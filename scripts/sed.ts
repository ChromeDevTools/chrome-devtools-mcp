/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';

/**
 * Replaces content in a file.
 * @param filePath The path to the file.
 * @param find The regex to find.
 * @param replace The string to replace with.
 */
export function sed(
  filePath: string,
  find: RegExp | string,
  replace: string,
): void {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found for sed operation: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const newContent = content.replace(find, replace);
  fs.writeFileSync(filePath, newContent, 'utf-8');
}
