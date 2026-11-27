/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {startCoverage, stopCoverage} from '../../src/tools/coverage.js';
import type {CoverageReport} from '../../src/tools/ToolDefinition.js';
import {createHandlerMocks, createMockMcpPage} from '../mocks.js';
import {serverHooks} from '../server.js';
import {getTextContent, html, withMcpContext} from '../utils.js';

function emptyReport(): CoverageReport {
  return {
    resources: [],
    totals: {
      resources: 0,
      totalBytes: 0,
      usedBytes: 0,
      unusedBytes: 0,
      unusedPercent: 0,
    },
  };
}

describe('start_coverage', () => {
  it('starts coverage with the given options', async () => {
    const {page, context, response, args} = createHandlerMocks();

    await startCoverage(args).handler(
      {
        params: {
          js: true,
          css: true,
        },
        page,
      },
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.startCoverage, {
      js: true,
      css: true,
    });
    sinon.assert.calledOnceWithExactly(
      response.appendResponseLine,
      'JavaScript and CSS coverage collection has started. Interact with the page, then call stop_coverage to get the report.',
    );
  });

  it('mentions CSS only when js is false', async () => {
    const {page, context, response, args} = createHandlerMocks();

    await startCoverage(args).handler(
      {
        params: {
          js: false,
          css: true,
        },
        page,
      },
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.startCoverage, {
      js: false,
      css: true,
    });
    sinon.assert.calledOnceWithExactly(
      response.appendResponseLine,
      'CSS coverage collection has started. Interact with the page, then call stop_coverage to get the report.',
    );
  });

  it('errors while a performance trace is running', async () => {
    const {page, context, response, args} = createHandlerMocks();
    context.isRunningPerformanceTrace.returns(true);

    await assert.rejects(
      startCoverage(args).handler(
        {params: {js: true, css: true}, page},
        response,
        context,
      ),
      /A performance trace is running\. Coverage skews trace timings, so stop the trace with performance_stop_trace before calling start_coverage\./,
    );
    sinon.assert.notCalled(page.startCoverage);
    sinon.assert.notCalled(response.appendResponseLine);
  });
});

describe('stop_coverage', () => {
  it('stops coverage and attaches the report', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const report = emptyReport();
    page.isRunningCoverage.returns(true);
    page.stopCoverage.resolves(report);

    await stopCoverage(args).handler({params: {}, page}, response, context);

    sinon.assert.calledOnceWithExactly(page.stopCoverage);
    sinon.assert.calledOnceWithExactly(response.attachCoverageReport, report);
  });

  it('errors when coverage is running on another page', async () => {
    const {page, context, response, args} = createHandlerMocks();
    Object.defineProperty(page, 'id', {value: 1});
    page.isRunningCoverage.returns(false);
    const other = createMockMcpPage({id: 2});
    other.isRunningCoverage.returns(true);
    context.getPages.returns([page, other]);

    await assert.rejects(
      stopCoverage(args).handler({params: {}, page}, response, context),
      /Coverage is running on page 2, not on page 1\. Pass pageId: 2 to stop_coverage to stop it\./,
    );
    sinon.assert.notCalled(page.stopCoverage);
    sinon.assert.notCalled(response.attachCoverageReport);
  });

  it('tells the user to select the other page when pageId routing is off', async () => {
    const {page, context, response, args} = createHandlerMocks({
      pageIdRouting: false,
    });
    Object.defineProperty(page, 'id', {value: 1});
    page.isRunningCoverage.returns(false);
    const other = createMockMcpPage({id: 2});
    other.isRunningCoverage.returns(true);
    context.getPages.returns([page, other]);

    await assert.rejects(
      stopCoverage(args).handler({params: {}, page}, response, context),
      /Coverage is running on page 2, not on page 1\. Select page 2 with select_page first, then call stop_coverage\./,
    );
    sinon.assert.notCalled(page.stopCoverage);
  });
});

const COVERAGE_PAGE = html`
  <style>
    .used {
      color: red;
    }
    .unused {
      display: none;
      color: blue;
      background: yellow;
      padding: 12px;
    }
  </style>
  <button id="go">Go</button>
  <div class="used">hello</div>
  <script>
    function usedFn() {
      return 1;
    }
    function unusedFn() {
      return 'dead code ' + 'x'.repeat(200);
    }
    function extraFn() {
      document.body.dataset.extra = '1';
    }
    usedFn();
    document.getElementById('go').addEventListener('click', extraFn);
  </script>
`;

describe('coverage in a browser', () => {
  const server = serverHooks();

  it('reports used bytes less than total for mixed JS and CSS', async () => {
    server.addHtmlRoute('/coverage.html', COVERAGE_PAGE);
    await withMcpContext(async (response, context, args) => {
      const mcpPage = context.getSelectedMcpPage();
      await mcpPage.pptrPage.goto(server.getRoute('/coverage.html'));
      await startCoverage(args).handler(
        {
          params: {
            js: true,
            css: true,
          },
          page: mcpPage,
        },
        response,
        context,
      );
      await mcpPage.pptrPage.reload({waitUntil: 'load'});
      await mcpPage.pptrPage.click('#go');
      await stopCoverage(args).handler(
        {params: {}, page: mcpPage},
        response,
        context,
      );
      const {content} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.match(text, /## Coverage report/);
      assert.match(text, / JS /);
      assert.match(text, / CSS /);
      const totals =
        /Totals: (\d+) resources, (\d+) total bytes, (\d+) used, (\d+) unused/.exec(
          text,
        );
      assert.ok(totals);
      const totalBytes = Number(totals[2]);
      const usedBytes = Number(totals[3]);
      const unusedBytes = Number(totals[4]);
      assert.ok(totalBytes > 0);
      assert.ok(usedBytes < totalBytes);
      assert.ok(unusedBytes > 0);
    });
  });
});
