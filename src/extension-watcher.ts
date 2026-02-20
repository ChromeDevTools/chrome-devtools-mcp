
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension folder change detection for hot-reload.
 *
 * Two-phase detection strategy:
 * 1. Fast mtime check: compares newest source mtime against newest dist/ mtime.
 * 2. Content hash verification: when mtime suggests staleness, computes a
 *    SHA-256 fingerprint of all source file contents and compares against
 *    the stored fingerprint. This prevents false positives from operations
 *    that update file metadata without changing content (e.g. `git add`).
 *
 * Tracked files are filtered by:
 * 1. Built-in ignore defaults (node_modules, dist, .git, *.vsix)
 * 2. Optional `<extensionRoot>/.devtoolsignore` patterns
 */

import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path, {extname, join, relative} from 'node:path';

import {logger} from './logger.js';

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', '.devtools']);
const IGNORE_EXTENSIONS = new Set(['.vsix']);
const DEVTOOLS_IGNORE_FILENAME = '.devtoolsignore';
const EXT_FINGERPRINT_DIR = '.devtools';
const EXT_FINGERPRINT_FILE = 'ext-source-fingerprint.json';

interface IgnoreRule {
  pattern: string;
  negated: boolean;
}

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

function parseIgnoreRules(extensionDir: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  const filePath = join(extensionDir, DEVTOOLS_IGNORE_FILENAME);
  if (!existsSync(filePath)) {
    return rules;
  }

  let raw = '';
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return rules;
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const negated = trimmed.startsWith('!');
    const pattern = negated ? trimmed.slice(1).trim() : trimmed;
    if (!pattern) {
      continue;
    }
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
  extensionDir: string,
  fullPath: string,
  isDirectory: boolean,
  rules: IgnoreRule[],
): boolean {
  const relativePath = normalizeRelativePath(relative(extensionDir, fullPath));
  if (!relativePath || relativePath === '.') {
    return false;
  }

  const basename = path.basename(fullPath);
  if (isDirectory && IGNORE_DIRS.has(basename)) {
    return true;
  }
  if (!isDirectory && IGNORE_EXTENSIONS.has(extname(basename))) {
    return true;
  }

  const matchPath = isDirectory ? `${relativePath}/` : relativePath;
  return applyIgnoreRules(matchPath, rules);
}

interface FileMtimeResult {
  newestMtimeMs: number;
  trackedFileCount: number;
}

/**
 * Recursively scan tracked files and return the newest mtimeMs.
 */
function scanNewestMtime(
  dir: string,
  extensionDir: string,
  rules: IgnoreRule[],
): FileMtimeResult {
  let newestMtimeMs = 0;
  let trackedFileCount = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir, {encoding: 'utf8'});
  } catch {
    return {newestMtimeMs, trackedFileCount};
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
      if (shouldIgnorePath(extensionDir, fullPath, true, rules)) {
        continue;
      }
      const child = scanNewestMtime(fullPath, extensionDir, rules);
      if (child.newestMtimeMs > newestMtimeMs) {
        newestMtimeMs = child.newestMtimeMs;
      }
      trackedFileCount += child.trackedFileCount;
    } else if (stat.isFile()) {
      if (shouldIgnorePath(extensionDir, fullPath, false, rules)) {
        continue;
      }
      trackedFileCount++;
      if (stat.mtimeMs > newestMtimeMs) {
        newestMtimeMs = stat.mtimeMs;
      }
    }
  }

  return {newestMtimeMs, trackedFileCount};
}

/**
 * Returns the newest file change timestamp among tracked extension files.
 */
export function getNewestTrackedChangeTime(extensionDir: string): number {
  const rules = parseIgnoreRules(extensionDir);
  const result = scanNewestMtime(extensionDir, extensionDir, rules);
  return result.newestMtimeMs;
}

// ── Content Hashing ──────────────────────────────────────

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
      const rel = path.posix.normalize(relative(rootDir, fullPath).replaceAll('\\', '/'));
      hash.update(rel);
      try {
        hash.update(readFileSync(fullPath));
      } catch {
        // skip unreadable files
      }
    }
  }
}

function computeExtSourceFingerprint(extensionDir: string, rules: IgnoreRule[]): string {
  const hash = createHash('sha256');
  hashDirectoryContents(extensionDir, extensionDir, rules, hash);
  return hash.digest('hex');
}

function readExtFingerprint(extensionDir: string): string | null {
  const fp = join(extensionDir, EXT_FINGERPRINT_DIR, EXT_FINGERPRINT_FILE);
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
 * Persist the current extension source fingerprint so future checks can skip
 * rebuilds when only file metadata (not content) changed.
 */
export function writeExtSourceFingerprint(extensionDir: string): void {
  const rules = parseIgnoreRules(extensionDir);
  const hash = computeExtSourceFingerprint(extensionDir, rules);
  const dir = join(extensionDir, EXT_FINGERPRINT_DIR);
  try {
    mkdirSync(dir, {recursive: true});
    writeFileSync(
      join(dir, EXT_FINGERPRINT_FILE),
      JSON.stringify({hash, computedAt: Date.now()}),
    );
    logger(`[hot-reload] Extension fingerprint written: ${hash.slice(0, 12)}…`);
  } catch (err) {
    logger(`[hot-reload] Failed to write extension fingerprint: ${err}`);
  }
}

/**
 * Check whether extension files changed after the debug window started.
 *
 * @param extensionDir Extension source root
 * @param sessionStartedAtMs Debug session start timestamp in epoch ms
 * @deprecated Use isBuildStale instead for proper source vs build comparison
 */
function hasExtensionChangedSince(
  extensionDir: string,
  sessionStartedAtMs: number,
): boolean {
  const newestChangeTime = getNewestTrackedChangeTime(extensionDir);
  const changed = newestChangeTime > sessionStartedAtMs;
  if (changed) {
    logger(
      `Extension changed after session start: newest=${new Date(newestChangeTime).toISOString()}, sessionStart=${new Date(sessionStartedAtMs).toISOString()}`,
    );
  }
  return changed;
}

/**
 * Scan a directory recursively (ignoring .git, node_modules) for newest mtime.
 * Used for scanning build output folders like dist/.
 */
function scanBuildFolderMtime(dir: string): number {
  let newestMtimeMs = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir, {encoding: 'utf8'});
  } catch {
    return newestMtimeMs;
  }

  for (const name of entries) {
    if (name === '.git' || name === 'node_modules') {
      continue;
    }
    const fullPath = join(dir, name);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const child = scanBuildFolderMtime(fullPath);
      if (child > newestMtimeMs) {
        newestMtimeMs = child;
      }
    } else if (stat.isFile()) {
      if (stat.mtimeMs > newestMtimeMs) {
        newestMtimeMs = stat.mtimeMs;
      }
    }
  }

  return newestMtimeMs;
}

/**
 * Get the newest mtime from the build output folder (dist/).
 *
 * @param extensionDir Extension root directory
 * @returns Newest file mtime in dist/, or 0 if dist doesn't exist
 */
export function getNewestBuildMtime(extensionDir: string): number {
  const distDir = join(extensionDir, 'dist');
  if (!existsSync(distDir)) {
    return 0;
  }
  return scanBuildFolderMtime(distDir);
}

/**
 * Check if the extension build is stale (source files newer than build output).
 *
 * Uses a two-phase approach:
 * 1. Fast mtime comparison of source vs dist/ output.
 * 2. Content hash verification when mtime suggests staleness, to filter
 *    out metadata-only changes (e.g. git staging).
 *
 * @param extensionDir Extension root directory
 * @returns true if source content has actually changed since last build
 */
export function isBuildStale(extensionDir: string): boolean {
  const sourceNewest = getNewestTrackedChangeTime(extensionDir);
  const buildNewest = getNewestBuildMtime(extensionDir);

  if (buildNewest === 0) {
    logger(`[hot-reload] No build found in dist/ — build is stale`);
    return true;
  }

  if (sourceNewest <= buildNewest) {
    logger(
      `[hot-reload] Build up-to-date: source=${new Date(sourceNewest).toISOString()} <= build=${new Date(buildNewest).toISOString()}`,
    );
    return false;
  }

  // Mtime says stale — verify with content hash
  logger(
    `[hot-reload] Mtime suggests stale: source=${new Date(sourceNewest).toISOString()} > build=${new Date(buildNewest).toISOString()} — verifying content…`,
  );

  const rules = parseIgnoreRules(extensionDir);
  const currentHash = computeExtSourceFingerprint(extensionDir, rules);
  const storedHash = readExtFingerprint(extensionDir);

  if (storedHash && currentHash === storedHash) {
    logger(
      `[hot-reload] Content unchanged (fingerprint=${currentHash.slice(0, 12)}…) — metadata-only change, skipping rebuild`,
    );
    return false;
  }

  logger(
    `[hot-reload] Content changed: ${storedHash ? `${storedHash.slice(0, 12)}… → ${currentHash.slice(0, 12)}…` : `new fingerprint ${currentHash.slice(0, 12)}…`}`,
  );
  return true;
}

/**
 * Check if extension build (dist/) is newer than the Client window start time.
 *
 * Catches the case where the user manually ran `npm run compile` in the CLI.
 * The Client window still has the old code loaded, but `isBuildStale` would
 * return false (source ≤ build). This second check detects that the build
 * is newer than the running Client window.
 *
 * @param extensionDir Extension root directory
 * @param windowStartTime Epoch ms when the Client window started
 * @returns true if build output is newer than the Client window start
 */
export function hasBuildChangedSinceWindowStart(
  extensionDir: string,
  windowStartTime: number,
): boolean {
  const buildMtime = getNewestBuildMtime(extensionDir);
  if (buildMtime === 0) return false;

  const changed = buildMtime > windowStartTime;
  if (changed) {
    logger(
      `[hot-reload] Build newer than Client window: build=${new Date(buildMtime).toISOString()}, window=${new Date(windowStartTime).toISOString()}`,
    );
  }
  return changed;
}
