/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {installExtension} from '../../src/tools/extensions.js';
import {withMcpContext} from '../utils.js';

const EXTENSION_PATH = '/usr/local/google/home/nharshunova/test/extensions';
const EXTENSION_ID = 'emhhlofcjnaambdnpppkpbcimdeaccnn';

describe('extension', () => {
  it('installs an extension and verifies it is listed in chrome://extensions', async () => {
    await withMcpContext(async (response, context) => {
      // 1. Install the extension
      await installExtension.handler(
        {params: {path: EXTENSION_PATH}},
        response,
        context,
      );

      // 2. Verify response
      assert.ok(
        response.responseLines[0]?.includes(EXTENSION_ID),
        `Response should include extension ID ${EXTENSION_ID}`,
      );

      // 3. Verify extension is accessible by navigating to its popup
      const page = context.getSelectedPage();
      await page.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
      const popupContent = await page.content();
      assert.ok(
        popupContent.includes('Popup Action'),
        'Extension popup should be accessible',
      );

      // 4. Verify extension presence in chrome://extensions UI
      // 4. Verify extension presence in chrome://extensions UI
      await page.goto('chrome://extensions');

      // Wait for usage to ensure page is loaded
      await new Promise(r => setTimeout(r, 2000));

      const EXTENSION_NAME = 'Simple Popup Action';
      const found = await page.evaluate(extName => {
        function deepSearch(root: Element | ShadowRoot): boolean {
          if (root.textContent?.includes(extName)) return true;
          if ('shadowRoot' in root && root.shadowRoot) {
            if (deepSearch(root.shadowRoot)) return true;
          }
          for (const child of Array.from(root.children)) {
            if (deepSearch(child)) return true;
          }
          return false;
        }
        return deepSearch(document.body);
      }, EXTENSION_NAME);

      assert.ok(
        found,
        `Extension "${EXTENSION_NAME}" should be visible on chrome://extensions`,
      );
    });
  });
});
