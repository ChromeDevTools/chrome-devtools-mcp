/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {evaluate, navigate, screenshot} from '../../../src/tools/slim/tools.js';
import {screenshots} from '../../snapshot.js';
import {withMcpContext} from '../../utils.js';

describe('slim', () => {
  it('evaluates', async t => {
    await withMcpContext(async (response, context) => {
      await evaluate.handler(
        {
          params: {
            script: `2 * 5`,
          },
        },
        response,
        context,
      );
      t.assert.snapshot?.(response.responseLines.join('\n'));
    });
  });

  it('handles errors', async t => {
    await withMcpContext(async (response, context) => {
      await evaluate.handler(
        {
          params: {
            script: `throw new Error('test error')`,
          },
        },
        response,
        context,
      );
      t.assert.snapshot?.(response.responseLines.join('\n'));
    });
  });

  it('navigates to correct page', async t => {
    await withMcpContext(async (response, context) => {
      await navigate.handler(
        {params: {url: 'data:text/html,<div>Hello MCP</div>'}},
        response,
        context,
      );
      const page = context.getSelectedPage();
      assert.equal(
        await page.evaluate(() => document.querySelector('div')?.textContent),
        'Hello MCP',
      );
      assert(!response.includePages);
      t.assert.snapshot?.(response.responseLines.join('\n'));
    });
  });

  it('with default options', async () => {
    await withMcpContext(async (response, context) => {
      const fixture = screenshots.basic;
      const page = context.getSelectedPage();
      await page.setContent(fixture.html);
      await screenshot.handler({params: {format: 'png'}}, response, context);
      assert(path.isAbsolute(response.responseLines.at(0)!));
      assert(fs.existsSync(response.responseLines.at(0)!));
    });
  });
});
