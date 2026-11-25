#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {hideBin} from '../third_party/cli.js';
import {checkForUpdates} from '../utils/check-for-updates.js';

import {runCli} from '../daemon/chrome-devtools-cli.js';

process.title = 'chrome-devtools';

await checkForUpdates(
  'Run `npm install -g chrome-devtools-mcp@latest` and `chrome-devtools start` to update and restart the daemon.',
);

const exitCode = await runCli(hideBin(process.argv));
if (exitCode !== 0) {
  process.exit(exitCode);
}
