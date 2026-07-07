/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {McpContext} from '../../src/McpContext.js';
import type {McpResponse} from '../../src/McpResponse.js';
import {TextSnapshot} from '../../src/TextSnapshot.js';
import {
  executeThirdPartyDeveloperTool,
  listThirdPartyDeveloperTools,
} from '../../src/tools/thirdPartyDeveloper.js';
import type {ToolGroups} from '../../src/tools/thirdPartyDeveloper.js';
import {withMcpContext} from '../utils.js';

describe('thirdPartyDeveloperTools', () => {
  describe('list_3p_developer_tools', () => {
    it('lists tools', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);

          await page.pptrPage.evaluate(() => {
            const mockToolGroup = {
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
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(mockToolGroup);
            });
          });

          await listThirdPartyDeveloperTools.handler(
            {params: {}, page},
            response,
            context,
          );

          const result = await response.handle(
            'list_3p_developer_tools',
            context,
          );
          // @ts-expect-error `structuredContent` has `thirdPartyDeveloperTools`
          const groups = result.structuredContent.thirdPartyDeveloperTools;
          assert.strictEqual(groups.length, 1);
          const actualGroup = groups[0];
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
        {categoryExperimentalThirdParty: true},
      );
    });

    it('handles empty response', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);
          await page.pptrPage.evaluate(() => {
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith({});
            });
          });

          await listThirdPartyDeveloperTools.handler(
            {params: {}, page},
            response,
            context,
          );

          const result = await response.handle(
            'list_3p_developer_tools',
            context,
          );
          assert.ok(result.structuredContent);
          assert.deepStrictEqual(
            (
              result.structuredContent as {
                thirdPartyDeveloperTools?: ToolGroups;
              }
            ).thirdPartyDeveloperTools,
            undefined,
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('handles no response', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);
          await page.pptrPage.evaluate(() => {
            window.addEventListener('devtoolstooldiscovery', () => {
              // do nothing
            });
          });

          await listThirdPartyDeveloperTools.handler(
            {params: {}, page},
            response,
            context,
          );

          const result = await response.handle(
            'list_3p_developer_tools',
            context,
          );
          assert.ok(result.structuredContent);
          assert.deepStrictEqual(
            (
              result.structuredContent as {
                thirdPartyDeveloperTools?: ToolGroups;
              }
            ).thirdPartyDeveloperTools,
            undefined,
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('handles no eventListener', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);
          await listThirdPartyDeveloperTools.handler(
            {params: {}, page},
            response,
            context,
          );

          const result = await response.handle(
            'list_3p_developer_tools',
            context,
          );
          assert.ok(result.structuredContent);
          assert.deepStrictEqual(
            (
              result.structuredContent as {
                thirdPartyDeveloperTools?: ToolGroups;
              }
            ).thirdPartyDeveloperTools,
            undefined,
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('lists multiple toolgroups', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);

          await page.pptrPage.evaluate(() => {
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith?.({
                name: 'group-1',
                description: 'desc-1',
                tools: [
                  {
                    name: 'tool-1',
                    description: 'tool-1-desc',
                    inputSchema: {},
                    execute: () => 'r1',
                  },
                ],
              });
            });
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith?.({
                name: 'group-2',
                description: 'desc-2',
                tools: [
                  {
                    name: 'tool-2',
                    description: 'tool-2-desc',
                    inputSchema: {},
                    execute: () => 'r2',
                  },
                ],
              });
            });
          });

          await listThirdPartyDeveloperTools.handler(
            {params: {}, page},
            response,
            context,
          );

          const result = await response.handle(
            'list_3p_developer_tools',
            context,
          );
          const actualGroups =
            // @ts-expect-error structuredContent has `thirdPartyDeveloperTools`
            result.structuredContent.thirdPartyDeveloperTools;
          assert.ok(actualGroups);
          assert.strictEqual(actualGroups.length, 2);
          assert.strictEqual(actualGroups[0].name, 'group-1');
          assert.strictEqual(actualGroups[1].name, 'group-2');
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('clears window.__dtmcp.toolGroups on subsequent getToolGroups calls', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);

          await page.pptrPage.evaluate(() => {
            const mockToolGroup = {
              name: 'group-1',
              description: 'desc-1',
              tools: [
                {
                  name: 'tool-1',
                  description: 'tool-1-desc',
                  inputSchema: {},
                  execute: () => 'r1',
                },
              ],
            };
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(mockToolGroup);
            });
          });

          await listThirdPartyDeveloperTools.handler(
            {params: {}, page},
            response,
            context,
          );
          await response.handle('list_3p_developer_tools', context);

          let groupsLength = await page.pptrPage.evaluate(
            () => window.__dtmcp?.toolGroups?.length,
          );
          assert.strictEqual(groupsLength, 1);

          await listThirdPartyDeveloperTools.handler(
            {params: {}, page},
            response,
            context,
          );
          await response.handle('list_3p_developer_tools', context);

          groupsLength = await page.pptrPage.evaluate(
            () => window.__dtmcp?.toolGroups?.length,
          );
          assert.strictEqual(groupsLength, 1);
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });
  });

  describe('execute_3p_developer_tool', () => {
    async function setupThirdPartyDeveloperTools(
      response: McpResponse,
      context: McpContext,
      evaluateFn: () => void,
    ) {
      const page = await context.newPage();
      response.setPage(page);
      await page.pptrPage.evaluate(evaluateFn);
      await listThirdPartyDeveloperTools.handler(
        {params: {}, page},
        response,
        context,
      );
      await response.handle('list_3p_developer_tools', context);
    }

    it('executes a tool', async () => {
      await withMcpContext(
        async (response, context) => {
          await setupThirdPartyDeveloperTools(response, context, () => {
            const mockToolGroup = {
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
                    required: ['arg'],
                  },
                  execute: () => 'result',
                },
              ],
            };
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(mockToolGroup);
            });
          });

          await executeThirdPartyDeveloperTool.handler(
            {
              params: {
                toolName: 'test-tool',
                params: JSON.stringify({arg: 'value'}),
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify('result', null, 2),
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('throws if tool not found in list', async () => {
      await withMcpContext(async (response, context) => {
        await setupThirdPartyDeveloperTools(response, context, () => {
          const mockToolGroup = {
            name: 'test-group',
            description: 'test description',
            tools: [],
          };
          window.addEventListener('devtoolstooldiscovery', (e: Event) => {
            // @ts-expect-error Event has `respondWith`
            e.respondWith(mockToolGroup);
          });
        });

        await assert.rejects(
          async () => {
            await executeThirdPartyDeveloperTool.handler(
              {
                params: {
                  toolName: 'missing-tool',
                  params: JSON.stringify({}),
                },
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {message: /Tool missing-tool not found/},
        );
      });
    });

    it('throws if parameters are invalid', async () => {
      await withMcpContext(
        async (response, context) => {
          await setupThirdPartyDeveloperTools(response, context, () => {
            const mockToolGroup = {
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
                    required: ['arg'],
                  },
                  execute: () => 'result',
                },
              ],
            };
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(mockToolGroup);
            });
          });

          await assert.rejects(
            async () => {
              await executeThirdPartyDeveloperTool.handler(
                {
                  params: {
                    toolName: 'test-tool',
                    params: JSON.stringify({}), // Missing required 'arg'
                  },
                  page: context.getSelectedMcpPage(),
                },
                response,
                context,
              );
            },
            {message: /Invalid parameters for tool test-tool/},
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('handles JSON result', async () => {
      await withMcpContext(
        async (response, context) => {
          await setupThirdPartyDeveloperTools(response, context, () => {
            const mockToolGroup = {
              name: 'test-group',
              description: 'test description',
              tools: [
                {
                  name: 'test-tool',
                  description: 'test tool description',
                  inputSchema: {},
                  execute: () => ({foo: 'bar'}),
                },
              ],
            };
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(mockToolGroup);
            });
          });

          await executeThirdPartyDeveloperTool.handler(
            {
              params: {
                toolName: 'test-tool',
                params: JSON.stringify({}),
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify({foo: 'bar'}, null, 2),
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('replaces uid with element handle in params', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        response.setPage(page);

        page.thirdPartyDeveloperTools = [
          {
            name: 'test-group',
            description: 'test description',
            tools: [
              {
                name: 'test-tool',
                description: 'test tool description',
                inputSchema: {
                  type: 'object',
                  properties: {
                    element: {type: 'object'},
                  },
                  required: ['element'],
                },
              },
            ],
          },
        ];

        await page.pptrPage.evaluate(() => {
          window.__dtmcp = {
            executeTool: async (
              _name: string,
              args: Record<string, unknown>,
            ) => {
              const el = args.element;
              if (el instanceof HTMLElement) {
                return {
                  isElement: true,
                  tagName: el.tagName,
                  id: el.id,
                };
              }
              return {
                isElement: false,
                tagName: '',
                id: '',
              };
            },
          };
        });

        await page.pptrPage.evaluate(() => {
          const div = document.createElement('div');
          div.id = 'test-id';
          document.body.appendChild(div);
        });

        const handle = await page.pptrPage.$('#test-id');
        if (!handle) {
          throw new Error('Handle not found');
        }

        page.getElementByUid = async (uid: string) => {
          if (uid === 'some-uid') {
            return handle;
          }
          throw new Error('Not found');
        };

        await executeThirdPartyDeveloperTool.handler(
          {
            params: {
              toolName: 'test-tool',
              params: JSON.stringify({element: {uid: 'some-uid'}}),
            },
            page: page,
          },
          response,
          context,
        );

        assert.strictEqual(
          response.responseLines[0],
          JSON.stringify(
            {
              isElement: true,
              tagName: 'DIV',
              id: 'test-id',
            },
            null,
            2,
          ),
        );
      });
    });

    it('processToolResult replaces functions with "<Function object>"', async () => {
      await withMcpContext(
        async (response, context) => {
          await setupThirdPartyDeveloperTools(response, context, () => {
            const mockToolGroup = {
              name: 'test-group',
              description: 'test description',
              tools: [
                {
                  name: 'test-tool',
                  description: 'test tool description',
                  inputSchema: {},
                  execute: () => ({
                    foo: 'bar',
                    func: () => undefined,
                  }),
                },
              ],
            };
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(mockToolGroup);
            });
          });

          await executeThirdPartyDeveloperTool.handler(
            {
              params: {
                toolName: 'test-tool',
                params: JSON.stringify({}),
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify({foo: 'bar', func: '<Function object>'}, null, 2),
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('processToolResult replaces circular references with "<Circular reference>"', async () => {
      await withMcpContext(
        async (response, context) => {
          await setupThirdPartyDeveloperTools(response, context, () => {
            const mockToolGroup = {
              name: 'test-group',
              description: 'test description',
              tools: [
                {
                  name: 'test-tool',
                  description: 'test tool description',
                  inputSchema: {},
                  execute: () => {
                    const obj: Record<string, unknown> = {foo: 'bar'};
                    obj.self = obj;
                    return obj;
                  },
                },
              ],
            };
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(mockToolGroup);
            });
          });

          await executeThirdPartyDeveloperTool.handler(
            {
              params: {
                toolName: 'test-tool',
                params: JSON.stringify({}),
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify({foo: 'bar', self: '<Circular reference>'}, null, 2),
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('processToolResult replaces non-plain objects with "<ConstructorName instance>"', async () => {
      await withMcpContext(
        async (response, context) => {
          await setupThirdPartyDeveloperTools(response, context, () => {
            class CustomClass {
              val = 'value';
            }
            const mockToolGroup = {
              name: 'test-group',
              description: 'test description',
              tools: [
                {
                  name: 'test-tool',
                  description: 'test tool description',
                  inputSchema: {},
                  execute: () => ({
                    foo: 'bar',
                    custom: new CustomClass(),
                  }),
                },
              ],
            };
            window.addEventListener('devtoolstooldiscovery', (e: Event) => {
              // @ts-expect-error Event has `respondWith`
              e.respondWith(mockToolGroup);
            });
          });

          await executeThirdPartyDeveloperTool.handler(
            {
              params: {
                toolName: 'test-tool',
                params: JSON.stringify({}),
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify(
              {foo: 'bar', custom: '<CustomClass instance>'},
              null,
              2,
            ),
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('stashDOMElement stashes elements and returns UID', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);

          page.thirdPartyDeveloperTools = [
            {
              name: 'test-group',
              description: 'test description',
              tools: [
                {
                  name: 'test-tool',
                  description: 'test tool description',
                  inputSchema: {},
                },
              ],
            },
          ];

          await page.pptrPage.evaluate(() => {
            window.__dtmcp = {
              executeTool: async () => {
                const div = document.createElement('div');
                div.id = 'test-element';
                document.body.appendChild(div);
                return div;
              },
            };
          });

          await executeThirdPartyDeveloperTool.handler(
            {
              params: {
                toolName: 'test-tool',
                params: JSON.stringify({}),
              },
              page: page,
            },
            response,
            context,
          );

          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify({uid: '1_1'}, null, 2),
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('creates a new snapshot if the third-party developer tool response contains a DOM element', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);

          page.thirdPartyDeveloperTools = [
            {
              name: 'test-group',
              description: 'test description',
              tools: [
                {
                  name: 'test-tool',
                  description: 'test tool description',
                  inputSchema: {},
                },
              ],
            },
          ];

          await page.pptrPage.evaluate(() => {
            window.__dtmcp = {
              executeTool: async () => {
                const div = document.createElement('div');
                div.id = 'test-element';
                document.body.appendChild(div);
                return div;
              },
            };
          });

          await executeThirdPartyDeveloperTool.handler(
            {
              params: {
                toolName: 'test-tool',
                params: JSON.stringify({}),
              },
              page: page,
            },
            response,
            context,
          );

          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify({uid: '1_1'}, null, 2),
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('does not create a new snapshot if the third-party developer tool response does not contain a DOM element', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await context.newPage();
          response.setPage(page);

          page.thirdPartyDeveloperTools = [
            {
              name: 'test-group',
              description: 'test description',
              tools: [
                {
                  name: 'test-tool',
                  description: 'test tool description',
                  inputSchema: {},
                },
              ],
            },
          ];

          await page.pptrPage.evaluate(() => {
            window.__dtmcp = {
              executeTool: async () => {
                return 'simple-result';
              },
            };
          });

          const stubSnapshot = sinon
            .stub(TextSnapshot, 'create')
            .resolves({} as TextSnapshot);

          await executeThirdPartyDeveloperTool.handler(
            {
              params: {
                toolName: 'test-tool',
                params: JSON.stringify({}),
              },
              page: page,
            },
            response,
            context,
          );

          assert.ok(
            stubSnapshot.notCalled,
            'Expected TextSnapshot.create not to be called',
          );
          assert.strictEqual(
            response.responseLines[0],
            JSON.stringify('simple-result', null, 2),
          );

          stubSnapshot.restore();
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });
  });
});
