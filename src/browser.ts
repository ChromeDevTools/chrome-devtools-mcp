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
  CDPSession,
} from './third_party/index.js';
import {puppeteer} from './third_party/index.js';

let browser: Browser | undefined;

export interface BootstrapOptions {
  includeExtensionTargets: boolean;
  bootstrapTimeoutMs: number;
  verboseBootstrap: boolean;
}

type TargetFilterEntry = {
  type?: string;
  exclude?: boolean;
};

type BootstrapState = {
  options: BootstrapOptions;
  promise: Promise<void>;
};

type RawCDPSession = CDPSession & {
  send: (method: string, params?: unknown) => Promise<unknown>;
  on: (event: string, listener: (event: unknown) => void) => void;
  off?: (event: string, listener: (event: unknown) => void) => void;
  removeListener?: (event: string, listener: (event: unknown) => void) => void;
};

const bootstrapStates = new WeakMap<Browser, BootstrapState>();

export async function ensureBrowserConnected(options: {
  browserURL?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  devtools: boolean;
  bootstrap: BootstrapOptions;
}) {
  if (browser?.connected) {
    return browser;
  }

  const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
    defaultViewport: null,
    handleDevToolsAsPage: true,
  };
  (connectOptions as {waitForInitialPage?: boolean}).waitForInitialPage = false;

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

  logger('Connecting Puppeteer to ', JSON.stringify(connectOptions));
  const connectedBrowser = await puppeteer.connect(connectOptions);
  logger('bootstrap: puppeteer.connect resolved');
  try {
    await bootstrapBrowser(connectedBrowser, options.bootstrap);
  } catch (error) {
    connectedBrowser.disconnect();
    throw error;
  }
  browser = connectedBrowser;
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
    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
      channel: puppeteerChannel,
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: true,
      headless,
      args,
      acceptInsecureCerts: options.acceptInsecureCerts,
      handleDevToolsAsPage: true,
    };
    (launchOptions as {waitForInitialPage?: boolean}).waitForInitialPage = false;
    const browser = await puppeteer.launch(launchOptions);
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
  options: McpLaunchOptions & {bootstrap: BootstrapOptions},
): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }
  const {bootstrap, ...launchOptions} = options;
  const launchedBrowser = await launch(launchOptions as McpLaunchOptions);
  try {
    await bootstrapBrowser(launchedBrowser, bootstrap);
  } catch (error) {
    await launchedBrowser.close().catch(() => {});
    throw error;
  }
  browser = launchedBrowser;
  return browser;
}

export type Channel = 'stable' | 'canary' | 'beta' | 'dev';

function bootstrapOptionsEqual(
  a: BootstrapOptions,
  b: BootstrapOptions,
): boolean {
  return (
    a.includeExtensionTargets === b.includeExtensionTargets &&
    a.bootstrapTimeoutMs === b.bootstrapTimeoutMs &&
    a.verboseBootstrap === b.verboseBootstrap
  );
}

async function bootstrapBrowser(
  instance: Browser,
  options: BootstrapOptions,
): Promise<void> {
  logger(
    `bootstrap: start (includeExtensionTargets=${options.includeExtensionTargets}, timeout=${options.bootstrapTimeoutMs}, verbose=${options.verboseBootstrap})`,
  );
  const existingState = bootstrapStates.get(instance);
  if (existingState) {
    if (bootstrapOptionsEqual(existingState.options, options)) {
      await existingState.promise;
      return;
    }
  }

  const promise = configureBootstrap(instance, options).catch(error => {
    bootstrapStates.delete(instance);
    throw error;
  });
  bootstrapStates.set(instance, {
    options: {...options},
    promise,
  });
  await promise;
}

async function configureBootstrap(
  instance: Browser,
  options: BootstrapOptions,
): Promise<void> {
  if (options.verboseBootstrap) {
    logger('bootstrap: creating root CDP session');
  }
  const session = (await instance
    .target()
    .createCDPSession()) as unknown as RawCDPSession;
  if (options.verboseBootstrap) {
    logger('bootstrap: root CDP session created');
  }

  const autoAttachFilter: TargetFilterEntry[] = options.includeExtensionTargets
    ? [{}]
    : [
        {type: 'service_worker', exclude: true},
        {type: 'background_page', exclude: true},
        {type: 'iframe', exclude: true},
        {type: 'worker', exclude: true},
        {type: 'shared_worker', exclude: true},
        {type: 'utility', exclude: true},
      ];

  const waitForFirstPage = waitForFirstPageOrTimeout(
    session,
    options.bootstrapTimeoutMs,
    options.verboseBootstrap,
  );

  if (options.verboseBootstrap) {
    logger(
      'bootstrap: setDiscoverTargets (discover=true, filter=[{}])',
    );
  }
  await sendWithFallback(session, 'Target.setDiscoverTargets', {
    discover: true,
    filter: [{}],
  });

  if (options.verboseBootstrap) {
    logger(
      `bootstrap: setAutoAttach (flatten=true, waitForDebuggerOnStart=false, filter=${JSON.stringify(autoAttachFilter)})`,
    );
  }
  await sendWithFallback(session, 'Target.setAutoAttach', {
    autoAttach: true,
    flatten: true,
    waitForDebuggerOnStart: false,
    filter: autoAttachFilter,
  });

  await waitForFirstPage;
}

async function sendWithFallback(
  session: RawCDPSession,
  method: 'Target.setDiscoverTargets' | 'Target.setAutoAttach',
  params: Record<string, unknown>,
): Promise<void> {
  try {
    await session.send(method, params);
    return;
  } catch (error) {
    if (!isFilterNotSupportedError(error)) {
      throw error;
    }
    const fallbackParams =
      method === 'Target.setDiscoverTargets'
        ? {discover: true}
        : {
            autoAttach: true,
            flatten: true,
            waitForDebuggerOnStart: false,
          };
    logger(
      `${method}: filter unsupported, retrying without filter (${(error as Error).message})`,
    );
    await session.send(method, fallbackParams);
  }
}

function isFilterNotSupportedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const message = 'message' in error ? String((error as Error).message) : '';
  return /filter/i.test(message) || /Invalid parameters/.test(message);
}

function waitForFirstPageOrTimeout(
  session: RawCDPSession,
  timeoutMs: number,
  verbose: boolean,
): Promise<void> {
  if (timeoutMs <= 0) {
    if (verbose) {
      logger('bootstrap: waiting for first page skipped (timeout <= 0)');
    }
    return Promise.resolve();
  }

  if (verbose) {
    logger(
      `bootstrap: waiting for first page or timeout (${timeoutMs} ms)`,
    );
  }

  return new Promise(resolve => {
    let settled = false;
    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      if (typeof session.off === 'function') {
        session.off('Target.attachedToTarget', onAttached);
      } else if (typeof session.removeListener === 'function') {
        session.removeListener('Target.attachedToTarget', onAttached);
      }
    };

    const done = (logMessage?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (logMessage && verbose) {
        logger(logMessage);
      }
      cleanup();
      resolve();
    };

    const onAttached = (event: unknown) => {
      if (!event || typeof event !== 'object') {
        return;
      }
      const attachedEvent = event as {
        targetInfo?: {
          type?: string;
          url?: string;
        };
      };
      const targetInfo = attachedEvent.targetInfo;
      if (!targetInfo) {
        return;
      }
      if (targetInfo.type === 'page' || targetInfo.type === 'tab') {
        const urlPart = targetInfo.url ? ` ${targetInfo.url}` : '';
        done(`bootstrap: first page attached (${targetInfo.type}${urlPart})`);
      }
    };

    timer = setTimeout(() => {
      done('bootstrap: timed out, continuing');
    }, timeoutMs);

    session.on('Target.attachedToTarget', onAttached);
  });
}
