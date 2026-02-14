/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP server source change detection for self hot-reload.
 *
 * Detects when `src/` files have been modified more recently than `build/src/`
 * files, indicating the TypeScript source needs to be recompiled before the
 * MCP server can use the latest code.
 *
 * The `.devtoolsignore` file at the MCP server root is respected,
 * using the same gitignore-style syntax as the extension watcher.
 *
 * A marker file (`.devtools/mcp-hot-reload.json`) is written after a
 * successful rebuild so the newly spawned process can detect that it was
 * just hot-reloaded and display a banner on the first tool call.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {dirname, extname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

import {logger} from './logger.js';

// ── Constants ────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', '.devtools']);
const IGNORE_EXTENSIONS = new Set(['.vsix', '.map']);
const DEVTOOLS_IGNORE_FILENAME = '.devtoolsignore';
const HOT_RELOAD_DIR = '.devtools';
const HOT_RELOAD_MARKER = 'mcp-hot-reload.json';

// ── Ignore Rule Types ────────────────────────────────────

interface IgnoreRule {
  pattern: string;
  negated: boolean;
}

// ── Path Utilities ───────────────────────────────────────

function normalizeRelativePath(input: string): string {
  return input.replaceAll('\\', '/');
}

function escapeRegex(text: string): string {
  return text.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(pattern: string): RegExp {
  const normalized = normalizeRelativePath(pattern.trim());
  let source = '';
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      i++;
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    source += escapeRegex(char);
  }
  return new RegExp(`^${source}$`);
}

// ── Ignore Rule Parsing ──────────────────────────────────

function parseIgnoreRules(rootDir: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  const filePath = join(rootDir, DEVTOOLS_IGNORE_FILENAME);
  if (!existsSync(filePath)) return rules;

  let raw = '';
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return rules;
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const negated = trimmed.startsWith('!');
    const pattern = negated ? trimmed.slice(1).trim() : trimmed;
    if (!pattern) continue;
    rules.push({pattern, negated});
  }

  return rules;
}

function applyIgnoreRules(relativePath: string, rules: IgnoreRule[]): boolean {
  let ignored = false;
  const normalized = normalizeRelativePath(relativePath);
  for (const rule of rules) {
    const raw = normalizeRelativePath(rule.pattern);
    const directoryPattern = raw.endsWith('/');
    const candidatePattern = directoryPattern ? `${raw}**` : raw;
    const matcher = globToRegex(candidatePattern);
    if (matcher.test(normalized)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function shouldIgnorePath(
  rootDir: string,
  fullPath: string,
  isDirectory: boolean,
  rules: IgnoreRule[],
): boolean {
  const relativePath = normalizeRelativePath(relative(rootDir, fullPath));
  if (!relativePath || relativePath === '.') return false;

  const basename = fullPath.split(/[\\/]/).pop() ?? '';
  if (isDirectory && IGNORE_DIRS.has(basename)) return true;
  if (!isDirectory && IGNORE_EXTENSIONS.has(extname(basename))) return true;

  const matchPath = isDirectory ? `${relativePath}/` : relativePath;
  return applyIgnoreRules(matchPath, rules);
}

// ── Mtime Scanning ───────────────────────────────────────

function scanNewestMtime(dir: string, rootDir: string, rules: IgnoreRule[]): number {
  let newestMtimeMs = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir, {encoding: 'utf8'});
  } catch {
    return 0;
  }

  for (const name of entries) {
    const fullPath = join(dir, name);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (shouldIgnorePath(rootDir, fullPath, true, rules)) continue;
      const childMtime = scanNewestMtime(fullPath, rootDir, rules);
      if (childMtime > newestMtimeMs) newestMtimeMs = childMtime;
    } else if (stat.isFile()) {
      if (shouldIgnorePath(rootDir, fullPath, false, rules)) continue;
      if (stat.mtimeMs > newestMtimeMs) newestMtimeMs = stat.mtimeMs;
    }
  }

  return newestMtimeMs;
}

// ── Public API ───────────────────────────────────────────

/**
 * Derive the MCP server package root from the build output location.
 * Build output is at `mcp-server/build/src/`, so __dirname goes up twice.
 */
export function getMcpServerRoot(): string {
  return dirname(dirname(__dirname));
}

/**
 * Check if MCP server source has changed since the last build.
 *
 * Compares the newest mtime in `src/` against the newest mtime in
 * `build/src/`. If source files are newer than build output, a rebuild
 * is needed.
 *
 * @param mcpServerDir Root of the mcp-server package
 * @returns true if source is newer than build output
 */
export function hasMcpServerSourceChanged(mcpServerDir: string): boolean {
  const srcDir = join(mcpServerDir, 'src');
  const buildSrcDir = join(mcpServerDir, 'build', 'src');

  if (!existsSync(srcDir)) return false;
  if (!existsSync(buildSrcDir)) {
    logger('[mcp-watcher] No build output found — rebuild needed');
    return true;
  }

  const rules = parseIgnoreRules(mcpServerDir);
  const srcMtime = scanNewestMtime(srcDir, srcDir, rules);
  const buildMtime = scanNewestMtime(buildSrcDir, buildSrcDir, rules);

  const changed = srcMtime > buildMtime;
  if (changed) {
    logger(
      `[mcp-watcher] Source changed: src=${new Date(srcMtime).toISOString()}, build=${new Date(buildMtime).toISOString()}`,
    );
  }
  return changed;
}

/**
 * Write a hot-reload marker file after a successful rebuild.
 * The newly spawned MCP server process reads this on startup
 * to display a "just updated" banner.
 */
export function writeHotReloadMarker(mcpServerDir: string): void {
  const markerDir = join(mcpServerDir, HOT_RELOAD_DIR);
  const markerPath = join(markerDir, HOT_RELOAD_MARKER);
  try {
    mkdirSync(markerDir, {recursive: true});
    writeFileSync(markerPath, JSON.stringify({builtAt: Date.now()}));
    logger('[mcp-watcher] Hot-reload marker written');
  } catch (err) {
    logger(`[mcp-watcher] Failed to write marker: ${err}`);
  }
}

/**
 * Read and consume the hot-reload marker. Returns the build timestamp
 * if the marker exists, or null otherwise. The marker file is deleted
 * after reading so the banner only appears once.
 */
export function consumeHotReloadMarker(mcpServerDir: string): number | null {
  const markerPath = join(mcpServerDir, HOT_RELOAD_DIR, HOT_RELOAD_MARKER);
  if (!existsSync(markerPath)) return null;

  try {
    const raw = readFileSync(markerPath, 'utf8');
    const data: unknown = JSON.parse(raw);
    unlinkSync(markerPath);
    if (
      typeof data === 'object' &&
      data !== null &&
      'builtAt' in data &&
      typeof (data as Record<string, unknown>).builtAt === 'number'
    ) {
      const builtAt = (data as Record<string, unknown>).builtAt as number;
      logger(`[mcp-watcher] Hot-reload marker consumed — builtAt=${new Date(builtAt).toISOString()}`);
      return builtAt;
    }
    return null;
  } catch {
    return null;
  }
}
