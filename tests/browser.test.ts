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

import {detectDisplay, ensureBrowserConnected, launch} from '../src/browser.js';
import {puppeteer} from '../src/third_party/index.js';

describe('browser', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('detects display does not crash', () => {
    detectDisplay();
  });

  it('cannot launch multiple times with the same profile', async () => {
    const tmpDir = os.tmpdir();
    const folderPath = path.join(tmpDir, `temp-folder-${crypto.randomUUID()}`);
    const browser1 = await launch({
      headless: true,
      isolated: false,
      userDataDir: folderPath,
      executablePath: executablePath(),
      devtools: false,
    });
    try {
      try {
        const browser2 = await launch({
          headless: true,
          isolated: false,
          userDataDir: folderPath,
          executablePath: executablePath(),
          devtools: false,
        });
        await browser2.close();
        assert.fail('not reached');
      } catch (err) {
        assert.strictEqual(
          err.message,
          `The browser is already running for ${folderPath}. Use --isolated to run multiple browser instances.`,
        );
      }
    } finally {
      await browser1.close();
    }
  });

  it('launches with the initial viewport', async () => {
    const tmpDir = os.tmpdir();
    const folderPath = path.join(tmpDir, `temp-folder-${crypto.randomUUID()}`);
    const browser = await launch({
      headless: true,
      isolated: false,
      userDataDir: folderPath,
      executablePath: executablePath(),
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
      await browser.close();
    }
  });
  it('connects to an existing browser with userDataDir', async () => {
    const tmpDir = os.tmpdir();
    const folderPath = path.join(tmpDir, `temp-folder-${crypto.randomUUID()}`);
    const browser = await launch({
      headless: true,
      isolated: false,
      userDataDir: folderPath,
      executablePath: executablePath(),
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
      await browser.close();
    }
  });

  it('falls back to auto-connect when browser url cannot connect', async () => {
    const connect = sinon.stub(puppeteer, 'connect');
    connect.onFirstCall().rejects(new Error('port unavailable'));
    connect.onSecondCall().rejects(new Error('auto-connect unavailable'));

    await assert.rejects(
      ensureBrowserConnected({
        browserURL: 'http://127.0.0.1:9222',
        autoConnect: true,
        channel: 'stable',
        devtools: false,
      }),
      /Could not connect to Chrome/,
    );

    assert.strictEqual(connect.callCount, 2);
    assert.strictEqual(
      connect.firstCall.args[0].browserURL,
      'http://127.0.0.1:9222',
    );
    assert.strictEqual(connect.firstCall.args[0].channel, undefined);
    assert.strictEqual(connect.secondCall.args[0].browserURL, undefined);
    assert.strictEqual(connect.secondCall.args[0].channel, 'chrome');
  });
});
