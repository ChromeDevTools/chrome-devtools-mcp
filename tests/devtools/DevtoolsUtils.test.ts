/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  createTargetUniverse,
  SymbolizedError,
} from '../../src/devtools/DevtoolsUtils.js';
import {DevTools} from '../../src/third_party/index.js';
import type {Protocol} from '../../src/third_party/index.js';
import {serverHooks} from '../server.js';
import {html, withBrowser} from '../utils.js';

describe('createTargetUniverse', () => {
  const server = serverHooks();

  afterEach(() => {
    sinon.restore();
  });

  it('works with a real browser', async () => {
    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );

      assert.notStrictEqual(targetUniverse, null);
    });
  });

  it('ignores pauses', async () => {
    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );
      assert.ok(targetUniverse);
      const model = targetUniverse.target.model(DevTools.DebuggerModel);
      assert.ok(model);

      const pausedSpy = sinon.stub();
      model.addEventListener('DebuggerPaused' as any, pausedSpy); // eslint-disable-line

      const result = await page.evaluate('debugger; 1 + 1');
      assert.strictEqual(result, 2);

      sinon.assert.notCalled(pausedSpy);
    });
  });

  it('ignores pauses during navigation', async () => {
    server.addHtmlRoute(
      '/debugger',
      html`<script>
          debugger;
        </script>
        <h1>Loaded</h1>`,
    );

    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );
      assert.ok(targetUniverse);

      await page.goto(server.getRoute('/debugger'));
      const text = await page.$eval('h1', el => el.textContent);
      assert.strictEqual(text, 'Loaded');
    });
  });

  it('disables network domain', async () => {
    server.addHtmlRoute('/test', html`<div>Test</div>`);

    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );
      assert.ok(targetUniverse);

      const networkManager = targetUniverse.target.model(
        DevTools.NetworkManager.NetworkManager,
      );
      assert.ok(networkManager);

      const requestStartedSpy = sinon.stub();
      networkManager.addEventListener(
        DevTools.NetworkManager.Events.RequestStarted,
        requestStartedSpy,
      );

      await page.goto(server.getRoute('/test'));

      sinon.assert.notCalled(requestStartedSpy);
    });
  });

  it('does not replay retained Audits issues', async () => {
    server.addHtmlRoute('/audits', html`<div>Audits</div>`);

    await withBrowser(async (browser, page) => {
      await page.goto(server.getRoute('/audits'));

      const auditsSession = await page.createCDPSession();
      await auditsSession.send('Audits.enable');

      const backlogCreated = Promise.withResolvers<void>();
      let performanceIssueCount = 0;
      auditsSession.on('Audits.issueAdded', event => {
        if (
          event.issue.code === 'PerformanceIssue' &&
          event.issue.details.performanceIssueDetails?.performanceIssueType ===
            'DocumentCookie'
        ) {
          performanceIssueCount++;
          if (performanceIssueCount === 500) {
            backlogCreated.resolve();
          }
        }
      });

      await page.evaluate(() => {
        document.cookie = 'test=value';
        for (let i = 0; i < 500; i++) {
          void document.cookie;
        }
      });

      await backlogCreated.promise;
      assert.strictEqual(performanceIssueCount, 500);
      await auditsSession.detach();

      const warnStub = sinon.stub(console, 'warn');
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );

      assert.ok(targetUniverse.target.model(DevTools.DebuggerModel));
      assert.strictEqual(await page.evaluate('1 + 1'), 2);
      await targetUniverse.session.send('Runtime.evaluate', {
        expression: '1 + 1',
      });
      sinon.assert.neverCalledWithMatch(
        warnStub,
        'No handler registered for issue code PerformanceIssue',
      );
    });
  });

  it('enables source maps by default', async () => {
    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
      );
      assert.ok(targetUniverse);

      assert.strictEqual(
        targetUniverse.universe.settings
          .resolve(DevTools.SDKSettings.jsSourceMapsEnabledSettingDescriptor)
          .get(),
        true,
      );
      assert.strictEqual(
        targetUniverse.universe.settings
          .resolve(DevTools.SDKSettings.cssSourceMapsEnabledSettingDescriptor)
          .get(),
        true,
      );
    });
  });

  it('disables source maps when sourceMaps is false', async () => {
    await withBrowser(async (browser, page) => {
      const targetUniverse = await createTargetUniverse(
        await page.createCDPSession(),
        {sourceMaps: false},
      );
      assert.ok(targetUniverse);

      assert.strictEqual(
        targetUniverse.universe.settings
          .resolve(DevTools.SDKSettings.jsSourceMapsEnabledSettingDescriptor)
          .get(),
        false,
      );
      assert.strictEqual(
        targetUniverse.universe.settings
          .resolve(DevTools.SDKSettings.cssSourceMapsEnabledSettingDescriptor)
          .get(),
        false,
      );
    });
  });
});

describe('SymbolizedError', () => {
  function exceptionDetails(
    overrides: Partial<Protocol.Runtime.ExceptionDetails> = {},
  ): Protocol.Runtime.ExceptionDetails {
    return {
      exceptionId: 1,
      text: 'Uncaught',
      lineNumber: 0,
      columnNumber: 0,
      ...overrides,
    };
  }

  describe('fromDetails', () => {
    it('extracts the message from the exception description', async () => {
      const error = await SymbolizedError.fromDetails({
        details: exceptionDetails({
          exception: {
            type: 'object',
            subtype: 'error',
            className: 'Error',
            description:
              'Error: Something went wrong\n    at foo (http://example.com/app.js:10:15)\n    at http://example.com/app.js:20:3',
          },
        }),
        targetId: '',
      });

      assert.strictEqual(error.message, 'Uncaught Error: Something went wrong');
      assert.strictEqual(error.stackTrace, undefined);
      assert.strictEqual(error.cause, undefined);
    });

    it('keeps the full description when it has no stack frames', async () => {
      const error = await SymbolizedError.fromDetails({
        details: exceptionDetails({
          exception: {
            type: 'object',
            subtype: 'error',
            className: 'Error',
            description: 'Error: no frames here',
          },
        }),
        targetId: '',
      });

      assert.strictEqual(error.message, 'Uncaught Error: no frames here');
    });

    it('keeps multi-line messages up to the first stack frame', async () => {
      const error = await SymbolizedError.fromDetails({
        details: exceptionDetails({
          exception: {
            type: 'object',
            subtype: 'error',
            className: 'Error',
            description:
              'Error: first line\nsecond line\n    at foo (http://example.com/app.js:1:1)',
          },
        }),
        targetId: '',
      });

      assert.strictEqual(
        error.message,
        'Uncaught Error: first line\nsecond line',
      );
    });

    it('uses an empty exception message when the exception only has a value', async () => {
      // A thrown primitive (e.g. `throw 'oops'`) has no description.
      const error = await SymbolizedError.fromDetails({
        details: exceptionDetails({
          exception: {
            type: 'string',
            value: 'oops',
          },
        }),
        targetId: '',
      });

      assert.strictEqual(error.message, 'Uncaught ');
    });

    it('uses the details text verbatim when there is no exception object', async () => {
      const error = await SymbolizedError.fromDetails({
        details: exceptionDetails(),
        targetId: '',
      });

      assert.strictEqual(error.message, 'Uncaught');
    });

    it('uses the details text verbatim when it is not "Uncaught"', async () => {
      // Runtime.getExceptionDetails puts the Error.message into `text`.
      const error = await SymbolizedError.fromDetails({
        details: exceptionDetails({
          text: 'Error: boom',
          exception: {
            type: 'object',
            subtype: 'error',
            className: 'Error',
            description: 'Error: a different description',
          },
        }),
        targetId: '',
      });

      assert.strictEqual(error.message, 'Error: boom');
    });

    it('ignores url, line, column and raw stack trace for the message', async () => {
      const error = await SymbolizedError.fromDetails({
        details: exceptionDetails({
          scriptId: '42',
          url: 'http://example.com/app.js',
          lineNumber: 42,
          columnNumber: 7,
          stackTrace: {
            callFrames: [
              {
                functionName: 'foo',
                scriptId: '42',
                url: 'http://example.com/app.js',
                lineNumber: 42,
                columnNumber: 7,
              },
            ],
          },
          exception: {
            type: 'object',
            subtype: 'error',
            className: 'Error',
            description:
              'Error: with locations\n    at foo (http://example.com/app.js:43:8)',
          },
        }),
        targetId: '',
        includeStackAndCause: true,
      });

      assert.strictEqual(error.message, 'Uncaught Error: with locations');
      // Without a DevTools universe the raw stack trace cannot be resolved.
      assert.strictEqual(error.stackTrace, undefined);
    });

    it('retains the resolved stack trace and cause provided for testing', async () => {
      const stackTrace = {} as DevTools.StackTrace.StackTrace.StackTrace;
      const cause = SymbolizedError.createForTesting('cause message');

      const error = await SymbolizedError.fromDetails({
        details: exceptionDetails({
          exception: {
            type: 'object',
            subtype: 'error',
            className: 'Error',
            description: 'Error: effect',
          },
        }),
        targetId: '',
        resolvedStackTraceForTesting: stackTrace,
        resolvedCauseForTesting: cause,
      });

      assert.strictEqual(error.message, 'Uncaught Error: effect');
      assert.strictEqual(error.stackTrace, stackTrace);
      assert.strictEqual(error.cause, cause);
      assert.strictEqual(error.cause?.message, 'cause message');
    });
  });

  describe('fromError', () => {
    it('extracts the message from the error description', async () => {
      const error = await SymbolizedError.fromError({
        error: {
          type: 'object',
          subtype: 'error',
          className: 'TypeError',
          description:
            'TypeError: x is not a function\n    at bar (http://example.com/b.js:5:3)',
        },
        targetId: '',
      });

      assert.strictEqual(error.message, 'TypeError: x is not a function');
      assert.strictEqual(error.stackTrace, undefined);
      assert.strictEqual(error.cause, undefined);
    });

    it('uses the full description when there are no stack frames', async () => {
      const error = await SymbolizedError.fromError({
        error: {
          type: 'object',
          subtype: 'error',
          className: 'TypeError',
          description: 'TypeError: nope',
        },
        targetId: '',
      });

      assert.strictEqual(error.message, 'TypeError: nope');
    });

    it('falls back to an empty message without a description', async () => {
      const error = await SymbolizedError.fromError({
        error: {
          type: 'string',
          value: 'oops',
        },
        targetId: '',
      });

      assert.strictEqual(error.message, '');
    });
  });
});
