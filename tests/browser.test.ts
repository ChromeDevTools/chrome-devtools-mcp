/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {executablePath} from 'puppeteer';

import {detectDisplay, ensureBrowserConnected, launch} from '../src/browser.js';

import {serverHooks} from './server.js';

describe('browser', () => {
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
      await browser.close();
    }
  });

  describe('Blocking', () => {
    const server = serverHooks();

    it('blocks URLs in blocklist', async () => {
      server.addHtmlRoute('/allowed.html', '<html><body>Allowed</body></html>');
      server.addHtmlRoute('/blocked.html', '<html><body>Blocked</body></html>');

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
            await fetch(url);
            return true;
          } catch {
            return false;
          }
        }, server.getRoute('/blocked.html'));

        assert.strictEqual(fetchSucceeded, false);
      } finally {
        await browser.close();
      }
    });

    it('blocks URLs not in allowlist', async () => {
      server.addHtmlRoute('/allowed.html', '<html><body>Allowed</body></html>');
      server.addHtmlRoute('/blocked.html', '<html><body>Blocked</body></html>');

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
            await fetch(url);
            return true;
          } catch {
            return false;
          }
        }, server.getRoute('/blocked.html'));

        assert.strictEqual(fetchSucceeded, false);
      } finally {
        await browser.close();
      }
    });
  });
});
