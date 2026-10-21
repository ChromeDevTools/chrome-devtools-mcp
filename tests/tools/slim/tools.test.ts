/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {evaluate, navigate, screenshot} from '../../../src/tools/slim/tools.js';
import {createHandlerMocks, createMockParsedArguments} from '../../mocks.js';
import {screenshots} from '../../snapshot.js';
import {withMcpContext, createTempDir} from '../../utils.js';

describe('slim', () => {
  it('evaluates', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const script = '2 * 5';
    page.pptrPage.evaluate.resolves(10);

    await evaluate(args).handler({params: {script}, page}, response, context);

    sinon.assert.calledOnceWithExactly(page.pptrPage.evaluate, script);
    sinon.assert.calledOnceWithExactly(response.appendResponseLine, '10');
  });

  it('propagates evaluation errors for response handling', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const script = "throw new Error('test error')";
    page.pptrPage.evaluate.rejects(new Error('test error'));

    await assert.rejects(
      evaluate(args).handler({params: {script}, page}, response, context),
      {message: 'test error'},
    );

    sinon.assert.calledOnceWithExactly(page.pptrPage.evaluate, script);
    sinon.assert.notCalled(response.appendResponseLine);
  });

  it('navigates to correct page', async t => {
    await withMcpContext(async (response, context, args) => {
      await navigate(args).handler(
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
    const {page, context, response, args} = createHandlerMocks();

    await assert.rejects(
      async () => {
        await navigate(args).handler(
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
    const disabledArgs = createMockParsedArguments({
      slim: true,
      javascriptEvaluation: false,
    });
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

  it('disallows file URLs when fileNavigations is false', async () => {
    const {page, context, response} = createHandlerMocks();
    const disabledArgs = createMockParsedArguments({
      slim: true,
      fileNavigations: false,
    });
    const tool = navigate(disabledArgs);
    await assert.rejects(
      async () => {
        await tool.handler(
          {params: {url: 'file:///etc/passwd'}, page},
          response,
          context,
        );
      },
      {
        message:
          'Navigating to file: URLs is not allowed when --file-navigations is disabled.',
      },
    );

    sinon.assert.notCalled(page.pptrPage.goto);
  });

  it('rejects chrome: and chrome-untrusted: URLs', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const tool = navigate(args);
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
    await withMcpContext(async (response, context, args) => {
      const fixture = screenshots.basic;
      const page = context.getSelectedMcpPage().pptrPage;
      await page.setContent(fixture.html);

      await screenshot(args).handler(
        {params: {}, page: context.getSelectedMcpPage()},
        response,
        context,
      );
      assert(path.isAbsolute(response.responseLines.at(0)!));
      assert(fs.existsSync(response.responseLines.at(0)!));
    });
  });

  it('with custom file path', async () => {
    await withMcpContext(async (response, context, args) => {
      const fixture = screenshots.basic;
      const page = context.getSelectedMcpPage().pptrPage;
      await page.setContent(fixture.html);

      using tmpDir = createTempDir();
      const filePath = path.join(tmpDir.path, 'test.png');
      await screenshot(args).handler(
        {params: {filePath}, page: context.getSelectedMcpPage()},
        response,
        context,
      );
      const responseFilePath = response.responseLines.at(0)!;
      assert(path.isAbsolute(responseFilePath));
      assert(fs.existsSync(responseFilePath));
      assert.equal(await fs.promises.realpath(filePath), responseFilePath);
    });
  });
});
