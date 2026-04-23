/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function getTempFilePath(filename: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));

  const filepath = path.join(dir, filename);
  return filepath;
}

export function ensureExtension(
  filepath: string,
  extension: `.${string}`,
): string {
  const ext = path.extname(filepath);
  return filepath.slice(0, filepath.length - ext.length) + extension;
}
