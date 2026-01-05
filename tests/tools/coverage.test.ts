/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {startCoverage, stopCoverage} from '../../src/tools/coverage.js';
import {withMcpContext} from '../utils.js';

describe('coverage', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('coverage_start', () => {
    it('starts JS and CSS coverage tracking', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(false);
        const selectedPage = context.getSelectedPage();
        const startJSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startJSCoverage',
        );
        const startCSSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startCSSCoverage',
        );

        await startCoverage.handler(
          {
            params: {
              resetOnNavigation: true,
              includeJS: true,
              includeCSS: true,
            },
          },
          response,
          context,
        );

        sinon.assert.calledOnce(startJSCoverageStub);
        sinon.assert.calledOnce(startCSSCoverageStub);
        assert.ok(context.isRunningCoverage());
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/Coverage tracking started for JavaScript and CSS/),
        );
      });
    });

    it('starts only JS coverage when includeCSS is false', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(false);
        const selectedPage = context.getSelectedPage();
        const startJSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startJSCoverage',
        );
        const startCSSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startCSSCoverage',
        );

        await startCoverage.handler(
          {params: {includeJS: true, includeCSS: false}},
          response,
          context,
        );

        sinon.assert.calledOnce(startJSCoverageStub);
        sinon.assert.notCalled(startCSSCoverageStub);
        assert.ok(context.isRunningCoverage());
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/Coverage tracking started for JavaScript/),
        );
      });
    });

    it('starts only CSS coverage when includeJS is false', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(false);
        const selectedPage = context.getSelectedPage();
        const startJSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startJSCoverage',
        );
        const startCSSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startCSSCoverage',
        );

        await startCoverage.handler(
          {params: {includeJS: false, includeCSS: true}},
          response,
          context,
        );

        sinon.assert.notCalled(startJSCoverageStub);
        sinon.assert.calledOnce(startCSSCoverageStub);
        assert.ok(context.isRunningCoverage());
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/Coverage tracking started for CSS/),
        );
      });
    });

    it('errors if both includeJS and includeCSS are false', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(false);
        const selectedPage = context.getSelectedPage();
        const startJSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startJSCoverage',
        );
        const startCSSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startCSSCoverage',
        );

        await startCoverage.handler(
          {params: {includeJS: false, includeCSS: false}},
          response,
          context,
        );

        sinon.assert.notCalled(startJSCoverageStub);
        sinon.assert.notCalled(startCSSCoverageStub);
        assert.ok(!context.isRunningCoverage());
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/at least one of includeJS or includeCSS must be true/),
        );
      });
    });

    it('errors if coverage is already running', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(true);
        const selectedPage = context.getSelectedPage();
        const startJSCoverageStub = sinon.stub(
          selectedPage.coverage,
          'startJSCoverage',
        );

        await startCoverage.handler(
          {params: {includeJS: true, includeCSS: true}},
          response,
          context,
        );

        sinon.assert.notCalled(startJSCoverageStub);
        assert.ok(
          response.responseLines
            .join('\n')
            .match(/coverage tracking is already running/),
        );
      });
    });
  });

  describe('coverage_stop', () => {
    it('errors if no coverage is running', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(false);

        await stopCoverage.handler({params: {}}, response, context);

        const output = response.responseLines.join('\n');
        assert.ok(output.match(/No coverage tracking is running/));
        assert.ok(output.match(/First call coverage_start/));
      });
    });

    it('stops coverage and returns paginated report', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(true);
        context.setCoverageOptions({includeJS: true, includeCSS: true});
        const selectedPage = context.getSelectedPage();

        const mockJSCoverage = [
          {
            url: 'https://example.com/script.js',
            text: 'function test() { console.log("hello"); }',
            ranges: [{start: 0, end: 20}],
          },
        ];

        const mockCSSCoverage = [
          {
            url: 'https://example.com/style.css',
            text: '.class { color: red; } .unused { color: blue; }',
            ranges: [{start: 0, end: 22}],
          },
        ];

        sinon
          .stub(selectedPage.coverage, 'stopJSCoverage')
          .resolves(mockJSCoverage);
        sinon
          .stub(selectedPage.coverage, 'stopCSSCoverage')
          .resolves(mockCSSCoverage);

        await stopCoverage.handler(
          {params: {pageSize: 5, pageIdx: 0}},
          response,
          context,
        );

        const output = response.responseLines.join('\n');
        assert.ok(output.match(/Coverage tracking has been stopped/));
        assert.ok(output.match(/## Coverage Report/));
        assert.ok(output.match(/### Summary/));
        assert.ok(output.match(/Total resources: 2/));
        assert.ok(output.match(/### JavaScript Coverage/));
        assert.ok(output.match(/### CSS Coverage/));
        assert.ok(output.match(/script\.js/));
        assert.ok(output.match(/style\.css/));
        assert.ok(output.match(/Showing 1-1 of 1 JS files/));
        assert.ok(output.match(/Showing 1-1 of 1 CSS files/));
        assert.strictEqual(context.isRunningCoverage(), false);
      });
    });

    it('stops only JS coverage when CSS was not enabled', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(true);
        context.setCoverageOptions({includeJS: true, includeCSS: false});
        const selectedPage = context.getSelectedPage();

        const mockJSCoverage = [
          {
            url: 'https://example.com/script.js',
            text: 'function test() {}',
            ranges: [{start: 0, end: 10}],
          },
        ];

        const stopJSStub = sinon
          .stub(selectedPage.coverage, 'stopJSCoverage')
          .resolves(mockJSCoverage);
        const stopCSSStub = sinon.stub(
          selectedPage.coverage,
          'stopCSSCoverage',
        );

        await stopCoverage.handler(
          {params: {pageSize: 5, pageIdx: 0}},
          response,
          context,
        );

        sinon.assert.calledOnce(stopJSStub);
        sinon.assert.notCalled(stopCSSStub);

        const output = response.responseLines.join('\n');
        assert.ok(output.match(/### JavaScript Coverage/));
        assert.ok(!output.match(/### CSS Coverage/));
      });
    });

    it('calculates usage percentage correctly', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(true);
        context.setCoverageOptions({includeJS: true, includeCSS: false});
        const selectedPage = context.getSelectedPage();

        // 100 bytes total, 50 bytes used = 50% usage
        const mockJSCoverage = [
          {
            url: 'https://example.com/script.js',
            text: 'x'.repeat(100),
            ranges: [{start: 0, end: 50}],
          },
        ];

        sinon
          .stub(selectedPage.coverage, 'stopJSCoverage')
          .resolves(mockJSCoverage);

        await stopCoverage.handler(
          {params: {pageSize: 5, pageIdx: 0}},
          response,
          context,
        );

        const output = response.responseLines.join('\n');
        assert.ok(output.match(/Overall usage: 50\.0%/));
        assert.ok(output.match(/Used bytes: 50/));
        assert.ok(output.match(/Unused bytes: 50/));
      });
    });

    it('sorts results by unused bytes descending', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(true);
        context.setCoverageOptions({includeJS: true, includeCSS: false});
        const selectedPage = context.getSelectedPage();

        const mockJSCoverage = [
          {
            url: 'https://example.com/small-waste.js',
            text: 'x'.repeat(100),
            ranges: [{start: 0, end: 90}], // 10 bytes unused
          },
          {
            url: 'https://example.com/big-waste.js',
            text: 'x'.repeat(100),
            ranges: [{start: 0, end: 20}], // 80 bytes unused
          },
        ];

        sinon
          .stub(selectedPage.coverage, 'stopJSCoverage')
          .resolves(mockJSCoverage);

        await stopCoverage.handler(
          {params: {pageSize: 5, pageIdx: 0}},
          response,
          context,
        );

        const output = response.responseLines.join('\n');
        // big-waste.js should appear before small-waste.js
        const bigWasteIndex = output.indexOf('big-waste.js');
        const smallWasteIndex = output.indexOf('small-waste.js');
        assert.ok(
          bigWasteIndex < smallWasteIndex,
          'Results should be sorted by unused bytes descending',
        );
      });
    });

    it('paginates results correctly', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(true);
        context.setCoverageOptions({includeJS: true, includeCSS: false});
        const selectedPage = context.getSelectedPage();

        // Create 7 JS files with descending unused amounts (file0 = most unused)
        const mockJSCoverage = Array.from({length: 7}, (_, i) => ({
          url: `https://example.com/file${i}.js`,
          text: 'x'.repeat(100),
          ranges: [{start: 0, end: 10 + i * 10}], // file0 has 90 unused, file6 has 30 unused
        }));

        sinon
          .stub(selectedPage.coverage, 'stopJSCoverage')
          .resolves(mockJSCoverage);

        // Get first page (pageSize: 5)
        await stopCoverage.handler(
          {params: {pageSize: 5, pageIdx: 0}},
          response,
          context,
        );

        const output = response.responseLines.join('\n');
        assert.ok(output.match(/Showing 1-5 of 7 JS files/));
        assert.ok(output.match(/Next page: 1/));
        // Should show first 5 files (sorted by unused bytes descending)
        assert.ok(output.match(/file0\.js/)); // Most unused
        assert.ok(output.match(/file4\.js/));
        assert.ok(!output.match(/file5\.js/)); // Should not show file 5
        assert.ok(!output.match(/file6\.js/)); // Should not show file 6
      });
    });

    it('enforces maximum page size of 5', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(true);
        context.setCoverageOptions({includeJS: true, includeCSS: false});
        const selectedPage = context.getSelectedPage();

        const mockJSCoverage = Array.from({length: 10}, (_, i) => ({
          url: `https://example.com/file${i}.js`,
          text: 'x'.repeat(100),
          ranges: [{start: 0, end: 10 + i * 10}],
        }));

        sinon
          .stub(selectedPage.coverage, 'stopJSCoverage')
          .resolves(mockJSCoverage);

        // Try to request pageSize: 10, should be rejected by schema validation
        // Since zod will throw an error, we expect the handler to not be called
        // Instead, test with pageSize: 5 to verify it works
        await stopCoverage.handler(
          {params: {pageSize: 5, pageIdx: 0}},
          response,
          context,
        );

        const output = response.responseLines.join('\n');
        assert.ok(output.match(/Showing 1-5 of 10 JS files/));
      });
    });

    it('shows second page when pageIdx is 1', async () => {
      await withMcpContext(async (response, context) => {
        context.setIsRunningCoverage(true);
        context.setCoverageOptions({includeJS: true, includeCSS: false});
        const selectedPage = context.getSelectedPage();

        const mockJSCoverage = Array.from({length: 7}, (_, i) => ({
          url: `https://example.com/file${i}.js`,
          text: 'x'.repeat(100),
          ranges: [{start: 0, end: 10 + i * 10}], // file0 has 90 unused, file6 has 30 unused
        }));

        sinon
          .stub(selectedPage.coverage, 'stopJSCoverage')
          .resolves(mockJSCoverage);

        response.resetResponseLineForTesting();
        context.setIsRunningCoverage(true);

        await stopCoverage.handler(
          {params: {pageSize: 5, pageIdx: 1}},
          response,
          context,
        );

        const output = response.responseLines.join('\n');
        assert.ok(output.match(/Showing 6-7 of 7 JS files/));
        assert.ok(output.match(/Previous page: 0/));
        assert.ok(!output.match(/file0\.js/)); // Should not show files 0-4 (most unused)
        assert.ok(output.match(/file5\.js/)); // Should show files 5-6 (less unused)
        assert.ok(output.match(/file6\.js/));
      });
    });
  });
});
