/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {html, withMcpContext} from './utils.js';

describe('WaitForHelper', () => {
  it('does not stall when an action opens a dialog without handleDialog', async () => {
    await withMcpContext(async (response, context) => {
      const mcpPage = context.getSelectedMcpPage();
      await mcpPage.pptrPage.setContent(html`<button id="b">go</button>`);

      // The action opens a dialog asynchronously and passes no handleDialog.
      // The dialog leaves the renderer paused; without the fix,
      // waitForStableDom's setup evaluation would hang until protocolTimeout
      // (~180s) while the tool mutex is held, freezing the session. Racing the
      // call against a short timeout proves it returns promptly instead.
      const result = await Promise.race([
        mcpPage.waitForEventsAfterAction(async () => {
          await mcpPage.pptrPage.evaluate(() => {
            setTimeout(() => confirm('blocked?'), 0);
          });
        }),
        new Promise<'stalled'>(resolve =>
          setTimeout(() => resolve('stalled'), 15_000),
        ),
      ]);

      if (result === 'stalled') {
        assert.fail(
          'waitForEventsAfterAction stalled while a dialog was open; the tool mutex would be held ~180s',
        );
      }
      // The dialog was detected but not handled (no handleDialog was passed).
      assert.strictEqual(result.dialogHandled, false);
      // The dialog is still open and recorded, so the next blockedByDialog tool
      // correctly refuses to run.
      assert.throws(() => mcpPage.throwIfDialogOpen());

      // Clean up so the page can be torn down.
      await mcpPage.getDialog()?.dismiss();
      mcpPage.clearDialog();
    });
  });
});
