/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {lighthouseRunner} from '../../src/third_party/index.js';
import {lighthouseAudit} from '../../src/tools/lighthouse.js';
import {createHandlerMocks, createMockRunnerResult} from '../mocks.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('lighthouse', () => {
  afterEach(() => {
    sinon.restore();
  });

  const server = serverHooks();
  describe('lighthouse_audit', () => {
    it('runs Lighthouse audit by default (navigation, desktop)', async () => {
      server.addHtmlRoute('/test', html`<div>Test</div>`);

      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/test'));

        await lighthouseAudit(args).handler(
          {
            params: {
              mode: 'navigation',
              device: 'desktop',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const data = response.attachedLighthouseResult;
        assert.ok(data);

        assert.ok(data.summary);
        assert.equal(data.summary.mode, 'navigation');
        assert.equal(data.summary.device, 'desktop');
        assert.ok(data.reports.length === 2); // json, html
        assert.equal(data.failedAudits.length, data.summary.audits.failed);

        // Verify files exist
        for (const reportPath of data.reports) {
          const stats = await fs.stat(reportPath);
          assert.ok(stats.isFile());
        }
      });
    });

    it('restores emulation', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.saveTemporaryFile.resolves({filepath: 'report.json'});
      sinon
        .stub(lighthouseRunner, 'snapshot')
        .resolves(createMockRunnerResult());

      await lighthouseAudit(args).handler(
        {
          params: {
            mode: 'snapshot',
            device: 'mobile',
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(page.restoreEmulation);
    });

    it('restores emulation even when audit fails', async () => {
      const {page, context, response, args} = createHandlerMocks();
      sinon
        .stub(lighthouseRunner, 'snapshot')
        .rejects(new Error('Audit failed'));

      await assert.rejects(
        () =>
          lighthouseAudit(args).handler(
            {
              params: {
                mode: 'snapshot',
                device: 'mobile',
              },
              page,
            },
            response,
            context,
          ),
        {message: 'Audit failed'},
      );

      sinon.assert.calledOnceWithExactly(page.restoreEmulation);
    });

    it('emulates a desktop user agent for desktop audits', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.saveTemporaryFile.resolves({filepath: 'report.json'});
      const navigation = sinon
        .stub(lighthouseRunner, 'navigation')
        .resolves(createMockRunnerResult());

      await lighthouseAudit(args).handler(
        {
          params: {
            mode: 'navigation',
            device: 'desktop',
          },
          page,
        },
        response,
        context,
      );

      const {flags} = navigation.firstCall.args[2];
      assert.equal(flags?.formFactor, 'desktop');
      assert.match(String(flags?.emulatedUserAgent), /Macintosh/);
      assert.doesNotMatch(String(flags?.emulatedUserAgent), /Mobile/);
    });

    it('emulates a mobile user agent for mobile audits', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.saveTemporaryFile.resolves({filepath: 'report.json'});
      const snapshot = sinon
        .stub(lighthouseRunner, 'snapshot')
        .resolves(createMockRunnerResult());

      await lighthouseAudit(args).handler(
        {
          params: {
            mode: 'snapshot',
            device: 'mobile',
          },
          page,
        },
        response,
        context,
      );

      const {flags} = snapshot.firstCall.args[1];
      assert.equal(flags?.formFactor, 'mobile');
      assert.match(String(flags?.emulatedUserAgent), /Mobile Safari/);
    });

    it('reports the URL in snapshot mode, where mainDocumentUrl is unset', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.saveTemporaryFile.resolves({filepath: 'report.json'});
      sinon.stub(lighthouseRunner, 'snapshot').resolves(
        createMockRunnerResult({
          mainDocumentUrl: undefined,
          finalDisplayedUrl: 'https://example.com/page',
        }),
      );

      await lighthouseAudit(args).handler(
        {
          params: {
            mode: 'snapshot',
            device: 'mobile',
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnce(response.attachLighthouseResult);
      assert.equal(
        response.attachLighthouseResult.firstCall.args[0].summary.url,
        'https://example.com/page',
      );
    });

    it('runs Lighthouse in snapshot mode with mobile device', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.saveTemporaryFile
        .withArgs(sinon.match.instanceOf(Uint8Array), 'report.json')
        .resolves({filepath: '/tmp/report.json'});
      context.saveTemporaryFile
        .withArgs(sinon.match.instanceOf(Uint8Array), 'report.html')
        .resolves({filepath: '/tmp/report.html'});
      const snapshot = sinon
        .stub(lighthouseRunner, 'snapshot')
        .resolves(createMockRunnerResult());
      const navigation = sinon.stub(lighthouseRunner, 'navigation');

      await lighthouseAudit(args).handler(
        {
          params: {
            mode: 'snapshot',
            device: 'mobile',
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnce(snapshot);
      sinon.assert.notCalled(navigation);
      sinon.assert.calledTwice(context.saveTemporaryFile);
      sinon.assert.notCalled(context.saveFile);
      sinon.assert.calledOnce(response.attachLighthouseResult);
      const {summary, reports} =
        response.attachLighthouseResult.firstCall.args[0];
      assert.equal(summary.mode, 'snapshot');
      assert.equal(summary.device, 'mobile');
      assert.deepEqual(reports, ['/tmp/report.json', '/tmp/report.html']);
    });

    it('runs Lighthouse with custom output dir', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const outputDirPath = path.join('custom', 'reports');
      const reportPath = path.join(outputDirPath, 'report');
      context.saveFile
        .withArgs(sinon.match.instanceOf(Uint8Array), reportPath, '.json')
        .resolves({filename: `${reportPath}.json`});
      context.saveFile
        .withArgs(sinon.match.instanceOf(Uint8Array), reportPath, '.html')
        .resolves({filename: `${reportPath}.html`});
      sinon
        .stub(lighthouseRunner, 'snapshot')
        .resolves(createMockRunnerResult());

      await lighthouseAudit(args).handler(
        {
          params: {
            mode: 'snapshot',
            device: 'mobile',
            outputDirPath,
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledTwice(context.saveFile);
      sinon.assert.notCalled(context.saveTemporaryFile);
      sinon.assert.calledOnce(response.attachLighthouseResult);
      const {summary, reports} =
        response.attachLighthouseResult.firstCall.args[0];
      assert.equal(summary.mode, 'snapshot');
      assert.equal(summary.device, 'mobile');
      assert.deepEqual(reports, [`${reportPath}.json`, `${reportPath}.html`]);
    });

    it('returns failing audits with their DOM nodes inline', async () => {
      const {page, context, response, args} = createHandlerMocks();
      context.saveTemporaryFile.resolves({filepath: 'report.json'});
      const node = (
        id: number,
      ): {
        type: 'node';
        lhId: string;
        selector: string;
        snippet: string;
        nodeLabel: string;
      } => ({
        type: 'node',
        lhId: `node-${id}`,
        selector: `div.item-${id}`,
        snippet: `<div class="item-${id}">`,
        nodeLabel: `Item ${id}`,
      });
      sinon.stub(lighthouseRunner, 'snapshot').resolves(
        createMockRunnerResult({
          categories: {
            accessibility: {
              id: 'accessibility',
              title: 'Accessibility',
              score: 0.5,
              auditRefs: [
                {id: 'color-contrast', weight: 7},
                {id: 'document-title', weight: 7},
                {id: 'html-has-lang', weight: 7},
              ],
            },
            seo: {
              id: 'seo',
              title: 'SEO',
              score: 0.5,
              auditRefs: [{id: 'document-title', weight: 1}],
            },
          },
          audits: {
            'color-contrast': {
              id: 'color-contrast',
              title: 'Insufficient contrast',
              description: 'Low-contrast text is difficult to read.',
              score: 0,
              scoreDisplayMode: 'binary',
              details: {
                type: 'table',
                headings: [],
                items: [
                  {
                    node: {
                      ...node(1),
                      explanation: 'Fix any of the following: contrast',
                    },
                    subItems: {
                      type: 'subitems',
                      items: [{relatedNode: node(2)}],
                    },
                  },
                  // Duplicate node, which must only be reported once.
                  {node: node(1)},
                  ...Array.from({length: 12}, (_, i) => ({node: node(i + 3)})),
                ],
                debugData: {type: 'debugdata', node: node(99)},
              },
            },
            'document-title': {
              id: 'document-title',
              title: 'Missing title',
              description: 'Titles matter.',
              score: 0,
              scoreDisplayMode: 'binary',
              displayValue: '1 issue',
              details: {
                type: 'list',
                items: [
                  {type: 'table', headings: [], items: [{node: node(50)}]},
                ],
              },
            },
            'html-has-lang': {
              id: 'html-has-lang',
              title: 'Has lang',
              description: '',
              score: 1,
              scoreDisplayMode: 'binary',
            },
            'manual-audit': {
              id: 'manual-audit',
              title: 'Manual',
              description: '',
              score: null,
              scoreDisplayMode: 'manual',
            },
          },
        }),
      );

      await lighthouseAudit(args).handler(
        {params: {mode: 'snapshot', device: 'desktop'}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(response.attachLighthouseResult);
      const {summary, failedAudits} =
        response.attachLighthouseResult.firstCall.args[0];
      assert.deepEqual(summary.audits, {failed: 2, passed: 1});
      assert.equal(failedAudits.length, 2);

      const [contrast, title] = failedAudits;
      assert.equal(contrast.id, 'color-contrast');
      assert.deepEqual(contrast.categories, ['accessibility']);
      assert.equal(
        contrast.description,
        'Low-contrast text is difficult to read.',
      );
      assert.equal(contrast.totalNodes, 14);
      assert.equal(contrast.nodes.length, 10);
      assert.deepEqual(contrast.nodes[0], {
        selector: 'div.item-1',
        snippet: '<div class="item-1">',
        nodeLabel: 'Item 1',
        explanation: 'Fix any of the following: contrast',
      });
      assert.equal(contrast.nodes[1].selector, 'div.item-2');
      assert.ok(!contrast.nodes.some(n => n.selector === 'div.item-99'));

      assert.deepEqual(title, {
        id: 'document-title',
        title: 'Missing title',
        description: 'Titles matter.',
        score: 0,
        displayValue: '1 issue',
        categories: ['accessibility', 'seo'],
        nodes: [
          {
            selector: 'div.item-50',
            snippet: '<div class="item-50">',
            nodeLabel: 'Item 50',
          },
        ],
        totalNodes: 1,
      });
    });
  });
});
