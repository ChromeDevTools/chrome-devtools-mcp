/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Note: can be converted to ts file once node 20 support is dropped.
// Node 20 does not support --experimental-strip-types flag.

import {spawn} from 'node:child_process';
import {glob, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {parseArgs} from 'node:util';

const callerCwd = process.cwd();
const projectRoot = path.resolve(import.meta.dirname, '..');

const ownOptions = {
  retry: {
    type: 'boolean',
    default: false,
  },
  'build-dir': {
    type: 'string',
  },
  suite: {
    type: 'string',
    default: 'all',
  },
};

const {
  values,
  positionals: userArgs,
  tokens,
} = parseArgs({
  options: ownOptions,
  strict: false,
  allowPositionals: true,
  tokens: true,
});

const shouldRetry = values.retry;
const suite = values.suite;
const buildDir = values['build-dir']
  ? path.resolve(callerCwd, values['build-dir'])
  : path.join(projectRoot, 'out', 'Default');

const flags = tokens
  .filter(token => token.kind === 'option' && !(token.name in ownOptions))
  .map(token =>
    token.value !== undefined
      ? `${token.rawName}=${token.value}`
      : token.rawName,
  );

const relGenDir = path
  .relative(projectRoot, path.join(buildDir, 'gen'))
  .replaceAll('\\', '/');
const relGenTestsDir = `${relGenDir}/tests`;
const genTestsDir = path.join(buildDir, 'gen', 'tests');

const files = [];

if (userArgs.length > 0) {
  for (const arg of userArgs) {
    // Map .ts files to <buildDir>/gen/ .js files
    let testPath = arg;
    if (testPath.endsWith('.ts')) {
      testPath = testPath.replace(/\.ts$/, '.js');
      if (!testPath.startsWith(`${relGenDir}/`)) {
        testPath = path.posix.join(relGenDir, testPath.replaceAll('\\', '/'));
      }
    }
    files.push(testPath);
  }
} else if (flags.includes('--test-only')) {
  for await (const tsFile of glob('tests/**/*.test.ts', {cwd: projectRoot})) {
    const content = await readFile(path.join(projectRoot, tsFile), 'utf8');
    if (content.includes('.only(')) {
      files.push(
        path.posix.join(
          relGenDir,
          tsFile.replaceAll('\\', '/').replace(/\.ts$/, '.js'),
        ),
      );
    }
  }
  if (files.length === 0) {
    console.warn('no files contain .only');
    process.exit(0);
  }
} else if (suite === 'e2e') {
  files.push(`${relGenTestsDir}/e2e/**/*.test.js`);
} else if (suite === 'unit') {
  for await (const jsFile of glob('**/*.test.js', {cwd: genTestsDir})) {
    const normalized = jsFile.replaceAll('\\', '/');
    if (!normalized.startsWith('e2e/')) {
      files.push(`${relGenTestsDir}/${normalized}`);
    }
  }
} else if (files.length === 0) {
  files.push(`${relGenTestsDir}/**/*.test.js`);
}

// Node runs `availableParallelism() - 1` test files at a time by default, so
// a 2-core CI runner runs one file at a time. Most test files wait on Chrome
// and child processes, so a second file uses the idle CPU. On 2 cores, 2
// files at a time cut the suite from 304 s to 222 s.
if (!flags.some(flag => flag.startsWith('--test-concurrency'))) {
  flags.push(
    `--test-concurrency=${Math.max(2, os.availableParallelism() - 1)}`,
  );
}

const nodeArgs = [
  '--import',
  `./${relGenTestsDir}/setup.js`,
  '--no-warnings=ExperimentalWarning',
  '--test-reporter',
  (process.env['NODE_TEST_REPORTER'] ?? process.env['CI']) ? 'spec' : 'dot',
  '--test-force-exit',
  '--test',
  '--test-timeout=120000',
  ...flags,
  ...files,
];

async function runTests(attempt) {
  if (attempt > 1) {
    console.log(`\nRun attempt ${attempt}...\n`);
  }
  return await new Promise(resolve => {
    const child = spawn(process.execPath, nodeArgs, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: true,
        CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT: true,
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: true,
        CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY: true,
        ...(process.env['RUNNER_DEBUG'] === '1'
          ? {NODE_DEBUG: 'puppeteer:*'}
          : {}),
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
