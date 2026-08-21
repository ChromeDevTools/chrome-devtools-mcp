/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {getNetworkMultiplierFromString} from '../src/WaitForHelper.js';

import {serverHooks} from './server.js';
import {html, withMcpContext} from './utils.js';

describe('getNetworkMultiplierFromString', () => {
  it('maps each predefined network condition to its multiplier', () => {
    assert.strictEqual(getNetworkMultiplierFromString('Fast 4G'), 1);
    assert.strictEqual(getNetworkMultiplierFromString('Slow 4G'), 2.5);
    assert.strictEqual(getNetworkMultiplierFromString('Fast 3G'), 5);
    assert.strictEqual(getNetworkMultiplierFromString('Slow 3G'), 10);
  });

  it('falls back to 1 for unknown condition strings', () => {
    assert.strictEqual(getNetworkMultiplierFromString('2G'), 1);
    assert.strictEqual(getNetworkMultiplierFromString('No emulation'), 1);
    assert.strictEqual(getNetworkMultiplierFromString(''), 1);
  });

  it('falls back to 1 when no condition is set', () => {
    assert.strictEqual(getNetworkMultiplierFromString(null), 1);
  });
});

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
    });
  });

  it('reports navigatedToUrl when the action starts a cross-document navigation', async () => {
    await withMcpContext(async (response, context) => {
      const mcpPage = context.getSelectedMcpPage();
      server.addHtmlRoute('/target.html', html`<h1>target</h1>`);
      const targetUrl = server.getRoute('/target.html');

      const result = await mcpPage.waitForEventsAfterAction(async () => {
        await mcpPage.pptrPage.evaluate(url => {
          // Navigate asynchronously so the evaluate call returns before the
          // execution context is destroyed by the navigation.
          setTimeout(() => {
            window.location.href = url;
          }, 0);
        }, targetUrl);
      });

      assert.strictEqual(result.navigatedToUrl, targetUrl);
      assert.strictEqual(result.dialogHandled, false);
      assert.strictEqual(mcpPage.pptrPage.url(), targetUrl);
    });
  });

  it('resolves quickly without navigatedToUrl when no navigation happens', async () => {
    await withMcpContext(async (response, context) => {
      const mcpPage = context.getSelectedMcpPage();
      await mcpPage.pptrPage.setContent(html`<div id="root"></div>`);

      const start = Date.now();
      const result = await mcpPage.waitForEventsAfterAction(async () => {
        await mcpPage.pptrPage.evaluate(() => {
          document.querySelector('#root')!.append('done');
        });
      });
      const elapsed = Date.now() - start;

      assert.strictEqual(result.navigatedToUrl, undefined);
      assert.strictEqual(result.dialogHandled, false);
      // Expected wait is ~200ms (#expectNavigationIn 100ms + #stableDomFor
      // 100ms). Assert we stayed below #stableDomTimeout/#navigationTimeout
      // (3s each) to prove neither full timeout was consumed.
      assert.ok(
        elapsed < 2_000,
        `expected a fast return without navigation, took ${elapsed}ms`,
      );
    });
  });

  it('swallows navigation timeouts and still resolves with a result', async () => {
    await withMcpContext(async (response, context) => {
      const mcpPage = context.getSelectedMcpPage();
      server.addRoute('/hang.html', () => {
        // Never respond so the started navigation cannot complete.
      });
      const hangUrl = server.getRoute('/hang.html');

      const start = Date.now();
      const result = await mcpPage.waitForEventsAfterAction(
        async () => {
          await mcpPage.pptrPage.evaluate(url => {
            setTimeout(() => {
              window.location.href = url;
            }, 0);
          }, hangUrl);
        },
        {timeout: 500},
      );
      const elapsed = Date.now() - start;

      // The navigation started but timed out; the timeout error is logged and
      // swallowed rather than thrown, and the pending navigation never
      // committed, so the URL is unchanged and no navigatedToUrl is reported.
      assert.strictEqual(result.navigatedToUrl, undefined);
      assert.strictEqual(result.dialogHandled, false);
      // Current behavior: the total wait is the 500ms navigation timeout plus
      // the full 3s #stableDomTimeout, because the stable-DOM evaluation does
      // not settle while the navigation is still pending (~3.5s in total).
      // Assert an upper bound well below protocolTimeout-scale hangs.
      assert.ok(
        elapsed < 8_000,
        `expected the wait to be bounded by the internal timeouts, took ${elapsed}ms`,
      );

    });
  });

  it('reports same-document hash navigations via the URL comparison', async () => {
    await withMcpContext(async (response, context) => {
      const mcpPage = context.getSelectedMcpPage();
      server.addHtmlRoute('/page.html', html`<p>content</p>`);
      const pageUrl = server.getRoute('/page.html');
      await mcpPage.pptrPage.goto(pageUrl);

      const result = await mcpPage.waitForEventsAfterAction(async () => {
        await mcpPage.pptrPage.evaluate(() => {
          window.location.hash = '#section';
        });
      });

      assert.strictEqual(result.navigatedToUrl, `${pageUrl}#section`);
      assert.strictEqual(result.dialogHandled, false);
    });
  });

  it('rethrows errors from the action', async () => {
    await withMcpContext(async (response, context) => {
      const mcpPage = context.getSelectedMcpPage();
      await mcpPage.pptrPage.setContent(html`<p>content</p>`);

      await assert.rejects(
        mcpPage.waitForEventsAfterAction(() =>
          Promise.reject(new Error('action failed')),
        ),
        /action failed/,
      );
    });
  });
});
