/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {TextSnapshot} from '../../src/TextSnapshot.js';
import type {Page} from '../../src/third_party/index.js';
import {installExtension} from '../../src/tools/extensions.js';
import {evaluateScript, listDedicatedWorkers} from '../../src/tools/script.js';
import {serverHooks} from '../server.js';
import {
  assertNoServiceWorkerReported,
  extractExtensionId,
  html,
  withMcpContext,
} from '../utils.js';

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
        const page = context.getSelectedMcpPage().pptrPage;

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

    it('work for scripts that trigger dialogs', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;

        await page.setContent(html`<button id="test">test</button>`);

        await evaluateScript().handler(
          {
            params: {
              function: String(() => {
                alert('hello');
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

    it('work for scripts that trigger dialogs and dismiss them', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;

        await page.setContent(html`<button id="test">test</button>`);

        await evaluateScript().handler(
          {
            params: {
              function: String(() => {
                return confirm('hello');
              }),
              dialogAction: 'dismiss',
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), false);
      });
    });

    it('work for scripts that trigger prompts and fill them', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;

        await page.setContent(html`<button id="test">test</button>`);

        await evaluateScript().handler(
          {
            params: {
              function: String(() => {
                return prompt('Enter your name:');
              }),
              dialogAction: 'John Doe',
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 'John Doe');
      });
    });

    it('work for async functions', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;

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
        const page = context.getSelectedMcpPage().pptrPage;

        await page.setContent(html`<button id="test">test</button>`);

        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );

        await evaluateScript().handler(
          {
            params: {
              function: String(async (el: Element) => {
                return el.id;
              }),
              args: ['1_1'],
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
        const page = context.getSelectedMcpPage().pptrPage;

        await page.setContent(html`<button id="test">test</button>`);

        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );

        await evaluateScript().handler(
          {
            params: {
              function: String((container: Element, child: Element) => {
                return container.contains(child);
              }),
              args: ['1_0', '1_1'],
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
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/main'));
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await evaluateScript().handler(
          {
            params: {
              function: String((element: Element) => {
                return element.textContent;
              }),
              args: ['1_3'],
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2)!;
        assert.strictEqual(JSON.parse(lineEvaluation), 'I am iframe button');
      });
    });
    it('saves output to file when filePath is provided', async () => {
      const {rm, readFile} = await import('node:fs/promises');
      const {tmpdir} = await import('node:os');
      const {join} = await import('node:path');
      const filePath = join(tmpdir(), 'test-evaluate-script-output.json');
      try {
        await withMcpContext(async (response, context) => {
          await evaluateScript().handler(
            {
              params: {
                function: String(() => ({hello: 'world'})),
                filePath,
              },
            },
            response,
            context,
          );
          assert.strictEqual(response.responseLines.length, 1);
          assert.ok(
            response.responseLines[0]?.includes('Output saved to'),
            `Expected "Output saved to" but got: ${response.responseLines[0]}`,
          );
        });
        const content = await readFile(filePath, 'utf-8');
        assert.deepStrictEqual(JSON.parse(content), {hello: 'world'});
      } finally {
        await rm(filePath, {force: true});
      }
    });
    it('evaluates inside extension service worker', async () => {
      await withMcpContext(
        async (response, context) => {
          await installExtension.handler(
            {params: {path: EXTENSION_PATH}},
            response,
            context,
          );

          const extensionId = extractExtensionId(response);
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

          await context.triggerExtensionAction(extensionId);

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
          await context.uninstallExtension(extensionId);
          const targets = context.browser.targets();
          assertNoServiceWorkerReported(targets, extensionId);
        },
        {},
        {categoryExtensions: true},
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
        {categoryExtensions: true},
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
                  args: ['1_1'],
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
        {categoryExtensions: true},
      );
    });

    it('evaluates inside a dedicated worker', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = context.getSelectedMcpPage().pptrPage;
          await spawnDedicatedWorker(page);

          const workers = context.createDedicatedWorkersSnapshot();
          assert.strictEqual(workers.length, 1);
          const workerId = context.getDedicatedWorkerId(workers[0]!);

          await evaluateScript({
            experimentalWorkers: true,
          } as ParsedArguments).handler(
            {
              params: {
                function: String(() => self.constructor.name),
                workerId,
              },
            },
            response,
            context,
          );

          const lineEvaluation = response.responseLines.at(2)!;
          assert.strictEqual(
            JSON.parse(lineEvaluation),
            'DedicatedWorkerGlobalScope',
          );
        },
        {},
        {experimentalWorkers: true},
      );
    });

    it('throws error when both pageId and workerId are provided', async () => {
      await withMcpContext(
        async (response, context) => {
          await assert.rejects(
            evaluateScript({
              experimentalWorkers: true,
            } as ParsedArguments).handler(
              {
                params: {
                  function: String(() => 'test'),
                  workerId: 'worker-1',
                  pageId: '1',
                },
              },
              response,
              context,
            ),
            {
              message: 'specify either a pageId or a workerId.',
            },
          );
        },
        {},
        {experimentalWorkers: true},
      );
    });

    it('throws error when args are provided with workerId', async () => {
      await withMcpContext(
        async (response, context) => {
          await assert.rejects(
            evaluateScript({
              experimentalWorkers: true,
            } as ParsedArguments).handler(
              {
                params: {
                  function: String(() => 'test'),
                  workerId: 'worker-1',
                  args: ['1_1'],
                },
              },
              response,
              context,
            ),
            {
              message:
                'args (element uids) cannot be used when evaluating in a worker.',
            },
          );
        },
        {},
        {experimentalWorkers: true},
      );
    });
  });

  describe('list_dedicated_workers', () => {
    it('lists dedicated workers of the selected page', async () => {
      await withMcpContext(
        async (response, context) => {
          const page = context.getSelectedMcpPage().pptrPage;
          await spawnDedicatedWorker(page);

          await listDedicatedWorkers.handler({params: {}}, response, context);

          assert.strictEqual(
            response.responseLines.at(0),
            '## Dedicated Workers',
          );
          assert.match(response.responseLines.at(1)!, /^worker-\d+: blob:/);
        },
        {},
        {experimentalWorkers: true},
      );
    });

    it('reports when there are no dedicated workers', async () => {
      await withMcpContext(
        async (response, context) => {
          await listDedicatedWorkers.handler({params: {}}, response, context);

          assert.strictEqual(
            response.responseLines.at(0),
            'No dedicated workers found in the selected page.',
          );
        },
        {},
        {experimentalWorkers: true},
      );
    });
  });
});

/**
 * Spawns a dedicated worker in the page and resolves once Puppeteer has
 * attached to it.
 */
async function spawnDedicatedWorker(page: Page): Promise<void> {
  const workerAttached = new Promise<void>(resolve => {
    page.once('workercreated', () => resolve());
  });
  await page.evaluate(() => {
    const blob = new Blob(['self.onmessage = () => {};'], {
      type: 'application/javascript',
    });
    // Keep a reference so the worker is not garbage collected.
    (globalThis as unknown as {__worker?: Worker}).__worker = new Worker(
      URL.createObjectURL(blob),
    );
  });
  await workerAttached;
}
