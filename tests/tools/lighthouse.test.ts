/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {lighthouseRunner} from '../../src/third_party/index.js';
import {lighthouseAudit} from '../../src/tools/lighthouse.js';
import {resolveCanonicalPath} from '../../src/utils/files.js';
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

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/test'));

        await lighthouseAudit.handler(
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
      const {page, context, response} = createHandlerMocks();
      context.saveTemporaryFile.resolves({filepath: 'report.json'});
      sinon
        .stub(lighthouseRunner, 'snapshot')
        .resolves(createMockRunnerResult());

      await lighthouseAudit.handler(
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
      const {page, context, response} = createHandlerMocks();
      sinon
        .stub(lighthouseRunner, 'snapshot')
        .rejects(new Error('Audit failed'));

      await assert.rejects(
        () =>
          lighthouseAudit.handler(
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

    it('runs Lighthouse in snapshot mode with mobile device', async () => {
      server.addHtmlRoute('/test-mobile', html`<div>Test Mobile</div>`);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/test-mobile'));

        await lighthouseAudit.handler(
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

      const tmpDir = os.tmpdir();
      const folderPath = path.join(
        tmpDir,
        `temp-folder-${crypto.randomUUID()}`,
      );

      try {
        await withMcpContext(async (response, context) => {
          const page = context.getSelectedMcpPage().pptrPage;
          await page.goto(server.getRoute('/test-mobile'));

          await lighthouseAudit.handler(
            {
              params: {
                mode: 'snapshot',
                device: 'mobile',
                outputDirPath: folderPath,
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
          const canonicalFolderPath = await resolveCanonicalPath(folderPath);
          for (const report of data.reports) {
            assert.ok(report.startsWith(canonicalFolderPath));
          }
        });
      } finally {
        await fs.rm(folderPath, {recursive: true, force: true});
      }
    });
  });
});
