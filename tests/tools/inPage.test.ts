/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import type {ToolGroup, ToolDefinition} from '../../src/tools/inPage.js';
import {listInPageTools} from '../../src/tools/inPage.js';
import {withMcpContext} from '../utils.js';

describe('inPage', () => {
  describe('list_in_page_tools', () => {
    it('lists tools', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();

          await page.pptrPage.evaluate(() => {
            window.__dtmcp = {
              toolGroup: {
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
              },
            };
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(window.__dtmcp?.toolGroup);
            });
          });

          await listInPageTools.handler({params: {}, page}, response, context);

          const result = await response.handle('list_in_page_tools', context);
          // @ts-expect-error `structuredContent` has `inPageTools`
          const actualGroup = result.structuredContent.inPageTools;
          assert.strictEqual(actualGroup.name, 'test-group');
          assert.strictEqual(actualGroup.description, 'test description');
          assert.strictEqual(actualGroup.tools.length, 1);
          assert.strictEqual(actualGroup.tools[0].name, 'test-tool');
          assert.strictEqual(
            actualGroup.tools[0].description,
            'test tool description',
          );
          assert.deepEqual(actualGroup.tools[0].inputSchema, {
            type: 'object',
            properties: {
              arg: {type: 'string'},
            },
          });
        },
        undefined,
        {categoryInPageTools: true} as ParsedArguments,
      );
    });

    it('handles empty response', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          await page.pptrPage.evaluate(() => {
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith({});
            });
          });

          await listInPageTools.handler({params: {}, page}, response, context);

          const result = await response.handle('list_in_page_tools', context);
          assert.ok('inPageTools' in result.structuredContent);
          assert.deepEqual(
            (
              result.structuredContent as {
                inPageTools: ToolGroup<ToolDefinition>;
              }
            ).inPageTools,
            {},
          );
        },
        undefined,
        {categoryInPageTools: true} as ParsedArguments,
      );
    });

    it('handles no response', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          await page.pptrPage.evaluate(() => {
            window.addEventListener('devtoolstooldiscovery', () => {
              // do nothing
            });
          });

          await listInPageTools.handler({params: {}, page}, response, context);

          const result = await response.handle('list_in_page_tools', context);
          assert.ok('inPageTools' in result.structuredContent);
          assert.strictEqual(
            (
              result.structuredContent as {
                inPageTools: ToolGroup<ToolDefinition>;
              }
            ).inPageTools,
            undefined,
          );
        },
        undefined,
        {categoryInPageTools: true} as ParsedArguments,
      );
    });

    it('handles no eventListener', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
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
