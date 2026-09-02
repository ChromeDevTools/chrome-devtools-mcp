/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the snapshot tool handlers.
 *
 * Verifies handler state mutations on McpResponse without a real browser.
 *
 * Part of the test-optimization effort described in
 * https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2639.
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {takeSnapshot} from '../../src/tools/snapshot.js';
import {
  createMockMcpContext,
  createMockMcpPage,
  createMockMcpResponse,
} from '../testMocks.js';

afterEach(() => {
  sinon.restore();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(params: Record<string, unknown> = {}) {
  const page = createMockMcpPage();
  const context = createMockMcpContext({selectedPage: page});
  const response = createMockMcpResponse();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (takeSnapshot as any).handler({params, page}, response, context);
  return {page, context, response};
}

describe('snapshot tool handlers (unit)', () => {
  describe('takeSnapshot handler', () => {
    it('calls response.includeSnapshot', async () => {
      const {response} = await run();
      assert.strictEqual(response.includeSnapshot.callCount, 1);
    });

    it('passes verbose: false by default', async () => {
      const {response} = await run();
      const [params] = response.includeSnapshot.firstCall.args as [{verbose?: boolean; filePath?: string}];
      assert.strictEqual(params.verbose, false);
    });

    it('passes verbose: true when specified', async () => {
      const {response} = await run({verbose: true});
      const [params] = response.includeSnapshot.firstCall.args as [{verbose?: boolean}];
      assert.strictEqual(params.verbose, true);
    });

    it('passes filePath through when specified', async () => {
      const {response} = await run({filePath: '/tmp/snap.txt'});
      const [params] = response.includeSnapshot.firstCall.args as [{filePath?: string}];
      assert.strictEqual(params.filePath, '/tmp/snap.txt');
    });

    it('passes filePath as undefined when not specified', async () => {
      const {response} = await run();
      const [params] = response.includeSnapshot.firstCall.args as [{filePath?: string}];
      assert.strictEqual(params.filePath, undefined);
    });
  });
});
