/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import type {ToolGroup} from '../../src/tools/inPage.js';
import {listInPageTools} from '../../src/tools/inPage.js';
import {withMcpContext} from '../utils.js';

describe('inPage', () => {
  describe('list_in_page_tools', () => {
    it('lists tools', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          const toolGroup: ToolGroup = {
            name: 'test-group',
            description: 'test description',
            tools: [
              {
                name: 'test-tool',
                description: 'test tool description',
                inputSchema: {
                  type: 'object',
                  properties: {
                    arg: {type: 'string'},
                  },
                },
                execute: () => 'result',
              },
            ],
          };

          await page.pptrPage.evaluate(() => {
            window.addEventListener('devtoolstooldiscovery', () => {
              // No-op
            });
          });

          const evaluateStub = sinon.stub(page.pptrPage, 'evaluate');
          evaluateStub.resolves(toolGroup);

          await listInPageTools.handler({params: {}, page}, response, context);

          const result = await response.handle('list_in_page_tools', context);
          assert.ok('inPageTools' in result.structuredContent);
          assert.deepEqual(
            (result.structuredContent as {inPageTools: ToolGroup}).inPageTools,
            toolGroup,
          );
        },
        undefined,
        {categoryInPageTools: true} as ParsedArguments,
      );
    });

    it('handles no tools', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          await page.pptrPage.evaluate(() => {
            window.addEventListener('devtoolstooldiscovery', () => {
              // No-op
            });
          });

          const evaluateStub = sinon.stub(page.pptrPage, 'evaluate');
          evaluateStub.resolves(undefined);

          await listInPageTools.handler({params: {}, page}, response, context);

          const result = await response.handle('list_in_page_tools', context);
          assert.ok('inPageTools' in result.structuredContent);
          assert.strictEqual(
            (result.structuredContent as {inPageTools: undefined}).inPageTools,
            undefined,
          );
        },
        undefined,
        {categoryInPageTools: true} as ParsedArguments,
      );
    });
  });
});
