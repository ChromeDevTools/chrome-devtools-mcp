/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Note: can be converted to ts file once node 20 support is dropped.
// Node 20 does not support --experimental-strip-types flag.

import {spawn, execSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const userArgs = args.filter(arg => !arg.startsWith('-'));
const flags = args.filter(arg => arg.startsWith('-'));

/** Default per-root-test limit (fast CI failures). */
const DEFAULT_TEST_TIMEOUT_MS = Number(
  process.env['CHROME_DEVTOOLS_MCP_TEST_TIMEOUT_MS'] ?? 60_000,
);

/** Root timeout for heavy E2E files (100+ MCP launches; lighthouse). */
const LONG_TEST_TIMEOUT_MS = Number(
  process.env['CHROME_DEVTOOLS_MCP_LONG_TEST_TIMEOUT_MS'] ?? 900_000,
);

let shouldRetry = false;
const retryIndex = flags.indexOf('--retry');
if (retryIndex !== -1) {
  shouldRetry = true;
  flags.splice(retryIndex, 1);
}

/**
 * Under build/tests/e2e/comparison/, the root test spans many subtests or
 * long lighthouse work; a 60s root limit cancels the file mid-run.
 */
function isLongE2eComparisonFile(file) {
  const normalized = file.split(path.sep).join('/');
  return (
    normalized.includes('/e2e/comparison/') && normalized.endsWith('.test.js')
  );
}

async function globTestJsFiles() {
  const {glob} = await import('node:fs/promises');
  const out = [];
  for await (const tsFile of glob('tests/**/*.test.ts')) {
    out.push(path.join('build', tsFile.replace(/\.ts$/, '.js')));
  }
  return out.sort();
}

/**
 * @param {string[]} files
 * @returns {{ fast: string[]; long: string[] }}
 */
function partitionByTimeout(files) {
  const long = [];
  const fast = [];
  for (const f of files) {
    (isLongE2eComparisonFile(f) ? long : fast).push(f);
  }
  return {fast, long};
}

function buildNodeArgs(testTimeoutMs, testFiles) {
  return [
    '--import',
    './build/tests/setup.js',
    '--no-warnings=ExperimentalWarning',
    '--test-reporter',
    (process.env['NODE_TEST_REPORTER'] ?? process.env['CI']) ? 'spec' : 'dot',
    '--test-force-exit',
    '--test-concurrency=1',
    '--test',
    `--test-timeout=${testTimeoutMs}`,
    ...flags,
    ...testFiles,
  ];
}

function installChrome(version) {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const p = process.env.PUPPETEER_EXECUTABLE_PATH;
    try {
      execSync(`test -x "${p}"`);
      return p;
    } catch {
      // fall through to install
    }
  }
  try {
    return execSync(
      `npx puppeteer browsers install chrome@${version} --format "{{path}}"`,
    )
      .toString()
      .trim();
  } catch (e) {
    console.error(`Failed to install Chrome ${version}:`, e);
    process.exit(1);
  }
}

async function runNodeTestBatch(testTimeoutMs, testFiles, label) {
  if (testFiles.length === 0) {
    return 0;
  }
  if (label) {
    console.error(
      `\n[test] ${label} (${testFiles.length} file(s), ` +
        `timeout ${testTimeoutMs}ms)\n`,
    );
  }
  const nodeArgs = buildNodeArgs(testTimeoutMs, testFiles);
  return await new Promise(resolve => {
    const child = spawn('node', nodeArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: true,
        CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT: true,
      },
    });
    child.on('close', code => {
      resolve(code ?? 1);
    });
  });
}

async function resolveTestFiles() {
  if (userArgs.length > 0) {
    const files = [];
    for (const arg of userArgs) {
      let testPath = arg;
      if (testPath.endsWith('.ts')) {
        testPath = testPath.replace(/\.ts$/, '.js');
        if (!testPath.startsWith('build/')) {
          testPath = path.join('build', testPath);
        }
      }
      files.push(testPath);
    }
    return {mode: 'explicit', files};
  }

  const isNode20 = process.version.startsWith('v20.');
  if (flags.includes('--test-only')) {
    if (isNode20) {
      throw new Error(`--test-only is not supported for Node 20`);
    }
    const {glob} = await import('node:fs/promises');
    const files = [];
    for await (const tsFile of glob('tests/**/*.test.ts')) {
      const content = await readFile(tsFile, 'utf8');
      if (content.includes('.only(')) {
        files.push(path.join('build', tsFile.replace(/\.ts$/, '.js')));
      }
    }
    return {mode: 'only', files};
  }

  const files = await globTestJsFiles();
  return {mode: 'default', files};
}

async function runFullSuite() {
  const resolved = await resolveTestFiles();
  const {files, mode} = resolved;

  if (mode === 'only' && files.length === 0) {
    console.warn('no files contain .only');
    return 0;
  }

  const usePartition = mode === 'default';
  const split = usePartition
    ? partitionByTimeout(files)
    : {fast: files, long: []};
  const anyLong = files.some(isLongE2eComparisonFile);

  if (usePartition) {
    const c1 = await runNodeTestBatch(
      DEFAULT_TEST_TIMEOUT_MS,
      split.fast,
      'default timeout',
    );
    if (c1 !== 0) {
      return c1;
    }
    return await runNodeTestBatch(
      LONG_TEST_TIMEOUT_MS,
      split.long,
      'extended timeout (e2e/comparison)',
    );
  }

  const timeout = anyLong ? LONG_TEST_TIMEOUT_MS : DEFAULT_TEST_TIMEOUT_MS;
  return await runNodeTestBatch(timeout, files, '');
}

const chromePath = installChrome('146.0.7680.31');
process.env.CHROME_M146_EXECUTABLE_PATH = chromePath;
process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;

const maxAttempts = shouldRetry ? 3 : 1;
let exitCode = 1;

for (let i = 1; i <= maxAttempts; i++) {
  if (i > 1) {
    console.log(`\nRun attempt ${i}...\n`);
  }
  exitCode = await runFullSuite();
  if (exitCode === 0) {
    break;
  }
}

process.exit(exitCode);
