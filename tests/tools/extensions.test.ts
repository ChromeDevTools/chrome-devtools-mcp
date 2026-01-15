/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it, after} from 'node:test';

import {installExtension} from '../../src/tools/extensions.js';
import {withMcpContext} from '../utils.js';

describe('extension', () => {
  let tmpDir: string;

  it('installs an extension and verifies it is listed in chrome://extensions', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: 'Test Extension',
        version: '1.0',
        action: {
          default_popup: 'popup.html',
        },
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'popup.html'),
      '<!DOCTYPE html><html><body><h1>Test Popup</h1></body></html>',
    );

    await withMcpContext(async (response, context) => {
      await installExtension.handler(
        {params: {path: tmpDir}},
        response,
        context,
      );

      const responseLine = response.responseLines[0];
      assert.ok(responseLine, 'Response should not be empty');
      const match = responseLine.match(/Extension installed\. Id: (.+)/);
      const extensionId = match ? match[1] : null;
      assert.ok(extensionId, 'Response should contain a valid key');

      const page = context.getSelectedPage();
      await page.goto('chrome://extensions');

      const element = await page.waitForSelector(
        `extensions-manager >>> extensions-item[id="${extensionId}"]`,
      );
      assert.ok(
        element,
        `Extension with ID "${extensionId}" should be visible on chrome://extensions`,
      );
    });
  });

  after(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    }
  });
});
