/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {logger} from './logger.js';
import type {
  Browser,
  ChromeReleaseChannel,
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
  ]);

  return function targetFilter(target: Target): boolean {
    if (target.url() === 'chrome://newtab/') {
      return true;
    }
    // Could be the only page opened in the browser.
    if (target.url().startsWith('chrome://inspect')) {
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
    const userDataDir = options.userDataDir;
    if (userDataDir) {
      // TODO: re-expose this logic via Puppeteer.
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
          `Could not connect to Chrome in ${userDataDir}. Check if Chrome is running and remote debugging is enabled.`,
          {
            cause: error,
          },
        );
      }
    } else {
      if (!channel) {
        throw new Error('Channel must be provided if userDataDir is missing');
      }
      connectOptions.channel = (
        channel === 'stable' ? 'chrome' : `chrome-${channel}`
      ) as ChromeReleaseChannel;
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
      'Could not connect to Chrome. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.',
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
  chromeArgs?: string[];
  ignoreDefaultChromeArgs?: string[];
  devtools: boolean;
  enableExtensions?: boolean;
}

export function detectDisplay(): void {
  // Only detect display on Linux/UNIX.
  if (os.platform() === 'win32' || os.platform() === 'darwin') {
    return;
  }
  if (!process.env['DISPLAY']) {
    try {
      const result = execSync(
        `ps -u $(id -u) -o pid= | xargs -I{} cat /proc/{}/environ 2>/dev/null | tr '\\0' '\\n' | grep -m1 '^DISPLAY=' | cut -d= -f2`,
      );
      const display = result.toString('utf8').trim();
      process.env['DISPLAY'] = display;
    } catch {
      // no-op
    }
  }
}

/**
 * Removes stale Chrome singleton lock files from a user data directory.
 *
 * When an MCP client crashes without cleanly shutting down the browser,
 * Chrome's singleton lock files (SingletonLock, SingletonSocket,
 * SingletonCookie) remain on disk. On the next startup, Chrome refuses to
 * launch because it thinks an instance is already running. This function
 * checks whether the process referenced by SingletonLock is still alive and,
 * if not, removes the stale lock files so Chrome can start cleanly.
 */
async function clearStaleSingletonLock(userDataDir: string): Promise<void> {
  const lockPath = path.join(userDataDir, 'SingletonLock');
  let lockTarget: string;
  try {
    lockTarget = await fs.promises.readlink(lockPath);
  } catch {
    return; // No lock file present, nothing to do.
  }

  const pid = parseInt(lockTarget.split('-').at(-1) ?? '', 10);
  if (isNaN(pid)) {
    return;
  }

  try {
    process.kill(pid, 0); // Throws if the process does not exist.
    return; // Process is alive, leave the lock alone.
  } catch {
    // Process is gone — the lock is stale.
  }

  logger(`Removing stale Chrome singleton lock for PID ${pid} in ${userDataDir}`);
  await Promise.all([
    fs.promises.unlink(lockPath).catch(() => {}),
    fs.promises.unlink(path.join(userDataDir, 'SingletonSocket')).catch(() => {}),
    fs.promises.unlink(path.join(userDataDir, 'SingletonCookie')).catch(() => {}),
  ]);
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
    ...(options.chromeArgs ?? []),
    '--hide-crash-restore-bubble',
  ];
  const ignoreDefaultArgs: LaunchOptions['ignoreDefaultArgs'] =
    options.ignoreDefaultChromeArgs ?? false;

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

  if (!headless) {
    detectDisplay();
  }

  if (userDataDir) {
    await clearStaleSingletonLock(userDataDir);
  }

  try {
    const browser = await puppeteer.launch({
      channel: puppeteerChannel,
      targetFilter: makeTargetFilter(),
      executablePath,
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
      // FIXME: we are probably subscribing too late to catch startup logs. We
      // should expose the process earlier or expose the getRecentLogs() getter.
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

export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
