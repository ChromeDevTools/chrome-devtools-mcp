/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe, it} from 'node:test';
import assert from 'assert';

import {withBrowser} from './utils.js';

describe('McpResponse', () => {
  it('list pages', async () => {
    await withBrowser(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(`<!DOCTYPE html>
<button>Click me</button><input type="text" value="Input">`);
      await context.createTextSnapshot();
      assert.ok(await context.getElementByUid('1_1'));
      await context.createTextSnapshot();
      try {
        await context.getElementByUid('1_1');
        assert.fail('not reached');
      } catch (err) {
        assert.strict(
          err.message,
          'This uid is coming from a stale snapshot. Call take_snapshot to get a fresh snapshot',
        );
      }
    });
  });
});
