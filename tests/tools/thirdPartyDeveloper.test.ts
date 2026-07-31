/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {McpContext} from '../../src/McpContext.js';
import type {McpPage} from '../../src/McpPage.js';
import type {McpResponse} from '../../src/McpResponse.js';
import {TextSnapshot} from '../../src/TextSnapshot.js';
import {
  executeThirdPartyDeveloperTool,
  listThirdPartyDeveloperTools,
} from '../../src/tools/thirdPartyDeveloper.js';
import type {ToolGroups} from '../../src/tools/thirdPartyDeveloper.js';
import {withMcpContext} from '../utils.js';

function parseUidResult(responseLine: string): string {
  const result: unknown = JSON.parse(responseLine);
  assert.ok(
    result !== null &&
      typeof result === 'object' &&
      'uid' in result &&
      typeof result.uid === 'string',
  );
  return result.uid;
}

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

          const result = await response.handle(context);
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

          const result = await response.handle(context);
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

          const result = await response.handle(context);
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

          const result = await response.handle(context);
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

          const result = await response.handle(context);
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
          await response.handle(context);

          let groupsLength = await page.pptrPage.evaluate(
            () => window.__dtmcp?.toolGroups?.length,
          );
          assert.strictEqual(groupsLength, 1);

          await listThirdPartyDeveloperTools.handler(
            {params: {}, page},
            response,
            context,
          );
          await response.handle(context);

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
      await response.handle(context);
    }

    async function setupDirectThirdPartyDeveloperTool(
      response: McpResponse,
      context: McpContext,
      evaluateFn: () => void,
    ) {
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
      await page.pptrPage.evaluate(evaluateFn);
      return page;
    }

    async function executeTestTool(
      page: McpPage,
      response: McpResponse,
      context: McpContext,
    ): Promise<void> {
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
    }

    function pauseSnapshotCreation() {
      const snapshotStarted = Promise.withResolvers<void>();
      const continueSnapshot = Promise.withResolvers<void>();
      const createSnapshot = TextSnapshot.create;
      const snapshotStub = sinon
        .stub(TextSnapshot, 'create')
        .callsFake(async (mcpPage, options) => {
          snapshotStarted.resolve();
          await continueSnapshot.promise;
          return await createSnapshot(mcpPage, options);
        });

      return {
        started: snapshotStarted.promise,
        resume: () => {
          continueSnapshot.resolve();
        },
        restore: () => {
          snapshotStub.restore();
        },
      };
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
        await assert.rejects(
          handle.evaluate(element => element.id),
          /disposed/,
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

    it('clears stashed elements when serializing a tool result fails', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await setupDirectThirdPartyDeveloperTool(
            response,
            context,
            () => {
              window.__dtmcp = {
                executeTool: async () => [
                  document.createElement('div'),
                  new Proxy(
                    {},
                    {
                      getPrototypeOf: () => {
                        throw new Error('Failed to serialize tool result');
                      },
                    },
                  ),
                ],
              };
            },
          );

          await assert.rejects(
            executeTestTool(page, response, context),
            /Failed to serialize tool result/,
          );

          assert.strictEqual(
            await page.pptrPage.evaluate(
              () => window.__dtmcp?.stashedElements?.length,
            ),
            0,
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('preserves handle extraction errors when stash cleanup fails', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await setupDirectThirdPartyDeveloperTool(
            response,
            context,
            () => {
              window.__dtmcp = {
                executeTool: async () => document.createElement('div'),
              };
            },
          );
          const evaluateHandleStub = sinon
            .stub(page.pptrPage, 'evaluateHandle')
            .callsFake(async () => {
              await page.pptrPage.close();
              throw new Error('Primary handle extraction failed');
            });

          try {
            await assert.rejects(
              executeTestTool(page, response, context),
              /Primary handle extraction failed/,
            );
          } finally {
            evaluateHandleStub.restore();
          }
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('keeps stashed element UIDs reusable', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await setupDirectThirdPartyDeveloperTool(
            response,
            context,
            () => {
              window.__dtmcp = {
                executeTool: async () => {
                  const div = document.createElement('div');
                  div.id = 'test-element';
                  return div;
                },
              };
            },
          );

          await executeTestTool(page, response, context);

          const uid = parseUidResult(response.responseLines[0]);

          {
            using firstHandle = await page.getElementByUid(uid);
            assert.strictEqual(
              await firstHandle.evaluate(element => element.id),
              'test-element',
            );
          }
          {
            using secondHandle = await page.getElementByUid(uid);
            assert.strictEqual(
              await secondHandle.evaluate(element => element.id),
              'test-element',
            );
          }
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('disposes stashed element handles when replaced and on teardown', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await setupDirectThirdPartyDeveloperTool(
            response,
            context,
            () => {
              let elementCounter = 0;
              window.__dtmcp = {
                executeTool: async () => {
                  const div = document.createElement('div');
                  div.id = `test-element-${elementCounter++}`;
                  return div;
                },
              };
            },
          );

          await executeTestTool(page, response, context);
          const originalUid = parseUidResult(response.responseLines[0]);
          const originalHandle = page.extraHandles[0];
          assert.ok(originalHandle);
          assert.strictEqual(
            await originalHandle.evaluate(element => element.id),
            'test-element-0',
          );
          assert.strictEqual(
            await page.pptrPage.evaluate(
              () => window.__dtmcp?.stashedElements?.length,
            ),
            0,
          );

          await executeTestTool(page, response, context);
          await assert.rejects(
            originalHandle.evaluate(element => element.id),
            /disposed/,
          );
          assert.strictEqual(page.extraHandles.length, 1);
          await assert.rejects(async () => {
            using oldHandle = await page.getElementByUid(originalUid);
            await oldHandle.evaluate(element => element.id);
          }, /not found/);

          const currentHandle = page.extraHandles.at(-1);
          assert.ok(currentHandle);
          assert.strictEqual(
            await currentHandle.evaluate(element => element.id),
            'test-element-1',
          );

          const currentSnapshot = page.textSnapshot;
          await page.pptrPage.evaluate(() => {
            if (window.__dtmcp) {
              window.__dtmcp.executeTool = async () => 'simple-result';
            }
          });
          await executeTestTool(page, response, context);
          assert.strictEqual(page.textSnapshot, currentSnapshot);
          assert.strictEqual(
            response.responseLines.at(-1),
            JSON.stringify('simple-result', null, 2),
          );

          context.dispose();
          await assert.rejects(
            currentHandle.evaluate(element => element.id),
            /disposed/,
          );
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('releases stashed element handles after main frame navigation', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await setupDirectThirdPartyDeveloperTool(
            response,
            context,
            () => {
              window.__dtmcp = {
                executeTool: async () => {
                  const div = document.createElement('div');
                  div.id = 'test-element';
                  return div;
                },
              };
            },
          );

          await executeTestTool(page, response, context);

          const uid = parseUidResult(response.responseLines[0]);
          const retainedHandle = page.extraHandles[0];
          assert.ok(retainedHandle);

          await page.pptrPage.goto(
            'data:text/html,<main>Navigated page</main>',
          );

          assert.deepStrictEqual(page.extraHandles, []);
          await assert.rejects(
            retainedHandle.evaluate(element => element.id),
            /disposed/,
          );

          page.textSnapshot = await TextSnapshot.create(page);
          await assert.rejects(async () => {
            using oldHandle = await page.getElementByUid(uid);
            await oldHandle.evaluate(element => element.id);
          }, /not found/);
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('does not retain stashed handles if navigation occurs during snapshot creation', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await setupDirectThirdPartyDeveloperTool(
            response,
            context,
            () => {
              window.__dtmcp = {
                executeTool: async () => document.createElement('div'),
              };
            },
          );
          const pausedSnapshot = pauseSnapshotCreation();

          try {
            const execution = executeTestTool(page, response, context);
            await pausedSnapshot.started;

            await Promise.all([
              page.pptrPage.waitForNavigation({timeout: 5_000}),
              page.pptrPage.evaluate(() => {
                window.location.hash = 'navigation-during-snapshot';
              }),
            ]);
            pausedSnapshot.resume();

            await assert.rejects(execution, /changed/);
            assert.deepStrictEqual(page.extraHandles, []);
          } finally {
            pausedSnapshot.resume();
            pausedSnapshot.restore();
            page.dispose();
          }
        },
        undefined,
        {categoryExperimentalThirdParty: true},
      );
    });

    it('does not retain stashed handles after page teardown', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = await setupDirectThirdPartyDeveloperTool(
            response,
            context,
            () => {
              window.__dtmcp = {
                executeTool: async () => document.createElement('div'),
              };
            },
          );

          const pausedSnapshot = pauseSnapshotCreation();
          const evaluateHandleSpy = sinon.spy(page.pptrPage, 'evaluateHandle');

          try {
            const execution = executeTestTool(page, response, context);

            await pausedSnapshot.started;
            const pendingHandle = await evaluateHandleSpy.firstCall.returnValue;
            context.dispose();
            pausedSnapshot.resume();

            await assert.rejects(execution, /disposed/);
            assert.deepStrictEqual(page.extraHandles, []);
            await assert.rejects(
              pendingHandle.evaluate(element => element),
              /disposed/,
            );
          } finally {
            pausedSnapshot.resume();
            pausedSnapshot.restore();
            evaluateHandleSpy.restore();
            page.dispose();
          }
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

          assert.ok(parseUidResult(response.responseLines[0]));
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
