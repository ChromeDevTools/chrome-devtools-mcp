/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {parseArguments} from '../../../src/config/mcp-options.js';
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
          page: context.getSelectedMcpPage(),
        },
        response,
        context,
      );
      t.assert.snapshot(response.responseLines.join('\n'));
    });
  });

  it('handles errors', async t => {
    await withMcpContext(async (response, context) => {
      await evaluate.handler(
        {
          params: {
            script: `throw new Error('test error')`,
          },
          page: context.getSelectedMcpPage(),
        },
        response,
        context,
      );
      t.assert.snapshot(response.responseLines.join('\n'));
    });
  });

  it('navigates to correct page', async t => {
    await withMcpContext(async (response, context) => {
      await navigate().handler(
        {
          params: {url: 'data:text/html,<div>Hello MCP</div>'},
          page: context.getSelectedMcpPage(),
        },
        response,
        context,
      );
      const page = context.getSelectedMcpPage().pptrPage;
      assert.equal(
        await page.evaluate(() => document.querySelector('div')?.textContent),
        'Hello MCP',
      );
      assert(!response.includePages);
      t.assert.snapshot(response.responseLines.join('\n'));
    });
  });

  it('throws when URL does not parse with new URL', async () => {
    await withMcpContext(async (response, context) => {
      await assert.rejects(
        async () => {
          await navigate().handler(
            {
              params: {url: 'not a valid url'},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        },
        {
          message:
            'Invalid URL: "not a valid url". URLs must be valid according to the URL standard.',
        },
      );
    });
  });

  it('disallows javascript, data, and vbscript URLs when javascriptEvaluation is false', async () => {
    await withMcpContext(async (response, context) => {
      const disabledArgs = parseArguments(
        '1.0.0',
        ['node', 'script.js', '--slim', '--no-javascript-evaluation'],
        {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
      );
      const tool = navigate(disabledArgs);
      await assert.rejects(
        async () => {
          await tool.handler(
            {
              params: {url: 'javascript:alert(1)'},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        },
        {
          message:
            'Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled.',
        },
      );
      await assert.rejects(
        async () => {
          await tool.handler(
            {
              params: {url: 'data:text/html,<div>test</div>'},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        },
        {
          message:
            'Navigating to data: URLs is not allowed when JavaScript evaluation is disabled.',
        },
      );
      await assert.rejects(
        async () => {
          await tool.handler(
            {
              params: {url: 'vbscript:msgbox(1)'},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        },
        {
          message:
            'Navigating to vbscript: URLs is not allowed when JavaScript evaluation is disabled.',
        },
      );
    });
  });

  it('rejects chrome: and chrome-untrusted: URLs', async () => {
    await withMcpContext(async (response, context) => {
      const tool = navigate();
      await assert.rejects(
        async () => {
          await tool.handler(
            {
              params: {url: 'chrome://settings'},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        },
        {
          message: 'Navigating to chrome: URLs is not allowed.',
        },
      );
      await assert.rejects(
        async () => {
          await tool.handler(
            {
              params: {url: 'chrome-untrusted://terminal'},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        },
        {
          message: 'Navigating to chrome-untrusted: URLs is not allowed.',
        },
      );
    });
  });

  it('with default options', async () => {
    await withMcpContext(async (response, context) => {
      const fixture = screenshots.basic;
      const page = context.getSelectedMcpPage().pptrPage;
      await page.setContent(fixture.html);
      await screenshot.handler(
        {params: {format: 'png'}, page: context.getSelectedMcpPage()},
        response,
        context,
      );
      assert(path.isAbsolute(response.responseLines.at(0)!));
      assert(fs.existsSync(response.responseLines.at(0)!));
    });
  });
});
