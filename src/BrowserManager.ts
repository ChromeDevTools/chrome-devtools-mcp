/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {ParsedArguments} from './config/mcp-options.js';
import type {
  Browser,
  ChromeReleaseChannel,
  LaunchOptions,
} from './third_party/index.js';
import {Mutex, puppeteer} from './third_party/index.js';
import {logger, puppeteerLogger} from './utils/logger.js';
import {isAllowedUrl} from './utils/url.js';

export interface BrowserManagerOptions {
  logFile?: fs.WriteStream;
}

export class BrowserManager {
  #browser?: Browser;
  #browserMode?: 'launched' | 'connected';
  #initPromise?: Promise<Browser>;
  #mutex = new Mutex();
  #closingCount = 0;
  #serverArgs: ParsedArguments;
  #options: BrowserManagerOptions;

  constructor(
    serverArgs: ParsedArguments,
    options: BrowserManagerOptions = {},
  ) {
    this.#serverArgs = serverArgs;
    this.#options = options;
  }

  static makeTargetFilter(enableExtensions = false) {
    return function targetFilter(target: {url(): string}): boolean {
      const url = target.url();
      if (!url) {
        return true;
      }
      return isAllowedUrl(url, {categoryExtensions: enableExtensions});
    };
  }

  static detectDisplay(): void {
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
   * Chrome refuses to start as root unless the sandbox is explicitly disabled and
   * only says so on its stderr. Because we launch with `pipe: true`, Puppeteer
   * never surfaces that stderr and the failure reaches the client as an opaque
   * `Protocol error (Target.setDiscoverTargets): Target closed`. Detect the
   * situation and explain the way out instead. See https://crbug.com/638180.
   *
   * Returns `undefined` when the failure cannot be explained by running as root,
   * including on platforms without uids and when the sandbox was already disabled
   * through `--chrome-arg` (in which case root is not what stopped Chrome).
   */
  static rootSandboxLaunchError(
    error: Error,
    args: readonly string[],
    uid = process.getuid?.(),
  ): Error | undefined {
    if (uid !== 0) {
      return undefined;
    }
    if (
      args.some(
        arg => arg === '--no-sandbox' || arg.startsWith('--no-sandbox='),
      )
    ) {
      return undefined;
    }
    return new Error(
      `Chrome failed to start: ${error.message}\n\n` +
        'chrome-devtools-mcp is running as root and Chrome does not start as root ' +
        '(https://crbug.com/638180). Run chrome-devtools-mcp as a non-root user; in a ' +
        'container, create an unprivileged user in the image and switch to it with ' +
        "USER. For the setup that Chrome's sandbox needs, see " +
        'https://pptr.dev/troubleshooting#setting-up-chrome-linux-sandbox.',
      {
        cause: error,
      },
    );
  }

  async ensureBrowser(): Promise<Browser> {
    if (this.#initPromise) {
      return await this.#initPromise;
    }
    const initPromise = this.#ensureBrowserLocked();
    this.#initPromise = initPromise;
    try {
      return await initPromise;
    } finally {
      if (this.#initPromise === initPromise) {
        this.#initPromise = undefined;
      }
    }
  }

  async #ensureBrowserLocked(): Promise<Browser> {
    if (this.#closingCount > 0) {
      throw new Error('Browser was closed while initializing.');
    }
    using _guard = await this.#mutex.acquire();
    if (this.#closingCount > 0) {
      throw new Error('Browser was closed while initializing.');
    }
    if (!this.#browser?.connected) {
      await this.#initBrowser();
    }
    if (this.#closingCount > 0 || !this.#browser) {
      await this.#closeBrowser();
      throw new Error('Browser was closed while initializing.');
    }
    return this.#browser;
  }

  async #initBrowser(): Promise<Browser> {
    if (
      this.#serverArgs.browserUrl ||
      this.#serverArgs.wsEndpoint ||
      this.#serverArgs.autoConnect
    ) {
      return await this.#connect();
    }
    return await this.#launch();
  }

  async #launch(): Promise<Browser> {
    const {
      channel,
      executablePath,
      headless,
      isolated = false,
      categoryExtensions: enableExtensions,
      viaCli,
      viewport,
      acceptInsecureCerts,
      experimentalDevtools: devtools = false,
      blockedUrlPattern: blocklist,
      allowedUrlPattern: allowlist,
      ignoreDefaultChromeArg,
      proxyServer,
    } = this.#serverArgs;

    const profileDirName =
      channel && channel !== 'stable'
        ? `chrome-profile-${channel}`
        : 'chrome-profile';

    let userDataDir = this.#serverArgs.userDataDir;
    if (!isolated && !userDataDir) {
      userDataDir = path.join(
        os.homedir(),
        '.cache',
        viaCli ? 'chrome-devtools-mcp-cli' : 'chrome-devtools-mcp',
        profileDirName,
      );
      await fs.promises.mkdir(userDataDir, {
        recursive: true,
      });
    }

    const args: LaunchOptions['args'] = [...(this.#serverArgs.chromeArg ?? [])];
    if (proxyServer) {
      args.push(`--proxy-server=${proxyServer}`);
    }
    args.push('--hide-crash-restore-bubble');

    const ignoreDefaultArgs: LaunchOptions['ignoreDefaultArgs'] =
      ignoreDefaultChromeArg ?? false;

    if (headless) {
      args.push('--screen-info={3840x2160}');
    }
    let puppeteerChannel: ChromeReleaseChannel | undefined;
    if (devtools) {
      args.push('--auto-open-devtools-for-tabs');
    }
    if (!executablePath) {
      puppeteerChannel =
        channel && channel !== 'stable' ? `chrome-${channel}` : 'chrome';
    }

    if (!headless) {
      BrowserManager.detectDisplay();
    }

    let browser: Browser | undefined;
    try {
      browser = await puppeteer.launch({
        channel: puppeteerChannel,
        targetFilter: BrowserManager.makeTargetFilter(enableExtensions),
        executablePath,
        defaultViewport: null,
        userDataDir,
        pipe: true,
        headless,
        args,
        ignoreDefaultArgs,
        acceptInsecureCerts,
        handleDevToolsAsPage: true,
        enableExtensions,
        blocklist,
        allowlist,
        logger: puppeteerLogger,
      });
      if (this.#options.logFile) {
        // FIXME: we are probably subscribing too late to catch startup logs. We
        // should expose the process earlier or expose the getRecentLogs() getter.
        browser.process()?.stderr?.pipe(this.#options.logFile);
        browser.process()?.stdout?.pipe(this.#options.logFile);
      }
      if (viewport) {
        const [page] = await browser.pages();
        await page?.resize({
          contentWidth: viewport.width,
          contentHeight: viewport.height,
        });
      }
      this.#browserMode = 'launched';
      this.#browser = browser;
      return browser;
    } catch (error) {
      await browser?.close().catch(() => {
        // Best-effort cleanup if post-launch setup failed.
      });
      if (
        userDataDir &&
        error instanceof Error &&
        error.message.includes('The browser is already running')
      ) {
        throw new Error(
          `The browser is already running for ${userDataDir}. Use --isolated to run multiple browser instances.`,
          {
            cause: error,
          },
        );
      }
      if (error instanceof Error) {
        const rootError = BrowserManager.rootSandboxLaunchError(error, args);
        if (rootError) {
          throw rootError;
        }
      }
      throw error;
    }
  }

  async #connect(): Promise<Browser> {
    const {
      browserUrl: browserURL,
      wsEndpoint,
      wsHeaders,
      autoConnect: isAutoConnect,
      userDataDir,
      blockedUrlPattern: blocklist,
      allowedUrlPattern: allowlist,
    } = this.#serverArgs;
    // Important: only pass channel, if autoConnect is true.
    const channel = isAutoConnect ? this.#serverArgs.channel : undefined;

    const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
      targetFilter: BrowserManager.makeTargetFilter(),
      defaultViewport: null,
      handleDevToolsAsPage: true,
      blocklist,
      allowlist,
      logger: puppeteerLogger,
    };

    let autoConnect = false;
    if (wsEndpoint) {
      connectOptions.browserWSEndpoint = wsEndpoint;
      if (wsHeaders) {
        connectOptions.headers = wsHeaders;
      }
    } else if (browserURL) {
      connectOptions.browserURL = browserURL;
    } else if (channel || userDataDir) {
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
            throw new Error(
              `Invalid DevToolsActivePort '${fileContent}' found`,
            );
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
        connectOptions.channel =
          channel === 'stable' ? 'chrome' : `chrome-${channel}`;
      }
    } else {
      throw new Error(
        'Either browserURL, wsEndpoint, channel or userDataDir must be provided',
      );
    }

    logger?.('Connecting Puppeteer to ', JSON.stringify(connectOptions));
    try {
      const connected = await puppeteer.connect(connectOptions);
      logger?.('Connected Puppeteer');
      this.#browserMode = 'connected';
      this.#browser = connected;
      return connected;
    } catch (err) {
      throw new Error(
        `Could not connect to Chrome. ${autoConnect ? `Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.` : `Check if Chrome is running.`}`,
        {
          cause: err,
        },
      );
    }
  }

  async #closeBrowser(): Promise<void> {
    const browser = this.#browser;
    const mode = this.#browserMode;
    this.#browser = undefined;
    this.#browserMode = undefined;
    if (!browser || !browser.connected) {
      return;
    }
    if (mode === 'launched') {
      await browser.close().catch(err => {
        logger?.('Failed to close browser', err);
      });
      return;
    }
    await browser.disconnect().catch(err => {
      logger?.('Failed to disconnect from browser', err);
    });
  }

  /**
   * Shutdown hook for the active browser. Closes a launched browser (so the
   * Chrome subprocess is reaped) or disconnects from an attached browser (so
   * the user's Chrome instance stays alive). No-op if no browser is active or
   * the connection has already been dropped.
   */
  async close(): Promise<void> {
    this.#initPromise = undefined;
    this.#closingCount++;
    using _guard = await this.#mutex.acquire();
    try {
      await this.#closeBrowser();
    } finally {
      this.#closingCount--;
    }
  }

  [Symbol.dispose](): void {
    this.close().catch(err => {
      logger?.('Failed to dispose BrowserManager', err);
    });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
