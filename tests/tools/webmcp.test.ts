/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import type {McpPage} from '../../src/McpPage.js';
import {ToolHandler} from '../../src/ToolHandler.js';
import {Mutex} from '../../src/third_party/index.js';
import {listPages, navigatePage, selectPage} from '../../src/tools/pages.js';
import {executeWebMcpTool} from '../../src/tools/webmcp.js';
import {
  createHandlerMocks,
  createMockPuppeteerBrowser,
  createMockWebMCPTool,
} from '../mocks.js';
import {html, withMcpContext} from '../utils.js';

describe('webmcp', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('list_webmcp_tools', () => {
    it('list webmcp tools in navigate_page response', async () => {
      await withMcpContext(async (response, context, args) => {
        await navigatePage(args).handler(
          {
            params: {url: 'data:text/html,<html></html>'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(response.listWebMcpTools);
      });
    });

    it('list webmcp tools in list_pages response', async () => {
      await withMcpContext(async (response, context, args) => {
        await listPages(args).handler({params: {}}, response, context);
        assert.ok(response.listWebMcpTools);
      });
    });

    it('list webmcp tools in select_page response', async () => {
      await withMcpContext(async (response, context, args) => {
        const pageId = context.getSelectedMcpPage().id ?? 1;
        await selectPage(args).handler({params: {pageId}}, response, context);
        assert.ok(response.listWebMcpTools);
      });
    });
  });

  describe('execute_webmcp_tool', () => {
    async function setupWebMcpTool(page: McpPage) {
      await page.pptrPage.setContent(
        html`<form
            toolname="test_tool"
            tooldescription="A test tool"
            toolautosubmit
          ></form
          ><script>
            document.querySelector('form').onsubmit = event => {
              event.preventDefault();
              event.respondWith('hello');
            };
          </script>`,
      );
    }

    function createFailedToolCall(options: {
      errorText?: string;
      exceptionDescription?: string;
    }) {
      const {page, context, response, args} = createHandlerMocks();
      const tool = createMockWebMCPTool({name: 'failing_tool'});
      tool.execute.resolves({
        id: 'call-1',
        status: 'Error',
        output: undefined,
        errorText: options.errorText ?? '',
        exception:
          options.exceptionDescription !== undefined
            ? {
                type: 'object',
                subtype: 'error',
                className: 'Error',
                description: options.exceptionDescription,
              }
            : undefined,
      });
      page.getWebMcpTools.returns([tool]);
      const run = executeWebMcpTool(args).handler(
        {params: {toolName: 'failing_tool'}, page},
        response,
        context,
      );
      return {page, context, response, args, run};
    }

    it('executes a tool successfully', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const page = context.getSelectedMcpPage();
          const toolsAddedPromise = new Promise(resolve => {
            page.pptrPage.webmcp.once('toolsadded', resolve);
          });
          await setupWebMcpTool(page);

          // Wait for WebMCP tools to be registered and detected by Puppeteer
          await toolsAddedPromise;

          await executeWebMcpTool(args).handler(
            {params: {toolName: 'test_tool', input: JSON.stringify({})}, page},
            response,
            context,
          );
          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify({status: 'Completed', output: 'hello'}, null, 2),
          );
        },
        {args: ['--enable-features=WebMCP,DevToolsWebMCPSupport']},
        {categoryExperimentalWebmcp: true},
      );
    });

    it('throws if tool is not found', async () => {
      await withMcpContext(
        async (response, context, args) => {
          await assert.rejects(
            async () => {
              await executeWebMcpTool(args).handler(
                {
                  params: {toolName: 'missing-tool', input: JSON.stringify({})},
                  page: context.getSelectedMcpPage(),
                },
                response,
                context,
              );
            },
            {message: /Tool missing-tool not found/},
          );
        },
        {args: ['--enable-features=WebMCP,DevToolsWebMCPSupport']},
        {categoryExperimentalWebmcp: true},
      );
    });

    it('looks up tools via page.getWebMcpTools and throws if not returned', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.getWebMcpTools.returns([]);

      await assert.rejects(
        executeWebMcpTool(args).handler(
          {
            params: {toolName: 'debug_tool', input: '{}'},
            page,
          },
          response,
          context,
        ),
        {message: /Tool debug_tool not found/},
      );
      sinon.assert.calledOnceWithExactly(page.getWebMcpTools);
    });

    it('executes a matching tool returned by page.getWebMcpTools', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const tool = createMockWebMCPTool({
        name: 'my_tool',
      });
      tool.execute.resolves({
        id: 'call-1',
        status: 'Completed',
        output: {ok: true},
        errorText: undefined,
      });
      page.getWebMcpTools.returns([tool]);

      await executeWebMcpTool(args).handler(
        {
          params: {toolName: 'my_tool', input: '{"key":"val"}'},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(page.getWebMcpTools);
      sinon.assert.calledOnceWithExactly(tool.execute, {key: 'val'});
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        JSON.stringify(
          {status: 'Completed', output: {ok: true}, errorText: undefined},
          null,
          2,
        ),
      );
    });

    it('surfaces the page exception description', async () => {
      const {response, run} = createFailedToolCall({
        exceptionDescription: 'Error: boom from page',
        errorText: 'A less useful tool error',
      });

      await assert.rejects(run, {message: 'Error: boom from page'});
      sinon.assert.notCalled(response.appendResponseLine);
    });

    it('uses errorText when the exception has no description', async () => {
      const {run} = createFailedToolCall({errorText: 'Tool execution failed'});

      await assert.rejects(run, {message: 'Tool execution failed'});
    });

    it('uses errorText when the exception description is empty', async () => {
      const {run} = createFailedToolCall({
        exceptionDescription: '',
        errorText: 'Tool execution failed',
      });

      await assert.rejects(run, {message: 'Tool execution failed'});
    });

    it('uses a status message when no error text is available', async () => {
      const {run} = createFailedToolCall({});

      await assert.rejects(run, {message: 'Tool execution failed: Error'});
    });

    it('maps a page exception to an MCP tool error', async () => {
      const {page, context, args} = createHandlerMocks({
        categoryExperimentalWebmcp: true,
      });
      const tool = createMockWebMCPTool({name: 'failing_tool'});
      tool.execute.resolves({
        id: 'call-1',
        status: 'Error',
        output: undefined,
        errorText: '',
        exception: {
          type: 'object',
          subtype: 'error',
          className: 'Error',
          description: 'Error: boom from page',
        },
      });
      page.getWebMcpTools.returns([tool]);
      context.browser = createMockPuppeteerBrowser();
      const toolHandler = new ToolHandler(
        executeWebMcpTool(args),
        args,
        async () => context,
        new Mutex(),
        sinon.spy(),
        sinon.spy(),
      );

      const result = await toolHandler.handle({toolName: 'failing_tool'});

      assert.strictEqual(result.isError, true);
      const text = result.content.find(content => content.type === 'text');
      assert.ok(text && text.type === 'text');
      assert.match(text.text, /Error: boom from page/);
    });

    it('rejects JSON array input', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await assert.rejects(
        executeWebMcpTool(args).handler(
          {
            params: {toolName: 'test_tool', input: '[]'},
            page,
          },
          response,
          context,
        ),
        {message: /Parsed input is not an object/},
      );
    });

    it('throws if input is invalid', async () => {
      await withMcpContext(
        async (response, context, args) => {
          await assert.rejects(
            async () => {
              const page = context.getSelectedMcpPage();
              await setupWebMcpTool(page);

              await executeWebMcpTool(args).handler(
                {params: {toolName: 'test_tool', input: 'invalid'}, page},
                response,
                context,
              );
            },
            {
              message:
                /Failed to parse input as JSON: Unexpected token 'i', "invalid" is not valid JSON/,
            },
          );
        },
        {args: ['--enable-features=WebMCP,DevToolsWebMCPSupport']},
        {categoryExperimentalWebmcp: true},
      );
    });
  });
});
