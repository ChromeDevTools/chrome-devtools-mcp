/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

function getRegistry(): string {
  // Use the user's configured npm registry so update checks work behind
  // corporate proxies and private registries. `npm config get registry`
  // honors .npmrc files at every scope and respects npm_config_registry,
  // so it covers direct CLI invocations as well as `npx` / `npm run`.
  try {
    const registry = execSync('npm config get registry', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    })
      .trim()
      .replace(/\/$/, '');
    if (registry && registry !== 'undefined' && /^https?:\/\//.test(registry)) {
      return registry;
    }
  } catch {
    // npm not on PATH or other errors, fall back to default.
  }
  return DEFAULT_REGISTRY;
}

const cachePath = process.argv[2];

if (cachePath) {
  try {
    const response = await fetch(`${getRegistry()}/chrome-devtools-mcp/latest`);
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
