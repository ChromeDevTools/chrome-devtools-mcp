/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it, mock} from 'node:test';

import {HeapSnapshotManager} from '../src/processors/HeapSnapshotManager.js';
import {type Browser, Locator} from '../src/third_party/browser.js';
import {TaskRunner} from '../src/utils/TaskRunner.js';

import type {SinonStubbedInstance} from 'sinon';
import type {McpContext} from '../src/McpContext.js';
import {createMockPuppeteerBrowser, createMockServerConfig} from './mocks.js';
import {createConnectedMcpContext} from './utils.js';

// Mirrors EXTENSION_OPERATION_TIMEOUT_MS in src/McpContext.ts. The deadline
// itself is an implementation detail; the test advances the fake clock past it.
const TIMEOUT_MS = 30_000;

async function createContext(
  browser: SinonStubbedInstance<Browser>,
): Promise<McpContext> {
  browser.targets.returns([]);
  return await createConnectedMcpContext(
    browser,
    {
      config: createMockServerConfig(),
      heapSnapshotManager: new HeapSnapshotManager(new TaskRunner()),
    },
    Locator,
  );
}

describe('extension install/uninstall deadline', () => {
  afterEach(() => {
    mock.timers.reset();
  });

  it('returns the browser result when the install completes in time', async () => {
    const browser = createMockPuppeteerBrowser();
    browser.installExtension.resolves('abcdef');
    const context = await createContext(browser);

    mock.timers.enable({apis: ['setTimeout']});
    const id = await context.installExtension('/tmp/extension');
    // Advancing past the deadline must not change anything after settlement.
    mock.timers.tick(TIMEOUT_MS * 2);

    assert.strictEqual(id, 'abcdef');
    assert.ok(browser.installExtension.calledOnceWith('/tmp/extension'));
  });

  it('reports an install deadline as possibly still running, not as a failure', async () => {
    const browser = createMockPuppeteerBrowser();
    // The browser call never settles: Chrome cannot cancel it, so this is the
    // exact situation the deadline exists for.
    browser.installExtension.returns(new Promise(() => {}));
    const context = await createContext(browser);

    mock.timers.enable({apis: ['setTimeout']});
    const pending = context.installExtension('/tmp/slow-extension');
    const rejection = assert.rejects(pending, (err: Error) => {
      assert.match(err.message, /Timed out after 30000ms/);
      assert.match(
        err.message,
        /Chrome cannot cancel an in-flight install/,
        'must state that the install was not cancelled',
      );
      assert.match(
        err.message,
        /may still complete/,
        'must not claim the install failed',
      );
      assert.match(
        err.message,
        /list_extensions/,
        'must point at the way to learn the real outcome',
      );
      assert.doesNotMatch(err.message, /Timeout installing extension/);
      return true;
    });
    await Promise.resolve();
    mock.timers.tick(TIMEOUT_MS);
    await rejection;
  });

  it('reports an uninstall deadline with the retry hazard', async () => {
    const browser = createMockPuppeteerBrowser();
    browser.uninstallExtension.returns(new Promise(() => {}));
    const context = await createContext(browser);

    mock.timers.enable({apis: ['setTimeout']});
    const pending = context.uninstallExtension('abcdef');
    const rejection = assert.rejects(pending, (err: Error) => {
      assert.match(err.message, /Timed out after 30000ms/);
      assert.match(err.message, /Chrome cannot cancel an in-flight uninstall/);
      assert.match(
        err.message,
        /could not find extension/,
        'a retry after a completed uninstall fails with this error',
      );
      assert.doesNotMatch(err.message, /Timeout uninstalling extension/);
      return true;
    });
    await Promise.resolve();
    mock.timers.tick(TIMEOUT_MS);
    await rejection;
  });

  it('propagates a browser error unchanged instead of masking it as a timeout', async () => {
    const browser = createMockPuppeteerBrowser();
    const browserError = new Error(
      'Failed to load extension: ENOENT: no such file or directory',
    );
    browser.installExtension.rejects(browserError);
    const context = await createContext(browser);

    mock.timers.enable({apis: ['setTimeout']});
    await assert.rejects(
      context.installExtension('/tmp/missing-extension'),
      (err: Error) => {
        assert.strictEqual(err, browserError);
        return true;
      },
    );
  });
});
