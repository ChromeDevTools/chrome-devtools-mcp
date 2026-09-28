/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {lighthouseRunner} from '../../src/third_party/index.js';
import {lighthouseAudit} from '../../src/tools/lighthouse.js';
import {resolveCanonicalPath} from '../../src/utils/files.js';
import {createHandlerMocks, createMockRunnerResult} from '../mocks.js';
import {serverHooks} from '../server.js';
import {createTempDir, html, withMcpContext} from '../utils.js';

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
      server.addHtmlRoute('/test-mobile', html`<div>Test Mobile</div>`);

      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/test-mobile'));

        await lighthouseAudit(args).handler(
          {
            params: {
              mode: 'snapshot',
              device: 'mobile',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const data = response.attachedLighthouseResult;
        assert.ok(data);

        assert.equal(data.summary.mode, 'snapshot');
        assert.equal(data.summary.device, 'mobile');
        assert.ok(data.reports.length === 2);
      });
    });

    it('runs Lighthouse with custom output dir', async () => {
      server.addHtmlRoute('/test-mobile', html`<div>Test Mobile</div>`);

      using folder = createTempDir('temp-folder-');

      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/test-mobile'));

        await lighthouseAudit(args).handler(
          {
            params: {
              mode: 'snapshot',
              device: 'mobile',
              outputDirPath: folder.path,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const data = response.attachedLighthouseResult;
        assert.ok(data);
        assert.equal(data.summary.mode, 'snapshot');
        assert.equal(data.summary.device, 'mobile');
        assert.ok(data.reports.length === 2);
        const canonicalFolderPath = await resolveCanonicalPath(folder.path);
        for (const report of data.reports) {
          assert.ok(report.startsWith(canonicalFolderPath));
        }
      });
    });
  });
});
