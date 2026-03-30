/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {logger} from './logger.js';
import type {
  Browser,
  ChromeReleaseChannel,
  LaunchOptions,
  Target,
} from './third_party/index.js';
import {puppeteer} from './third_party/index.js';

let browser: Browser | undefined;

/**
 * Ensures only one chrome-devtools-mcp process connects to a given endpoint.
 * Multiple CDP clients on the same debug port cause "Network.enable timed out"
 * errors because sessions conflict. This kills any previous instance before
 * connecting.
 */
function getLockDir(): string {
  const uid = os.userInfo().uid;
  const dir = path.join(os.tmpdir(), `chrome-devtools-mcp-${uid}`);
  fs.mkdirSync(dir, {recursive: true});
  return dir;
}

function endpointToLockName(endpoint: string): string {
  // Normalize endpoint to a safe filename. Include host so different
  // hosts on the same port don't collide.
  return endpoint.replace(/[^a-zA-Z0-9]/g, '_') + '.lock';
}

export function acquireEndpointLock(endpoint: string): void {
  const lockPath = path.join(getLockDir(), endpointToLockName(endpoint));

  // Check for and kill any existing owner.
  try {
    const content = fs.readFileSync(lockPath, 'utf-8').trim();
    const lines = content.split('\n');
    const pid = parseInt(lines[0] ?? '', 10);
    if (!isNaN(pid) && pid !== process.pid) {
      try {
        process.kill(pid, 0); // Throws if process doesn't exist.
        logger(`Killing previous MCP process (PID ${pid}) for ${endpoint}`);
        process.kill(pid, 'SIGTERM');
        // Wait for the process to actually exit before proceeding.
        const start = Date.now();
        while (Date.now() - start < 1000) {
          try {
            process.kill(pid, 0);
          } catch {
            break; // Process exited.
          }
        }
        // Force kill if still alive after 1s.
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already dead.
        }
      } catch {
        // Process already dead, stale lock file.
      }
      // Remove stale lock before acquiring.
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Best effort.
      }
    }
  } catch {
    // No lock file exists yet.
  }

  // Write lock atomically. If another process races us, one of us will fail
  // the 'wx' open and retry or proceed without the lock.
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, `${process.pid}\n${endpoint}\n`);
    fs.closeSync(fd);
  } catch {
    // File already exists (race). Overwrite since we already killed the owner.
    fs.writeFileSync(lockPath, `${process.pid}\n${endpoint}\n`);
  }
}

export function releaseEndpointLock(endpoint: string): void {
  try {
    const lockPath = path.join(getLockDir(), endpointToLockName(endpoint));
    const content = fs.readFileSync(lockPath, 'utf-8').trim();
    const pid = parseInt(content.split('\n')[0] ?? '', 10);
    if (pid === process.pid) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // Best effort cleanup.
  }
}

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
          `Could not connect to Chrome in ${userDataDir}. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.`,
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

  // Acquire endpoint lock to prevent multiple clients on the same browser.
  const endpoint = options.browserURL ?? options.wsEndpoint;
  if (endpoint) {
    acquireEndpointLock(endpoint);
  }

  logger('Connecting Puppeteer to ', JSON.stringify(connectOptions));
  try {
    browser = await puppeteer.connect(connectOptions);
  } catch (err) {
    throw new Error(
      `Could not connect to Chrome. ${autoConnect ? `Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.` : `Check if Chrome is running.`}`,
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
