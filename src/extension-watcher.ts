
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension folder change detection for hot-reload.
 *
 * Timestamp strategy:
 * - Read the most recent mtimeMs across all tracked extension files.
 * - Compare it against the debug window session start time.
 * - If newest mtimeMs > sessionStartMs, trigger extension hot-reload.
 *
 * Tracked files are filtered by:
 * 1. Built-in ignore defaults (node_modules, dist, .git, *.vsix)
 * 2. Optional `<extensionRoot>/.devtoolsignore` patterns
 */

import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import path, {extname, join, relative} from 'node:path';

import {logger} from './logger.js';

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git']);
const IGNORE_EXTENSIONS = new Set(['.vsix']);
const DEVTOOLS_IGNORE_FILENAME = '.devtoolsignore';

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

/**
 * Check whether extension files changed after the debug window started.
 *
 * @param extensionDir Extension source root
 * @param sessionStartedAtMs Debug session start timestamp in epoch ms
 */
export function hasExtensionChangedSince(
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
