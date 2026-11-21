/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Note: can be converted to ts file once node 20 support is dropped.
// Node 20 does not support --experimental-strip-types flag.

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {glob, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {parseArgs} from 'node:util';

const callerCwd = process.cwd();
const projectRoot = path.resolve(import.meta.dirname, '..');
const devtoolsRoot = path.resolve(projectRoot, '..');

function resolveDefaultChromePath(buildDir) {
  if (!fs.existsSync(path.join(devtoolsRoot, 'front_end'))) {
    return undefined;
  }
  const platform = os.platform();
  let cftRel;
  if (platform === 'linux') {
    cftRel = path.join('chrome-linux', 'chrome-linux64', 'chrome');
  } else if (platform === 'darwin') {
    const name = os.arch() === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64';
    cftRel = path.join(
      name,
      name,
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    );
  } else if (platform === 'win32') {
    cftRel = path.join('chrome-win', 'chrome-win64', 'chrome.exe');
  }

  if (cftRel) {
    const cftCandidate = path.join(
      devtoolsRoot,
      'third_party',
      'chrome',
      cftRel,
    );
    if (fs.existsSync(cftCandidate)) {
      return cftCandidate;
    }
  }

  const builtNames = {
    linux: 'chrome',
    darwin: path.join('Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    win32: 'chrome.exe',
  };
  if (platform in builtNames) {
    const builtCandidate = path.join(buildDir, builtNames[platform]);
    if (fs.existsSync(builtCandidate)) {
      return builtCandidate;
    }
  }
  return undefined;
}

const ownOptions = {
  retry: {
    type: 'boolean',
    default: false,
  },
  'build-dir': {
    type: 'string',
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
const defaultBuildDir = fs.existsSync(path.join(projectRoot, 'out', 'Default'))
  ? path.join(projectRoot, 'out', 'Default')
  : path.join(devtoolsRoot, 'out', 'Default');
const buildDir = values['build-dir']
  ? path.resolve(callerCwd, values['build-dir'])
  : defaultBuildDir;

const genCandidates = [
  path.join(buildDir, 'gen', 'for_agents'),
  path.join(
    buildDir,
    'gen',
    'third_party',
    'devtools-frontend',
    'src',
    'for_agents',
  ),
  path.join(buildDir, 'gen'),
];
const genDir =
  genCandidates.find(candidate => fs.existsSync(candidate)) ??
  path.join(buildDir, 'gen');

const flags = tokens
  .filter(token => token.kind === 'option' && !(token.name in ownOptions))
  .map(token =>
    token.value !== undefined
      ? `${token.rawName}=${token.value}`
      : token.rawName,
  );

const relGenDir = path.relative(projectRoot, genDir).replaceAll('\\', '/');
const relGenTestsDir = `${relGenDir}/tests`;

const files = [];

if (userArgs.length > 0) {
  for (const arg of userArgs) {
    let testPath = arg.replaceAll('\\', '/');
    if (path.isAbsolute(arg)) {
      const relToProject = path
        .relative(projectRoot, arg)
        .replaceAll('\\', '/');
      const relToGen = path.relative(genDir, arg).replaceAll('\\', '/');
      if (!relToGen.startsWith('..')) {
        testPath = relToGen;
      } else if (!relToProject.startsWith('..')) {
        testPath = relToProject;
      }
    } else if (testPath.startsWith('for_agents/')) {
      testPath = testPath.slice('for_agents/'.length);
    }

    if (testPath.endsWith('.ts')) {
      testPath = testPath.replace(/\.ts$/, '.js');
    }
    if (testPath === 'tests' || testPath === 'tests/') {
      files.push(`${relGenTestsDir}/**/*.test.js`);
      continue;
    }
    if (!testPath.startsWith(`${relGenDir}/`)) {
      testPath = path.posix.join(relGenDir, testPath);
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
} else if (files.length === 0) {
  files.push(`${relGenTestsDir}/**/*.test.js`);
}

// Node runs `availableParallelism() - 1` test files at a time by default, so
// a 2-core CI runner runs one file at a time. Most test files wait on Chrome
// and child processes, so a second file uses the idle CPU. On Windows CI/LUCI
// bots, keep concurrency at 1 to avoid browser contention.
if (!flags.some(flag => flag.startsWith('--test-concurrency'))) {
  const defaultConcurrency =
    process.platform === 'win32'
      ? 1
      : Math.max(2, os.availableParallelism() - 1);
  flags.push(`--test-concurrency=${defaultConcurrency}`);
}

const nodeArgs = [
  '--import',
  `./${relGenTestsDir}/setup.js`,
  '--no-warnings=ExperimentalWarning',
  '--test-reporter',
  (process.env['NODE_TEST_REPORTER'] ??
  process.env['CI'] ??
  process.env['LUCI_CONTEXT'])
    ? 'spec'
    : 'dot',
  '--test-force-exit',
  '--test',
  '--test-timeout=120000',
  ...flags,
  ...files,
];

const defaultChromeExecutable =
  process.env['PUPPETEER_EXECUTABLE_PATH'] ??
  resolveDefaultChromePath(buildDir);

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
        ...(defaultChromeExecutable
          ? {PUPPETEER_EXECUTABLE_PATH: defaultChromeExecutable}
          : {}),
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
        CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT: 'true',
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: 'true',
        CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY: 'true',
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
