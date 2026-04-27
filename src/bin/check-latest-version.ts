/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const cachePath = process.argv[2];

if (cachePath) {
  try {
    const registry =
      process.env.npm_config_registry?.replace(/\/$/, '') ||
      'https://registry.npmjs.org';
    const response = await fetch(
      `${registry}/chrome-devtools-mcp/latest`,
    );
    const data = response.ok ? await response.json() : null;

    if (
      data &&
      typeof data === 'object' &&
      'version' in data &&
      typeof data.version === 'string'
    ) {
      await fs.mkdir(path.dirname(cachePath), {recursive: true});
      await fs.writeFile(cachePath, JSON.stringify({version: data.version}));
    }
  } catch {
    // Ignore errors.
  }
}
