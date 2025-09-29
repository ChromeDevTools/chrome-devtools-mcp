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
  ConnectOptions,
  LaunchOptions,
  Target,
} from 'puppeteer-core';
import puppeteer from 'puppeteer-core';

let browser: Browser | undefined;

const ignoredPrefixes = new Set([
  'chrome://',
  'chrome-extension://',
  'chrome-untrusted://',
  'devtools://',
]);

function targetFilter(target: Target): boolean {
  if (target.url() === 'chrome://newtab/') {
    return true;
  }
  for (const prefix of ignoredPrefixes) {
    if (target.url().startsWith(prefix)) {
      return false;
    }
  }
  return true;
}

const connectOptions: ConnectOptions = {
  targetFilter,
  // We do not expect any single CDP command to take more than 10sec.
  protocolTimeout: 10_000,
};

async function ensureBrowserConnected(browserURL: string) {
  if (browser?.connected) {
    return browser;
  }
  browser = await puppeteer.connect({
    ...connectOptions,
    browserURL,
    defaultViewport: null,
  });
  return browser;
}

function scanExtensionsDirectory(extensionsDir: string): string[] {
  const extensionPaths: string[] = [];

  try {
    if (!fs.existsSync(extensionsDir)) {
      console.warn(`Extensions directory not found: ${extensionsDir}`);
      return extensionPaths;
    }

    const entries = fs.readdirSync(extensionsDir, {withFileTypes: true});

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extensionPath = path.join(extensionsDir, entry.name);
        const manifestPath = path.join(extensionPath, 'manifest.json');

        if (fs.existsSync(manifestPath)) {
          try {
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent);

            if (manifest.manifest_version) {
              extensionPaths.push(extensionPath);
              console.log(
                `Found extension: ${entry.name} (v${manifest.version || 'unknown'})`,
              );
            }
          } catch (error) {
            console.warn(
              `Invalid manifest.json in ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    }

    console.log(
      `Scanned ${extensionsDir}: found ${extensionPaths.length} valid extensions`,
    );
  } catch (error) {
    console.error(
      `Error scanning extensions directory ${extensionsDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return extensionPaths;
}

interface McpLaunchOptions {
  executablePath?: string;
  customDevTools?: string;
  channel?: Channel;
  userDataDir?: string;
  headless: boolean;
  isolated: boolean;
  loadExtension?: string;
  loadExtensionsDir?: string;
  logFile?: fs.WriteStream;
}

export async function launch(options: McpLaunchOptions): Promise<Browser> {
  const {
    channel,
    executablePath,
    customDevTools,
    headless,
    isolated,
    loadExtension,
    loadExtensionsDir,
  } = options;
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

  const args: LaunchOptions['args'] = ['--hide-crash-restore-bubble'];
  if (customDevTools) {
    args.push(`--custom-devtools-frontend=file://${customDevTools}`);
  }
  // Collect all extension paths
  const extensionPaths: string[] = [];

  if (loadExtension) {
    extensionPaths.push(loadExtension);
  }

  if (loadExtensionsDir) {
    const scannedExtensions = scanExtensionsDirectory(loadExtensionsDir);
    extensionPaths.push(...scannedExtensions);
  }

  if (extensionPaths.length > 0) {
    args.push(`--load-extension=${extensionPaths.join(',')}`);
    args.push('--enable-experimental-extension-apis');
    console.log(`Loading ${extensionPaths.length} Chrome extension(s)`);
  }
  let puppeterChannel: ChromeReleaseChannel | undefined;
  if (!executablePath) {
    puppeterChannel =
      channel && channel !== 'stable'
        ? (`chrome-${channel}` as ChromeReleaseChannel)
        : 'chrome';
  }

  try {
    const browser = await puppeteer.launch({
      ...connectOptions,
      channel: puppeterChannel,
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: true,
      headless,
      args,
      ignoreDefaultArgs:
        extensionPaths.length > 0 ? ['--disable-extensions'] : undefined,
    });
    if (options.logFile) {
      // FIXME: we are probably subscribing too late to catch startup logs. We
      // should expose the process earlier or expose the getRecentLogs() getter.
      browser.process()?.stderr?.pipe(options.logFile);
      browser.process()?.stdout?.pipe(options.logFile);
    }
    return browser;
  } catch (error) {
    if (
      userDataDir &&
      ((error as Error).message.includes('The browser is already running') ||
        (error as Error).message.includes('Target closed') ||
        (error as Error).message.includes('Connection closed'))
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

export async function resolveBrowser(options: {
  browserUrl?: string;
  executablePath?: string;
  customDevTools?: string;
  channel?: Channel;
  headless: boolean;
  isolated: boolean;
  loadExtension?: string;
  loadExtensionsDir?: string;
  logFile?: fs.WriteStream;
}) {
  const browser = options.browserUrl
    ? await ensureBrowserConnected(options.browserUrl)
    : await ensureBrowserLaunched(options);

  return browser;
}

export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
