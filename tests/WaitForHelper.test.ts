/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {serverHooks} from './server.js';
import {html, withMcpContext} from './utils.js';

describe('WaitForHelper', () => {
  const server = serverHooks();

  it('does not stall when an action opens a dialog without handleDialog', async () => {
    await withMcpContext(async (response, context) => {
      const mcpPage = context.getSelectedMcpPage();
      await mcpPage.pptrPage.setContent(html`<button id="b">go</button>`);

      // The action opens a dialog asynchronously and passes no handleDialog.
      // The dialog leaves the renderer paused; without the fix,
      // waitForStableDom's setup evaluation would hang until protocolTimeout
      // (~180s) while the tool mutex is held, freezing the session.
      try {
        const result = await Promise.race([
          mcpPage.waitForEventsAfterAction(async () => {
            await mcpPage.pptrPage.evaluate(() => {
              setTimeout(() => confirm('blocked?'), 0);
            });
          }),
          // Comfortably above WaitForHelper.#stableDomTimeout (3s): the call
          // should return well within this once the dialog is detected.
          new Promise<'stalled'>(resolve =>
            setTimeout(() => resolve('stalled'), 5_000),
          ),
        ]);

        assert(
          result !== 'stalled',
          'stalled because a dialog was shown; would time out with ProtocolError',
        );
        // The dialog was detected but not handled (no handleDialog was passed).
        assert.strictEqual(result.dialogHandled, false);
        // The dialog is still open and recorded, so the next blockedByDialog tool
        // correctly refuses to run.
        assert.throws(() => mcpPage.throwIfDialogOpen());
      } finally {
        await mcpPage.getDialog()?.dismiss();
      }
    });
  });

  it('awaits navigation when action takes longer than expectNavigationIn', async () => {
    await withMcpContext(async (response, context) => {
      server.addHtmlRoute('/nav-target', html`<main>navigated</main>`);
      const url = server.getRoute('/nav-target');
      const mcpPage = context.getSelectedMcpPage();

      const result = await mcpPage.waitForEventsAfterAction(
        async () => {
          // Simulate an action that takes longer than expectNavigationIn (50ms)
          // before triggering the navigation.
          await new Promise(resolve => setTimeout(resolve, 100));
          await mcpPage.pptrPage.evaluate(targetUrl => {
            location.href = targetUrl;
          }, url);
        },
        {waitForStableDom: false, expectNavigationIn: 50},
      );

      assert.strictEqual(result.navigatedToUrl, url);
    });
  });
});
