/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {consoleTool} from '../../src/tools/console.js';
import {withBrowser} from '../utils.js';

describe('console', () => {
  describe('list_console_messages', () => {
    it('list messages', async () => {
      await withBrowser(async (response, context) => {
        await consoleTool.handler({params: {}}, response, context);
        assert.ok(response.includeConsoleData);
      });
    });

    it('lists error messages', async () => {
      await withBrowser(async (response, context) => {
        const page = await context.newPage();
        await page.setContent(
          '<script>console.error("This is an error")</script>',
        );
        await consoleTool.handler({params: {}}, response, context);
        await response.handle('test', context);

        const formattedResponse = response.format('test', context);

        const textContent = formattedResponse[0] as {text: string};
        assert.ok(textContent.text.includes('Error>'));
        assert.ok(textContent.text.includes('This is an error'));
      });
    });
  });
});
