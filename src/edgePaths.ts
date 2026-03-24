/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Channel = 'stable' | 'canary' | 'beta' | 'dev';

const EDGE_EXECUTABLE_PATHS: Record<
  string,
  Partial<Record<Channel, string[]>>
> = {
  win32: {
    stable: [
      path.join(
        process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
        'Microsoft',
        'Edge',
        'Application',
        'msedge.exe',
      ),
      path.join(
        process.env['PROGRAMFILES'] ?? 'C:\\Program Files',
        'Microsoft',
        'Edge',
        'Application',
        'msedge.exe',
      ),
      ...(process.env['LOCALAPPDATA']
        ? [
            path.join(
              process.env['LOCALAPPDATA'],
              'Microsoft',
              'Edge',
              'Application',
              'msedge.exe',
            ),
          ]
        : []),
    ],
    beta: [
      path.join(
        process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
        'Microsoft',
        'Edge Beta',
        'Application',
        'msedge.exe',
      ),
      path.join(
        process.env['PROGRAMFILES'] ?? 'C:\\Program Files',
        'Microsoft',
        'Edge Beta',
        'Application',
        'msedge.exe',
      ),
      ...(process.env['LOCALAPPDATA']
        ? [
            path.join(
              process.env['LOCALAPPDATA'],
              'Microsoft',
              'Edge Beta',
              'Application',
              'msedge.exe',
            ),
          ]
        : []),
    ],
    dev: [
      path.join(
        process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
        'Microsoft',
        'Edge Dev',
        'Application',
        'msedge.exe',
      ),
      path.join(
        process.env['PROGRAMFILES'] ?? 'C:\\Program Files',
        'Microsoft',
        'Edge Dev',
        'Application',
        'msedge.exe',
      ),
      ...(process.env['LOCALAPPDATA']
        ? [
            path.join(
              process.env['LOCALAPPDATA'],
              'Microsoft',
              'Edge Dev',
              'Application',
              'msedge.exe',
            ),
          ]
        : []),
    ],
    canary: [
      ...(process.env['LOCALAPPDATA']
        ? [
            path.join(
              process.env['LOCALAPPDATA'],
              'Microsoft',
              'Edge SxS',
              'Application',
              'msedge.exe',
            ),
          ]
        : []),
    ],
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

const EDGE_USER_DATA_DIRS: Record<string, Partial<Record<Channel, string>>> = {
  win32: {
    ...(process.env['LOCALAPPDATA']
      ? {
          stable: path.join(
            process.env['LOCALAPPDATA'],
            'Microsoft',
            'Edge',
            'User Data',
          ),
          beta: path.join(
            process.env['LOCALAPPDATA'],
            'Microsoft',
            'Edge Beta',
            'User Data',
          ),
          dev: path.join(
            process.env['LOCALAPPDATA'],
            'Microsoft',
            'Edge Dev',
            'User Data',
          ),
          canary: path.join(
            process.env['LOCALAPPDATA'],
            'Microsoft',
            'Edge SxS',
            'User Data',
          ),
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
