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
  /** Raw file contents (comments + rules). Empty string if file doesn't exist. */
  contents: string;
}

/**
 * Read the `.devtoolsignore` file from a given root directory.
 * Returns structured context about what's being ignored, useful
 * for surfacing to the LLM when a tool returns 0 results.
 */
export function readIgnoreContext(rootDir: string): IgnoreContext {
  const ignoreFilePath = join(rootDir, DEVTOOLS_IGNORE_FILENAME);
  const ignoreFileExists = existsSync(ignoreFilePath);

  let contents = '';
  if (ignoreFileExists) {
    try {
      contents = readFileSync(ignoreFilePath, 'utf8');
    } catch {
      // File exists but couldn't be read — treat as empty
    }
  }

  return {rootDir, ignoreFilePath, ignoreFileExists, contents};
}

/**
 * Append an "ignoredBy" section to markdown output when results are empty.
 * Helps the LLM understand why no results were found.
 */
export function appendIgnoreContextMarkdown(lines: string[], rootDir: string): void {
  const ctx = readIgnoreContext(rootDir);
  lines.push('');
  lines.push('### 📋 Ignore Context\n');
  lines.push(`**Root directory:** \`${ctx.rootDir}\`\n`);

  if (!ctx.ignoreFileExists) {
    lines.push('*No `.devtoolsignore` file found in the workspace root.*');
    return;
  }

  lines.push(`**Ignore file:** \`${ctx.ignoreFilePath}\`\n`);
  lines.push('```gitignore');
  lines.push(ctx.contents.trimEnd());
  lines.push('```');
}

/**
 * Build an "ignoredBy" object for JSON output when results are empty.
 */
export function buildIgnoreContextJson(rootDir: string): IgnoreContext {
  return readIgnoreContext(rootDir);
}
