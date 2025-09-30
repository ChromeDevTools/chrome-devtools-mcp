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

import {launch} from '../src/browser.js';

describe('browser', () => {
  it('cannot launch multiple times with the same profile', async () => {
    const tmpDir = os.tmpdir();
    const folderPath = path.join(tmpDir, `temp-folder-${crypto.randomUUID()}`);
    const browser1 = await launch({
      headless: true,
      isolated: false,
      userDataDir: folderPath,
      executablePath: executablePath(),
    });
    try {
      try {
        const browser2 = await launch({
          headless: true,
          isolated: false,
          userDataDir: folderPath,
          executablePath: executablePath(),
        });
        await browser2.close();
        assert.fail('not reached');
      } catch (err) {
        // Puppeteer throws this error when profile is already in use
        assert.ok(
          err.message.includes('The browser is already running for') ||
          err.message.includes('Chrome is already using this profile'),
          `Expected profile lock error, got: ${err.message}`
        );
      }
    } finally {
      await browser1.close();
    }
  });
});
