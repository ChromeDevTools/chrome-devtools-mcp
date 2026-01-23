/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  installExtension,
  uninstallExtension,
  listExtensions,
} from '../../src/tools/extensions.js';
import {withMcpContext} from '../utils.js';

const EXTENSION_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension',
);

describe('extension', () => {
  it('installs and uninstalls an extension and verifies it in chrome://extensions', async () => {
    await withMcpContext(async (response, context) => {
      // Install the extension
      await installExtension.handler(
        {params: {path: EXTENSION_PATH}},
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

      // Uninstall the extension
      await uninstallExtension.handler(
        {params: {id: extensionId!}},
        response,
        context,
      );

      const uninstallResponseLine = response.responseLines[1];
      assert.ok(
        uninstallResponseLine.includes('Extension uninstalled'),
        'Response should indicate uninstallation',
      );

      await page.waitForSelector('extensions-manager');

      const elementAfterUninstall = await page.$(
        `extensions-manager >>> extensions-item[id="${extensionId}"]`,
      );
      assert.strictEqual(
        elementAfterUninstall,
        null,
        `Extension with ID "${extensionId}" should NOT be visible on chrome://extensions`,
      );
    });
  });
  it('lists installed extensions', async () => {
    await withMcpContext(async (response, context) => {
      await installExtension.handler(
        { params: { path: EXTENSION_PATH } },
        response,
        context,
      );

      await listExtensions.handler({ params: {} }, response, context);

      const listResponseLine = response.responseLines[1];
      assert.ok(listResponseLine, 'Response should not be empty');
      const extensions = JSON.parse(listResponseLine);
      assert.strictEqual(extensions.length, 1);
      assert.strictEqual(extensions[0].Name, 'Test Extension');
      assert.strictEqual(extensions[0].Version, '1.0');
      assert.strictEqual(extensions[0].Enabled, 'Yes');

      const extensionId = extensions[0].ID;
      await uninstallExtension.handler(
        { params: { id: extensionId } },
        response,
        context,
      );

      response.resetResponseLineForTesting();
      await listExtensions.handler({ params: {} }, response, context);

      const emptyListResponse = response.responseLines[0];
      assert.strictEqual(emptyListResponse, 'No extensions installed.');
    });
  });
});
