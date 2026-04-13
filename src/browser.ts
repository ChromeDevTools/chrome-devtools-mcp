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
  LaunchOptions,
  Target,
} from './third_party/index.js';
import {puppeteer} from './third_party/index.js';

let browser: Browser | undefined;

export type Channel = 'release' | 'beta' | 'nightly' | 'dev';

function makeTargetFilter(enableExtensions = false) {
  const ignoredPrefixes = new Set([
    'chrome://',
    'chrome-untrusted://',
    'brave://',
  ]);
  if (!enableExtensions) {
    ignoredPrefixes.add('chrome-extension://');
  }

  return function targetFilter(target: Target): boolean {
    if (target.url() === 'brave://newtab/' || target.url() === 'chrome://newtab/') {
      return true;
    }
    if (target.url().startsWith('brave://inspect') || target.url().startsWith('chrome://inspect')) {
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

function resolveBraveExecutablePath(channel?: Channel): string {
  const envPath = process.env['BRAVE_PATH'];
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      throw new Error(`BRAVE_PATH points to ${envPath} but that file does not exist.`);
    }
    return envPath;
  }

  const platform = os.platform();

  if (platform === 'darwin') {
    const paths: Record<Channel, string> = {
      release: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      beta: '/Applications/Brave Browser Beta.app/Contents/MacOS/Brave Browser Beta',
      nightly: '/Applications/Brave Browser Nightly.app/Contents/MacOS/Brave Browser Nightly',
      dev: '/Applications/Brave Browser Dev.app/Contents/MacOS/Brave Browser Dev',
    };
    const resolved = paths[channel ?? 'release'];
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    throw new Error(
      `Could not find Brave Browser (${channel ?? 'release'}) at ${resolved}. Install Brave or set the BRAVE_PATH environment variable.`,
    );
  }

  if (platform === 'linux') {
    const paths: Record<Channel, string[]> = {
      release: ['brave-browser', 'brave-browser-stable'],
      beta: ['brave-browser-beta'],
      nightly: ['brave-browser-nightly'],
      dev: ['brave-browser-dev'],
    };
    const candidates = paths[channel ?? 'release'];
    for (const candidate of candidates) {
      try {
        const resolvedPath = execSync(`which ${candidate}`, {encoding: 'utf8'}).trim();
        if (resolvedPath) {
          return resolvedPath;
        }
      } catch {
        // try next candidate
      }
    }
    throw new Error(
      `Could not find Brave Browser (${channel ?? 'release'}) in PATH. Install Brave or set the BRAVE_PATH environment variable.`,
    );
  }

  if (platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files';
    const localAppData = process.env['LOCALAPPDATA'] ?? '';
    const paths: Record<Channel, string[]> = {
      release: [
        path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      ],
      beta: [
        path.join(programFiles, 'BraveSoftware', 'Brave-Browser-Beta', 'Application', 'brave.exe'),
        path.join(localAppData, 'BraveSoftware', 'Brave-Browser-Beta', 'Application', 'brave.exe'),
      ],
      nightly: [
        path.join(programFiles, 'BraveSoftware', 'Brave-Browser-Nightly', 'Application', 'brave.exe'),
        path.join(localAppData, 'BraveSoftware', 'Brave-Browser-Nightly', 'Application', 'brave.exe'),
      ],
      dev: [
        path.join(programFiles, 'BraveSoftware', 'Brave-Browser-Dev', 'Application', 'brave.exe'),
        path.join(localAppData, 'BraveSoftware', 'Brave-Browser-Dev', 'Application', 'brave.exe'),
      ],
    };
    const candidates = paths[channel ?? 'release'];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    throw new Error(
      `Could not find Brave Browser (${channel ?? 'release'}). Install Brave or set the BRAVE_PATH environment variable.`,
    );
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

function resolveBraveUserDataDir(channel?: Channel): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === 'darwin') {
    const dirs: Record<Channel, string> = {
      release: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
      beta: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser-Beta'),
      nightly: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser-Nightly'),
      dev: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser-Dev'),
    };
    return dirs[channel ?? 'release'];
  }

  if (platform === 'linux') {
    const configDir = process.env['XDG_CONFIG_HOME'] ?? path.join(home, '.config');
    const dirs: Record<Channel, string> = {
      release: path.join(configDir, 'BraveSoftware', 'Brave-Browser'),
      beta: path.join(configDir, 'BraveSoftware', 'Brave-Browser-Beta'),
      nightly: path.join(configDir, 'BraveSoftware', 'Brave-Browser-Nightly'),
      dev: path.join(configDir, 'BraveSoftware', 'Brave-Browser-Dev'),
    };
    return dirs[channel ?? 'release'];
  }

  if (platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? path.join(home, 'AppData', 'Local');
    const dirs: Record<Channel, string> = {
      release: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
      beta: path.join(localAppData, 'BraveSoftware', 'Brave-Browser-Beta', 'User Data'),
      nightly: path.join(localAppData, 'BraveSoftware', 'Brave-Browser-Nightly', 'User Data'),
      dev: path.join(localAppData, 'BraveSoftware', 'Brave-Browser-Dev', 'User Data'),
    };
    return dirs[channel ?? 'release'];
  }

  throw new Error(`Unsupported platform: ${platform}`);
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
    const userDataDir = options.userDataDir ?? resolveBraveUserDataDir(channel);
    autoConnect = true;
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
        `Could not connect to Brave in ${userDataDir}. Check if Brave is running and remote debugging is enabled by going to brave://inspect/#remote-debugging.`,
        {
          cause: error,
        },
      );
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
      `Could not connect to Brave. ${autoConnect ? `Check if Brave is running and remote debugging is enabled by going to brave://inspect/#remote-debugging.` : `Check if Brave is running.`}`,
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
  viaCli?: boolean;
}

export function detectDisplay(): void {
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
  const {channel, headless, isolated} = options;
  const profileDirName =
    channel && channel !== 'release'
      ? `brave-profile-${channel}`
      : 'brave-profile';

  const executablePath = options.executablePath ?? resolveBraveExecutablePath(channel);

  let userDataDir = options.userDataDir;
  if (!isolated && !userDataDir) {
    userDataDir = path.join(
      os.homedir(),
      '.cache',
      options.viaCli ? 'brave-devtools-mcp-cli' : 'brave-devtools-mcp',
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

  if (!headless) {
    detectDisplay();
  }

  try {
    const browser = await puppeteer.launch({
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
