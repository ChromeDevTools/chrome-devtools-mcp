/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import type {McpPage} from '../../src/McpPage.js';
import {listPages, navigatePage, selectPage} from '../../src/tools/pages.js';
import {executeWebMcpTool} from '../../src/tools/webmcp.js';
import {createHandlerMocks, createMockMcpPage} from '../mocks.js';
import {html, withMcpContext} from '../utils.js';

describe('webmcp', () => {
  afterEach(() => {
    sinon.restore();
  });

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

      sinon.assert.called(response.setListWebMcpTools);
    });

    it('list webmcp tools in list_pages response', async () => {
      const {context, response, args} = createHandlerMocks();

      await listPages(args).handler({params: {}}, response, context);

      sinon.assert.called(response.setListWebMcpTools);
    });

    it('list webmcp tools in select_page response', async () => {
      const {context, response, args} = createHandlerMocks();
      const mockPage = createMockMcpPage();
      mockPage.init.resolves();
      context.getPageById.returns(mockPage);

      await selectPage(args).handler({params: {pageId: 1}}, response, context);

      sinon.assert.called(response.setListWebMcpTools);
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
