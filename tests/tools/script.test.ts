/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

import {evaluateScript} from '../../src/tools/script.js';
import {html, withBrowser} from '../utils.js';

describe('script', () => {
  describe('browser_evaluate_script', () => {
    it('evaluates', async () => {
      await withBrowser(async (response, context) => {
        await evaluateScript.handler(
          {params: {function: String(() => 2 * 5)}},
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 10);
      });
    });
    it('runs in selected page', async () => {
      await withBrowser(async (response, context) => {
        await evaluateScript.handler(
          {params: {function: String(() => document.title)}},
          response,
          context,
        );

        let lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), '');

        const page = await context.newPage();
        await page.setContent(`
          <head>
            <title>New Page</title>
          </head>
        `);

        response.resetResponseLineForTesting();
        await evaluateScript.handler(
          {params: {function: String(() => document.title)}},
          response,
          context,
        );

        lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 'New Page');
      });
    });

    it('work for complex objects', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();

        await page.setContent(html`<script src="./scripts.js"></script> `);

        await evaluateScript.handler(
          {
            params: {
              function: String(() => {
                const scripts = Array.from(
                  document.head.querySelectorAll('script'),
                ).map(s => ({src: s.src, async: s.async, defer: s.defer}));

                return {scripts};
              }),
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.deepEqual(JSON.parse(lineEvaluation), {
          scripts: [],
        });
      });
    });

    it('work for async functions', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();

        await page.setContent(html`<script src="./scripts.js"></script> `);

        await evaluateScript.handler(
          {
            params: {
              function: String(async () => {
                await new Promise(res => setTimeout(res, 0));
                return 'Works';
              }),
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 'Works');
      });
    });

    it('work with one argument', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();

        await page.setContent(html`<button id="test">test</button>`);

        await context.createTextSnapshot();

        await evaluateScript.handler(
          {
            params: {
              function: String(async (el: Element) => {
                return el.id;
              }),
              args: [{uid: '1_1'}],
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 'test');
      });
    });

    it('work with multiple args', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();

        await page.setContent(html`<button id="test">test</button>`);

        await context.createTextSnapshot();

        await evaluateScript.handler(
          {
            params: {
              function: String((container: Element, child: Element) => {
                return container.contains(child);
              }),
              args: [{uid: '1_0'}, {uid: '1_1'}],
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), true);
      });
    });

    it('saves result to file when filePath is provided', async () => {
      const testFilePath = path.join(process.cwd(), 'test-script-result.json');

      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(html`<div id="data">{"key":"value"}</div>`);

        await evaluateScript.handler(
          {
            params: {
              function: String(() => ({result: 'test', number: 42})),
              filePath: testFilePath,
            },
          },
          response,
          context,
        );

        assert.strictEqual(
          response.responseLines[0],
          `Saved script result to ${testFilePath}.`,
        );
        assert.strictEqual(response.responseLines.length, 1);

        // Verify file was created and contains expected JSON
        const fileContent = await fs.readFile(testFilePath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        assert.deepEqual(parsed, {result: 'test', number: 42});
      });

      await fs.unlink(testFilePath);
    });
  });
});
