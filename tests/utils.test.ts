/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {Browser} from 'puppeteer';

import {withBrowser} from './utils.js';

describe('withBrowser', () => {
  it('relaunches a cached browser that has disconnected', async () => {
    let firstBrowser: Browser | undefined;
    await withBrowser(async browser => {
      firstBrowser = browser;
    });
    assert.ok(firstBrowser);

    // Simulate a browser that died mid-run – the cache still holds the dead handle.
    await firstBrowser.close();
    assert.ok(!firstBrowser.connected);

    // The next call with the same options must not reuse the dead browser.
    let secondBrowser: Browser | undefined;
    await withBrowser(async browser => {
      secondBrowser = browser;
      assert.ok(browser.connected);
    });
    assert.notStrictEqual(secondBrowser, firstBrowser);
  });
});
