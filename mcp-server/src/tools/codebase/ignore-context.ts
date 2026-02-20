/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const DEVTOOLS_IGNORE_FILENAME = '.devtoolsignore';

export interface IgnoreContext {
  rootDir: string;
  ignoreFilePath: string;
  ignoreFileExists: boolean;
  /** Active glob patterns (non-comment, non-blank lines). */
  activePatterns: string[];
}

/**
 * Read the `.devtoolsignore` file from a given root directory.
 * Returns only the active glob patterns (strips comments and blank lines).
 */
export function readIgnoreContext(rootDir: string): IgnoreContext {
  const ignoreFilePath = join(rootDir, DEVTOOLS_IGNORE_FILENAME);
  const ignoreFileExists = existsSync(ignoreFilePath);

  const activePatterns: string[] = [];
  if (ignoreFileExists) {
    try {
      const contents = readFileSync(ignoreFilePath, 'utf8');
      for (const rawLine of contents.split('\n')) {
        const line = rawLine.trim();
        if (line.length > 0 && !line.startsWith('#')) {
          activePatterns.push(line);
        }
      }
    } catch {
      // File exists but couldn't be read — treat as empty
    }
  }

  return {rootDir, ignoreFilePath, ignoreFileExists, activePatterns};
}

/**
 * Build an "ignoredBy" object for JSON output when results are empty.
 */
export function buildIgnoreContextJson(rootDir: string): IgnoreContext {
  return readIgnoreContext(rootDir);
}
