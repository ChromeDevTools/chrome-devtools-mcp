/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from 'node:worker_threads';

const ROOT_DIR = process.cwd();
const MIN_SIMILARITY = 0.45;
const MAX_GUIDES_PER_ITEM = 1;
const MAX_QUERY_CHARS = 120;

const LIGHTHOUSE_AUDIT_DENYLIST = new Set<string>([
  'document-title',
  'screenshot-thumbnails',
  'final-screenshot',
  'script-treemap-data',
  'metrics',
  'diagnostics',
  'network-requests',
  'network-rtt',
  'network-server-latency',
  'main-thread-tasks',
  'resource-summary',
  'user-timings',
]);

const LIGHTHOUSE_AUDIT_OVERRIDES: Readonly<Record<string, readonly string[]>> =
  {
    'autocomplete-valid': ['autofill-sign-in-form'],
    'bf-cache': ['performance'],
    'color-contrast': ['ensure-sufficient-color-contrast'],
    'csp-xss': ['security'],
    'image-size-responsive': ['responsive-design'],
    label: ['forms'],
    'long-tasks': ['break-up-long-tasks'],
    'non-composited-animations': ['motion'],
    'target-size': ['accessibility'],
    'third-party-cookies': ['privacy'],
    'trusted-types-xss': ['mitigate-dom-xss-trusted-types'],
    'unsized-images': ['responsive-design'],
    'webmcp-form-coverage': ['agentic-forms'],
    'webmcp-registered-tools': ['agentic-javascript-tools'],
    'webmcp-schema-validity': ['webmcp'],
  };

const DEVTOOLS_ISSUE_DENYLIST = new Set<string>(['mock.md']);

const DEVTOOLS_ISSUE_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
  'ConnectionAllowlistInvalidHeader.md': ['restrict-outbound-connections'],
  'cookieExcludeThirdPartyPhaseoutRead.md': ['privacy'],
  'cookieExcludeThirdPartyPhaseoutSet.md': ['privacy'],
  'cspEvalViolation.md': ['security'],
  'cspInlineViolation.md': ['security'],
  'cspTrustedTypesPolicyViolation.md': ['mitigate-dom-xss-trusted-types'],
  'cspTrustedTypesSinkViolation.md': ['mitigate-dom-xss-trusted-types'],
  'genericFormAutocompleteAttributeEmptyError.md': ['autofill-sign-in-form'],
  'genericFormInputHasWrongButWellIntendedAutocompleteValueError.md': [
    'autofill-sign-in-form',
  ],
  'genericFormLabelForNameError.md': ['forms'],
  'LowTextContrast.md': ['ensure-sufficient-color-contrast'],
};

interface SearchResultItem {
  id: string;
  similarity: number;
}

interface SearchGates {
  top1MinSimilarity?: number;
  highConfidenceSimilarity?: number;
  maxDropFromTop1?: number;
}

interface SearchModule {
  searchUseCases: (
    query: string,
    limit?: number,
    minSimilarity?: number,
    embedder?: unknown,
    gates?: SearchGates,
  ) => Promise<SearchResultItem[]>;
}

interface QueryItem {
  key: string;
  query: string;
  lexicalScore: number;
}

interface WorkerPayload {
  searchMjsPath: string;
  items: QueryItem[];
}

interface WorkerResultEntry {
  key: string;
  semanticIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isSearchModule = (value: unknown): value is SearchModule => {
  return isRecord(value) && typeof value.searchUseCases === 'function';
};

const isWorkerPayload = (value: unknown): value is WorkerPayload => {
  return (
    isRecord(value) &&
    typeof value.searchMjsPath === 'string' &&
    Array.isArray(value.items)
  );
};

const isWorkerResultArray = (value: unknown): value is WorkerResultEntry[] => {
  return Array.isArray(value);
};

function resolveMwgDir(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--mwg-dir' && args[i + 1]) {
      return path.resolve(args[i + 1]);
    }
    if (arg.startsWith('--mwg-dir=')) {
      return path.resolve(arg.slice('--mwg-dir='.length));
    }
  }

  const candidates = [
    path.resolve(ROOT_DIR, '../mwg'),
    path.resolve(ROOT_DIR, '../../../mwg'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function loadGuideVocabulary(mwgDir: string): Set<string> {
  const guidesJsonPath = path.join(
    mwgDir,
    'dist/skills-cli/skills/modern-web-guidance/guides.json',
  );
  const vocab = new Set<string>();
  if (!fs.existsSync(guidesJsonPath)) {
    return vocab;
  }
  const raw: unknown = JSON.parse(fs.readFileSync(guidesJsonPath, 'utf8'));
  if (!Array.isArray(raw)) {
    return vocab;
  }
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const id = typeof item.id === 'string' ? item.id : '';
    for (const token of id.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= 4) {
        vocab.add(token);
      }
    }
    if (Array.isArray(item.featuresUsed)) {
      for (const feat of item.featuresUsed) {
        if (typeof feat === 'string') {
          for (const token of feat.toLowerCase().split(/[^a-z0-9]+/)) {
            if (token.length >= 4) {
              vocab.add(token);
            }
          }
        }
      }
    }
  }
  return vocab;
}

function scoreLexicalOverlap(text: string, vocab: ReadonlySet<string>): number {
  let score = 0;
  const seen = new Set<string>();
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= 4 && !seen.has(token) && vocab.has(token)) {
      seen.add(token);
      score++;
    }
  }
  return score;
}

function normalizeQuery(text: string): string {
  const cleaned = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, MAX_QUERY_CHARS);
}

function mergeGuides(
  overrideIds: readonly string[] | undefined,
  semanticIds: readonly string[],
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const combined = [...(overrideIds ?? []), ...semanticIds];
  for (const id of combined) {
    if (id && !seen.has(id)) {
      seen.add(id);
      merged.push(id);
      if (merged.length >= MAX_GUIDES_PER_ITEM) {
        break;
      }
    }
  }
  return merged;
}

function extractAuditQuery(source: string): string {
  const uiStart = source.indexOf('const UIStrings = {');
  if (uiStart === -1) {
    return '';
  }
  const uiEnd = source.indexOf('};', uiStart);
  const block =
    uiEnd !== -1
      ? source.slice(uiStart, uiEnd)
      : source.slice(uiStart, uiStart + 2000);
  const withoutComments = block
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');

  const parts: string[] = [];
  for (const line of withoutComments.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const quoteMatch = /['"`]([^'"`]+)['"`]/.exec(trimmed);
    if (quoteMatch) {
      parts.push(quoteMatch[1]);
    }
  }
  return normalizeQuery(parts.join(' '));
}

function collectLighthouseQueryItems(vocab: ReadonlySet<string>): QueryItem[] {
  const defaultConfigPath = path.join(
    ROOT_DIR,
    'node_modules/lighthouse/core/config/default-config.js',
  );
  const auditsDir = path.join(ROOT_DIR, 'node_modules/lighthouse/core/audits');
  const configSource = fs.readFileSync(defaultConfigPath, 'utf8');
  const auditsStart = configSource.indexOf('audits: [');
  const groupsStart = configSource.indexOf('groups: {', auditsStart);
  const auditsBlock =
    auditsStart !== -1 && groupsStart !== -1
      ? configSource.slice(auditsStart, groupsStart)
      : '';

  const auditPaths: string[] = [];
  const entryRegex = /'([^']+)'/g;
  let match = entryRegex.exec(auditsBlock);
  while (match !== null) {
    auditPaths.push(match[1]);
    match = entryRegex.exec(auditsBlock);
  }

  const items: QueryItem[] = [];
  for (const auditRelPath of auditPaths) {
    if (
      auditRelPath.startsWith('insights/') ||
      auditRelPath.startsWith('metrics/')
    ) {
      continue;
    }
    const auditFilePath = path.join(auditsDir, `${auditRelPath}.js`);
    if (!fs.existsSync(auditFilePath)) {
      continue;
    }
    const auditSource = fs.readFileSync(auditFilePath, 'utf8');
    const idMatch = /\bid:\s*'([^']+)'/.exec(auditSource);
    const id = idMatch ? idMatch[1] : path.basename(auditRelPath);
    if (!id || LIGHTHOUSE_AUDIT_DENYLIST.has(id)) {
      continue;
    }

    const query = extractAuditQuery(auditSource);
    if (query) {
      const lexicalScore =
        (Object.hasOwn(LIGHTHOUSE_AUDIT_OVERRIDES, id) ? 100 : 0) +
        scoreLexicalOverlap(`${id} ${query}`, vocab);
      items.push({key: id, query, lexicalScore});
    }
  }
  return items;
}

function collectDevToolsIssueQueryItems(
  vocab: ReadonlySet<string>,
): QueryItem[] {
  const descriptionsDir = path.join(
    ROOT_DIR,
    'third_party/devtools-frontend/front_end/models/issues_manager/descriptions',
  );
  const files = fs
    .readdirSync(descriptionsDir)
    .filter(file => file.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));

  const items: QueryItem[] = [];
  for (const file of files) {
    if (DEVTOOLS_ISSUE_DENYLIST.has(file)) {
      continue;
    }
    const rawMarkdown = fs.readFileSync(
      path.join(descriptionsDir, file),
      'utf8',
    );
    const query = normalizeQuery(rawMarkdown.replace(/^#\s+/gm, ''));
    if (query) {
      const lexicalScore =
        (Object.hasOwn(DEVTOOLS_ISSUE_OVERRIDES, file) ? 100 : 0) +
        scoreLexicalOverlap(`${file} ${query}`, vocab);
      items.push({key: file, query, lexicalScore});
    }
  }
  return items;
}

async function runWorkerBatch(
  searchMjsPath: string,
  items: QueryItem[],
): Promise<WorkerResultEntry[]> {
  if (items.length === 0) {
    return [];
  }
  return await new Promise<WorkerResultEntry[]>((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: {searchMjsPath, items},
    });
    worker.once('message', (msg: unknown) => {
      if (isWorkerResultArray(msg)) {
        resolve(msg);
      } else {
        reject(new Error('Unexpected worker message payload'));
      }
    });
    worker.once('error', reject);
    worker.once('exit', code => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

async function executeParallelSearch(
  searchMjsPath: string,
  items: readonly QueryItem[],
): Promise<Map<string, string[]>> {
  const workerCount = Math.min(
    Math.max(1, os.availableParallelism()),
    24,
    Math.max(1, items.length),
  );
  const chunks: QueryItem[][] = Array.from({length: workerCount}, () => []);
  for (let i = 0; i < items.length; i++) {
    chunks[i % workerCount].push(items[i]);
  }

  const batchResults = await Promise.all(
    chunks.map(async chunk => await runWorkerBatch(searchMjsPath, chunk)),
  );

  const semanticMap = new Map<string, string[]>();
  for (const batch of batchResults) {
    for (const entry of batch) {
      if (entry.semanticIds.length > 0) {
        semanticMap.set(entry.key, entry.semanticIds);
      }
    }
  }
  return semanticMap;
}

function buildFinalMappings(
  keys: readonly string[],
  semanticMap: Map<string, string[]>,
  overrides: Readonly<Record<string, readonly string[]>>,
  denylist: ReadonlySet<string>,
): Map<string, string[]> {
  const mappings = new Map<string, string[]>();
  for (const key of keys) {
    if (denylist.has(key)) {
      continue;
    }
    const semanticIds = semanticMap.get(key) ?? [];
    const guides = mergeGuides(overrides[key], semanticIds);
    if (guides.length > 0) {
      mappings.set(key, guides);
    }
  }

  for (const [overrideKey, overrideGuides] of Object.entries(overrides)) {
    if (!mappings.has(overrideKey) && !denylist.has(overrideKey)) {
      mappings.set(overrideKey, mergeGuides(overrideGuides, []));
    }
  }

  return new Map(
    [...mappings.entries()].sort(([keyA], [keyB]) => keyA.localeCompare(keyB)),
  );
}

function formatMappingRecord(mappings: Map<string, string[]>): string {
  const lines: string[] = [];
  for (const [key, guides] of mappings.entries()) {
    const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? key
      : `'${key}'`;
    const formattedGuides = guides.map(guide => `'${guide}'`).join(', ');
    lines.push(`  ${formattedKey}: [${formattedGuides}],`);
  }
  return lines.join('\n');
}

function generateMwgMappingSource(
  lighthouseMappings: Map<string, string[]>,
  devToolsIssueMappings: Map<string, string[]>,
): string {
  return `/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Generated by scripts/update-mwg-mappings.ts. Do not edit manually.

export const LIGHTHOUSE_AUDIT_TO_MWG_GUIDES: Readonly<
  Record<string, readonly string[]>
> = {
${formatMappingRecord(lighthouseMappings)}
};

export const DEVTOOLS_ISSUE_TO_MWG_GUIDES: Readonly<
  Record<string, readonly string[]>
> = {
${formatMappingRecord(devToolsIssueMappings)}
};

export function getMwgGuidesForLighthouseAudit(auditId: string): string[] {
  if (!auditId || !Object.hasOwn(LIGHTHOUSE_AUDIT_TO_MWG_GUIDES, auditId)) {
    return [];
  }
  const guides = LIGHTHOUSE_AUDIT_TO_MWG_GUIDES[auditId];
  return guides ? [...guides] : [];
}

export function getMwgGuidesForDevToolsIssue(
  descriptionFile: string | undefined,
): string[] {
  if (
    !descriptionFile ||
    !Object.hasOwn(DEVTOOLS_ISSUE_TO_MWG_GUIDES, descriptionFile)
  ) {
    return [];
  }
  const guides = DEVTOOLS_ISSUE_TO_MWG_GUIDES[descriptionFile];
  return guides ? [...guides] : [];
}

export function formatMwgRampSection(guideIds: readonly string[]): string {
  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  for (const id of guideIds) {
    if (id && !seen.has(id)) {
      seen.add(id);
      uniqueIds.push(id);
    }
  }
  if (uniqueIds.length === 0) {
    return '';
  }
  return \`Get implementation help with \\\`npx -y modern-web-guidance retrieve \${uniqueIds.join(',')}\\\`\`;
}
`;
}

async function runWorker(): Promise<void> {
  if (!isWorkerPayload(workerData) || !parentPort) {
    throw new Error('Invalid workerData for update-mwg-mappings worker');
  }
  const searchUrl = pathToFileURL(workerData.searchMjsPath).href;
  const importedSearch: unknown = await import(searchUrl);
  if (!isSearchModule(importedSearch)) {
    throw new Error(`Invalid MWG search module at ${workerData.searchMjsPath}`);
  }

  const results: WorkerResultEntry[] = [];
  for (const item of workerData.items) {
    const matches = await importedSearch.searchUseCases(
      item.query,
      MAX_GUIDES_PER_ITEM,
      MIN_SIMILARITY,
      undefined,
      {
        top1MinSimilarity: MIN_SIMILARITY,
        highConfidenceSimilarity: MIN_SIMILARITY,
        maxDropFromTop1: 0.12,
      },
    );
    const semanticIds: string[] = [];
    for (const match of matches) {
      if (match.similarity >= MIN_SIMILARITY) {
        semanticIds.push(match.id);
      }
    }
    results.push({key: item.key, semanticIds});
  }
  parentPort.postMessage(results);
}

async function main(): Promise<void> {
  const mwgDir = resolveMwgDir();
  const searchMjsPath = path.join(
    mwgDir,
    'dist/skills-cli/skills/modern-web-guidance/search.mjs',
  );
  if (!fs.existsSync(searchMjsPath)) {
    throw new Error(
      `MWG search module not found at ${searchMjsPath}. Build mwg first or pass --mwg-dir.`,
    );
  }

  const vocab = loadGuideVocabulary(mwgDir);
  const lighthouseItems = collectLighthouseQueryItems(vocab);
  const devToolsItems = collectDevToolsIssueQueryItems(vocab);

  const combinedItems: QueryItem[] = [
    ...lighthouseItems.map(item => ({
      ...item,
      key: `lh:${item.key}`,
    })),
    ...devToolsItems.map(item => ({
      ...item,
      key: `dt:${item.key}`,
    })),
  ];

  const combinedMap = await executeParallelSearch(searchMjsPath, combinedItems);
  const lighthouseSemanticMap = new Map<string, string[]>();
  for (const item of lighthouseItems) {
    const ids = combinedMap.get(`lh:${item.key}`);
    if (ids) {
      lighthouseSemanticMap.set(item.key, ids);
    }
  }
  const devToolsSemanticMap = new Map<string, string[]>();
  for (const item of devToolsItems) {
    const ids = combinedMap.get(`dt:${item.key}`);
    if (ids) {
      devToolsSemanticMap.set(item.key, ids);
    }
  }

  const lighthouseMappings = buildFinalMappings(
    lighthouseItems.map(item => item.key),
    lighthouseSemanticMap,
    LIGHTHOUSE_AUDIT_OVERRIDES,
    LIGHTHOUSE_AUDIT_DENYLIST,
  );
  const devToolsIssueMappings = buildFinalMappings(
    devToolsItems.map(item => item.key),
    devToolsSemanticMap,
    DEVTOOLS_ISSUE_OVERRIDES,
    DEVTOOLS_ISSUE_DENYLIST,
  );

  const outputPath = path.join(ROOT_DIR, 'src/utils/mwgMapping.ts');
  const source = generateMwgMappingSource(
    lighthouseMappings,
    devToolsIssueMappings,
  );
  fs.writeFileSync(outputPath, source, 'utf8');
  console.log(
    `Wrote ${lighthouseMappings.size} Lighthouse audit mappings and ${devToolsIssueMappings.size} DevTools issue mappings to ${outputPath}`,
  );
}

if (isMainThread) {
  await main();
} else {
  await runWorker();
}
