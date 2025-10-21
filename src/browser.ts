/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  Browser,
  ChromeReleaseChannel,
  LaunchOptions,
  Target,
} from './third_party/index.js';
import {puppeteer} from './third_party/index.js';

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

export async function ensureBrowserConnected(options: {
  browserURL?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  devtools: boolean;
}) {
  if (browser?.connected) {
    return browser;
  }

  const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
    targetFilter: makeTargetFilter(options.devtools),
    defaultViewport: null,
    handleDevToolsAsPage: options.devtools,
  };

  if (options.wsEndpoint) {
    connectOptions.browserWSEndpoint = options.wsEndpoint;
    if (options.wsHeaders) {
      connectOptions.headers = options.wsHeaders;
    }
  } else if (options.browserURL) {
    connectOptions.browserURL = options.browserURL;
  } else {
    throw new Error('Either browserURL or wsEndpoint must be provided');
  }

  browser = await puppeteer.connect(connectOptions);
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
  args?: string[];
  devtools: boolean;
}

export async function launch(options: McpLaunchOptions): Promise<Browser> {
  const {channel, executablePath, headless, isolated} = options;
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
    ...(options.args ?? []),
    '--hide-crash-restore-bubble',
  ];
  if (headless) {
    args.push('--screen-info={3840x2160}');
  }
  let puppeteerChannel: ChromeReleaseChannel | undefined;
  if (options.devtools) {
    args.push('--auto-open-devtools-for-tabs');
  }
  if (!executablePath) {
    puppeteerChannel =
      channel && channel !== 'stable'
        ? (`chrome-${channel}` as ChromeReleaseChannel)
        : 'chrome';
  }

  try {
    const browser = await puppeteer.launch({
      channel: puppeteerChannel,
      targetFilter: makeTargetFilter(options.devtools),
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: true,
      headless,
      args,
      acceptInsecureCerts: options.acceptInsecureCerts,
      handleDevToolsAsPage: options.devtools,
    });
    if (options.logFile) {
      // FIXME: we are probably subscribing too late to catch startup logs. We
      // should expose the process earlier or expose the getRecentLogs() getter.
      browser.process()?.stderr?.pipe(options.logFile);
      browser.process()?.stdout?.pipe(options.logFile);
    }
    if (options.viewport) {
      const [page] = await browser.pages();
      // @ts-expect-error internal API for now.
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

export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
