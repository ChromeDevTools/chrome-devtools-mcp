
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension folder change detection for hot-reload.
 *
 * Computes a SHA-256 content hash of all source files in the extension
 * directory (excluding node_modules, dist, .git, and .vsix artifacts).
 * The hash serves as a fast equality check between snapshots.
 *
 * Workflow:
 * 1. `saveExtensionSnapshot()` is called at server startup and after each
 *    hot-reload cycle to establish a baseline.
 * 2. Before every MCP tool call, `hasExtensionChanged()` compares the live
 *    directory against the saved baseline — if the hash differs, the caller
 *    triggers a rebuild + reconnect cycle.
 */

import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {extname, join, relative} from 'node:path';

import {logger} from './logger.js';

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git']);
const IGNORE_EXTENSIONS = new Set(['.vsix']);

/** Saved hash from the most recent snapshot. */
let lastSnapshotHash: string | undefined;

/**
 * Recursively walk a directory and return sorted relative paths of all files,
 * skipping ignored directories and file extensions.
 */
function walkFiles(dir: string, base: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, {encoding: 'utf8'});
  } catch {
    return results;
  }
  for (const name of entries) {
    const fullPath = join(dir, name);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (IGNORE_DIRS.has(name)) {continue;}
      results.push(...walkFiles(fullPath, base));
    } else if (stat.isFile()) {
      if (IGNORE_EXTENSIONS.has(extname(name))) {continue;}
      results.push(relative(base, fullPath));
    }
  }
  return results.sort();
}

/**
 * Compute a SHA-256 hash of all source files in the extension directory.
 * The hash includes file paths (sorted) and their contents so that both
 * content edits and renames are detected.
 */
export function computeExtensionHash(extensionDir: string): string {
  const hash = createHash('sha256');
  const files = walkFiles(extensionDir, extensionDir);
  for (const file of files) {
    // Include the relative path so renames are detected
    hash.update(file);
    hash.update(readFileSync(join(extensionDir, file)));
  }
  return hash.digest('hex');
}

/**
 * Save the current state of the extension directory as the baseline snapshot.
 * Subsequent calls to `hasExtensionChanged()` compare against this.
 */
export function saveExtensionSnapshot(extensionDir: string): void {
  lastSnapshotHash = computeExtensionHash(extensionDir);
  logger(`Extension snapshot saved: ${lastSnapshotHash.slice(0, 12)}…`);
}

/**
 * Check whether the extension directory has changed since the last snapshot.
 * Returns false if no snapshot exists (nothing to compare against).
 */
export function hasExtensionChanged(extensionDir: string): boolean {
  if (lastSnapshotHash === undefined) {return false;}
  const currentHash = computeExtensionHash(extensionDir);
  const changed = currentHash !== lastSnapshotHash;
  if (changed) {
    logger(
      `Extension changed: ${lastSnapshotHash.slice(0, 12)}… → ${currentHash.slice(0, 12)}…`,
    );
  }
  return changed;
}
