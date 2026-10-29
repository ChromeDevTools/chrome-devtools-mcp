/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const BUILD_DIR = path.join(process.cwd(), 'build');

/**
 * Writes content to a file.
 * @param filePath The path to the file.
 * @param content The content to write.
 */
function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

async function main(): Promise<void> {
  const devtoolsTs = path.join(
    process.cwd(),
    'src',
    'third_party',
    'devtools.ts',
  );
  if (fs.existsSync(devtoolsTs)) {
    fs.unlinkSync(devtoolsTs);
  }
  const devtoolsThirdPartyPath =
    'third_party/devtools-frontend/front_end/third_party';
  const devtoolsFrontEndCorePath =
    'third_party/devtools-frontend/front_end/core';

  // Create i18n mock
  const i18nDir = path.join(BUILD_DIR, devtoolsFrontEndCorePath, 'i18n');
  fs.mkdirSync(i18nDir, {recursive: true});
  const localesFile = path.join(i18nDir, 'locales.js');
  const localesContent = `
export const LOCALES = [
  'en-US',
];

export const BUNDLED_LOCALES = [
  'en-US',
];

export const DEFAULT_LOCALE = 'en-US';

export const REMOTE_FETCH_PATTERN = '@HOST@/remote/serve_file/@VERSION@/core/i18n/locales/@LOCALE@.json';

export const LOCAL_FETCH_PATTERN = './locales/@LOCALE@.json';`;
  writeFile(localesFile, localesContent);

  // Create codemirror.next mock.
  const codeMirrorDir = path.join(
    BUILD_DIR,
    devtoolsThirdPartyPath,
    'codemirror.next',
  );
  fs.mkdirSync(codeMirrorDir, {recursive: true});
  const codeMirrorFile = path.join(codeMirrorDir, 'codemirror.next.js');
  const codeMirrorContent = `
export default {};
export const cssStreamParser = () => Promise.resolve({ startState: () => ({}) });
export class StringStream { constructor() {} }
export const css = { cssLanguage: { parser: { parse: () => ({ topNode: { getChild: () => null } }) } } };
`;
  writeFile(codeMirrorFile, codeMirrorContent);

  // Create skills mocks
  const skillsDir = path.join(
    BUILD_DIR,
    'third_party',
    'devtools-frontend',
    'front_end',
    'models',
    'ai_assistance',
    'skills',
  );
  fs.mkdirSync(skillsDir, {recursive: true});
  const skillMockContent = `
export const skill = {
  name: '',
  description: '',
  tools: [],
  systemPrompt: '',
};
export default skill;
`;
  writeFile(path.join(skillsDir, 'lighthouse.skill.js'), skillMockContent);
  writeFile(path.join(skillsDir, 'network.skill.js'), skillMockContent);
  writeFile(path.join(skillsDir, 'performance.skill.js'), skillMockContent);
  writeFile(path.join(skillsDir, 'sources.skill.js'), skillMockContent);
  writeFile(path.join(skillsDir, 'storage.skill.js'), skillMockContent);
  writeFile(path.join(skillsDir, 'styling.skill.js'), skillMockContent);

  // Create root mock
  const rootDir = path.join(BUILD_DIR, devtoolsFrontEndCorePath, 'root');
  fs.mkdirSync(rootDir, {recursive: true});
  const runtimeFile = path.join(rootDir, 'Runtime.js');
  const runtimeContent = `
export function getChromeVersion() { return ''; };
export function getRemoteBase() { return null; };
export const hostConfig = {};
export const GenAiEnterprisePolicyValue = {
  ALLOW: 0,
  ALLOW_WITHOUT_LOGGING: 1,
  DISABLE: 2,
};
export const HostConfigFreestylerExecutionMode = {
  ALL_SCRIPTS: 'ALL_SCRIPTS',
  SIDE_EFFECT_FREE_SCRIPTS_ONLY: 'SIDE_EFFECT_FREE_SCRIPTS_ONLY',
  NO_SCRIPTS: 'NO_SCRIPTS',
};
export const GdpProfilesEnterprisePolicyValue = {
  ENABLED: 0,
  ENABLED_WITHOUT_BADGES: 1,
  DISABLED: 2,
};
export const Runtime = {
  isDescriptorEnabled: () => true,
  queryParam: () => null,
}
export const experiments = {
  isEnabled: () => false,
}
export const ExperimentName = {
  ALL: '*',
  CAPTURE_NODE_CREATION_STACKS: 'capture-node-creation-stacks',
  LIVE_HEAP_PROFILE: 'live-heap-profile',
  PROTOCOL_MONITOR: 'protocol-monitor',
  SAMPLING_HEAP_PROFILER_TIMELINE: 'sampling-heap-profiler-timeline',
  SHOW_OPTION_TO_EXPOSE_INTERNALS_IN_HEAP_SNAPSHOT: 'show-option-to-expose-internals-in-heap-snapshot',
  TIMELINE_INVALIDATION_TRACKING: 'timeline-invalidation-tracking',
  TIMELINE_SHOW_ALL_EVENTS: 'timeline-show-all-events',
  TIMELINE_V8_RUNTIME_CALL_STATS: 'timeline-v8-runtime-call-stats',
  APCA: 'apca',
  FONT_EDITOR: 'font-editor',
  FULL_ACCESSIBILITY_TREE: 'full-accessibility-tree',
  CONTRAST_ISSUES: 'contrast-issues',
  EXPERIMENTAL_COOKIE_FEATURES: 'experimental-cookie-features',
  INSTRUMENTATION_BREAKPOINTS: 'instrumentation-breakpoints',
  AUTHORED_DEPLOYED_GROUPING: 'authored-deployed-grouping',
  JUST_MY_CODE: 'just-my-code',
  USE_SOURCE_MAP_SCOPES: 'use-source-map-scopes',
  TIMELINE_SHOW_POST_MESSAGE_EVENTS: 'timeline-show-postmessage-events',
  TIMELINE_DEBUG_MODE: 'timeline-debug-mode',
}
  `;
  writeFile(runtimeFile, runtimeContent);

  // Temporary fix: without allowJs in tsconfig.json, tsc ignores pre-built
  // DevTools third_party .mjs/.js files, and transpileModule formats minified
  // single-line files so rollup-plugin-cleanup (skip-regex) does not hang on
  // catastrophic regex backtracking during bundling.
  const devtoolsJsFiles = [
    'acorn/package/dist/acorn.mjs',
    'codemirror/package/addon/runmode/runmode-standalone.mjs',
    'codemirror/package/mode/css/css.mjs',
    'codemirror/package/mode/javascript/javascript.mjs',
    'codemirror/package/mode/xml/xml.mjs',
    'diff/diff_match_patch.js',
    'intl-messageformat/package/intl-messageformat.esm.js',
    'legacy-javascript/lib/legacy-javascript.js',
    'marked/package/lib/marked.esm.js',
    'third-party-web/lib/nostats-subset.js',
  ];
  await Promise.all(
    devtoolsJsFiles.map(async file => {
      const relPath = path.join(devtoolsThirdPartyPath, file);
      const src = path.join(process.cwd(), relPath);
      const dest = path.join(BUILD_DIR, relPath);
      const source = await fs.promises.readFile(src, 'utf-8');
      const {outputText} = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
        },
      });
      await fs.promises.mkdir(path.dirname(dest), {recursive: true});
      await fs.promises.writeFile(dest, outputText, 'utf-8');
    }),
  );

  // Copy lighthouse bundle that tsc ignores due to lighthouse-devtools-mcp-bundle.d.ts
  const lighthouseBundle = 'src/third_party/lighthouse-devtools-mcp-bundle.js';
  const lighthouseBundleDest = path.join(BUILD_DIR, lighthouseBundle);
  fs.mkdirSync(path.dirname(lighthouseBundleDest), {recursive: true});
  fs.copyFileSync(
    path.join(process.cwd(), lighthouseBundle),
    lighthouseBundleDest,
  );

  copyDevToolsDescriptionFiles();
}

function copyDevToolsDescriptionFiles(): void {
  const devtoolsIssuesDescriptionPath =
    'third_party/devtools-frontend/front_end/models/issues_manager/descriptions';
  const sourceDir = path.join(process.cwd(), devtoolsIssuesDescriptionPath);
  const destDir = path.join(
    BUILD_DIR,
    'src',
    'third_party',
    'issue-descriptions',
  );
  fs.cpSync(sourceDir, destDir, {recursive: true});
}

await main();
