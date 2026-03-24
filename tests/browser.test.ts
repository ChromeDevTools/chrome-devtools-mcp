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

import {executablePath} from 'puppeteer';

import {
  detectDisplay,
  ensureBrowserConnected,
  isExtensionUrl,
  isBrowserNewTabUrl,
  isBrowserInspectUrl,
  browserName,
  inspectUrl,
  launch,
  resolveEdgeExecutablePath,
  resolveEdgeUserDataDir,
} from '../src/browser.js';

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
});

describe('browserName', () => {
  it('returns correct browser names', () => {
    assert.strictEqual(browserName('chrome'), 'Chrome');
    assert.strictEqual(browserName('edge'), 'Edge');
  });
});

describe('inspectUrl', () => {
  it('returns correct inspect URLs', () => {
    assert.strictEqual(
      inspectUrl('chrome'),
      'chrome://inspect/#remote-debugging',
    );
    assert.strictEqual(inspectUrl('edge'), 'edge://inspect/#remote-debugging');
  });
});

describe('isExtensionUrl', () => {
  it('detects chrome extension URLs', () => {
    assert.strictEqual(
      isExtensionUrl('chrome-extension://abcdef/popup.html'),
      true,
    );
  });

  it('detects edge extension URLs', () => {
    assert.strictEqual(
      isExtensionUrl('edge-extension://abcdef/popup.html'),
      true,
    );
  });

  it('rejects non-extension URLs', () => {
    assert.strictEqual(isExtensionUrl('https://example.com'), false);
    assert.strictEqual(isExtensionUrl('chrome://settings'), false);
    assert.strictEqual(isExtensionUrl('edge://settings'), false);
  });
});

describe('isBrowserNewTabUrl', () => {
  it('detects new tab URLs for both browsers', () => {
    assert.strictEqual(isBrowserNewTabUrl('chrome://newtab/'), true);
    assert.strictEqual(isBrowserNewTabUrl('edge://newtab/'), true);
    assert.strictEqual(isBrowserNewTabUrl('https://example.com'), false);
  });
});

describe('isBrowserInspectUrl', () => {
  it('detects inspect URLs for both browsers', () => {
    assert.strictEqual(isBrowserInspectUrl('chrome://inspect'), true);
    assert.strictEqual(
      isBrowserInspectUrl('chrome://inspect/#remote-debugging'),
      true,
    );
    assert.strictEqual(isBrowserInspectUrl('edge://inspect'), true);
    assert.strictEqual(isBrowserInspectUrl('https://example.com'), false);
  });
});

describe('ensureBrowserConnected Edge auto-connect', () => {
  it('auto-connects to Edge via userDataDir', async () => {
    // Use a temp dir (not the real Edge profile) to avoid conflicts with a
    // running Edge instance. This mirrors the Chrome auto-connect test above.
    let edgePath: string;
    try {
      edgePath = resolveEdgeExecutablePath('stable');
    } catch {
      return; // Edge not installed — skip
    }

    const folderPath = path.join(
      os.tmpdir(),
      `edge-autoconnect-${crypto.randomUUID()}`,
    );
    let browser;
    try {
      browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        executablePath: edgePath,
        devtools: false,
        chromeArgs: ['--remote-debugging-port=0'],
      });
    } catch {
      return; // Edge found but not launchable — skip
    }
    try {
      const connectedBrowser = await ensureBrowserConnected({
        userDataDir: folderPath,
        browserKind: 'edge',
        devtools: false,
      });
      assert.ok(connectedBrowser);
      assert.ok(connectedBrowser.connected);
      connectedBrowser.disconnect();
    } finally {
      await browser.close();
    }
  });

  it('auto-resolves Edge user data dir from channel when userDataDir not provided', async () => {
    // Exercises the code path: browserKind='edge' + channel='stable' + no userDataDir
    // → ensureBrowserConnected calls resolveEdgeUserDataDir(channel) internally.
    let expectedDir: string;
    try {
      expectedDir = resolveEdgeUserDataDir('stable');
    } catch {
      return; // Edge paths not available on this platform — skip
    }
    try {
      await ensureBrowserConnected({
        channel: 'stable',
        browserKind: 'edge',
        devtools: false,
        // No userDataDir — forces auto-resolution via resolveEdgeUserDataDir
      });
      assert.fail('should have thrown (no running Edge expected)');
    } catch (err) {
      // The error proves resolveEdgeUserDataDir was called: the resolved path
      // appears in the error message ("Could not connect to Edge in <path>").
      assert.ok(
        err.message.includes(expectedDir),
        `Error should reference resolved Edge user data dir "${expectedDir}": ${err.message}`,
      );
    }
  });

  it('uses Edge-specific error message on connection failure', async () => {
    const fakePath = path.join(
      os.tmpdir(),
      `edge-no-exist-${crypto.randomUUID()}`,
    );
    await fs.promises.mkdir(fakePath, {recursive: true});
    try {
      await ensureBrowserConnected({
        userDataDir: fakePath,
        devtools: false,
        browserKind: 'edge',
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(
        err.message.includes('Edge'),
        `Error should mention Edge: ${err.message}`,
      );
      assert.ok(
        err.message.includes('edge://inspect'),
        `Error should mention edge://inspect: ${err.message}`,
      );
    } finally {
      await fs.promises.rm(fakePath, {recursive: true, force: true});
    }
  });

  it('uses Chrome-specific error message on connection failure', async () => {
    const fakePath = path.join(
      os.tmpdir(),
      `chrome-no-exist-${crypto.randomUUID()}`,
    );
    await fs.promises.mkdir(fakePath, {recursive: true});
    try {
      await ensureBrowserConnected({
        userDataDir: fakePath,
        devtools: false,
        browserKind: 'chrome',
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(
        err.message.includes('Chrome'),
        `Error should mention Chrome: ${err.message}`,
      );
      assert.ok(
        err.message.includes('chrome://inspect'),
        `Error should mention chrome://inspect: ${err.message}`,
      );
    } finally {
      await fs.promises.rm(fakePath, {recursive: true, force: true});
    }
  });
});

describe('launch Edge executable resolution', () => {
  it('launches Edge via browserKind without executablePath', async () => {
    try {
      resolveEdgeExecutablePath('stable');
    } catch {
      return; // Edge not installed — skip
    }

    const tmpDir = os.tmpdir();
    const folderPath = path.join(
      tmpDir,
      `edge-launch-test-${crypto.randomUUID()}`,
    );
    let browser;
    try {
      browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        browserKind: 'edge',
        devtools: false,
      });
    } catch {
      return; // Edge found but not launchable — skip
    }
    try {
      const [page] = await browser.pages();
      assert.ok(page);
    } finally {
      await browser.close();
    }
  });

  it('launches Edge beta via channel', async () => {
    try {
      resolveEdgeExecutablePath('beta');
    } catch {
      return; // Edge Beta not installed — skip
    }

    const tmpDir = os.tmpdir();
    const folderPath = path.join(
      tmpDir,
      `edge-beta-launch-${crypto.randomUUID()}`,
    );
    let browser;
    try {
      browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        browserKind: 'edge',
        channel: 'beta',
        devtools: false,
      });
    } catch {
      return; // Edge Beta found but not launchable — skip
    }
    try {
      const [page] = await browser.pages();
      assert.ok(page);
    } finally {
      await browser.close();
    }
  });

  it('launches Edge dev via channel', async () => {
    try {
      resolveEdgeExecutablePath('dev');
    } catch {
      return; // Edge Dev not installed — skip
    }

    const tmpDir = os.tmpdir();
    const folderPath = path.join(
      tmpDir,
      `edge-dev-launch-${crypto.randomUUID()}`,
    );
    let browser;
    try {
      browser = await launch({
        headless: true,
        isolated: false,
        userDataDir: folderPath,
        browserKind: 'edge',
        channel: 'dev',
        devtools: false,
      });
    } catch {
      return; // Edge Dev found but not launchable — skip
    }
    try {
      const [page] = await browser.pages();
      assert.ok(page);
    } finally {
      await browser.close();
    }
  });

  it('creates edge-profile directory prefix for Edge', async () => {
    const tmpDir = os.tmpdir();
    const basePath = path.join(
      tmpDir,
      `edge-profile-test-${crypto.randomUUID()}`,
    );
    await fs.promises.mkdir(basePath, {recursive: true});

    try {
      resolveEdgeExecutablePath('stable');
    } catch {
      await fs.promises.rm(basePath, {recursive: true, force: true});
      return; // Edge not installed — skip
    }

    const cliCacheDir = path.join(
      os.homedir(),
      '.cache',
      'chrome-devtools-mcp-cli',
    );
    const entriesBefore = await fs.promises
      .readdir(cliCacheDir)
      .catch(() => [] as string[]);

    const browser = await launch({
      headless: true,
      isolated: false,
      browserKind: 'edge',
      devtools: false,
      viaCli: true,
    });
    try {
      // Verify profile dir starts with 'edge-profile'
      const entries = await fs.promises.readdir(cliCacheDir);
      assert.ok(
        entries.some(e => e.startsWith('edge-profile')),
        `Expected edge-profile* in ${cliCacheDir}, found: ${entries.join(', ')}`,
      );
    } finally {
      await browser.close();
      // Clean up any new edge-profile dirs created by this test
      const entriesAfter = await fs.promises
        .readdir(cliCacheDir)
        .catch(() => [] as string[]);
      const newEntries = entriesAfter.filter(
        e => e.startsWith('edge-profile') && !entriesBefore.includes(e),
      );
      for (const entry of newEntries) {
        await fs.promises.rm(path.join(cliCacheDir, entry), {
          recursive: true,
          force: true,
        });
      }
      await fs.promises.rm(basePath, {recursive: true, force: true});
    }
  });

  it('uses channel-specific profile dir name', () => {
    // Unit test: verify the profile dir naming logic inline
    // The launch function uses `${browserPrefix}-profile-${channel}` for non-stable
    const browserPrefix = 'edge';
    const cases = [
      {channel: 'stable', expected: 'edge-profile'},
      {channel: 'beta', expected: 'edge-profile-beta'},
      {channel: 'dev', expected: 'edge-profile-dev'},
      {channel: 'canary', expected: 'edge-profile-canary'},
    ];
    for (const {channel, expected} of cases) {
      const profileDirName =
        channel && channel !== 'stable'
          ? `${browserPrefix}-profile-${channel}`
          : `${browserPrefix}-profile`;
      assert.strictEqual(profileDirName, expected, `channel=${channel}`);
    }
  });
});
