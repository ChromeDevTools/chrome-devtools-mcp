/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {lighthouseAudit} from '../../src/tools/lighthouse.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('lighthouse', () => {
  const server = serverHooks();
  describe('lighthouse_audit', () => {
    it('runs Lighthouse audit by default (navigation, desktop)', async () => {
      server.addHtmlRoute('/test', html`<div>Test</div>`);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/test'));

        await lighthouseAudit.handler(
          {
            params: {
              mode: 'navigation',
              device: 'desktop',
            },
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

    it('runs Lighthouse in snapshot mode with mobile device', async () => {
      server.addHtmlRoute('/test-mobile', html`<div>Test Mobile</div>`);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/test-mobile'));

        await lighthouseAudit.handler(
          {
            params: {
              mode: 'snapshot',
              device: 'mobile',
            },
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
          const page = context.getSelectedPage();
          await page.goto(server.getRoute('/test-mobile'));

          await lighthouseAudit.handler(
            {
              params: {
                mode: 'snapshot',
                device: 'mobile',
                outputDirPath: folderPath,
              },
            },
            response,
            context,
          );

          const data = response.attachedLighthouseResult;
          assert.ok(data);
          assert.equal(data.summary.mode, 'snapshot');
          assert.equal(data.summary.device, 'mobile');
          assert.ok(data.reports.length === 2);
          for (const report of data.reports) {
            assert.ok(report.startsWith(folderPath));
          }
        });
      } finally {
        await fs.rm(folderPath, {recursive: true, force: true});
      }
    });
  });
});
