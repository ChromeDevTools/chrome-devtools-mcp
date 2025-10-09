/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {
  analyzeInsight,
  startTrace,
  stopTrace,
} from '../../src/tools/performance.js';
import type {TraceResult} from '../../src/trace-processing/parse.js';
import {
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../../src/trace-processing/parse.js';
import {loadTraceAsBuffer} from '../trace-processing/fixtures/load.js';
import {withBrowser} from '../utils.js';

describe('performance', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('performance_start_trace', () => {
    it('starts a trace recording', async () => {
      await withBrowser(async (response, context) => {
        context.setIsRunningPerformanceTrace(false);
        const selectedPage = context.getSelectedPage();
        const startTracingStub = sinon.stub(selectedPage.tracing, 'start');
        await startTrace.handler(
          {params: {reload: true, autoStop: false}},
          response,
          context,
        );
        sinon.assert.calledOnce(startTracingStub);
        assert.ok(context.isRunningPerformanceTrace());
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/The performance trace is being recorded/),
        );
      });
    });

    it('can navigate to about:blank and record a page reload', async () => {
      await withBrowser(async (response, context) => {
        const selectedPage = context.getSelectedPage();
        sinon.stub(selectedPage, 'url').callsFake(() => 'https://www.test.com');
        const gotoStub = sinon.stub(selectedPage, 'goto');
        const startTracingStub = sinon.stub(selectedPage.tracing, 'start');
        await startTrace.handler(
          {params: {reload: true, autoStop: false}},
          response,
          context,
        );
        sinon.assert.calledOnce(startTracingStub);
        sinon.assert.calledWithExactly(gotoStub, 'about:blank', {
          waitUntil: ['networkidle0'],
        });
        sinon.assert.calledWithExactly(gotoStub, 'https://www.test.com', {
          waitUntil: ['load'],
        });
        assert.ok(context.isRunningPerformanceTrace());
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/The performance trace is being recorded/),
        );
      });
    });

    it('can autostop and store a recording', async () => {
      const rawData = loadTraceAsBuffer('basic-trace.json.gz');

      await withBrowser(async (response, context) => {
        const selectedPage = context.getSelectedPage();
        sinon.stub(selectedPage, 'url').callsFake(() => 'https://www.test.com');
        sinon.stub(selectedPage, 'goto').callsFake(() => Promise.resolve(null));
        const startTracingStub = sinon.stub(selectedPage.tracing, 'start');
        const stopTracingStub = sinon
          .stub(selectedPage.tracing, 'stop')
          .callsFake(() => {
            return Promise.resolve(rawData);
          });

        const clock = sinon.useFakeTimers();
        const handlerPromise = startTrace.handler(
          {params: {reload: true, autoStop: true}},
          response,
          context,
        );
        // In the handler we wait 5 seconds after the page load event (which is
        // what DevTools does), hence we now fake-progress time to allow
        // the handler to complete. We allow extra time because the Trace
        // Engine also uses some timers to yield updates and we need those to
        // execute.
        await clock.tickAsync(6_000);
        await handlerPromise;
        clock.restore();

        sinon.assert.calledOnce(startTracingStub);
        sinon.assert.calledOnce(stopTracingStub);
        assert.strictEqual(
          context.isRunningPerformanceTrace(),
          false,
          'Tracing was stopped',
        );
        assert.strictEqual(context.recordedTraces().length, 1);
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/The performance trace has been stopped/),
        );
      });
    });

    it('errors if a recording is already active', async () => {
      await withBrowser(async (response, context) => {
        context.setIsRunningPerformanceTrace(true);
        const selectedPage = context.getSelectedPage();
        const startTracingStub = sinon.stub(selectedPage.tracing, 'start');
        await startTrace.handler(
          {params: {reload: true, autoStop: false}},
          response,
          context,
        );
        sinon.assert.notCalled(startTracingStub);
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/a performance trace is already running/),
        );
      });
    });
  });

  describe('performance_analyze_insight', () => {
    async function parseTrace(fileName: string): Promise<TraceResult> {
      const rawData = loadTraceAsBuffer(fileName);
      const result = await parseRawTraceBuffer(rawData);
      if (!traceResultIsSuccess(result)) {
        assert.fail(`Unexpected trace parse error: ${result.error}`);
      }
      return result;
    }

    it('returns the information on the insight', async t => {
      const trace = await parseTrace('web-dev-with-commit.json.gz');
      await withBrowser(async (response, context) => {
        context.storeTraceRecording(trace);
        context.setIsRunningPerformanceTrace(false);

        await analyzeInsight.handler(
          {
            params: {
              insightName: 'LCPBreakdown',
            },
          },
          response,
          context,
        );

        t.assert.snapshot?.(response.responseLines.join('\n'));
      });
    });

    it('returns an error if the insight does not exist', async () => {
      const trace = await parseTrace('web-dev-with-commit.json.gz');
      await withBrowser(async (response, context) => {
        context.storeTraceRecording(trace);
        context.setIsRunningPerformanceTrace(false);

        await analyzeInsight.handler(
          {
            params: {
              insightName: 'MadeUpInsightName',
            },
          },
          response,
          context,
        );
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/No Insight with the name MadeUpInsightName found./),
        );
      });
    });

    it('returns an error if no trace has been recorded', async () => {
      await withBrowser(async (response, context) => {
        await analyzeInsight.handler(
          {
            params: {
              insightName: 'LCPBreakdown',
            },
          },
          response,
          context,
        );
        assert.ok(
          response.responseLines
            .join('\n')
            .match(
              /No recorded traces found. Record a performance trace so you have Insights to analyze./,
            ),
        );
      });
    });
  });

  describe('performance_stop_trace', () => {
    it('does nothing if the trace is not running and does not error', async () => {
      await withBrowser(async (response, context) => {
        context.setIsRunningPerformanceTrace(false);
        const selectedPage = context.getSelectedPage();
        const stopTracingStub = sinon.stub(selectedPage.tracing, 'stop');
        await stopTrace.handler({params: {}}, response, context);
        sinon.assert.notCalled(stopTracingStub);
        assert.strictEqual(context.isRunningPerformanceTrace(), false);
      });
    });

    it('will stop the trace and return trace info when a trace is running', async () => {
      const rawData = loadTraceAsBuffer('basic-trace.json.gz');
      await withBrowser(async (response, context) => {
        context.setIsRunningPerformanceTrace(true);
        const selectedPage = context.getSelectedPage();
        const stopTracingStub = sinon
          .stub(selectedPage.tracing, 'stop')
          .callsFake(async () => {
            return rawData;
          });
        await stopTrace.handler({params: {}}, response, context);
        assert.ok(
          response.responseLines.includes(
            'The performance trace has been stopped.',
          ),
        );
        assert.strictEqual(context.recordedTraces().length, 1);
        sinon.assert.calledOnce(stopTracingStub);
      });
    });

    it('returns an error message if parsing the trace buffer fails', async t => {
      await withBrowser(async (response, context) => {
        context.setIsRunningPerformanceTrace(true);
        const selectedPage = context.getSelectedPage();
        sinon
          .stub(selectedPage.tracing, 'stop')
          .returns(Promise.resolve(undefined));
        await stopTrace.handler({params: {}}, response, context);
        t.assert.snapshot?.(response.responseLines.join('\n'));
      });
    });

    it('returns the high level summary of the performance trace', async t => {
      const rawData = loadTraceAsBuffer('web-dev-with-commit.json.gz');
      await withBrowser(async (response, context) => {
        context.setIsRunningPerformanceTrace(true);
        const selectedPage = context.getSelectedPage();
        sinon.stub(selectedPage.tracing, 'stop').callsFake(async () => {
          return rawData;
        });
        await stopTrace.handler({params: {}}, response, context);
        t.assert.snapshot?.(response.responseLines.join('\n'));
      });
    });
  });
});
