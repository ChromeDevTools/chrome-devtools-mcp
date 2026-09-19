/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import {executablePath} from 'puppeteer';
import sinon from 'sinon';

import {
  abandonPendingBrowserAttempt,
  detectDisplay,
  ensureBrowserConnected,
  ensureBrowserLaunched,
  forgetBrowser,
  launch,
  makeTargetFilter,
  rootSandboxLaunchError,
} from '../src/browser.js';
import type {Browser} from '../src/third_party/index.js';

import {serverHooks} from './server.js';
import {getMockBrowser} from './utils.js';

async function safeClose(browser: Browser) {
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), 2000),
      ),
    ]);
  } catch {
    browser.process()?.kill('SIGKILL');
  }
}

async function runWithRetry(fn: () => Promise<void>) {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Test execution timeout exceeded')),
            20000,
          ),
        ),
      ]);
      return;
    } catch (e) {
      lastError = e as Error;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw lastError;
}

describe('browser', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('detects display does not crash', () => {
    detectDisplay();
  });

  describe('rootSandboxLaunchError', () => {
    const targetClosed = new Error(
      'Protocol error (Target.setDiscoverTargets): Target closed',
    );

    it('explains an opaque launch failure when running as root', () => {
      const error = rootSandboxLaunchError(targetClosed, [], 0);
      assert.ok(error);
      assert.match(error.message, /non-root user/);
      assert.match(error.message, /pptr\.dev\/troubleshooting/);
      // The original failure stays visible so unrelated errors are not masked.
      assert.match(error.message, /Target closed/);
      assert.strictEqual(error.cause, targetClosed);
    });

    it('does not explain failures when not running as root', () => {
      assert.strictEqual(
        rootSandboxLaunchError(targetClosed, [], 1000),
        undefined,
      );
    });

    it('does not explain failures on platforms without uids', () => {
      assert.strictEqual(
        rootSandboxLaunchError(targetClosed, [], undefined),
        undefined,
      );
    });

    it('does not explain failures when the sandbox is already disabled', () => {
      assert.strictEqual(
        rootSandboxLaunchError(targetClosed, ['--no-sandbox'], 0),
        undefined,
      );
      assert.strictEqual(
        rootSandboxLaunchError(targetClosed, ['--no-sandbox=true'], 0),
        undefined,
      );
    });

    it('is not fooled by unrelated arguments that start the same', () => {
      assert.ok(
        rootSandboxLaunchError(targetClosed, ['--no-sandbox-and-elevated'], 0),
      );
      assert.ok(
        rootSandboxLaunchError(targetClosed, ['--disable-setuid-sandbox'], 0),
      );
    });
  });

  it('cannot launch multiple times with the same profile', async () => {
    await runWithRetry(async () => {
      const tmpDir = os.tmpdir();
      const folderPath = path.join(
        tmpDir,
        `temp-folder-${crypto.randomUUID()}`,
      );
      const browser1 = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        executablePath: await executablePath(),
        devtools: false,
      });
      try {
        try {
          const browser2 = await launch({
            headless: true,
            isolated: false,
            userDataDir: folderPath,
            executablePath: await executablePath(),
            devtools: false,
          });
          await safeClose(browser2);
          assert.fail('not reached');
        } catch (err) {
          assert.strictEqual(
            (err as Error).message,
            `The browser is already running for ${folderPath}. Use --isolated to run multiple browser instances.`,
          );
        }
      } finally {
        await safeClose(browser1);
      }
    });
  });

  it('launches with the initial viewport', async () => {
    await runWithRetry(async () => {
      const tmpDir = os.tmpdir();
      const folderPath = path.join(
        tmpDir,
        `temp-folder-${crypto.randomUUID()}`,
      );
      const browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        executablePath: await executablePath(),
        viewport: {
          width: 1501,
          height: 801,
        },
        devtools: false,
      });
      try {
        const [page] = await browser.pages();
        const result = await page.evaluate(() => {
          return {width: window.innerWidth, height: window.innerHeight};
        });
        assert.deepStrictEqual(result, {
          width: 1501,
          height: 801,
        });
      } finally {
        await safeClose(browser);
      }
    });
  });

  it('connects to an existing browser with userDataDir', async () => {
    await runWithRetry(async () => {
      const tmpDir = os.tmpdir();
      const folderPath = path.join(
        tmpDir,
        `temp-folder-${crypto.randomUUID()}`,
      );
      const browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        executablePath: await executablePath(),
        devtools: false,
        chromeArgs: ['--remote-debugging-port=0'],
      });
      try {
        const connectedBrowser = await ensureBrowserConnected({
          userDataDir: folderPath,
          devtools: false,
        });
        assert.ok(connectedBrowser);
        assert.ok(connectedBrowser.connected);
        connectedBrowser.disconnect();
      } finally {
        await safeClose(browser);
      }
    });
  });

  it('reconnects after the browser transport disconnects cleanly', async () => {
    await runWithRetry(async () => {
      const tmpDir = os.tmpdir();
      const folderPath = path.join(
        tmpDir,
        `temp-folder-${crypto.randomUUID()}`,
      );
      const browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        executablePath: await executablePath(),
        devtools: false,
        chromeArgs: ['--remote-debugging-port=0'],
      });
      try {
        const connectOptions = {userDataDir: folderPath, devtools: false};
        const connectedBrowser = await ensureBrowserConnected(connectOptions);
        assert.ok(connectedBrowser.connected);

        const disconnected = new Promise<void>(resolve => {
          connectedBrowser.once('disconnected', () => resolve());
        });
        connectedBrowser.disconnect();
        await disconnected;

        // The `disconnected` listener installed by ensureBrowserConnected
        // should have forgotten the cached handle, so this reconnects
        // instead of trying to reuse (or erroring out on) the dead one.
        const reconnectedBrowser = await ensureBrowserConnected(connectOptions);
        assert.notStrictEqual(reconnectedBrowser, connectedBrowser);
        assert.ok(reconnectedBrowser.connected);
        reconnectedBrowser.disconnect();
      } finally {
        await safeClose(browser);
      }
    });
  });

  it('forgetBrowser only clears the cache on an exact match', async () => {
    await runWithRetry(async () => {
      const tmpDir = os.tmpdir();
      const folderPath = path.join(
        tmpDir,
        `temp-folder-${crypto.randomUUID()}`,
      );
      const browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        executablePath: await executablePath(),
        devtools: false,
        chromeArgs: ['--remote-debugging-port=0'],
      });
      try {
        const connectOptions = {userDataDir: folderPath, devtools: false};
        const connectedBrowser = await ensureBrowserConnected(connectOptions);

        forgetBrowser(getMockBrowser());

        const sameBrowser = await ensureBrowserConnected(connectOptions);
        assert.strictEqual(sameBrowser, connectedBrowser);
        connectedBrowser.disconnect();
      } finally {
        await safeClose(browser);
      }
    });
  });

  it('forgetBrowser disconnects a connected browser instead of leaking it', async () => {
    await runWithRetry(async () => {
      const tmpDir = os.tmpdir();
      const folderPath = path.join(
        tmpDir,
        `temp-folder-${crypto.randomUUID()}`,
      );
      const browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        executablePath: await executablePath(),
        devtools: false,
        chromeArgs: ['--remote-debugging-port=0'],
      });
      try {
        const connectOptions = {userDataDir: folderPath, devtools: false};
        const connectedBrowser = await ensureBrowserConnected(connectOptions);
        const disconnectSpy = sinon.spy(connectedBrowser, 'disconnect');

        forgetBrowser(connectedBrowser);

        sinon.assert.calledOnce(disconnectSpy);
      } finally {
        await safeClose(browser);
      }
    });
  });

  it('forgetBrowser closes a launched browser instead of leaking the subprocess', async () => {
    await runWithRetry(async () => {
      const launchedBrowser = await ensureBrowserLaunched({
        headless: true,
        isolated: true,
        executablePath: await executablePath(),
        devtools: false,
      });
      const closeSpy = sinon.spy(launchedBrowser, 'close');
      try {
        forgetBrowser(launchedBrowser);

        sinon.assert.calledOnce(closeSpy);
      } finally {
        await safeClose(launchedBrowser);
      }
    });
  });

  it('discards a connect() that resolves after being abandoned, instead of installing it', async () => {
    await runWithRetry(async () => {
      const tmpDir = os.tmpdir();
      const folderPath = path.join(
        tmpDir,
        `temp-folder-${crypto.randomUUID()}`,
      );
      const browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        executablePath: await executablePath(),
        devtools: false,
        chromeArgs: ['--remote-debugging-port=0'],
      });
      try {
        const connectOptions = {userDataDir: folderPath, devtools: false};

        // abandonPendingBrowserAttempt() runs synchronously right after the call
        // starts, before ensureBrowserConnected() reaches its first await —
        // so it always lands after the attempt's token is captured and
        // before the real connect() has resolved, deterministically
        // reproducing "abandoned while still connecting."
        const abandonedAttempt = ensureBrowserConnected(connectOptions);
        abandonPendingBrowserAttempt();

        await assert.rejects(abandonedAttempt, /abandoned/);

        // A subsequent, independent call must still succeed normally —
        // proving the abandoned attempt didn't leave the module cache in a
        // broken or clobbered state.
        const freshBrowser = await ensureBrowserConnected(connectOptions);
        assert.ok(freshBrowser.connected);
        freshBrowser.disconnect();
      } finally {
        await safeClose(browser);
      }
    });
  });

  it('discards a launch() that resolves after being abandoned, instead of installing it', async () => {
    await runWithRetry(async () => {
      const launchOptions = {
        headless: true,
        isolated: true,
        executablePath: await executablePath(),
        devtools: false,
      };

      const abandonedAttempt = ensureBrowserLaunched(launchOptions);
      abandonPendingBrowserAttempt();

      // The discarded browser is closed internally by ensureBrowserLaunched
      // itself (see its abandonment branch) — nothing for this test to do
      // with it, since the rejection carries an Error, not the instance.
      await assert.rejects(abandonedAttempt, /abandoned/);

      const freshBrowser = await ensureBrowserLaunched(launchOptions);
      try {
        assert.ok(freshBrowser.connected);
      } finally {
        await safeClose(freshBrowser);
      }
    });
  });

  describe('Blocking', () => {
    const server = serverHooks();

    it('blocks URLs in blocklist', async () => {
      await runWithRetry(async () => {
        server.addHtmlRoute(
          '/allowed.html',
          '<html><body>Allowed</body></html>',
        );
        server.addHtmlRoute(
          '/blocked.html',
          '<html><body>Blocked</body></html>',
        );

        const browser = await launch({
          headless: true,
          isolated: true,
          executablePath: await executablePath(),
          devtools: false,
          blocklist: ['*://*:*/blocked.html'],
        });
        try {
          const page = await browser.newPage();

          // Access allowed URL
          await page.goto(server.getRoute('/allowed.html'));
          const content = await page.evaluate(() => document.body.textContent);
          assert.strictEqual(content, 'Allowed');

          // Fetch of blocked URL from the page
          const fetchSucceeded = await page.evaluate(async url => {
            try {
              await fetch(url, {signal: AbortSignal.timeout(5000)});
              return true;
            } catch {
              return false;
            }
          }, server.getRoute('/blocked.html'));

          assert.strictEqual(fetchSucceeded, false);
        } finally {
          await safeClose(browser);
        }
      });
    });

    it('blocks URLs not in allowlist', async () => {
      await runWithRetry(async () => {
        server.addHtmlRoute(
          '/allowed.html',
          '<html><body>Allowed</body></html>',
        );
        server.addHtmlRoute(
          '/blocked.html',
          '<html><body>Blocked</body></html>',
        );

        const browser = await launch({
          headless: true,
          isolated: true,
          executablePath: await executablePath(),
          devtools: false,
          allowlist: ['*://*:*/allowed.html'],
        });
        try {
          const page = await browser.newPage();

          // Access allowed URL
          await page.goto(server.getRoute('/allowed.html'));
          const content = await page.evaluate(() => document.body.textContent);
          assert.strictEqual(content, 'Allowed');

          // Fetch of blocked URL from the page
          const fetchSucceeded = await page.evaluate(async url => {
            try {
              await fetch(url, {signal: AbortSignal.timeout(5000)});
              return true;
            } catch {
              return false;
            }
          }, server.getRoute('/blocked.html'));

          assert.strictEqual(fetchSucceeded, false);
        } finally {
          await safeClose(browser);
        }
      });
    });
  });

  describe('makeTargetFilter', () => {
    it('filters internal chrome and extension targets', () => {
      const filterWithoutExtensions = makeTargetFilter(false);
      const filterWithExtensions = makeTargetFilter(true);

      const mockTarget = (url: string) => ({
        url: () => url,
      });

      // Newtab and inspect allowances
      assert.strictEqual(
        filterWithoutExtensions(mockTarget('chrome://newtab/')),
        true,
      );
      assert.strictEqual(
        filterWithoutExtensions(mockTarget('chrome://inspect')),
        true,
      );
      assert.strictEqual(
        filterWithoutExtensions(mockTarget('chrome://inspect/#devices')),
        true,
      );

      // Disallowed internal schemes
      assert.strictEqual(
        filterWithoutExtensions(mockTarget('chrome://settings')),
        false,
      );
      assert.strictEqual(
        filterWithoutExtensions(mockTarget('chrome://version')),
        false,
      );
      assert.strictEqual(
        filterWithoutExtensions(mockTarget('chrome-untrusted://terminal')),
        false,
      );

      // Extensions toggle
      assert.strictEqual(
        filterWithoutExtensions(
          mockTarget('chrome-extension://abcdef/popup.html'),
        ),
        false,
      );
      assert.strictEqual(
        filterWithExtensions(
          mockTarget('chrome-extension://abcdef/popup.html'),
        ),
        true,
      );

      // Web URLs
      assert.strictEqual(
        filterWithoutExtensions(mockTarget('https://example.com')),
        true,
      );
      assert.strictEqual(
        filterWithoutExtensions(mockTarget('about:blank')),
        true,
      );
    });
  });
});
