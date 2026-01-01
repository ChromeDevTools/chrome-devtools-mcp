/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DESCRIPTIONS_PATH = path.join(
  import.meta.dirname,
  'third_party/issue-descriptions',
);

let issueDescriptions: Record<string, string> = {};

/**
 * Reads all issue descriptions from the filesystem into memory.
 */
export async function loadIssueDescriptions(): Promise<void> {
  if (Object.keys(issueDescriptions).length > 0) {
    return;
  }

  const files = await fs.promises.readdir(DESCRIPTIONS_PATH);
  const descriptions: Record<string, string> = {};

  for (const file of files) {
    if (!file.endsWith('.md')) {
      continue;
    }
    const content = await fs.promises.readFile(
      path.join(DESCRIPTIONS_PATH, file),
      'utf-8',
    );
    descriptions[file] = content;
  }

  issueDescriptions = descriptions;
}

/**
 * Gets an issue description from the in-memory cache.
 * @param fileName The file name of the issue description.
 * @returns The description of the issue, or null if it doesn't exist.
 */
export function getIssueDescription(fileName: string): string | null {
  return issueDescriptions[fileName] ?? null;
}

export const ISSUE_UTILS = {
  loadIssueDescriptions,
  getIssueDescription,
};
