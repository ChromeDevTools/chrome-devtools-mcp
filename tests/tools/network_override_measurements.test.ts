/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {NetworkOverridesFormatter} from '../../src/formatters/NetworkOverridesFormatter.js';
import type {NetworkOverride} from '../../src/NetworkOverrideManager.js';
import {lighthouseAudit} from '../../src/tools/lighthouse.js';
import {startTrace, stopTrace} from '../../src/tools/performance.js';
import {createHandlerMocks, createMockRunnerResult} from '../mocks.js';
import {loadTraceAsBuffer} from '../trace-processing/fixtures/load.js';

describe('network override measurements', () => {
  const overrides: NetworkOverride[] = [
    {
      id: 1,
      diagnostics: {hits: 0, errors: 0, navigations: 0},
      kind: 'redirect',
      urlPattern: 'https://example.com/app.js',
      redirectUrl: 'https://example.com/candidate.js',
    },
  ];
  const {warning} = new NetworkOverridesFormatter(overrides).toJSON();
  assert.ok(warning);

  it('prints no measurement warning without overrides', () => {
    const formatter = new NetworkOverridesFormatter([]);
    assert.deepEqual(formatter.toJSON(), {overrides: []});
    assert.equal(formatter.toString(), '');
  });

  for (const fails of [false, true]) {
    it(
      'keeps override cache bypass after trace reload ' +
        (fails ? 'failure' : 'success'),
      async () => {
        const {page, context, response, args} = createHandlerMocks();
        page.listNetworkOverrides.returns(overrides);
        page.pptrPage.url.returns('https://example.com/');
        if (fails) {
          page.pptrPage.goto.onSecondCall().rejects(new Error('Reload failed'));
        }
        const action = startTrace(args).handler(
          {params: {reload: true, autoStop: false, ignoreCache: true}, page},
          response,
          context,
        );
        if (fails) {
          await assert.rejects(action, /Reload failed/);
        } else {
          await action;
        }
        sinon.assert.notCalled(page.pptrPage.setCacheEnabled);
        sinon.assert.calledWithExactly(
          response.appendResponseLine.firstCall,
          warning,
        );
      },
    );
  }

  it('warns about overrides when stopping a trace and saves the raw trace', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const raw = loadTraceAsBuffer('basic-trace.json.gz');
    context.isRunningPerformanceTrace.returns(true);
    page.isRunningPerformanceTrace.returns(true);
    page.pptrPage.tracing.stop.resolves(raw);
    page.listNetworkOverrides.returns(overrides);
    context.saveFile.resolves({filename: '/tmp/trace.json'});
    await stopTrace(args).handler(
      {params: {filePath: '/tmp/trace.json'}, page},
      response,
      context,
    );
    sinon.assert.calledOnceWithExactly(
      context.saveFile,
      raw,
      '/tmp/trace.json',
      '.json',
    );
    sinon.assert.calledWithExactly(
      response.appendResponseLine.firstCall,
      warning,
    );
    const trace = context.storeTraceRecording.firstCall.args[0];
    sinon.assert.calledOnceWithExactly(response.attachTraceSummary, trace);
    sinon.assert.calledOnceWithExactly(
      page.setIsRunningPerformanceTrace,
      false,
    );
  });

  it('warns about overrides even when trace parsing fails', async () => {
    const {page, context, response, args} = createHandlerMocks();
    context.isRunningPerformanceTrace.returns(true);
    page.isRunningPerformanceTrace.returns(true);
    page.pptrPage.tracing.stop.resolves(new TextEncoder().encode('{}'));
    page.listNetworkOverrides.returns(overrides);
    context.saveFile.resolves({filename: '/tmp/trace.json'});
    await assert.rejects(
      stopTrace(args).handler(
        {params: {filePath: '/tmp/trace.json'}, page},
        response,
        context,
      ),
      /parsing the trace/,
    );
    sinon.assert.calledWithExactly(
      response.appendResponseLine.firstCall,
      warning,
    );
    sinon.assert.notCalled(context.storeTraceRecording);
  });

  it('warns about overrides in Lighthouse output and saved reports', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const result = createMockRunnerResult({runWarnings: []});
    page.listNetworkOverrides.returns(overrides);
    page.lighthouseSnapshot.resolves(result);
    context.saveTemporaryFile.resolves({filepath: '/tmp/report.json'});
    await lighthouseAudit(args).handler(
      {params: {mode: 'snapshot'}, page},
      response,
      context,
    );
    assert.deepEqual(result.lhr.runWarnings, [warning]);
    sinon.assert.calledOnceWithExactly(response.appendResponseLine, warning);
    const jsonReport = context.saveTemporaryFile.firstCall.args[0];
    assert.match(
      new TextDecoder().decode(jsonReport),
      /intercept every request/,
    );
    sinon.assert.notCalled(page.lighthouseNavigation);
  });
});
