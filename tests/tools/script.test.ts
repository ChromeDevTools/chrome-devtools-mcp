/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/cli.js';
import {installExtension} from '../../src/tools/extensions.js';
import {evaluateScript} from '../../src/tools/script.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

import {extractId} from './extensions.test.js';

const EXTENSION_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension-sw',
);

describe('script', () => {
  const server = serverHooks();

  describe('browser_evaluate_script', () => {
    it('evaluates', async () => {
      await withMcpContext(async (response, context) => {
        await evaluateScript().handler(
          {
            params: {function: String(() => 2 * 5)},
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 10);
      });
    });
    it('runs in selected page', async () => {
      await withMcpContext(async (response, context) => {
        await evaluateScript().handler(
          {
            params: {function: String(() => document.title)},
          },
          response,
          context,
        );

        let lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), '');

        const page = await context.newPage();
        await page.pptrPage.setContent(`
          <head>
            <title>New Page</title>
          </head>
        `);

        response.resetResponseLineForTesting();
        await evaluateScript().handler(
          {
            params: {function: String(() => document.title)},
          },
          response,
          context,
        );

        lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 'New Page');
      });
    });

    it('work for complex objects', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();

        await page.setContent(html`<script src="./scripts.js"></script> `);

        await evaluateScript().handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();

        await page.setContent(html`<script src="./scripts.js"></script> `);

        await evaluateScript().handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();

        await page.setContent(html`<button id="test">test</button>`);

        await context.createTextSnapshot(context.getSelectedMcpPage());

        await evaluateScript().handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();

        await page.setContent(html`<button id="test">test</button>`);

        await context.createTextSnapshot(context.getSelectedMcpPage());

        await evaluateScript().handler(
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

    it('work for elements inside iframes', async () => {
      server.addHtmlRoute(
        '/iframe',
        html`<main><button>I am iframe button</button></main>`,
      );
      server.addHtmlRoute('/main', html`<iframe src="/iframe"></iframe>`);

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.goto(server.getRoute('/main'));
        await context.createTextSnapshot(context.getSelectedMcpPage());
        await evaluateScript().handler(
          {
            params: {
              function: String((element: Element) => {
                return element.textContent;
              }),
              args: [{uid: '1_3'}],
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 'I am iframe button');
      });
    });
    it('evaluates inside extension service worker', async () => {
      await withMcpContext(
        async (response, context) => {
          await installExtension.handler(
            {params: {path: EXTENSION_PATH}},
            response,
            context,
          );

          const extensionId = extractId(response);
          const swTarget = await context.browser.waitForTarget(
            t => t.type() === 'service_worker' && t.url().includes(extensionId),
          );

          await context.createExtensionServiceWorkersSnapshot();
          const swList = context.getExtensionServiceWorkers();
          const sw = swList.find(s => s.target === swTarget);

          if (!sw) {
            assert.fail('Service worker not found in context list');
          }

          const swId = context.getExtensionServiceWorkerId(sw);

          response.resetResponseLineForTesting();
          await evaluateScript({
            categoryExtensions: true,
          } as ParsedArguments).handler(
            {
              params: {
                function: String(() => {
                  return 'chrome' in globalThis ? 'has-chrome' : 'no-chrome';
                }),
                serviceWorkerId: swId,
              },
            },
            response,
            context,
          );

          const lineEvaluation = response.responseLines.at(2)!;
          assert.strictEqual(JSON.parse(lineEvaluation), 'has-chrome');
        },
        {},
        {categoryExtensions: true} as ParsedArguments,
      );
    });

    it('throws error when both pageId and serviceWorkerId are provided', async () => {
      await withMcpContext(
        async (response, context) => {
          await assert.rejects(
            evaluateScript({
              categoryExtensions: true,
            } as ParsedArguments).handler(
              {
                params: {
                  function: String(() => 'test'),
                  serviceWorkerId: 'example_service_worker',
                  pageId: '1',
                },
              },
              response,
              context,
            ),
            {
              message: 'specify either a pageId or a serviceWorkerId.',
            },
          );
        },
        {},
        {categoryExtensions: true} as ParsedArguments,
      );
    });

    it('throws error when args are provided with serviceWorkerId', async () => {
      await withMcpContext(
        async (response, context) => {
          await assert.rejects(
            evaluateScript({
              categoryExtensions: true,
            } as ParsedArguments).handler(
              {
                params: {
                  function: String(() => 'test'),
                  serviceWorkerId: 'example_service_worker',
                  args: [{uid: '1_1'}],
                },
              },
              response,
              context,
            ),
            {
              message:
                'args (element uids) cannot be used when evaluating in a service worker.',
            },
          );
        },
        {},
        {categoryExtensions: true} as ParsedArguments,
      );
    });
  });
});
