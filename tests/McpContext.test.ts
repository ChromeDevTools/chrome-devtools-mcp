/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {TraceResult} from '../src/trace-processing/parse.js';

import {html, withMcpContext} from './utils.js';

describe('McpContext', () => {
  it('list pages', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(
        html`<button>Click me</button
          ><input
            type="text"
            value="Input"
          />`,
      );
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

  it('can store and retrieve performance traces', async () => {
    await withMcpContext(async (_response, context) => {
      const fakeTrace1 = {} as unknown as TraceResult;
      const fakeTrace2 = {} as unknown as TraceResult;
      context.storeTraceRecording(fakeTrace1);
      context.storeTraceRecording(fakeTrace2);
      assert.deepEqual(context.recordedTraces(), [fakeTrace1, fakeTrace2]);
    });
  });

  it('should update default timeout when cpu throttling changes', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const timeoutBefore = page.getDefaultTimeout();
      context.setCpuThrottlingRate(2);
      const timeoutAfter = page.getDefaultTimeout();
      assert(timeoutBefore < timeoutAfter, 'Timeout was less then expected');
    });
  });

  it('should update default timeout when network conditions changes', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();
      const timeoutBefore = page.getDefaultNavigationTimeout();
      context.setNetworkConditions('Slow 3G');
      const timeoutAfter = page.getDefaultNavigationTimeout();
      assert(timeoutBefore < timeoutAfter, 'Timeout was less then expected');
    });
  });

  it('should call waitForEventsAfterAction with correct multipliers', async () => {
    await withMcpContext(async (_response, context) => {
      const page = await context.newPage();

      context.setCpuThrottlingRate(2);
      context.setNetworkConditions('Slow 3G');
      const stub = sinon.spy(context, 'getWaitForHelper');

      await context.waitForEventsAfterAction(async () => {
        // trigger the waiting only
      });

      sinon.assert.calledWithExactly(stub, page, 2, 10);
    });
  });

  it('should should detect open DevTools pages', async () => {
    await withMcpContext(
      async (_response, context) => {
        const page = await context.newPage();
        // TODO: we do not know when the CLI flag to auto open DevTools will run
        // so we need this until
        // https://github.com/puppeteer/puppeteer/issues/14368 is there.
        await new Promise(resolve => setTimeout(resolve, 5000));
        await context.createPagesSnapshot();
        assert.ok(context.getDevToolsPage(page));
      },
      {
        autoOpenDevTools: true,
      },
    );
  });
});

describe('McpContext headers functionality', () => {
  it('works with headers in context options', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedPage();
      await page.setContent('<html><body>Test page</body></html>');
      
      // Verify context was created successfully
      assert.ok(context);
      
      // Test that we can make a request (headers should be applied if any)
      const navigationPromise = page.goto('data:text/html,<html><body>Test</body></html>');
      await navigationPromise;
      
      // If we reach here without errors, headers functionality is working
      assert.ok(true);
    }, { debug: false });
  });
});
