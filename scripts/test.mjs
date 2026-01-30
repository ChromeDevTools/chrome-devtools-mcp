/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Note: can be converted to ts file once node 20 support is dropped.
// Node 20 does not support --experimental-strip-types flag.

import {spawn} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const userArgs = args.filter(arg => !arg.startsWith('-'));
const flags = args.filter(arg => arg.startsWith('-'));

const files = [];

let shouldRetry = false;
const retryIndex = flags.indexOf('--retry');
if (retryIndex !== -1) {
  shouldRetry = true;
  flags.splice(retryIndex, 1);
}

if (userArgs.length > 0) {
  for (const arg of userArgs) {
    // Map .ts files to build/ .js files
    let testPath = arg;
    if (testPath.endsWith('.ts')) {
      testPath = testPath.replace(/\.ts$/, '.js');
      if (!testPath.startsWith('build/')) {
        testPath = path.join('build', testPath);
      }
    }
    files.push(testPath);
  }
} else {
  const isNode20 = process.version.startsWith('v20.');
  if (isNode20) {
    files.push('build/tests');
  } else {
    files.push('build/tests/**/*.test.js');
  }
}

const nodeArgs = [
  '--import',
  './build/tests/setup.js',
  '--no-warnings=ExperimentalWarning',
  '--test-reporter',
  'spec',
  '--test-force-exit',
  '--test',
  '--test-timeout=60000',
  ...flags,
  ...files,
];

async function runTests(attempt) {
  if (attempt > 1) {
    console.log(`\nRun attempt ${attempt}...\n`);
  }
  return new Promise(resolve => {
    const child = spawn('node', nodeArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: true,
      },
    });

    child.on('close', code => {
      resolve(code);
    });
  });
}

const maxAttempts = shouldRetry ? 3 : 1;
let exitCode = 1;

for (let i = 1; i <= maxAttempts; i++) {
  exitCode = await runTests(i);
  if (exitCode === 0) {
    break;
  }
}

process.exit(exitCode ?? 1);
