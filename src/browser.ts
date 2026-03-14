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

function makeTargetFilter(enableExtensions = false) {
  const ignoredPrefixes = new Set(['chrome://', 'chrome-untrusted://']);
  if (!enableExtensions) {
    ignoredPrefixes.add('chrome-extension://');
  }

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
  enableExtensions?: boolean;
}) {
  const {channel, enableExtensions} = options;
  if (browser?.connected) {
    return browser;
  }

  // Clear stale browser reference to force fresh reconnection.
  if (browser) {
    logger('Browser disconnected, clearing stale reference');
    browser = undefined;
  }

  const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
    targetFilter: makeTargetFilter(enableExtensions),
    defaultViewport: null,
    handleDevToolsAsPage: true,
  };

  let autoConnect = false;
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
      autoConnect = true;
      await readDevToolsActivePort(userDataDir, connectOptions);
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
  const retryDelays = [500, 1000, 2000];
  let lastConnectError: unknown;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      browser = await puppeteer.connect(connectOptions);
      lastConnectError = undefined;
      break;
    } catch (err) {
      lastConnectError = err;
      if (attempt < retryDelays.length) {
        logger(
          `Connection attempt ${attempt + 1} failed, retrying in ${retryDelays[attempt]}ms...`,
        );
        await new Promise(resolve =>
          setTimeout(resolve, retryDelays[attempt]),
        );
        // Re-read DevToolsActivePort in case Chrome restarted with a new port.
        if (autoConnect && options.userDataDir) {
          try {
            await readDevToolsActivePort(options.userDataDir, connectOptions);
          } catch {
            // Will retry connection with existing endpoint.
          }
        }
      }
    }
  }
  if (lastConnectError) {
    throw new Error(
      `Could not connect to Chrome. ${autoConnect ? `Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.` : `Check if Chrome is running.`}`,
      {
        cause: lastConnectError,
      },
    );
  }
  logger('Connected Puppeteer');
  // browser is guaranteed to be set here: either puppeteer.connect succeeded
  // or lastConnectError was thrown above.
  return browser!;
}

async function readDevToolsActivePort(
  userDataDir: string,
  connectOptions: Parameters<typeof puppeteer.connect>[0],
): Promise<void> {
  // TODO: re-expose this logic via Puppeteer.
  const portPath = path.join(userDataDir, 'DevToolsActivePort');
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const fileContent = await fs.promises.readFile(portPath, 'utf8');
      const [rawPort, rawPath] = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => !!line);
      if (!rawPort || !rawPath) {
        throw new Error(`Invalid DevToolsActivePort '${fileContent}' found`);
      }
      const port = parseInt(rawPort, 10);
      if (isNaN(port) || port <= 0 || port > 65535) {
        throw new Error(`Invalid port '${rawPort}' found`);
      }
      connectOptions.browserWSEndpoint = `ws://127.0.0.1:${port}${rawPath}`;
      return;
    } catch (error) {
      // Validation errors (invalid port/format) won't self-resolve — fail immediately.
      if (error instanceof Error && (error.message.startsWith('Invalid port') || error.message.startsWith('Invalid DevToolsActivePort'))) {
        throw error;
      }
      lastError = error;
      if (attempt < 4) {
        logger(
          `DevToolsActivePort read attempt ${attempt + 1} failed, retrying in 1s...`,
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  throw new Error(
    `Could not connect to Chrome in ${userDataDir}. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.`,
    {cause: lastError},
  );
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
  viaCli?: boolean;
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
      options.viaCli ? 'chrome-devtools-mcp-cli' : 'chrome-devtools-mcp',
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

  try {
    const browser = await puppeteer.launch({
      channel: puppeteerChannel,
      targetFilter: makeTargetFilter(options.enableExtensions),
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
