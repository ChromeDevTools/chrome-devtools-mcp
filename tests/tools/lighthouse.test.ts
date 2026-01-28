/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import {lighthouseAudit} from '../../src/tools/lighthouse.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('lighthouse', () => {
  const server = serverHooks();
  describe('lighthouse_audit', () => {
    it('runs Lighthouse accessibility audit', async t => {
      server.addHtmlRoute('/test', html`<div>Test</div>`);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/test'));

        await lighthouseAudit.handler({params: {}}, response, context);

        const responseText = response.responseLines.join('\n');
        t.assert.snapshot?.(responseText);
      });
    });
  });
});
