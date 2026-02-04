/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {logger} from './logger.js';
import type {
  Browser,
  LaunchOptions,
  Target,
} from './third_party/index.js';
import {puppeteer} from './third_party/index.js';

let browser: Browser | undefined;

function makeTargetFilter() {
  const ignoredPrefixes = new Set([
    'chrome://',
    'chrome-extension://',
    'chrome-untrusted://',
    'brave://',
  ]);

  return function targetFilter(target: Target): boolean {
    const url = target.url();
    if (url === 'chrome://newtab/' || url === 'brave://newtab/') {
      return true;
    }
    // Could be the only page opened in the browser.
    if (url.startsWith('chrome://inspect') || url.startsWith('brave://inspect')) {
      return true;
    }
    for (const prefix of ignoredPrefixes) {
      if (url.startsWith(prefix)) {
        return false;
      }
    }
    return true;
  };
}

export type Channel = 'stable' | 'beta' | 'dev' | 'nightly';

export function resolveBraveExecutablePath(channel: Channel): string {
  const platform = os.platform();

  if (platform === 'win32') {
    const channelSuffix =
      channel === 'stable' ? '' :
      channel === 'beta' ? '-Beta' :
      channel === 'dev' ? '-Dev' :
      '-Nightly';
    const folderName = `Brave-Browser${channelSuffix}`;
    const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files';
    const localAppData = process.env['LOCALAPPDATA'] ?? '';

    const candidates = [
      path.join(programFiles, 'BraveSoftware', folderName, 'Application', 'brave.exe'),
      path.join(localAppData, 'BraveSoftware', folderName, 'Application', 'brave.exe'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    throw new Error(
      `Could not find Brave (${channel}) executable. Checked:\n${candidates.join('\n')}`,
    );
  }

  if (platform === 'darwin') {
    const channelSuffix =
      channel === 'stable' ? '' :
      channel === 'beta' ? ' Beta' :
      channel === 'dev' ? ' Dev' :
      ' Nightly';
    const appName = `Brave Browser${channelSuffix}`;
    const candidate = `/Applications/${appName}.app/Contents/MacOS/${appName}`;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    throw new Error(
      `Could not find Brave (${channel}) executable at ${candidate}`,
    );
  }

  // Linux
  const channelSuffix =
    channel === 'stable' ? '' :
    channel === 'beta' ? '-beta' :
    channel === 'dev' ? '-dev' :
    '-nightly';
  const binaryName = `brave-browser${channelSuffix}`;
  const candidates = [
    `/usr/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
    `/snap/bin/${binaryName}`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Could not find Brave (${channel}) executable. Checked:\n${candidates.join('\n')}`,
  );
}

export function resolveBraveUserDataDir(channel: Channel): string {
  const platform = os.platform();

  const channelFolder =
    channel === 'stable' ? 'Brave-Browser' :
    channel === 'beta' ? 'Brave-Browser-Beta' :
    channel === 'dev' ? 'Brave-Browser-Dev' :
    'Brave-Browser-Nightly';

  if (platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'BraveSoftware', channelFolder, 'User Data');
  }

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', channelFolder);
  }

  // Linux
  return path.join(os.homedir(), '.config', 'BraveSoftware', channelFolder);
}

export async function ensureBrowserConnected(options: {
  browserURL?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  devtools: boolean;
  channel?: Channel;
  userDataDir?: string;
}) {
  const {channel} = options;
  if (browser?.connected) {
    return browser;
  }

  const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
    targetFilter: makeTargetFilter(),
    defaultViewport: null,
    handleDevToolsAsPage: true,
  };

  if (options.wsEndpoint) {
    connectOptions.browserWSEndpoint = options.wsEndpoint;
    if (options.wsHeaders) {
      connectOptions.headers = options.wsHeaders;
    }
  } else if (options.browserURL) {
    connectOptions.browserURL = options.browserURL;
  } else if (channel || options.userDataDir) {
    const userDataDir = options.userDataDir ?? (channel ? resolveBraveUserDataDir(channel) : undefined);
    if (userDataDir) {
      const portPath = path.join(userDataDir, 'DevToolsActivePort');
      try {
        const fileContent = await fs.promises.readFile(portPath, 'utf8');
        const [rawPort, rawPath] = fileContent
          .split('\n')
          .map(line => {
            return line.trim();
          })
          .filter(line => {
            return !!line;
          });
        if (!rawPort || !rawPath) {
          throw new Error(`Invalid DevToolsActivePort '${fileContent}' found`);
        }
        const port = parseInt(rawPort, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          throw new Error(`Invalid port '${rawPort}' found`);
        }
        const browserWSEndpoint = `ws://127.0.0.1:${port}${rawPath}`;
        connectOptions.browserWSEndpoint = browserWSEndpoint;
      } catch (error) {
        throw new Error(
          `Could not connect to Brave in ${userDataDir}. Check if Brave is running and remote debugging is enabled.`,
          {
            cause: error,
          },
        );
      }
    } else {
      throw new Error('Channel must be provided if userDataDir is missing');
    }
  } else {
    throw new Error(
      'Either browserURL, wsEndpoint, channel or userDataDir must be provided',
    );
  }

  logger('Connecting Puppeteer to ', JSON.stringify(connectOptions));
  try {
    browser = await puppeteer.connect(connectOptions);
  } catch (err) {
    throw new Error(
      'Could not connect to Brave. Check if Brave is running and remote debugging is enabled by going to brave://inspect/#remote-debugging.',
      {
        cause: err,
      },
    );
  }
  logger('Connected Puppeteer');
  return browser;
}

interface McpLaunchOptions {
  acceptInsecureCerts?: boolean;
  executablePath?: string;
  channel?: Channel;
  userDataDir?: string;
  headless: boolean;
  isolated: boolean;
  logFile?: fs.WriteStream;
  viewport?: {
    width: number;
    height: number;
  };
  braveArgs?: string[];
  ignoreDefaultBraveArgs?: string[];
  devtools: boolean;
  enableExtensions?: boolean;
}

export async function launch(options: McpLaunchOptions): Promise<Browser> {
  const {channel, headless, isolated} = options;
  const profileDirName =
    channel && channel !== 'stable'
      ? `brave-profile-${channel}`
      : 'brave-profile';

  const executablePath = options.executablePath ?? resolveBraveExecutablePath(channel ?? 'stable');

  let userDataDir = options.userDataDir;
  if (!isolated && !userDataDir) {
    userDataDir = path.join(
      os.homedir(),
      '.cache',
      'brave-devtools-mcp',
      profileDirName,
    );
    await fs.promises.mkdir(userDataDir, {
      recursive: true,
    });
  }

  const args: LaunchOptions['args'] = [
    ...(options.braveArgs ?? []),
    '--hide-crash-restore-bubble',
  ];
  const ignoreDefaultArgs: LaunchOptions['ignoreDefaultArgs'] =
    options.ignoreDefaultBraveArgs ?? false;

  if (headless) {
    args.push('--screen-info={3840x2160}');
  }
  if (options.devtools) {
    args.push('--auto-open-devtools-for-tabs');
  }

  try {
    const browser = await puppeteer.launch({
      executablePath,
      targetFilter: makeTargetFilter(),
      defaultViewport: null,
      userDataDir,
      pipe: true,
      headless,
      args,
      ignoreDefaultArgs: ignoreDefaultArgs,
      acceptInsecureCerts: options.acceptInsecureCerts,
      handleDevToolsAsPage: true,
      enableExtensions: options.enableExtensions,
    });
    if (options.logFile) {
      browser.process()?.stderr?.pipe(options.logFile);
      browser.process()?.stdout?.pipe(options.logFile);
    }
    if (options.viewport) {
      const [page] = await browser.pages();
      await page?.resize({
        contentWidth: options.viewport.width,
        contentHeight: options.viewport.height,
      });
    }
    return browser;
  } catch (error) {
    if (
      userDataDir &&
      (error as Error).message.includes('The browser is already running')
    ) {
      throw new Error(
        `The browser is already running for ${userDataDir}. Use --isolated to run multiple browser instances.`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }
}

export async function ensureBrowserLaunched(
  options: McpLaunchOptions,
): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }
  browser = await launch(options);
  return browser;
}
