/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {McpPage} from '../../src/McpPage.js';
import {listPages, navigatePage, selectPage} from '../../src/tools/pages.js';
import {executeWebMcpTool} from '../../src/tools/webmcp.js';
import {createHandlerMocks, createMockWebMCPTool} from '../mocks.js';
import {html, withMcpContext} from '../utils.js';

describe('webmcp', () => {
  describe('list_webmcp_tools', () => {
    it('list webmcp tools in navigate_page response', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.pptrPage.goto.resolves(null);

      await navigatePage(args).handler(
        {
          params: {url: 'data:text/html,<html></html>'},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(response.setListWebMcpTools);
    });

    it('list webmcp tools in list_pages response', async () => {
      const {context, response, args} = createHandlerMocks();

      await listPages(args).handler({params: {}}, response, context);

      sinon.assert.calledOnceWithExactly(response.setListWebMcpTools);
    });

    it('list webmcp tools in select_page response', async () => {
      const {context, response, args, page} = createHandlerMocks();
      context.getPageById.returns(page);

      await selectPage(args).handler({params: {pageId: 1}}, response, context);

      sinon.assert.calledOnceWithExactly(response.setListWebMcpTools);
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
          {status: 'Completed', output: {ok: true}, error: undefined},
          null,
          2,
        ),
      );
    });

    it('reports the exception description as error when the tool throws', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const tool = createMockWebMCPTool({
        name: 'my_tool',
      });
      tool.execute.resolves({
        id: 'call-1',
        status: 'Error',
        exception: {
          type: 'object',
          subtype: 'error',
          className: 'Error',
          description: 'Error: boom\n    at foo (app.js:1:1)',
          objectId: '1',
        },
      });
      page.getWebMcpTools.returns([tool]);

      await executeWebMcpTool(args).handler(
        {
          params: {toolName: 'my_tool'},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(tool.execute, {});
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        JSON.stringify(
          {status: 'Error', error: 'Error: boom\n    at foo (app.js:1:1)'},
          null,
          2,
        ),
      );
    });

    it('reports errorText as error when there is no exception', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const tool = createMockWebMCPTool({
        name: 'my_tool',
      });
      tool.execute.resolves({
        id: 'call-1',
        status: 'Error',
        errorText: 'Invalid input arguments',
      });
      page.getWebMcpTools.returns([tool]);

      await executeWebMcpTool(args).handler(
        {
          params: {toolName: 'my_tool'},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(tool.execute, {});
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        JSON.stringify(
          {status: 'Error', error: 'Invalid input arguments'},
          null,
          2,
        ),
      );
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
