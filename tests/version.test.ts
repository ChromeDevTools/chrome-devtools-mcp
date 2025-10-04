/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it, afterEach} from 'node:test';
import assert from 'node:assert';
import sinon from 'sinon';

describe('version check', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should exit if node version is not supported', async (t) => {
    const processExit = sinon.stub(process, 'exit');
    const consoleError = sinon.stub(console, 'error');

    await t.test('v21.0.0', async () => {
      Object.defineProperty(process, 'version', {
        value: 'v21.0.0',
        writable: true,
        configurable: true,
      });

      // We need to dynamically import the index with a random query string
      // to bypass the module cache and re-evaluate the version check.
      await import(`../src/index.js?r=${Math.random()}`);

      assert.strictEqual(processExit.callCount, 1);
      assert.strictEqual(processExit.getCall(0).args[0], 1);
      assert.deepStrictEqual(consoleError.getCall(0).args, [
        'ERROR: `chrome-devtools-mcp` does not support Node v21.0.0. Please upgrade to Node 20.19.0 LTS or a newer LTS.',
      ]);
    });
  });
});