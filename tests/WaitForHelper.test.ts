/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';

import type {Page} from '../src/third_party/index.js';
import {WaitForHelper} from '../src/WaitForHelper.js';

/**
 * Builds a minimal fake Puppeteer page that lets tests control the
 * DOM-stability setup evaluation and emit dialog events. The real thing would
 * pause its renderer while a dialog is open, so `evaluateHandle` never
 * resolves; a never-resolving stub models that without a live browser.
 */
function createFakePage(evaluateHandle: () => Promise<unknown>): {
  page: Page;
  emitDialog: () => void;
} {
  const dialogEmitter = new EventEmitter();
  const client = new EventEmitter();
  const page = {
    url: () => 'https://example.com',
    on: (event: string, handler: (...args: unknown[]) => void) => {
      dialogEmitter.on(event, handler);
      return page;
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      dialogEmitter.off(event, handler);
      return page;
    },
    _client: () => client,
    waitForNavigation: async () => null,
    evaluateHandle,
  };
  return {
    page: page as unknown as Page,
    emitDialog: () =>
      dialogEmitter.emit('dialog', {
        type: () => 'alert',
        accept: async () => undefined,
        dismiss: async () => undefined,
      }),
  };
}

const HANGS_FOREVER = () => new Promise<unknown>(() => undefined);

async function settlesWithin<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{settled: boolean; value?: T}> {
  const sentinel = Symbol('timeout');
  const value = await Promise.race([
    promise,
    new Promise<typeof sentinel>(resolve =>
      setTimeout(() => resolve(sentinel), ms),
    ),
  ]);
  return value === sentinel ? {settled: false} : {settled: true, value};
}

describe('WaitForHelper', () => {
  it('does not hang when the DOM-stability setup never resolves', async () => {
    // Defense-in-depth (B): even with no dialog, the setup evaluation is
    // capped by the stable-DOM timeout instead of protocolTimeout.
    const {page} = createFakePage(HANGS_FOREVER);
    // stableDomTimeout = 3000 * 0.05 = 150ms.
    const helper = new WaitForHelper(page, 0.05, 0.05);

    const {settled} = await settlesWithin(
      helper.waitForEventsAfterAction(async () => undefined),
      3000,
    );

    assert.ok(settled, 'waitForEventsAfterAction hung on the setup evaluation');
  });

  it('skips the DOM-stability wait when a dialog opens (no handleDialog)', async () => {
    // Correctness (A): a dialog opened by the action is detected even when the
    // caller passed no handleDialog, so the hanging evaluation is never run.
    const {page, emitDialog} = createFakePage(HANGS_FOREVER);
    // Normal timeouts: stableDomTimeout = 3000ms; a fast resolution proves the
    // wait was skipped rather than merely capped.
    const helper = new WaitForHelper(page, 1, 1);

    const {settled, value} = await settlesWithin(
      helper.waitForEventsAfterAction(async () => {
        emitDialog();
      }),
      1500,
    );

    assert.ok(settled, 'waitForEventsAfterAction hung despite an open dialog');
    // The dialog was detected but not handled (no handleDialog was passed).
    assert.strictEqual(value?.dialogHandled, false);
  });
});
