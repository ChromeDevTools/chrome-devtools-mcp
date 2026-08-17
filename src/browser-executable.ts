/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Platform = ReturnType<typeof os.platform>;

interface ResolveOneBrowserExecutablePathOptions {
  platform?: Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  isExecutable?: (executablePath: string) => boolean;
}

interface ResolveOneBrowserUserDataDirOptions {
  platform?: Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

function defaultIsExecutable(executablePath: string): boolean {
  try {
    fs.accessSync(executablePath, fs.constants.X_OK);
    return fs.statSync(executablePath).isFile();
  } catch {
    return false;
  }
}

function addCandidate(candidates: Set<string>, candidate?: string): void {
  if (candidate) {
    candidates.add(candidate);
  }
}

function getMacExecutableCandidates(homeDir: string): string[] {
  return [
    '/Applications/1Browser.app/Contents/MacOS/1Browser',
    path.join(
      homeDir,
      'Applications',
      '1Browser.app',
      'Contents',
      'MacOS',
      '1Browser',
    ),
  ];
}

function getLinuxExecutableCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates = new Set<string>();
  const pathValue = env['PATH'];
  if (pathValue) {
    for (const directory of pathValue.split(path.delimiter)) {
      if (directory) {
        addCandidate(candidates, path.join(directory, '1browser'));
      }
    }
  }
  addCandidate(candidates, '/usr/bin/1browser');
  addCandidate(candidates, '/usr/local/bin/1browser');
  addCandidate(candidates, '/opt/1browser/1browser');
  return [...candidates];
}

function getWindowsExecutableCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates = new Set<string>();
  const installationRoots = [
    env['PROGRAMFILES'],
    env['PROGRAMW6432'],
    env['PROGRAMFILES(X86)'],
    env['LOCALAPPDATA'],
  ];
  for (const installationRoot of installationRoots) {
    if (!installationRoot) {
      continue;
    }
    addCandidate(
      candidates,
      path.win32.join(
        installationRoot,
        '1Browser',
        '1Browser',
        'Application',
        '1browser.exe',
      ),
    );
  }
  return [...candidates];
}

export function getOneBrowserExecutableCandidates(
  platform: Platform,
  env: NodeJS.ProcessEnv,
  homeDir: string,
): string[] {
  switch (platform) {
    case 'darwin':
      return getMacExecutableCandidates(homeDir);
    case 'linux':
      return getLinuxExecutableCandidates(env);
    case 'win32':
      return getWindowsExecutableCandidates(env);
    default:
      return [];
  }
}

export function resolveOneBrowserExecutablePath(
  options: ResolveOneBrowserExecutablePathOptions = {},
): string {
  const platform = options.platform ?? os.platform();
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const isExecutable = options.isExecutable ?? defaultIsExecutable;

  const environmentPath = env['ONEBROWSER_PATH'];
  if (environmentPath) {
    if (isExecutable(environmentPath)) {
      return environmentPath;
    }
    throw new Error(
      `ONEBROWSER_PATH points to ${environmentPath}, but that file does not exist or is not executable.`,
    );
  }

  const candidates = getOneBrowserExecutableCandidates(platform, env, homeDir);
  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `Could not find 1Browser on unsupported platform '${platform}'. Set the ONEBROWSER_PATH environment variable or pass --executable-path.`,
    );
  }

  throw new Error(
    `Could not find 1Browser executable. Checked:${candidates
      .map(candidate => `\n - ${candidate}`)
      .join(
        '',
      )}\nInstall 1Browser, set ONEBROWSER_PATH, or pass --executable-path.`,
  );
}

export function resolveOneBrowserUserDataDir(
  options: ResolveOneBrowserUserDataDirOptions = {},
): string {
  const platform = options.platform ?? os.platform();
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', '1browser');
    case 'linux':
      return path.join(
        env['XDG_CONFIG_HOME'] ?? path.join(homeDir, '.config'),
        '1browser',
      );
    case 'win32':
      return path.win32.join(
        env['LOCALAPPDATA'] ?? path.win32.join(homeDir, 'AppData', 'Local'),
        '1browser',
        '1browser',
        'User Data',
      );
    default:
      throw new Error(
        `Could not determine the 1Browser user data directory on unsupported platform '${platform}'. Pass --user-data-dir.`,
      );
  }
}
