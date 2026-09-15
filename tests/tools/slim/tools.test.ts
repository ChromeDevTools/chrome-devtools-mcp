/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {parseArguments} from '../../../src/config/mcp-options.js';
import {evaluate, navigate, screenshot} from '../../../src/tools/slim/tools.js';
import {createHandlerMocks} from '../../mocks.js';
import {screenshots} from '../../snapshot.js';
import {withMcpContext} from '../../utils.js';

describe('slim', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('evaluates', async () => {
    const {page, context, response} = createHandlerMocks();
    const script = '2 * 5';
    page.pptrPage.evaluate.resolves(10);

    await evaluate.handler({params: {script}, page}, response, context);

    sinon.assert.calledOnceWithExactly(page.pptrPage.evaluate, script);
    sinon.assert.calledOnceWithExactly(response.appendResponseLine, '10');
  });

  it('handles errors', async () => {
    const {page, context, response} = createHandlerMocks();
    const script = "throw new Error('test error')";
    page.pptrPage.evaluate.rejects(new Error('test error'));

    await evaluate.handler({params: {script}, page}, response, context);

    sinon.assert.calledOnceWithExactly(page.pptrPage.evaluate, script);
    sinon.assert.calledOnceWithExactly(
      response.appendResponseLine,
      'test error',
    );
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
    const {page, context, response} = createHandlerMocks();

    await assert.rejects(
      async () => {
        await navigate().handler(
          {params: {url: 'not a valid url'}, page},
          response,
          context,
        );
      },
      {
        message:
          'Invalid URL: "not a valid url". URLs must be valid according to the URL standard.',
      },
    );

    sinon.assert.notCalled(page.pptrPage.goto);
  });

  it('disallows javascript, data, and vbscript URLs when javascriptEvaluation is false', async () => {
    const {page, context, response} = createHandlerMocks();
    const disabledArgs = parseArguments(
      '1.0.0',
      ['node', 'script.js', '--slim', '--no-javascript-evaluation'],
      {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    );
    const tool = navigate(disabledArgs);
    await assert.rejects(
      async () => {
        await tool.handler(
          {params: {url: 'javascript:alert(1)'}, page},
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
          {params: {url: 'data:text/html,<div>test</div>'}, page},
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
          {params: {url: 'vbscript:msgbox(1)'}, page},
          response,
          context,
        );
      },
      {
        message:
          'Navigating to vbscript: URLs is not allowed when JavaScript evaluation is disabled.',
      },
    );

    sinon.assert.notCalled(page.pptrPage.goto);
  });

  it('rejects chrome: and chrome-untrusted: URLs', async () => {
    const {page, context, response} = createHandlerMocks();
    const tool = navigate();
    await assert.rejects(
      async () => {
        await tool.handler(
          {params: {url: 'chrome://settings'}, page},
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
          {params: {url: 'chrome-untrusted://terminal'}, page},
          response,
          context,
        );
      },
      {
        message: 'Navigating to chrome-untrusted: URLs is not allowed.',
      },
    );

    sinon.assert.notCalled(page.pptrPage.goto);
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
