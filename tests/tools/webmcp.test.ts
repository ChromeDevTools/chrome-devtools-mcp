/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {listWebMcpTools} from '../../src/tools/webmcp.js';
import {getTextContent, withMcpContext} from '../utils.js';

describe('webmcp', () => {
  it('list webmcp tools', async () => {
    await withMcpContext(
      async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        // @ts-expect-error internal API
        const client = page._client();

        client.emit('WebMCP.toolsAdded', {
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              inputSchema: {type: 'object'},
              frameId: '1',
            },
          ],
        });

        await listWebMcpTools.handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        const formattedResponse = await response.handle('test', context);
        const textContent = getTextContent(formattedResponse.content[0]);
        assert.match(textContent, /name="test_tool", description="A test tool"/);
      },
      {},
      {experimentalWebmcp: true} as ParsedArguments,
    );
  });

  it('does not list webmcp tools if not enabled', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      // @ts-expect-error internal API
      const client = page._client();

      client.emit('WebMCP.toolsAdded', {
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            inputSchema: {type: 'object'},
            frameId: '1',
          },
        ],
      });

      await listWebMcpTools.handler(
        {params: {}, page: context.getSelectedMcpPage()},
        response,
        context,
      );

      const formattedResponse = await response.handle('test', context);
      const textContent = getTextContent(formattedResponse.content[0]);
      assert.ok(!textContent.includes('name="test_tool"'));
    }, {});
  });
});
