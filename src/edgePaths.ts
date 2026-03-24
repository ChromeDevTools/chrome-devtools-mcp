/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Channel = 'stable' | 'canary' | 'beta' | 'dev';

function win32EdgeExe(envVar: string, fallback: string, folder: string) {
  if (!process.env[envVar] && !fallback) {
    return '';
  }
  return path.join(
    process.env[envVar] ?? fallback,
    'Microsoft',
    folder,
    'Application',
    'msedge.exe',
  );
}

function win32EdgeExePaths(folder: string): string[] {
  return [
    win32EdgeExe('PROGRAMFILES(X86)', 'C:\\Program Files (x86)', folder),
    win32EdgeExe('LOCALAPPDATA', '', folder)
  ].filter(p => p); // Filter out empty paths if env vars are missing
}

const EDGE_EXECUTABLE_PATHS: Record<
  string,
  Partial<Record<Channel, string[]>>
> = {
  win32: {
    stable: win32EdgeExePaths('Edge'),
    beta: win32EdgeExePaths('Edge Beta'),
    dev: win32EdgeExePaths('Edge Dev'),
    canary: process.env['LOCALAPPDATA']
      ? [win32EdgeExe('LOCALAPPDATA', '', 'Edge SxS')]
      : [],
  },
  darwin: {
    stable: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    beta: [
      '/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta',
    ],
    dev: [
      '/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev',
    ],
    canary: [
      '/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary',
    ],
  },
  linux: {
    stable: ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge'],
    beta: ['/opt/microsoft/msedge-beta/msedge', '/usr/bin/microsoft-edge-beta'],
    dev: ['/opt/microsoft/msedge-dev/msedge', '/usr/bin/microsoft-edge-dev'],
  },
};

export function resolveEdgeExecutablePath(channel: Channel): string {
  const platform = os.platform();
  const paths = EDGE_EXECUTABLE_PATHS[platform]?.[channel];
  if (!paths || paths.length === 0) {
    throw new Error(`Edge ${channel} channel is not available on ${platform}.`);
  }
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const channelName =
    channel === 'stable'
      ? 'Edge'
      : `Edge ${channel[0].toUpperCase() + channel.slice(1)}`;
  throw new Error(
    `Could not find Microsoft ${channelName} executable. Tried:\n` +
      paths.map(p => `  ${p}`).join('\n') +
      `\nInstall ${channelName} or use --executablePath to specify the path manually.`,
  );
}

function win32EdgeUserDataDir(folder: string): string | undefined {
  if (!process.env['LOCALAPPDATA']) {
    return undefined;
  }
  return path.join(
    process.env['LOCALAPPDATA'],
    'Microsoft',
    folder,
    'User Data',
  );
}

const EDGE_USER_DATA_DIRS: Record<string, Partial<Record<Channel, string>>> = {
  win32: {
    ...(process.env['LOCALAPPDATA']
      ? {
          stable: win32EdgeUserDataDir('Edge')!,
          beta: win32EdgeUserDataDir('Edge Beta')!,
          dev: win32EdgeUserDataDir('Edge Dev')!,
          canary: win32EdgeUserDataDir('Edge SxS')!,
        }
      : {}),
  },
  darwin: {
    stable: path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Microsoft Edge',
    ),
    beta: path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Microsoft Edge Beta',
    ),
    dev: path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Microsoft Edge Dev',
    ),
    canary: path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Microsoft Edge Canary',
    ),
  },
  linux: {
    stable: path.join(os.homedir(), '.config', 'microsoft-edge'),
    beta: path.join(os.homedir(), '.config', 'microsoft-edge-beta'),
    dev: path.join(os.homedir(), '.config', 'microsoft-edge-dev'),
  },
};

export function resolveEdgeUserDataDir(channel: Channel): string {
  const platform = os.platform();
  const dir = EDGE_USER_DATA_DIRS[platform]?.[channel];
  if (!dir) {
    throw new Error(`Edge ${channel} channel is not available on ${platform}.`);
  }
  return dir;
}
