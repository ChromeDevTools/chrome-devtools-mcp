/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach, beforeEach} from 'node:test';

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
import {withMcpContext} from '../utils.js';

describe('performance', () => {
  afterEach(() => {
    sinon.restore();
  });

  beforeEach(() => {
    sinon.stub(globalThis, 'fetch').callsFake(async url => {
      const cruxEndpoint =
        'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
      if (url.toString().startsWith(cruxEndpoint)) {
        return new Response(JSON.stringify(cruxResponseFixture()), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
  });

  describe('performance_start_trace', () => {
    it('starts a trace recording', async () => {
      await withMcpContext(async (response, context) => {
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
      await withMcpContext(async (response, context) => {
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

      await withMcpContext(async (response, context) => {
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
      await withMcpContext(async (response, context) => {
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
      await withMcpContext(async (response, context) => {
        context.storeTraceRecording(trace);
        context.setIsRunningPerformanceTrace(false);

        await analyzeInsight.handler(
          {
            params: {
              insightSetId: 'NAVIGATION_0',
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
      await withMcpContext(async (response, context) => {
        context.storeTraceRecording(trace);
        context.setIsRunningPerformanceTrace(false);

        await analyzeInsight.handler(
          {
            params: {
              insightSetId: '8463DF94CD61B265B664E7F768183DE3',
              insightName: 'MadeUpInsightName',
            },
          },
          response,
          context,
        );
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/No Performance Insights for the given insight set id/),
        );
      });
    });

    it('returns an error if no trace has been recorded', async () => {
      await withMcpContext(async (response, context) => {
        await analyzeInsight.handler(
          {
            params: {
              insightSetId: '8463DF94CD61B265B664E7F768183DE3',
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
      await withMcpContext(async (response, context) => {
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
      await withMcpContext(async (response, context) => {
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
      await withMcpContext(async (response, context) => {
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
      await withMcpContext(async (response, context) => {
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

function cruxResponseFixture() {
  // Ideally we could use `mockResponse` from 'chrome-devtools-frontend/front_end/models/crux-manager/CrUXManager.test.ts'
  // But test files are not published in the cdtf npm package.
  return {
    record: {
      key: {
        url: 'https://web.dev/',
      },
      metrics: {
        form_factors: {
          fractions: {desktop: 0.5056, phone: 0.4796, tablet: 0.0148},
        },
        largest_contentful_paint: {
          histogram: [
            {start: 0, end: 2500, density: 0.7309},
            {start: 2500, end: 4000, density: 0.163},
            {start: 4000, density: 0.1061},
          ],
          percentiles: {p75: 2595},
        },
        largest_contentful_paint_image_element_render_delay: {
          percentiles: {p75: 786},
        },
        largest_contentful_paint_image_resource_load_delay: {
          percentiles: {p75: 86},
        },
        largest_contentful_paint_image_time_to_first_byte: {
          percentiles: {p75: 1273},
        },
        cumulative_layout_shift: {
          histogram: [
            {start: '0.00', end: '0.10', density: 0.8665},
            {start: '0.10', end: '0.25', density: 0.0716},
            {start: '0.25', density: 0.0619},
          ],
          percentiles: {p75: '0.06'},
        },
        interaction_to_next_paint: {
          histogram: [
            {start: 0, end: 200, density: 0.8414},
            {start: 200, end: 500, density: 0.1081},
            {start: 500, density: 0.0505},
          ],
          percentiles: {p75: 140},
        },
        largest_contentful_paint_image_resource_load_duration: {
          percentiles: {p75: 451},
        },
        round_trip_time: {
          histogram: [
            {start: 0, end: 75, density: 0.3663},
            {start: 75, end: 275, density: 0.5089},
            {start: 275, density: 0.1248},
          ],
          percentiles: {p75: 178},
        },
        first_contentful_paint: {
          histogram: [
            {start: 0, end: 1800, density: 0.5899},
            {start: 1800, end: 3000, density: 0.2439},
            {start: 3000, density: 0.1662},
          ],
          percentiles: {p75: 2425},
        },
      },
      collectionPeriod: {
        firstDate: {year: 2025, month: 12, day: 8},
        lastDate: {year: 2026, month: 1, day: 4},
      },
    },
  };
}
