/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import { describe, it } from 'node:test';

import { installExtension } from '../../src/tools/extensions.js';
import { withMcpContext } from '../utils.js';

const EXTENSION_PATH = path.join(import.meta.dirname, '../../../tests/tools/fixtures/extension');

describe('extension', () => {
  it('installs an extension and verifies it is listed in chrome://extensions', async () => {
    await withMcpContext(async (response, context) => {
      await installExtension.handler(
        { params: { path: EXTENSION_PATH } },
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
});
