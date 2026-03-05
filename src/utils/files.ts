/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function saveTemporaryFile(
  data: Uint8Array<ArrayBufferLike>,
  filename: string,
): Promise<{filepath: string}> {
  try {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'chrome-devtools-mcp-'),
    );

    const filepath = path.join(dir, filename);
    await fs.writeFile(filepath, data);
    return {filepath};
  } catch (err) {
    throw new Error('Could not save a file', {cause: err});
  }
}
