/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {createTools} from '../../src/tools/tools.js';
import {html, withMcpContext} from '../utils.js';

describe('repl', () => {
  describe('evaluate_script', () => {
    it('exposes MCP tools as global functions in repl mode and defaults pageId to current page', async () => {
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
                function: `async () => {
                  const snap = await take_snapshot();
                  const buttonNode = snap.snapshot.children?.find(c => c.role === 'button');
                  await click({uid: buttonNode.id});
                  const pagesResult = await list_pages();
                  return {
                    buttonText: document.getElementById('btn')?.textContent,
                    pageCount: pagesResult.pages.length,
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
          });

          // Verify subsequent calls on the same page reuse the CDP binding cleanly
          response.resetResponseLineForTesting();
          await replEvaluateTool.handler(
            {
              page: context.getSelectedMcpPage(),
              params: {
                function: `async () => {
                  const pagesResult = await list_pages();
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
                function: `async () => {
                  try {
                    await click({});
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
