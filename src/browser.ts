/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer, {
  Browser,
  ChromeReleaseChannel,
  ConnectOptions,
  LaunchOptions,
  Target,
} from 'puppeteer-core';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs';

let browser: Browser | undefined;

function makeTargetFilter(devtools: boolean) {
  const ignoredPrefixes = new Set([
    'chrome://',
    'chrome-extension://',
    'chrome-untrusted://',
  ]);

  if (!devtools) {
    ignoredPrefixes.add('devtools://');
  }
  return function targetFilter(target: Target): boolean {
    if (target.url() === 'chrome://newtab/') {
      return true;
    }
    for (const prefix of ignoredPrefixes) {
      if (target.url().startsWith(prefix)) {
        return false;
      }
    }
    return true;
  };
}

const connectOptions: ConnectOptions = {
  // We do not expect any single CDP command to take more than 10sec.
  protocolTimeout: 10_000,
};

async function ensureBrowserConnected(options: {
  browserURL: string;
  devtools: boolean;
}) {
  if (browser?.connected) {
    return browser;
  }
  browser = await puppeteer.connect({
    ...connectOptions,
    targetFilter: makeTargetFilter(options.devtools),
    browserURL: options.browserURL,
    defaultViewport: null,
  });
  return browser;
}

type McpLaunchOptions = {
  executablePath?: string;
  customDevTools?: string;
  channel?: Channel;
  userDataDir?: string;
  headless: boolean;
  isolated: boolean;
  devtools: boolean;
};

export async function launch(options: McpLaunchOptions): Promise<Browser> {
  const {channel, executablePath, customDevTools, headless, isolated} = options;
  const profileDirName =
    channel && channel !== 'stable'
      ? `chrome-profile-${channel}`
      : 'chrome-profile';

  let userDataDir = options.userDataDir;
  if (!isolated && !userDataDir) {
    userDataDir = path.join(
      os.homedir(),
      '.cache',
      'chrome-devtools-mcp',
      profileDirName,
    );
    await fs.promises.mkdir(userDataDir, {
      recursive: true,
    });
  }

  const args: LaunchOptions['args'] = [
    '--remote-debugging-pipe',
    '--no-first-run',
    '--hide-crash-restore-bubble',
  ];
  if (customDevTools) {
    args.push(`--custom-devtools-frontend=file://${customDevTools}`);
  }
  if (options.devtools) {
    args.push('--auto-open-devtools-for-tabs');
  }
  let puppeterChannel: ChromeReleaseChannel | undefined;
  if (!executablePath) {
    puppeterChannel =
      channel && channel !== 'stable'
        ? (`chrome-${channel}` as ChromeReleaseChannel)
        : 'chrome';
  }

  try {
    return await puppeteer.launch({
      ...connectOptions,
      targetFilter: makeTargetFilter(options.devtools),
      channel: puppeterChannel,
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: true,
      headless,
      args,
    });
  } catch (error) {
    // TODO: check browser logs for `Failed to create a ProcessSingleton for
    // your profile directory` instead.
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

async function ensureBrowserLaunched(
  options: McpLaunchOptions,
): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }
  browser = await launch(options);
  return browser;
}

export async function resolveBrowser(
  options: McpLaunchOptions & {
    browserUrl?: string;
  },
) {
  const browser = options.browserUrl
    ? await ensureBrowserConnected({
        browserURL: options.browserUrl,
        devtools: options.devtools,
      })
    : await ensureBrowserLaunched(options);

  return browser;
}

export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
