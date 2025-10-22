/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';

import {sed} from './sed.ts';

const projectRoot = process.cwd();

const filesToRemove = [
  'node_modules/chrome-devtools-frontend/package.json',
  'node_modules/chrome-devtools-frontend/front_end/models/trace/lantern/testing',
  'node_modules/chrome-devtools-frontend/front_end/third_party/intl-messageformat/package/package.json',
  'node_modules/chrome-devtools-frontend/front_end/third_party/codemirror.next/codemirror.next.js',
];

async function main() {
  console.log('Running prepare script to clean up chrome-devtools-frontend...');
  for (const file of filesToRemove) {
    const fullPath = resolve(projectRoot, file);
    console.log(`Removing: ${file}`);
    try {
      await rm(fullPath, {recursive: true, force: true});
    } catch (error) {
      console.error(`Failed to remove ${file}:`, error);
      process.exit(1);
    }
  }
  // TODO: remove once https://chromium-review.googlesource.com/c/devtools/devtools-frontend/+/7072054 is available.
  sed(
    'node_modules/chrome-devtools-frontend/front_end/core/sdk/NetworkManager.ts',
    `declare global {
  // TS typedefs are not up to date
  interface URLPattern {
    hash: string;
    hostname: string;
    password: string;
    pathname: string;
    port: string;
    protocol: string;
    search: string;
    username: string;
    hasRegExpGroups: boolean;
    test(url: string): boolean;
  }
  /* eslint-disable-next-line @typescript-eslint/naming-convention */
  var URLPattern: {prototype: URLPattern, new (input: string): URLPattern};
}`,
    '',
  );
  console.log('Clean up of chrome-devtools-frontend complete.');
}

void main();
