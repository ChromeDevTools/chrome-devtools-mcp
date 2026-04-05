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
  ChromeReleaseChannel,
  LaunchOptions,
  Target,
} from './third_party/index.js';
import {puppeteer} from './third_party/index.js';
import {applyGhostMode, type GhostModeConfig} from './ghost-mode.js';
import type {ResolvedProfile} from './config/profiles.js';

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
      // Parse DevToolsActivePort file to get the browser WebSocket endpoint.
      // Note: Puppeteer could expose this as a public API in the future.
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
  args?: string[];
  devtools: boolean;
  ghostMode?: Partial<GhostModeConfig>;
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
      targetFilter: makeTargetFilter(),
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: true,
      headless,
      args,
      acceptInsecureCerts: options.acceptInsecureCerts,
      handleDevToolsAsPage: true,
    });

    // 🟢 WORKING: Apply Ghost Mode stealth features
    if (options.ghostMode) {
      await applyGhostMode(browser, options.ghostMode);
      logger('Ghost Mode applied with config:', options.ghostMode);
    }

    if (options.logFile) {
      // Note: Early startup logs (during browser initialization) may be missed
      // due to subscribing after launch completes. This is acceptable as most
      // relevant logs occur after browser initialization. For full Chrome startup
      // logs, use Chromium's --enable-logging flag in args.
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

// --- Profile-based browser management ---

const profileBrowsers = new Map<string, Browser>();

/**
 * Launch or connect a browser for a ResolvedProfile.
 *
 * - 'managed' profiles launch a new Chrome via `launch()`.
 * - 'existing-session' profiles connect to a running Chrome via `ensureBrowserConnected()`.
 *
 * Returns the Browser instance and caches it by profile name.
 * If a connected browser already exists for the profile, returns it immediately.
 */
export async function ensureBrowserForProfile(
  profile: ResolvedProfile,
  ghostMode?: Partial<GhostModeConfig>,
): Promise<Browser> {
  const existing = profileBrowsers.get(profile.name);
  if (existing?.connected) {
    return existing;
  }

  let instance: Browser;

  if (profile.driver === 'managed') {
    const userDataDir =
      profile.userDataDir ??
      path.join(
        os.homedir(),
        '.boss-ghost',
        'profiles',
        profile.name,
        'chrome-data',
      );

    const args: string[] = [...profile.extraArgs];
    if (profile.cdpPort) {
      args.push(`--remote-debugging-port=${profile.cdpPort}`);
    }

    instance = await launch({
      headless: profile.headless,
      channel: profile.channel,
      executablePath: profile.executablePath,
      userDataDir,
      args,
      isolated: false,
      devtools: false,
      ghostMode,
    });
  } else {
    // existing-session: connect to a running browser
    if (profile.cdpUrl) {
      instance = await ensureBrowserConnected({
        wsEndpoint: profile.cdpUrl,
        devtools: false,
      });
    } else {
      instance = await ensureBrowserConnected({
        browserURL: `http://127.0.0.1:${profile.cdpPort}`,
        devtools: false,
      });
    }

    // Apply ghost mode to connected browsers manually since launch() won't do it
    if (ghostMode) {
      await applyGhostMode(instance, ghostMode);
      logger('Ghost Mode applied to connected profile "%s"', profile.name);
    }
  }

  profileBrowsers.set(profile.name, instance);
  logger('Browser ready for profile "%s" (driver=%s)', profile.name, profile.driver);
  return instance;
}

/**
 * Retrieve a cached browser instance by profile name.
 * Returns undefined if no browser exists or it has disconnected.
 */
export function getBrowserForProfile(name: string): Browser | undefined {
  const instance = profileBrowsers.get(name);
  if (instance && !instance.connected) {
    profileBrowsers.delete(name);
    return undefined;
  }
  return instance;
}

/**
 * Close/disconnect a profile's browser and remove it from the cache.
 */
export async function closeBrowserForProfile(name: string): Promise<void> {
  const instance = profileBrowsers.get(name);
  if (!instance) {
    return;
  }

  profileBrowsers.delete(name);

  if (instance.connected) {
    try {
      await instance.close();
      logger('Closed browser for profile "%s"', name);
    } catch (err) {
      logger('Error closing browser for profile "%s": %s', name, err);
    }
  }
}
