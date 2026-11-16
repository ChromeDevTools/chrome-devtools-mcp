/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {spawnSync} from 'node:child_process';
import {appendFileSync, existsSync, writeFileSync} from 'node:fs';
import {delimiter, dirname, join, resolve} from 'node:path';

import {runGnGen} from './gn-gen.ts';

const isWindows = process.platform === 'win32';
const projectRoot = process.cwd();
const thirdPartyDir = resolve(projectRoot, 'third_party');
const devtoolsDir = resolve(thirdPartyDir, 'devtools-frontend');

const GCLIENT_SPEC = `solutions = [
  {
    "name": "devtools-frontend",
    "url": None,
    "deps_file": "DEPS",
    "managed": False,
    "custom_deps": {
      "third_party/chrome/chrome-linux": None,
      "third_party/chrome/chrome-mac-x64": None,
      "third_party/chrome/chrome-mac-arm64": None,
      "third_party/chrome/chrome-win": None,
      "third_party/depot_tools": None,
    },
  },
]
`;

interface RunOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell?: boolean;
}

// Windows stores PATH under a case-insensitive key such as `Path`.
function getPathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
}

function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const names = isWindows ? [`${command}.bat`, `${command}.exe`] : [command];
  for (const dir of (env[getPathKey(env)] ?? '').split(delimiter)) {
    if (!dir) {
      continue;
    }
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function prependToPath(env: NodeJS.ProcessEnv, dir: string): void {
  const key = getPathKey(env);
  const current = env[key];
  env[key] = current ? `${dir}${delimiter}${current}` : dir;
}

function run(
  command: string,
  args: string[],
  {cwd, env, shell}: RunOptions,
): void {
  const commandLine = [command, ...args].join(' ');
  console.log(`> ${commandLine} (in ${cwd})`);
  const result = shell
    ? spawnSync(commandLine, {cwd, env, stdio: 'inherit', shell: true})
    : spawnSync(command, args, {cwd, env, stdio: 'inherit'});
  if (result.error) {
    throw new Error(
      `Failed to start "${commandLine}" in ${cwd}: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const exit = result.status ?? result.signal;
    throw new Error(`"${commandLine}" in ${cwd} exited with ${exit}`);
  }
}

// depot_tools uses `.bat` launchers on Windows, which only a shell can run.
// Callers pass fixed arguments without spaces, so joining them is safe.
function runDepotTool(tool: string, args: string[], options: RunOptions): void {
  run(tool, args, {...options, shell: isWindows});
}

const env: NodeJS.ProcessEnv = {...process.env, DEPOT_TOOLS_WIN_TOOLCHAIN: '0'};

console.log(`Setting up gclient in ${thirdPartyDir}`);

let depotToolsDir: string;
const gclientOnPath = findOnPath('gclient', env);
if (gclientOnPath) {
  depotToolsDir = dirname(gclientOnPath);
  console.log(`Using depot_tools from PATH (${depotToolsDir}).`);
} else {
  depotToolsDir = resolve(thirdPartyDir, 'depot_tools');
  if (existsSync(depotToolsDir)) {
    console.log(`depot_tools already exists in ${depotToolsDir}.`);
  } else {
    console.log('Cloning depot_tools...');
    run(
      'git',
      [
        'clone',
        'https://chromium.googlesource.com/chromium/tools/depot_tools.git',
        depotToolsDir,
      ],
      {cwd: projectRoot, env},
    );
  }
  prependToPath(env, depotToolsDir);

  const githubPath = process.env['GITHUB_PATH'];
  if (githubPath) {
    console.log('Adding depot_tools to GITHUB_PATH...');
    appendFileSync(githubPath, `${depotToolsDir}\n`);
  }
}

const gclientFile = join(thirdPartyDir, '.gclient');
console.log(`Writing ${gclientFile}...`);
writeFileSync(gclientFile, GCLIENT_SPEC);

console.log('Running gclient sync...');
runDepotTool('gclient', ['sync', '--nohooks'], {cwd: devtoolsDir, env});

const pythonPath = env['PYTHONPATH'];
runDepotTool(
  'vpython3',
  ['build/util/lastchange.py', '-o', 'build/util/LASTCHANGE'],
  {
    cwd: devtoolsDir,
    env: {
      ...env,
      PYTHONPATH: pythonPath
        ? `${depotToolsDir}${delimiter}${pythonPath}`
        : depotToolsDir,
    },
  },
);

if (
  existsSync(resolve(devtoolsDir, 'scripts', 'deps', 'ensure_node_modules.py'))
) {
  runDepotTool('vpython3', ['scripts/deps/ensure_node_modules.py'], {
    cwd: devtoolsDir,
    env,
  });
}

console.log('Linking DevTools DEPS and generating GN build files...');
runGnGen();
