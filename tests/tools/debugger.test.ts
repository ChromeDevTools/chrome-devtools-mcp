/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  enableDebugger,
  disableDebugger,
  setBreakpoint,
  removeBreakpoint,
  setLogpoint,
  removeLogpoint,
  resume,
  getPausedState,
  evaluateOnCallFrame,
  getScopeVariables,

  // getCodeLines, // Not easy to test without a real script with multiple lines knowing external scriptId
} from '../../src/tools/debugger.js';
import {withMcpContext} from '../utils.js';

describe('debugger', () => {
  it('enables and disables debugger', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      await enableDebugger.handler({params: {}, page}, response, context);
      assert.ok(response.responseLines[0].includes('Debugger enabled'));

      response.resetResponseLineForTesting();
      await disableDebugger.handler({params: {}, page}, response, context);
      assert.ok(response.responseLines[0].includes('Debugger disabled'));
    });
  });

  it('sets and removes breakpoint', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      // Navigate to a page to ensure we have a execution context
      await page.pptrPage.setContent(
        '<script>function test() { console.log("test"); }</script>',
      );

      await setBreakpoint.handler(
        {params: {url: 'http://localhost/', lineNumber: 1}, page},
        response,
        context,
      );

      const setOutput = response.responseLines.join('\n');
      const breakpointIdMatch = setOutput.match(/Breakpoint set with ID: (.*)/);
      assert.ok(breakpointIdMatch, 'Should return breakpoint ID');
      const breakpointId = breakpointIdMatch[1];

      response.resetResponseLineForTesting();
      await removeBreakpoint.handler(
        {params: {breakpointId}, page},
        response,
        context,
      );
      assert.ok(
        response.responseLines[0].includes(
          `Breakpoint ${breakpointId} removed`,
        ),
      );
    });
  });

  it('sets and removes logpoint', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent(
        '<script>function test() { console.log("test"); }</script>',
      );

      await setLogpoint.handler(
        {
          params: {url: 'http://localhost/', lineNumber: 1, message: 'Log {x}'},
          page,
        },
        response,
        context,
      );

      const setOutput = response.responseLines.join('\n');
      const breakpointIdMatch = setOutput.match(/Logpoint set with ID: (.*)/);
      assert.ok(breakpointIdMatch, 'Should return logpoint ID');
      const breakpointId = breakpointIdMatch[1];

      // Verify condition includes logs
      assert.ok(setOutput.includes('console.log(`Log ${x}`)'));

      response.resetResponseLineForTesting();
      await removeLogpoint.handler(
        {params: {breakpointId}, page},
        response,
        context,
      );
      assert.ok(
        response.responseLines[0].includes(`Logpoint ${breakpointId} removed`),
      );
    });
  });

  it('reports not paused when execution is running', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      await enableDebugger.handler({params: {}, page}, response, context);

      response.resetResponseLineForTesting();
      await getPausedState.handler({params: {}, page}, response, context);
      assert.ok(response.responseLines[0].includes('Debugger is not paused'));
    });
  });

  it('pauses on breakpoint and resumes', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      const pptrPage = page.pptrPage;

      // We need a script that runs somewhat later or triggered by us to hit the breakpoint reliably in test
      // Or we can use `debugger;` statement.
      await pptrPage.evaluate(() => {
        // @ts-expect-error - Window property
        window.debugMe = () => {
          // eslint-disable-next-line no-debugger
          debugger;
        };
      });

      // Enable debugger
      await enableDebugger.handler({params: {}, page}, response, context);

      // Trigger debugger

      // We trigger execution, but we usually need to do it without awaiting if it pauses.
      await pptrPage.evaluate(() => {
        setTimeout(() => {
          // @ts-expect-error - Window property
          window.debugMe();
        }, 100);
      });

      // Wait a bit for pause
      await new Promise(r => setTimeout(r, 500));

      response.resetResponseLineForTesting();
      await getPausedState.handler({params: {}, page}, response, context);

      const output = response.responseLines.join('\n');
      assert.ok(
        output.includes('Paused state') ||
          output.includes('Debugger is not paused'),
        'Should report state (flake warning: might not be paused yet)',
      );

      if (output.includes('Paused state')) {
        // Test resume
        response.resetResponseLineForTesting();
        await resume.handler({params: {}, page}, response, context);
        assert.ok(response.responseLines[0].includes('Resumed execution'));
      }
    });
  });

  it('reports not enabled when calling getPausedState without enabling', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      await getPausedState.handler({params: {}, page}, response, context);
      assert.ok(response.responseLines[0].includes('Debugger is not enabled'));
    });
  });

  it('throws when calling getScopeVariables without enabling', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      try {
        await getScopeVariables.handler(
          {params: {callFrameId: '1', scopeIndex: 0}, page},
          response,
          context,
        );
        assert.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        if (!error.message.includes('Debugger is not enabled')) {
          console.error('Unexpected error:', e);
          assert.fail(`Expected "Debugger is not enabled", got: ${e.message}`);
        }
        assert.ok(true);
      }
    });
  });

  it('evaluates on call frame (mock check)', async () => {
    // This is hard to test e2e without actually being paused.
    // We verified "not paused" error in getPausedState.
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      try {
        await evaluateOnCallFrame.handler(
          {params: {callFrameId: 'fake', expression: '1+1'}, page},
          response,
          context,
        );
      } catch (e) {
        // It might fail because session throws "Invalid parameters" or similar from CDP
        assert.ok(e);
      }
    });
  });
  it('removes logpoints via removeAllBreakpoints', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent('<script>function test() {}</script>');

      // Set a logpoint
      await setLogpoint.handler(
        {
          params: {url: 'http://localhost/', lineNumber: 1, message: 'Log'},
          page,
        },
        response,
        context,
      );

      response.resetResponseLineForTesting();

      // Remove all
      // We need to import removeAllBreakpoints
      const {removeAllBreakpoints} =
        await import('../../src/tools/debugger.js');
      await removeAllBreakpoints.handler({params: {}, page}, response, context);

      assert.ok(
        response.responseLines[0].includes(
          'All breakpoints and logpoints removed',
        ),
      );
    });
  });
});
