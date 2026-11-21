/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {BrowserManager} from '../src/BrowserManager.js';
import {
  puppeteer,
  type Browser,
  type CookieData,
} from '../src/third_party/browser.js';

import {
  createMockPuppeteerBrowser,
  createMockPuppeteerTarget,
  createMockServerConfig,
} from './mocks.js';
import {serverHooks} from './server.js';
import {createTempFile, getExecutablePath} from './utils.js';

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
      lastError = e instanceof Error ? e : new Error(String(e));
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw lastError ?? new Error('Failed without an error');
}

describe('browser', () => {
  it('detects display does not crash', () => {
    BrowserManager.detectDisplay();
  });

  describe('BrowserManager', () => {
    it('loads cookies once when initializing a launched browser', async () => {
      const cookies: CookieData[] = [
        {
          name: 'session',
          value: 'COOKIE_VALUE',
          domain: '.example.test',
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'None',
          expires: 1900000000,
          priority: 'High',
          sourceScheme: 'Secure',
          partitionKey: {
            sourceOrigin: 'https://example.test',
            hasCrossSiteAncestor: true,
          },
        },
      ];
      using file = createTempFile(JSON.stringify(cookies), 'cookies.json');
      const browser = createMockPuppeteerBrowser();
      sinon.stub(puppeteer, 'launch').resolves(browser);
      const manager = new BrowserManager(
        createMockServerConfig({
          headless: true,
          isolated: true,
          cookiesFile: file.path,
        }),
      );

      await manager.ensureBrowser();
      await manager.ensureBrowser();

      sinon.assert.calledOnceWithExactly(browser.setCookie, ...cookies);
    });

    it('loads cookies when connecting to an existing browser', async () => {
      const cookies: CookieData[] = [
        {name: 'session', value: 'COOKIE_VALUE', domain: 'example.test'},
      ];
      using file = createTempFile(JSON.stringify(cookies), 'cookies.json');
      const browser = createMockPuppeteerBrowser();
      sinon.stub(puppeteer, 'connect').resolves(browser);
      const manager = new BrowserManager(
        createMockServerConfig({
          browserUrl: 'http://localhost:9222',
          cookiesFile: file.path,
        }),
      );

      await manager.ensureBrowser();

      sinon.assert.calledOnceWithExactly(browser.setCookie, ...cookies);
    });

    it('cleans up a launched browser and reports why the cookie import failed', async () => {
      using file = createTempFile(
        JSON.stringify([
          {name: 'session', value: 'COOKIE_VALUE', domain: 'example.test'},
        ]),
        'cookies.json',
      );
      const browser = createMockPuppeteerBrowser();
      const importError = new Error(
        'Protocol error (Storage.setCookies): Invalid cookie fields',
      );
      browser.setCookie.rejects(importError);
      sinon.stub(puppeteer, 'launch').resolves(browser);
      const manager = new BrowserManager(
        createMockServerConfig({
          headless: true,
          isolated: true,
          cookiesFile: file.path,
        }),
      );

      await assert.rejects(manager.ensureBrowser(), error => {
        assert.ok(error instanceof Error);
        assert.strictEqual(
          error.message,
          `Unable to import cookies from "${file.path}": ${importError.message}`,
        );
        assert.strictEqual(error.cause, importError);
        return true;
      });
      sinon.assert.calledOnceWithExactly(browser.close);
    });

    it('disconnects an attached browser after a failed cookie import and retries with the updated file', async () => {
      using file = createTempFile(
        JSON.stringify([
          {name: 'session', value: 'old', domain: 'example.test'},
        ]),
        'cookies.json',
      );
      const firstBrowser = createMockPuppeteerBrowser();
      firstBrowser.setCookie.rejects(new Error('import failed'));
      const secondBrowser = createMockPuppeteerBrowser();
      sinon
        .stub(puppeteer, 'connect')
        .onFirstCall()
        .resolves(firstBrowser)
        .onSecondCall()
        .resolves(secondBrowser);
      const manager = new BrowserManager(
        createMockServerConfig({
          browserUrl: 'http://localhost:9222',
          cookiesFile: file.path,
        }),
      );

      await assert.rejects(manager.ensureBrowser(), /Unable to import cookies/);
      sinon.assert.calledOnceWithExactly(firstBrowser.disconnect);
      sinon.assert.notCalled(firstBrowser.close);
      sinon.assert.calledOnceWithExactly(firstBrowser.setCookie, {
        name: 'session',
        value: 'old',
        domain: 'example.test',
      });

      const cookie = {name: 'session', value: 'new', domain: 'example.test'};
      fs.writeFileSync(file.path, JSON.stringify([cookie]));
      assert.strictEqual(await manager.ensureBrowser(), secondBrowser);
      sinon.assert.calledOnceWithExactly(secondBrowser.setCookie, cookie);
    });

    for (const mode of ['launch', 'connect']) {
      it(`rejects an invalid cookies file before ${mode}`, async () => {
        using file = createTempFile('invalid JSON', 'cookies.json');
        const launch = sinon.stub(puppeteer, 'launch');
        const connect = sinon.stub(puppeteer, 'connect');
        const manager = new BrowserManager(
          createMockServerConfig({
            ...(mode === 'launch'
              ? {isolated: true}
              : {browserUrl: 'http://localhost:9222'}),
            cookiesFile: file.path,
          }),
        );

        await assert.rejects(
          manager.ensureBrowser(),
          /must contain valid JSON/,
        );
        sinon.assert.notCalled(launch);
        sinon.assert.notCalled(connect);
      });

      it(`reloads cookies on reconnect after ${mode}`, async () => {
        const firstCookie = {
          name: 'session',
          value: 'first',
          domain: 'example.test',
        };
        const secondCookie = {...firstCookie, value: 'second'};
        using file = createTempFile(
          JSON.stringify([firstCookie]),
          'cookies.json',
        );
        const firstBrowser = createMockPuppeteerBrowser();
        const secondBrowser = createMockPuppeteerBrowser();
        const launch = sinon.stub(puppeteer, 'launch');
        const connect = sinon.stub(puppeteer, 'connect');
        const initialize = mode === 'launch' ? launch : connect;
        initialize.onFirstCall().resolves(firstBrowser);
        initialize.onSecondCall().resolves(secondBrowser);
        const manager = new BrowserManager(
          createMockServerConfig({
            ...(mode === 'launch'
              ? {isolated: true}
              : {browserUrl: 'http://localhost:9222'}),
            cookiesFile: file.path,
          }),
        );

        assert.strictEqual(await manager.ensureBrowser(), firstBrowser);
        sinon.assert.calledOnceWithExactly(firstBrowser.setCookie, firstCookie);
        firstBrowser.emit('disconnected', undefined);
        fs.writeFileSync(file.path, JSON.stringify([secondCookie]));

        assert.strictEqual(await manager.ensureBrowser(), secondBrowser);
        sinon.assert.calledOnceWithExactly(
          secondBrowser.setCookie,
          secondCookie,
        );
        sinon.assert.calledTwice(initialize);
        sinon.assert.notCalled(mode === 'launch' ? connect : launch);
      });
    }

    it('does not set cookies for an empty file array', async () => {
      using file = createTempFile('[]', 'cookies.json');
      const browser = createMockPuppeteerBrowser();
      sinon.stub(puppeteer, 'launch').resolves(browser);
      const manager = new BrowserManager(
        createMockServerConfig({isolated: true, cookiesFile: file.path}),
      );

      assert.strictEqual(await manager.ensureBrowser(), browser);
      sinon.assert.notCalled(browser.setCookie);
    });

    const interruptionErrors = {
      abandon: 'Connection attempt was abandoned before it completed.',
      close: 'Browser was closed while initializing.',
    };

    for (const [action, interruptionError] of Object.entries(
      interruptionErrors,
    )) {
      it(`does not launch when ${action} happens while reading the cookies file`, async () => {
        const readStarted = Promise.withResolvers<void>();
        const contents = Promise.withResolvers<string>();
        sinon.stub(fs.promises, 'readFile').callsFake(async () => {
          readStarted.resolve();
          return await contents.promise;
        });
        const browser = createMockPuppeteerBrowser();
        const launch = sinon.stub(puppeteer, 'launch').resolves(browser);
        const manager = new BrowserManager(
          createMockServerConfig({isolated: true, cookiesFile: 'cookies.json'}),
        );

        const pending = manager.ensureBrowser();
        await readStarted.promise;
        const closed = action === 'close' ? manager.close() : undefined;
        if (action === 'abandon') {
          manager.abandonPendingAttempt();
        }
        contents.resolve(
          JSON.stringify([
            {name: 'session', value: 'COOKIE_VALUE', domain: 'example.test'},
          ]),
        );

        await assert.rejects(pending, new Error(interruptionError));
        await closed;
        sinon.assert.notCalled(launch);
      });

      it(`does not import cookies when ${action} happens during launch`, async () => {
        using file = createTempFile(
          JSON.stringify([
            {name: 'session', value: 'COOKIE_VALUE', domain: 'example.test'},
          ]),
          'cookies.json',
        );
        const launchStarted = Promise.withResolvers<void>();
        const launched = Promise.withResolvers<Browser>();
        const browser = createMockPuppeteerBrowser();
        sinon.stub(puppeteer, 'launch').callsFake(async () => {
          launchStarted.resolve();
          return await launched.promise;
        });
        const manager = new BrowserManager(
          createMockServerConfig({isolated: true, cookiesFile: file.path}),
        );

        const pending = manager.ensureBrowser();
        await launchStarted.promise;
        const closed = action === 'close' ? manager.close() : undefined;
        if (action === 'abandon') {
          manager.abandonPendingAttempt();
        }
        launched.resolve(browser);

        await assert.rejects(pending, new Error(interruptionError));
        await closed;
        sinon.assert.notCalled(browser.setCookie);
      });
    }

    it('imports HttpOnly cookies into the default context and leaves new isolated contexts empty', async () => {
      using file = createTempFile(
        JSON.stringify([
          {
            name: 'session',
            value: 'COOKIE_VALUE',
            domain: '127.0.0.1',
            path: '/',
            httpOnly: true,
            sameSite: 'Lax',
          },
        ]),
        'cookies.json',
      );
      await using manager = new BrowserManager(
        createMockServerConfig({
          isolated: true,
          headless: true,
          executablePath: await getExecutablePath(),
          cookiesFile: file.path,
        }),
      );

      const browser = await manager.ensureBrowser();
      const cookies = await browser.cookies();
      assert.strictEqual(cookies.length, 1);
      assert.strictEqual(cookies[0].value, 'COOKIE_VALUE');
      assert.strictEqual(cookies[0].httpOnly, true);
      assert.strictEqual(cookies[0].sameSite, 'Lax');
      const isolatedContext = await browser.createBrowserContext();
      try {
        assert.deepStrictEqual(await isolatedContext.cookies(), []);
      } finally {
        await isolatedContext.close();
      }
    });

    it('preserves WebSocket connection credentials for Puppeteer while redacting logs', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const connectStub = sinon
        .stub(puppeteer, 'connect')
        .resolves(pptrBrowser);
      const endpoint =
        'wss://user:password@browser.example/devtools/browser/test?token=WS_SECRET_123';
      const headers = {
        Authorization: 'Bearer HEADER_SECRET_456',
        'X-Test': 'visible',
      };
      const manager = new BrowserManager(
        createMockServerConfig({wsEndpoint: endpoint, wsHeaders: headers}),
      );

      await manager.ensureBrowser();

      sinon.assert.calledOnceWithMatch(connectStub, {
        browserWSEndpoint: endpoint,
        wsOptions: {headers},
      });
      assert.deepStrictEqual(
        connectStub.firstCall.args[0].wsOptions?.headers,
        headers,
      );
      await manager.close();
    });

    it('launches a browser when no connect options are set and closes it on close()', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const launchStub = sinon.stub(puppeteer, 'launch').resolves(pptrBrowser);
      const connectStub = sinon.stub(puppeteer, 'connect');

      const args = createMockServerConfig({
        headless: true,
        isolated: true,
        channel: 'canary',
        proxyServer: 'http://localhost:8080',
        chromeArg: ['--custom-arg'],
      });
      const manager = new BrowserManager(args);

      const browser1 = await manager.ensureBrowser();
      const browser2 = await manager.ensureBrowser();

      assert.strictEqual(browser1, pptrBrowser);
      assert.strictEqual(browser2, pptrBrowser);
      sinon.assert.notCalled(pptrBrowser.setCookie);
      sinon.assert.calledOnce(launchStub);
      sinon.assert.notCalled(connectStub);
      sinon.assert.calledWithMatch(launchStub, {
        channel: 'chrome-canary',
        headless: true,
        args: [
          '--custom-arg',
          '--proxy-server=http://localhost:8080',
          '--hide-crash-restore-bubble',
          '--screen-info={3840x2160}',
        ],
      });

      await manager.close();
      sinon.assert.calledOnceWithExactly(pptrBrowser.close);
      sinon.assert.notCalled(pptrBrowser.disconnect);
    });

    it('reads updated network restrictions from ServerConfig when launching', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const launchStub = sinon.stub(puppeteer, 'launch').resolves(pptrBrowser);
      const config = createMockServerConfig({
        headless: true,
        isolated: true,
      });
      const manager = new BrowserManager(config);
      config.commit(
        createMockServerConfig({
          headless: true,
          isolated: true,
          blockedUrlPattern: ['https://blocked.example.com/*'],
        }),
      );

      await manager.ensureBrowser();

      sinon.assert.calledOnceWithMatch(launchStub, {
        blocklist: ['https://blocked.example.com/*'],
        allowlist: undefined,
      });
      await manager.close();
    });

    it('does not pass a channel to Puppeteer when executablePath is set', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const launchStub = sinon.stub(puppeteer, 'launch').resolves(pptrBrowser);

      const args = createMockServerConfig({
        isolated: true,
        channel: 'stable',
        executablePath: '/path/to/chrome',
      });
      const manager = new BrowserManager(args);

      await manager.ensureBrowser();

      sinon.assert.calledOnceWithMatch(launchStub, {
        channel: undefined,
        executablePath: '/path/to/chrome',
      });
    });

    it('disables Puppeteer signal handlers so close() can shut the browser down gracefully', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const launchStub = sinon.stub(puppeteer, 'launch').resolves(pptrBrowser);
      const manager = new BrowserManager(
        createMockServerConfig({isolated: true}),
      );

      await manager.ensureBrowser();

      sinon.assert.calledOnceWithMatch(launchStub, {
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
      });
    });

    it('connects to a browser when browserUrl is set and disconnects on close()', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const launchStub = sinon.stub(puppeteer, 'launch');
      const connectStub = sinon
        .stub(puppeteer, 'connect')
        .resolves(pptrBrowser);

      const args = createMockServerConfig({
        browserUrl: 'http://127.0.0.1:9222',
        channel: 'stable',
      });
      const manager = new BrowserManager(args);

      const browser = await manager.ensureBrowser();

      assert.strictEqual(browser, pptrBrowser);
      sinon.assert.calledOnce(connectStub);
      sinon.assert.notCalled(launchStub);
      sinon.assert.calledWithMatch(connectStub, {
        browserURL: 'http://127.0.0.1:9222',
      });

      await manager.close();
      sinon.assert.calledOnceWithExactly(pptrBrowser.disconnect);
      sinon.assert.notCalled(pptrBrowser.close);
    });

    it('enables WebSocket keep-alive and passes wsHeaders when connecting', async () => {
      const connectStub = sinon
        .stub(puppeteer, 'connect')
        .resolves(createMockPuppeteerBrowser());

      const args = createMockServerConfig({
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        wsHeaders: {Authorization: 'Bearer token'},
      });
      await new BrowserManager(args).ensureBrowser();

      sinon.assert.calledWithMatch(connectStub, {
        browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
        wsOptions: {
          keepAlive: true,
          headers: {Authorization: 'Bearer token'},
        },
      });
    });

    for (const categoryExtensions of [false, true]) {
      it(`${categoryExtensions ? 'keeps' : 'drops'} extension targets when connecting with categoryExtensions=${categoryExtensions}`, async () => {
        const connectStub = sinon
          .stub(puppeteer, 'connect')
          .resolves(createMockPuppeteerBrowser());

        const args = createMockServerConfig({
          browserUrl: 'http://127.0.0.1:9222',
          categoryExtensions,
        });
        await new BrowserManager(args).ensureBrowser();

        const {targetFilter} = connectStub.firstCall.args[0];
        assert.ok(targetFilter);
        const target = createMockPuppeteerTarget({
          url: 'chrome-extension://abcdefgh/popup.html',
        });
        assert.strictEqual(targetFilter(target), categoryExtensions);
      });
    }

    it('deduplicates concurrent ensureBrowser() calls while launch is in-flight', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const {promise, resolve} = Promise.withResolvers<Browser>();
      const launchStub = sinon.stub(puppeteer, 'launch').returns(promise);

      const args = createMockServerConfig({
        headless: true,
        isolated: true,
      });
      const manager = new BrowserManager(args);

      const call1 = manager.ensureBrowser();
      const call2 = manager.ensureBrowser();

      resolve(pptrBrowser);
      const [browser1, browser2] = await Promise.all([call1, call2]);

      assert.strictEqual(browser1, pptrBrowser);
      assert.strictEqual(browser2, pptrBrowser);
      sinon.assert.calledOnce(launchStub);
    });

    it('clears pending state on launch failure so subsequent ensureBrowser() retries', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const launchStub = sinon
        .stub(puppeteer, 'launch')
        .onFirstCall()
        .rejects(new Error('launch failed'))
        .onSecondCall()
        .resolves(pptrBrowser);

      const args = createMockServerConfig({
        headless: true,
        isolated: true,
      });
      const manager = new BrowserManager(args);

      await assert.rejects(manager.ensureBrowser(), /launch failed/);
      const browser = await manager.ensureBrowser();

      assert.strictEqual(browser, pptrBrowser);
      sinon.assert.calledTwice(launchStub);
    });

    it('reconnects when existing browser is no longer connected', async () => {
      const pptrBrowser1 = createMockPuppeteerBrowser();
      const pptrBrowser2 = createMockPuppeteerBrowser();
      let isConnected = true;
      sinon.stub(pptrBrowser1, 'connected').get(() => isConnected);

      const launchStub = sinon
        .stub(puppeteer, 'launch')
        .onFirstCall()
        .resolves(pptrBrowser1)
        .onSecondCall()
        .resolves(pptrBrowser2);

      const args = createMockServerConfig({
        headless: true,
        isolated: true,
      });
      const manager = new BrowserManager(args);

      const first = await manager.ensureBrowser();
      assert.strictEqual(first, pptrBrowser1);

      isConnected = false;
      const second = await manager.ensureBrowser();
      assert.strictEqual(second, pptrBrowser2);
      sinon.assert.calledTwice(launchStub);
    });

    it('waits for in-flight launch, closes browser, and rejects ensureBrowser() when close() is called mid-launch', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const launchStarted = Promise.withResolvers<void>();
      const launchDeferred = Promise.withResolvers<Browser>();
      const closeDeferred = Promise.withResolvers<void>();
      const launchStub = sinon.stub(puppeteer, 'launch').callsFake(() => {
        launchStarted.resolve();
        return launchDeferred.promise;
      });
      let browserClosed = false;
      pptrBrowser.close.callsFake(async () => {
        await closeDeferred.promise;
        browserClosed = true;
      });

      const args = createMockServerConfig({
        headless: true,
        isolated: true,
      });
      const manager = new BrowserManager(args);

      const ensurePromise1 = manager.ensureBrowser();
      await launchStarted.promise;

      const ensurePromise2 = manager.ensureBrowser();
      const closePromise = manager.close();

      launchDeferred.resolve(pptrBrowser);
      closeDeferred.resolve();

      await Promise.all([
        assert.rejects(ensurePromise1, err => {
          assert.strictEqual(browserClosed, true);
          assert.match(String(err), /Browser was closed while initializing/);
          return true;
        }),
        assert.rejects(ensurePromise2, err => {
          assert.strictEqual(browserClosed, true);
          assert.match(String(err), /Browser was closed while initializing/);
          return true;
        }),
        closePromise,
      ]);

      sinon.assert.calledOnce(launchStub);
      sinon.assert.calledOnceWithExactly(pptrBrowser.close);
    });

    it('rejects ensureBrowser() without launching a new browser when called while close() is in flight', async () => {
      const pptrBrowser = createMockPuppeteerBrowser();
      const closeStarted = Promise.withResolvers<void>();
      const closeDeferred = Promise.withResolvers<void>();
      const launchStub = sinon.stub(puppeteer, 'launch').resolves(pptrBrowser);
      pptrBrowser.close.callsFake(() => {
        closeStarted.resolve();
        return closeDeferred.promise;
      });

      const args = createMockServerConfig({
        headless: true,
        isolated: true,
      });
      const manager = new BrowserManager(args);

      const browser = await manager.ensureBrowser();
      assert.strictEqual(browser, pptrBrowser);

      const closePromise = manager.close();
      await closeStarted.promise;

      const ensurePromise = manager.ensureBrowser();
      closeDeferred.resolve();

      await Promise.all([
        assert.rejects(ensurePromise, /Browser was closed while initializing/),
        closePromise,
      ]);

      sinon.assert.calledOnce(launchStub);
      sinon.assert.calledOnceWithExactly(pptrBrowser.close);
    });

    describe('push-based disconnect eviction', () => {
      it('proactively evicts a disconnected browser without waiting for a lazy connected check', async () => {
        const firstBrowser = createMockPuppeteerBrowser();
        const secondBrowser = createMockPuppeteerBrowser();
        const launchStub = sinon
          .stub(puppeteer, 'launch')
          .onFirstCall()
          .resolves(firstBrowser)
          .onSecondCall()
          .resolves(secondBrowser);

        const manager = new BrowserManager(
          createMockServerConfig({headless: true, isolated: true}),
        );

        const first = await manager.ensureBrowser();
        assert.strictEqual(first, firstBrowser);

        firstBrowser.emit('disconnected', undefined);

        // The mock's `connected` getter still reports true — proves the next
        // ensureBrowser() reconnected because of the push-based eviction,
        // not because a lazy `!browser.connected` check caught it.
        assert.strictEqual(firstBrowser.connected, true);

        const second = await manager.ensureBrowser();
        assert.strictEqual(second, secondBrowser);
        sinon.assert.calledTwice(launchStub);
      });

      it('does not evict the current browser when disconnected fires on an already-superseded one', async () => {
        const oldBrowser = createMockPuppeteerBrowser();
        const newBrowser = createMockPuppeteerBrowser();
        let oldConnected = true;
        sinon.stub(oldBrowser, 'connected').get(() => oldConnected);
        const launchStub = sinon
          .stub(puppeteer, 'launch')
          .onFirstCall()
          .resolves(oldBrowser)
          .onSecondCall()
          .resolves(newBrowser);

        const manager = new BrowserManager(
          createMockServerConfig({headless: true, isolated: true}),
        );

        const first = await manager.ensureBrowser();
        assert.strictEqual(first, oldBrowser);

        oldConnected = false;
        const second = await manager.ensureBrowser();
        assert.strictEqual(second, newBrowser);

        oldBrowser.emit('disconnected', undefined);

        const third = await manager.ensureBrowser();
        assert.strictEqual(third, newBrowser);
        sinon.assert.calledTwice(launchStub);
      });

      it('disconnects an already-cached connected browser when abandoned', async () => {
        const firstBrowser = createMockPuppeteerBrowser();
        const secondBrowser = createMockPuppeteerBrowser();
        const connectStub = sinon
          .stub(puppeteer, 'connect')
          .onFirstCall()
          .resolves(firstBrowser)
          .onSecondCall()
          .resolves(secondBrowser);

        const manager = new BrowserManager(
          createMockServerConfig({browserUrl: 'http://127.0.0.1:9222'}),
        );

        const first = await manager.ensureBrowser();
        assert.strictEqual(first, firstBrowser);

        manager.abandonPendingAttempt();

        sinon.assert.calledOnceWithExactly(firstBrowser.disconnect);
        sinon.assert.notCalled(firstBrowser.close);

        const second = await manager.ensureBrowser();
        assert.strictEqual(second, secondBrowser);
        sinon.assert.calledTwice(connectStub);
      });
    });

    describe('abandonPendingAttempt', () => {
      it('discards a connect() resolution that arrives after being abandoned, and a fresh call still succeeds', async () => {
        const abandonedBrowser = createMockPuppeteerBrowser();
        const freshBrowser = createMockPuppeteerBrowser();
        const connectStarted = Promise.withResolvers<void>();
        const connectDeferred = Promise.withResolvers<Browser>();
        const connectStub = sinon
          .stub(puppeteer, 'connect')
          .onFirstCall()
          .callsFake(() => {
            connectStarted.resolve();
            return connectDeferred.promise;
          })
          .onSecondCall()
          .resolves(freshBrowser);

        const manager = new BrowserManager(
          createMockServerConfig({browserUrl: 'http://127.0.0.1:9222'}),
        );

        const ensurePromise1 = manager.ensureBrowser();
        await connectStarted.promise;

        manager.abandonPendingAttempt();
        const ensurePromise2 = manager.ensureBrowser();

        connectDeferred.resolve(abandonedBrowser);

        await assert.rejects(
          ensurePromise1,
          /Connection attempt was abandoned before it completed/,
        );
        assert.strictEqual(await ensurePromise2, freshBrowser);

        sinon.assert.calledOnceWithExactly(abandonedBrowser.disconnect);
        sinon.assert.notCalled(freshBrowser.disconnect);
        sinon.assert.calledTwice(connectStub);
      });

      it('discards a launch() resolution that arrives after being abandoned, and a fresh call still succeeds', async () => {
        const abandonedBrowser = createMockPuppeteerBrowser();
        const freshBrowser = createMockPuppeteerBrowser();
        const launchStarted = Promise.withResolvers<void>();
        const launchDeferred = Promise.withResolvers<Browser>();
        const launchStub = sinon
          .stub(puppeteer, 'launch')
          .onFirstCall()
          .callsFake(() => {
            launchStarted.resolve();
            return launchDeferred.promise;
          })
          .onSecondCall()
          .resolves(freshBrowser);

        const manager = new BrowserManager(
          createMockServerConfig({headless: true, isolated: true}),
        );

        const ensurePromise1 = manager.ensureBrowser();
        await launchStarted.promise;

        manager.abandonPendingAttempt();
        const ensurePromise2 = manager.ensureBrowser();

        launchDeferred.resolve(abandonedBrowser);

        await assert.rejects(
          ensurePromise1,
          /Connection attempt was abandoned before it completed/,
        );
        assert.strictEqual(await ensurePromise2, freshBrowser);

        sinon.assert.calledOnceWithExactly(abandonedBrowser.close);
        sinon.assert.notCalled(freshBrowser.close);
        sinon.assert.calledTwice(launchStub);
      });

      it('discards a queued attempt whose own timeout fires while still waiting for the mutex', async () => {
        const firstBrowser = createMockPuppeteerBrowser();
        const launchStarted = Promise.withResolvers<void>();
        const launchDeferred = Promise.withResolvers<Browser>();
        const launchStub = sinon.stub(puppeteer, 'launch').callsFake(() => {
          launchStarted.resolve();
          return launchDeferred.promise;
        });

        const manager = new BrowserManager(
          createMockServerConfig({headless: true, isolated: true}),
        );

        const ensurePromise1 = manager.ensureBrowser();
        await launchStarted.promise;

        // Abandon call 1's own caller while its launch() is still pending
        // and still holding #mutex.
        manager.abandonPendingAttempt();

        // #initPromise was just cleared, so this starts a genuinely new
        // #ensureBrowserLocked() call that queues on #mutex (call 1 hasn't
        // released it yet) instead of sharing call 1's promise.
        const ensurePromise2 = manager.ensureBrowser();
        // Abandon call 2's own caller too, while call 2 is still queued
        // waiting for #mutex — the exact race being guarded against: call 2
        // must not silently adopt this rotation as its own baseline once it
        // gets the lock.
        manager.abandonPendingAttempt();

        launchDeferred.resolve(firstBrowser);

        await assert.rejects(
          ensurePromise1,
          /Connection attempt was abandoned before it completed/,
        );
        await assert.rejects(
          ensurePromise2,
          /Connection attempt was abandoned before it completed/,
        );

        // Call 2 was already abandoned before it ever reached the front of
        // #mutex, so it must bail immediately instead of starting (and then
        // silently keeping) a second, unwanted browser.
        sinon.assert.calledOnce(launchStub);
        sinon.assert.calledOnceWithExactly(firstBrowser.close);
      });

      it('forgets the already-cached browser when abandoned after ensureBrowser() already resolved', async () => {
        const firstBrowser = createMockPuppeteerBrowser();
        const secondBrowser = createMockPuppeteerBrowser();
        const launchStub = sinon
          .stub(puppeteer, 'launch')
          .onFirstCall()
          .resolves(firstBrowser)
          .onSecondCall()
          .resolves(secondBrowser);

        const manager = new BrowserManager(
          createMockServerConfig({headless: true, isolated: true}),
        );

        const first = await manager.ensureBrowser();
        assert.strictEqual(first, firstBrowser);

        // Simulates a getContext()-level timeout firing after ensureBrowser()
        // had already resolved — e.g. McpContext.ensureBrowser()'s own CDP
        // initialization hanging on a transport that died silently. Token
        // rotation alone wouldn't help here: there's no in-flight
        // connect()/launch() left to discard, #browser is already cached.
        manager.abandonPendingAttempt();

        sinon.assert.calledOnceWithExactly(firstBrowser.close);

        const second = await manager.ensureBrowser();
        assert.strictEqual(second, secondBrowser);
        sinon.assert.calledTwice(launchStub);
      });
    });

    it('includes remote debugging hint and preserves cause when autoConnect fails without userDataDir', async () => {
      const enoentError = Object.assign(
        new Error(
          "ENOENT: no such file or directory, open '/Users/test/Library/Application Support/Google/Chrome/DevToolsActivePort'",
        ),
        {code: 'ENOENT'},
      );
      const puppeteerError = new Error(
        'Could not find DevToolsActivePort for chrome at /Users/test/Library/Application Support/Google/Chrome/DevToolsActivePort',
        {cause: enoentError},
      );
      sinon.stub(puppeteer, 'connect').rejects(puppeteerError);

      const manager = new BrowserManager(
        createMockServerConfig({
          autoConnect: true,
          channel: 'stable',
        }),
      );

      await assert.rejects(manager.ensureBrowser(), err => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Could not connect to Chrome. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.',
        );
        assert.strictEqual(err.cause, puppeteerError);
        return true;
      });
    });
  });

  describe('rootSandboxLaunchError', () => {
    const targetClosed = new Error(
      'Protocol error (Target.setDiscoverTargets): Target closed',
    );

    it('explains an opaque launch failure when running as root', () => {
      const error = BrowserManager.rootSandboxLaunchError(targetClosed, [], 0);
      assert.ok(error);
      assert.match(error.message, /non-root user/);
      assert.match(error.message, /pptr\.dev\/troubleshooting/);
      // The original failure stays visible so unrelated errors are not masked.
      assert.match(error.message, /Target closed/);
      assert.strictEqual(error.cause, targetClosed);
    });

    it('does not explain failures when not running as root', () => {
      assert.strictEqual(
        BrowserManager.rootSandboxLaunchError(targetClosed, [], 1000),
        undefined,
      );
    });

    it('does not explain failures on platforms without uids', () => {
      assert.strictEqual(
        BrowserManager.rootSandboxLaunchError(targetClosed, [], undefined),
        undefined,
      );
    });

    it('does not explain failures when the sandbox is already disabled', () => {
      assert.strictEqual(
        BrowserManager.rootSandboxLaunchError(
          targetClosed,
          ['--no-sandbox'],
          0,
        ),
        undefined,
      );
      assert.strictEqual(
        BrowserManager.rootSandboxLaunchError(
          targetClosed,
          ['--no-sandbox=true'],
          0,
        ),
        undefined,
      );
    });

    it('is not fooled by unrelated arguments that start the same', () => {
      assert.ok(
        BrowserManager.rootSandboxLaunchError(
          targetClosed,
          ['--no-sandbox-and-elevated'],
          0,
        ),
      );
      assert.ok(
        BrowserManager.rootSandboxLaunchError(
          targetClosed,
          ['--disable-setuid-sandbox'],
          0,
        ),
      );
    });
  });

  describe('missingDisplayLaunchError', () => {
    const missingXServer = new Error(
      'Missing X server to start the headful browser. Either set headless ' +
        'to true or use xvfb-run to run your Puppeteer script.',
    );

    it('names --headless when a headed launch has no X server', () => {
      const error = BrowserManager.missingDisplayLaunchError(
        missingXServer,
        false,
      );
      assert.ok(error);
      assert.match(error.message, /--headless/);
      assert.match(error.message, /Missing X server/);
      assert.strictEqual(error.cause, missingXServer);
    });

    it('does not explain failures in headless mode', () => {
      assert.strictEqual(
        BrowserManager.missingDisplayLaunchError(missingXServer, true),
        undefined,
      );
    });

    it('does not explain unrelated failures', () => {
      assert.strictEqual(
        BrowserManager.missingDisplayLaunchError(
          new Error(
            'Protocol error (Target.setDiscoverTargets): Target closed',
          ),
          false,
        ),
        undefined,
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
      const manager1 = new BrowserManager(
        createMockServerConfig({
          headless: true,
          isolated: false,
          userDataDir: folderPath,
          executablePath: await getExecutablePath(),
        }),
      );
      const browser1 = await manager1.ensureBrowser();
      try {
        try {
          const manager2 = new BrowserManager(
            createMockServerConfig({
              headless: true,
              isolated: false,
              userDataDir: folderPath,
              executablePath: await getExecutablePath(),
            }),
          );
          const browser2 = await manager2.ensureBrowser();
          await safeClose(browser2);
          assert.fail('not reached');
        } catch (err) {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
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
      const manager = new BrowserManager(
        createMockServerConfig({
          headless: true,
          isolated: false,
          userDataDir: folderPath,
          executablePath: await getExecutablePath(),
          viewport: {
            width: 1501,
            height: 801,
          },
        }),
      );
      const browser = await manager.ensureBrowser();
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
      const launchManager = new BrowserManager(
        createMockServerConfig({
          headless: true,
          isolated: false,
          userDataDir: folderPath,
          executablePath: await getExecutablePath(),
          chromeArg: ['--remote-debugging-port=0'],
        }),
      );
      const browser = await launchManager.ensureBrowser();
      try {
        const manager = new BrowserManager(
          createMockServerConfig({
            userDataDir: folderPath,
            autoConnect: true,
          }),
        );
        const connectedBrowser = await manager.ensureBrowser();
        assert.ok(connectedBrowser);
        assert.ok(connectedBrowser.connected);
        await manager.close();
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

        const manager = new BrowserManager(
          createMockServerConfig({
            headless: true,
            isolated: true,
            executablePath: await getExecutablePath(),
            blockedUrlPattern: ['*://*:*/blocked.html'],
          }),
        );
        const browser = await manager.ensureBrowser();
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

        const manager = new BrowserManager(
          createMockServerConfig({
            headless: true,
            isolated: true,
            executablePath: await getExecutablePath(),
            allowedUrlPattern: ['*://*:*/allowed.html'],
          }),
        );
        const browser = await manager.ensureBrowser();
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
      const filterWithoutExtensions = BrowserManager.makeTargetFilter(false);
      const filterWithExtensions = BrowserManager.makeTargetFilter(true);

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
