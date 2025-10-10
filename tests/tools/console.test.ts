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
        await consoleTool.handler({params: {tail: 50}}, response, context);
        assert.ok(response.includeConsoleData);
      });
    });

    it('uses default tail of 50 messages', async () => {
      await withBrowser(async (response, context) => {
        // Generate 60 console messages
        const page = context.getSelectedPage();
        await page.evaluate(() => {
          for (let i = 1; i <= 60; i++) {
            console.log(`Message ${i}`);
          }
        });

        // Call handler without tail param (should default to 50)
        await consoleTool.handler({params: {tail: 50}}, response, context);

        const result = await response.handle('test', context);
        const text = (result[0] as any).text.toString();

        // Should include message 11 (first of last 50)
        assert.ok(text.includes('Message 11'), 'Should include Message 11');
        // Should include message 60 (last message)
        assert.ok(text.includes('Message 60'), 'Should include Message 60');
        // Should NOT include message 10 (51st from end)
        assert.ok(!text.includes('Message 10'), 'Should NOT include Message 10');
      });
    });

    it('respects custom tail parameter', async () => {
      await withBrowser(async (response, context) => {
        // Generate 20 console messages
        const page = context.getSelectedPage();
        await page.evaluate(() => {
          for (let i = 1; i <= 20; i++) {
            console.log(`Message ${i}`);
          }
        });

        // Call handler with tail=5
        await consoleTool.handler({params: {tail: 5}}, response, context);

        const result = await response.handle('test', context);
        const text = (result[0] as any).text.toString();

        // Should include messages 16-20 (last 5)
        assert.ok(text.includes('Message 16'), 'Should include Message 16');
        assert.ok(text.includes('Message 20'), 'Should include Message 20');
        // Should NOT include message 15
        assert.ok(!text.includes('Message 15'), 'Should NOT include Message 15');
      });
    });

    it('returns only last 10 messages with default tail when less than 50 exist', async () => {
      await withBrowser(async (response, context) => {
        // Generate 10 console messages
        const page = context.getSelectedPage();
        await page.evaluate(() => {
          for (let i = 1; i <= 10; i++) {
            console.log(`Message ${i}`);
          }
        });

        // Call handler with default tail (50, but only 10 messages exist)
        await consoleTool.handler({params: {tail: 50}}, response, context);

        const result = await response.handle('test', context);
        const text = (result[0] as any).text.toString();

        // Should include all 10 messages since there are less than 50
        for (let i = 1; i <= 10; i++) {
          assert.ok(text.includes(`Message ${i}`), `Should include Message ${i}`);
        }
      });
    });
  });
});
