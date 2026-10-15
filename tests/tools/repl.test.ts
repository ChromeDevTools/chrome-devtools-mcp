/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ConfigParser} from '../../src/config/ConfigParser.js';
import {createTools} from '../../src/tools/tools.js';
import {html, withMcpContext} from '../utils.js';

describe('repl', () => {
  describe('createTools', () => {
    it('registers only evaluate_script with exposed tool docs when repl mode is enabled', () => {
      const serverArgs = new ConfigParser(
        '1.0.0',
        ['node', 'script.js', '--repl', '--no-category-emulation'],
        {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
      ).parse();
      const tools = createTools(serverArgs);

      assert.strictEqual(tools.length, 1);
      assert.strictEqual(tools[0]?.name, 'evaluate_script');
      const description = tools[0]?.description ?? '';
      assert.match(description, /interface McpTools \{/);
      assert.match(description, /declare function getEventListeners\(/);
      assert.match(
        description,
        /click\(params: \{\n(?:.*\n)*?\s+uid: string;\n(?:.*\n)*?\s+dblClick\?: boolean;/,
      );
      assert.match(description, /take_snapshot\(params\?: \{/);
      assert.match(description, /\): Promise<ToolResult>;/);
      assert.doesNotMatch(description, /^\s+pageId\??: /m);
      assert.doesNotMatch(description, /\n  evaluate_script\(/);
      assert.doesNotMatch(description, /\n  emulate\(/);
    });
  });

  describe('evaluate_script', () => {
    it('exposes MCP tools via the mcp argument in repl mode and defaults pageId to current page', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const page = context.getSelectedMcpPage().pptrPage;
          await page.setContent(
            html`<button
              id="btn"
              onclick="this.textContent = 'Clicked!'"
            >
              Click me
            </button>`,
          );

          const [replEvaluateTool] = createTools(args);
          if (!replEvaluateTool) {
            assert.fail('evaluate_script tool not created');
          }

          await replEvaluateTool.handler(
            {
              page: context.getSelectedMcpPage(),
              params: {
                function: `async (mcp) => {
                  const snap = await mcp.take_snapshot();
                  const buttonNode = snap.snapshot.children?.find(c => c.role === 'button');
                  await mcp.click({uid: buttonNode.id});
                  const pagesResult = await mcp.list_pages();
                  return {
                    buttonText: document.getElementById('btn')?.textContent,
                    pageCount: pagesResult.pages.length,
                    globalsLeaked: ['click', 'take_snapshot', 'list_pages', 'mcp'].filter(name => name in globalThis),
                  };
                }`,
              },
            },
            response,
            context,
          );

          const lineEvaluation = response.responseLines.at(2) ?? '{}';
          assert.deepStrictEqual(JSON.parse(lineEvaluation), {
            buttonText: 'Clicked!',
            pageCount: 1,
            globalsLeaked: [],
          });

          // Verify subsequent calls on the same page reuse the CDP binding cleanly
          response.resetResponseLineForTesting();
          await replEvaluateTool.handler(
            {
              page: context.getSelectedMcpPage(),
              params: {
                function: `async (mcp) => {
                  const pagesResult = await mcp.list_pages();
                  return pagesResult.pages.length;
                }`,
              },
            },
            response,
            context,
          );
          const secondEvaluation = response.responseLines.at(2) ?? '0';
          assert.strictEqual(JSON.parse(secondEvaluation), 1);
        },
        {},
        {repl: true, pageIdRouting: true},
      );
    });

    it('does not overwrite page globals that share a tool name', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const page = context.getSelectedMcpPage().pptrPage;
          await page.setContent(
            html`<script>
              window.click = () => 'page-owned';
            </script>`,
          );

          const [replEvaluateTool] = createTools(args);
          if (!replEvaluateTool) {
            assert.fail('evaluate_script tool not created');
          }

          await replEvaluateTool.handler(
            {
              page: context.getSelectedMcpPage(),
              params: {
                function: `async (mcp) => ({
                  pageClick: window.click(),
                  mcpClickIsFunction: typeof mcp.click === 'function',
                })`,
              },
            },
            response,
            context,
          );

          const lineEvaluation = response.responseLines.at(2) ?? '{}';
          assert.deepStrictEqual(JSON.parse(lineEvaluation), {
            pageClick: 'page-owned',
            mcpClickIsFunction: true,
          });
        },
        {},
        {repl: true, pageIdRouting: true},
      );
    });

    it('attaches images from inner tool calls to the outer response', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const [replEvaluateTool] = createTools(args);
          if (!replEvaluateTool) {
            assert.fail('evaluate_script tool not created');
          }

          await replEvaluateTool.handler(
            {
              page: context.getSelectedMcpPage(),
              params: {
                function: `async (mcp) => {
                  await mcp.take_screenshot();
                  return 'done';
                }`,
              },
            },
            response,
            context,
          );

          const lineEvaluation = response.responseLines.at(2) ?? '""';
          assert.strictEqual(JSON.parse(lineEvaluation), 'done');
          assert.strictEqual(response.images.length, 1);
          assert.strictEqual(response.images[0]?.mimeType, 'image/png');
          assert.ok(response.images[0]?.data.length > 0);
        },
        {},
        {repl: true, pageIdRouting: true},
      );
    });

    it('keeps the DevTools Console Utilities in scope by name, even after an await', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const page = context.getSelectedMcpPage().pptrPage;
          await page.setContent(
            html`<button
                id="named"
                aria-label="Save"
                >💾</button
              >
              <button id="unnamed"></button>
              <script>
                document
                  .getElementById('named')
                  .addEventListener('click', () => {});
              </script>`,
          );

          const [replEvaluateTool] = createTools(args);
          if (!replEvaluateTool) {
            assert.fail('evaluate_script tool not created');
          }

          await replEvaluateTool.handler(
            {
              page: context.getSelectedMcpPage(),
              params: {
                function: `async (mcp) => {
                  // Utilities must survive the first await.
                  await mcp.list_pages();
                  const named = document.getElementById('named');
                  const unnamed = document.getElementById('unnamed');
                  return {
                    clickListeners: getEventListeners(named).click?.length ?? 0,
                    namedName: getAccessibleName(named),
                    namedRole: getAccessibleRole(named),
                    unnamedName: getAccessibleName(unnamed),
                    xpathCount: $x('//button').length,
                    dollarCount: $$('button').length,
                    globalsLeaked: ['getEventListeners', '$x', 'mcp'].filter(name => name in globalThis),
                  };
                }`,
              },
            },
            response,
            context,
          );

          const lineEvaluation = response.responseLines.at(2) ?? '{}';
          assert.deepStrictEqual(JSON.parse(lineEvaluation), {
            clickListeners: 1,
            namedName: 'Save',
            namedRole: 'button',
            unnamedName: '',
            xpathCount: 2,
            dollarCount: 2,
            globalsLeaked: [],
          });
        },
        {},
        {repl: true, pageIdRouting: true},
      );
    });

    it('propagates MCP tool errors as thrown Errors inside evaluated code in repl mode', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const [replEvaluateTool] = createTools(args);
          if (!replEvaluateTool) {
            assert.fail('evaluate_script tool not created');
          }

          await replEvaluateTool.handler(
            {
              page: context.getSelectedMcpPage(),
              params: {
                function: `async (mcp) => {
                  try {
                    await mcp.click({});
                    return 'should-not-succeed';
                  } catch (err) {
                    return err instanceof Error ? err.message : String(err);
                  }
                }`,
              },
            },
            response,
            context,
          );

          const lineEvaluation = response.responseLines.at(2) ?? '""';
          const errorMsg = JSON.parse(lineEvaluation);
          assert.match(String(errorMsg), /Invalid input/);
        },
        {},
        {repl: true, pageIdRouting: true},
      );
    });
  });
});
