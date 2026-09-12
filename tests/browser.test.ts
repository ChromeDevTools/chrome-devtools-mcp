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
  closeBrowser,
  detectDisplay,
  ensureBrowserConnected,
  ensureBrowserLaunched,
  launch,
  makeTargetFilter,
} from '../src/browser.js';
import {Browser, puppeteer} from '../src/third_party/index.js';

import {serverHooks} from './server.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise = (_value: T | PromiseLike<T>): void => {
    throw new Error('Deferred promise resolver was not initialized');
  };
  let rejectPromise = (_reason?: unknown): void => {
    throw new Error('Deferred promise rejecter was not initialized');
  };
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: value => resolvePromise(value),
    reject: reason => rejectPromise(reason),
  };
}

function createMockBrowser(): sinon.SinonStubbedInstance<Browser> {
  const mockBrowser = sinon.createStubInstance(Browser);
  Object.defineProperties(mockBrowser, {
    connected: {
      configurable: true,
      value: true,
    },
    close: {
      configurable: true,
      value: sinon.stub().resolves(),
    },
    disconnect: {
      configurable: true,
      value: sinon.stub().resolves(),
    },
  });
  return mockBrowser;
}

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
  afterEach(async () => {
    await closeBrowser();
    sinon.restore();
  });

  it('detects display does not crash', () => {
    detectDisplay();
  });

  it('single-flights concurrent launches', async () => {
    const deferred = createDeferred<Browser>();
    const mockBrowser = createMockBrowser();
    const launchStub = sinon.stub(puppeteer, 'launch');
    launchStub.returns(deferred.promise);

    const options = {
      headless: true,
      isolated: true,
      devtools: false,
    };
    const first = ensureBrowserLaunched(options);
    const second = ensureBrowserLaunched(options);

    sinon.assert.calledOnce(launchStub);
    deferred.resolve(mockBrowser);
    const [firstBrowser, secondBrowser] = await Promise.all([first, second]);

    assert.strictEqual(firstBrowser, mockBrowser);
    assert.strictEqual(secondBrowser, mockBrowser);
  });

  it('single-flights concurrent browser connections', async () => {
    const deferred = createDeferred<Browser>();
    const mockBrowser = createMockBrowser();
    const connectStub = sinon.stub(puppeteer, 'connect');
    connectStub.returns(deferred.promise);

    const options = {
      browserURL: 'http://127.0.0.1:9222',
      devtools: false,
    };
    const first = ensureBrowserConnected(options);
    const second = ensureBrowserConnected(options);

    sinon.assert.calledOnce(connectStub);
    deferred.resolve(mockBrowser);
    const [firstBrowser, secondBrowser] = await Promise.all([first, second]);

    assert.strictEqual(firstBrowser, mockBrowser);
    assert.strictEqual(secondBrowser, mockBrowser);
  });

  it('clears a failed launch acquisition before retrying', async () => {
    const launchError = new Error('launch failed');
    const mockBrowser = createMockBrowser();
    const launchStub = sinon.stub(puppeteer, 'launch');
    launchStub.onFirstCall().rejects(launchError);
    launchStub.onSecondCall().resolves(mockBrowser);

    const options = {
      headless: true,
      isolated: true,
      devtools: false,
    };
    const first = ensureBrowserLaunched(options);
    const second = ensureBrowserLaunched(options);

    sinon.assert.calledOnce(launchStub);
    await assert.rejects(first, /launch failed/);
    await assert.rejects(second, /launch failed/);

    const retry = await ensureBrowserLaunched(options);

    assert.strictEqual(retry, mockBrowser);
    sinon.assert.calledTwice(launchStub);
  });

  it('closes a launched browser acquired during shutdown', async () => {
    const deferred = createDeferred<Browser>();
    const mockBrowser = createMockBrowser();
    const launchStub = sinon.stub(puppeteer, 'launch');
    launchStub.returns(deferred.promise);

    const acquisition = ensureBrowserLaunched({
      headless: true,
      isolated: true,
      devtools: false,
    });
    const shutdown = closeBrowser();

    deferred.resolve(mockBrowser);
    const [acquiredBrowser] = await Promise.all([acquisition, shutdown]);

    assert.strictEqual(acquiredBrowser, mockBrowser);
    sinon.assert.calledOnce(mockBrowser.close);
    sinon.assert.notCalled(mockBrowser.disconnect);
    sinon.assert.calledOnce(launchStub);
  });

  it('rejects acquisition while a launched browser is shutting down', async () => {
    const closeDeferred = createDeferred<void>();
    const mockBrowser = createMockBrowser();
    mockBrowser.close.returns(closeDeferred.promise);
    const launchStub = sinon.stub(puppeteer, 'launch').resolves(mockBrowser);

    const options = {
      headless: true,
      isolated: true,
      devtools: false,
    };
    await ensureBrowserLaunched(options);
    const shutdown = closeBrowser();
    await Promise.resolve();

    const secondAcquisition = ensureBrowserLaunched(options);
    await assert.rejects(secondAcquisition, /Browser is shutting down/);
    sinon.assert.calledOnce(launchStub);
    sinon.assert.calledOnce(mockBrowser.close);

    closeDeferred.resolve(undefined);
    await shutdown;
  });

  it('disconnects an attached browser acquired during shutdown', async () => {
    const deferred = createDeferred<Browser>();
    const mockBrowser = createMockBrowser();
    const connectStub = sinon.stub(puppeteer, 'connect');
    connectStub.returns(deferred.promise);

    const acquisition = ensureBrowserConnected({
      browserURL: 'http://127.0.0.1:9222',
      devtools: false,
    });
    const shutdown = closeBrowser();

    deferred.resolve(mockBrowser);
    const [acquiredBrowser] = await Promise.all([acquisition, shutdown]);

    assert.strictEqual(acquiredBrowser, mockBrowser);
    sinon.assert.notCalled(mockBrowser.close);
    sinon.assert.calledOnce(mockBrowser.disconnect);
    sinon.assert.calledOnce(connectStub);
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
