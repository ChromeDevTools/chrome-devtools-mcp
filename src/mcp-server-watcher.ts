/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP server source change detection for self hot-reload.
 *
 * Two-phase detection strategy:
 * 1. Fast mtime check: compares newest mtime in `src/` against `build/src/`.
 * 2. Content hash verification: when mtime suggests a change, computes a
 *    SHA-256 fingerprint of all source file contents and compares against
 *    the stored fingerprint. This prevents false positives from operations
 *    that update file metadata without changing content (e.g. `git add`).
 *
 * The `.devtoolsignore` file at the MCP server root is respected,
 * using the same gitignore-style syntax as the extension watcher.
 *
 * A marker file (`.devtools/mcp-hot-reload.json`) is written after a
 * successful rebuild so the newly spawned process can detect that it was
 * just hot-reloaded and display a banner on the first tool call.
 */

import {createHash} from 'node:crypto';
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
const SOURCE_FINGERPRINT_FILE = 'source-fingerprint.json';

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

// ── Content Hashing ──────────────────────────────────────

/**
 * Recursively collect file contents into a hash. Files are processed
 * in sorted order (by relative path) for deterministic output.
 * Each file contributes its relative path + contents to the hash.
 */
function hashDirectoryContents(
  dir: string,
  rootDir: string,
  rules: IgnoreRule[],
  hash: ReturnType<typeof createHash>,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir, {encoding: 'utf8'});
  } catch {
    return;
  }
  entries.sort();

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
      hashDirectoryContents(fullPath, rootDir, rules, hash);
    } else if (stat.isFile()) {
      if (shouldIgnorePath(rootDir, fullPath, false, rules)) continue;
      const rel = normalizeRelativePath(relative(rootDir, fullPath));
      hash.update(rel);
      try {
        hash.update(readFileSync(fullPath));
      } catch {
        // skip unreadable files
      }
    }
  }
}

function computeSourceFingerprint(srcDir: string, rules: IgnoreRule[]): string {
  const hash = createHash('sha256');
  hashDirectoryContents(srcDir, srcDir, rules, hash);
  return hash.digest('hex');
}

function readStoredFingerprint(mcpServerDir: string): string | null {
  const fp = join(mcpServerDir, HOT_RELOAD_DIR, SOURCE_FINGERPRINT_FILE);
  if (!existsSync(fp)) return null;
  try {
    const raw = readFileSync(fp, 'utf8');
    const data: unknown = JSON.parse(raw);
    if (typeof data === 'object' && data !== null && 'hash' in data) {
      const hash = (data as Record<string, unknown>).hash;
      if (typeof hash === 'string') return hash;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist the current source fingerprint so future checks can skip
 * rebuilds when only file metadata (not content) changed.
 */
export function writeSourceFingerprint(mcpServerDir: string): void {
  const srcDir = join(mcpServerDir, 'src');
  if (!existsSync(srcDir)) return;
  const rules = parseIgnoreRules(mcpServerDir);
  const hash = computeSourceFingerprint(srcDir, rules);
  const dir = join(mcpServerDir, HOT_RELOAD_DIR);
  try {
    mkdirSync(dir, {recursive: true});
    writeFileSync(
      join(dir, SOURCE_FINGERPRINT_FILE),
      JSON.stringify({hash, computedAt: Date.now()}),
    );
    logger(`[mcp-watcher] Source fingerprint written: ${hash.slice(0, 12)}…`);
  } catch (err) {
    logger(`[mcp-watcher] Failed to write fingerprint: ${err}`);
  }
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
 * Uses a two-phase approach:
 * 1. Fast mtime check: if src/ newest mtime ≤ build/ newest mtime, no change.
 * 2. Content hash verification: if mtime suggests a change, compute a SHA-256
 *    fingerprint of all source file contents and compare against the stored
 *    fingerprint. This prevents false positives from metadata-only changes
 *    (e.g. git staging updates mtime without changing content).
 *
 * @param mcpServerDir Root of the mcp-server package
 * @returns true if source content has actually changed since last build
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

  if (srcMtime <= buildMtime) {
    return false;
  }

  // Mtime says changed — verify with content hash to filter out metadata-only changes
  logger(
    `[mcp-watcher] Mtime suggests change: src=${new Date(srcMtime).toISOString()}, build=${new Date(buildMtime).toISOString()} — verifying content…`,
  );

  const currentHash = computeSourceFingerprint(srcDir, rules);
  const storedHash = readStoredFingerprint(mcpServerDir);

  if (storedHash && currentHash === storedHash) {
    logger(
      `[mcp-watcher] Content unchanged (fingerprint=${currentHash.slice(0, 12)}…) — metadata-only change, skipping rebuild`,
    );
    return false;
  }

  logger(
    `[mcp-watcher] Content changed: ${storedHash ? `${storedHash.slice(0, 12)}… → ${currentHash.slice(0, 12)}…` : `new fingerprint ${currentHash.slice(0, 12)}…`}`,
  );
  return true;
}

/**
 * Check if MCP server build output is newer than the process start time.
 *
 * Catches the case where the user manually ran `pnpm run build` in the CLI.
 * The running MCP server still has the old code loaded, but
 * `hasMcpServerSourceChanged` would return false (source ≤ build).
 * This second check detects that the build is newer than the running process.
 *
 * @param mcpServerDir Root of the mcp-server package
 * @param processStartTime Epoch ms when the MCP server process started
 * @returns true if build output is newer than the process start
 */
export function hasBuildChangedSinceProcessStart(
  mcpServerDir: string,
  processStartTime: number,
): boolean {
  const buildSrcDir = join(mcpServerDir, 'build', 'src');
  if (!existsSync(buildSrcDir)) return false;

  const rules = parseIgnoreRules(mcpServerDir);
  const buildMtime = scanNewestMtime(buildSrcDir, buildSrcDir, rules);
  const changed = buildMtime > processStartTime;

  if (changed) {
    logger(
      `[mcp-watcher] Build newer than process start: build=${new Date(buildMtime).toISOString()}, started=${new Date(processStartTime).toISOString()}`,
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
