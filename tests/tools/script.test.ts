/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {ParsedArguments} from '../../src/config/mcp-options.js';
import {TextSnapshot} from '../../src/TextSnapshot.js';
import {zod} from '../../src/third_party/index.js';
import {installExtension} from '../../src/tools/extensions.js';
import {evaluateScript} from '../../src/tools/script.js';
import {WaitForHelper} from '../../src/utils/WaitForHelper.js';
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
    it('evaluates an inline classic script', async () => {
      await withMcpContext(async (response, context) => {
        await evaluateScript().handler(
          {
            params: {
              function: 'document.title = "Script title"; document.title',
              format: 'script',
            },
          },
          response,
          context,
        );
        const lineEvaluation = response.responseLines.at(2);
        assert.ok(lineEvaluation);
        assert.strictEqual(JSON.parse(lineEvaluation), 'Script title');
      });
    });
    it('evaluates a function loaded from a local file', async () => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'evaluate-script-function-'),
      );
      const sourcePath = path.join(directory, 'function.js');
      try {
        await fs.writeFile(sourcePath, '() => document.title', 'utf8');
        await withMcpContext(async (response, context) => {
          await context
            .getSelectedMcpPage()
            .pptrPage.setContent('<title>File function</title>');
          await evaluateScript().handler(
            {params: {sourcePath}},
            response,
            context,
          );
          const lineEvaluation = response.responseLines.at(2);
          assert.ok(lineEvaluation);
          assert.strictEqual(JSON.parse(lineEvaluation), 'File function');
        });
      } finally {
        await fs.rm(directory, {recursive: true, force: true});
      }
    });
    it('evaluates a classic script loaded from a local file', async () => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'evaluate-classic-script-'),
      );
      const sourcePath = path.join(directory, 'script.js');
      try {
        await fs.writeFile(
          sourcePath,
          'document.body.dataset.source = "file"; document.body.dataset.source',
          'utf8',
        );
        await withMcpContext(async (response, context) => {
          await evaluateScript().handler(
            {params: {sourcePath, format: 'script'}},
            response,
            context,
          );
          const lineEvaluation = response.responseLines.at(2);
          assert.ok(lineEvaluation);
          assert.strictEqual(JSON.parse(lineEvaluation), 'file');
        });
      } finally {
        await fs.rm(directory, {recursive: true, force: true});
      }
    });
    it('requires exactly one script source', async () => {
      await withMcpContext(async (response, context) => {
        await assert.rejects(
          evaluateScript().handler({params: {}}, response, context),
          /Specify exactly one of function or sourcePath/,
        );
        await assert.rejects(
          evaluateScript().handler(
            {
              params: {
                function: '() => true',
                sourcePath: 'script.js',
              },
            },
            response,
            context,
          ),
          /Specify exactly one of function or sourcePath/,
        );
      });
    });
    it('rejects args for classic scripts', async () => {
      await withMcpContext(async (response, context) => {
        await assert.rejects(
          evaluateScript().handler(
            {
              params: {
                function: 'document.title',
                format: 'script',
                args: ['1_1'],
              },
            },
            response,
            context,
          ),
          /args cannot be used when format is "script"/,
        );
      });
    });
    it('reports unreadable source files', async () => {
      const sourcePath = path.join(
        os.tmpdir(),
        'missing-evaluate-script-source.js',
      );
      await fs.rm(sourcePath, {force: true});
      await withMcpContext(async (response, context) => {
        await assert.rejects(
          evaluateScript().handler({params: {sourcePath}}, response, context),
          /Unable to read script source/,
        );
      });
    });
    it('skips the stable DOM wait when waitForStableDom is false', async () => {
      await withMcpContext(async (response, context) => {
        const spy = sinon.spy(WaitForHelper.prototype, 'waitForStableDom');
        try {
          await evaluateScript().handler(
            {
              params: {function: String(() => 1), waitForStableDom: false},
            },
            response,
            context,
          );
          sinon.assert.notCalled(spy);

          await evaluateScript().handler(
            {
              params: {function: String(() => 1)},
            },
            response,
            context,
          );
          sinon.assert.calledOnce(spy);
        } finally {
          spy.restore();
        }
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
      const filePath = path.join(
        os.tmpdir(),
        'test-evaluate-script-output.json',
      );
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
        const content = await fs.readFile(filePath, 'utf-8');
        assert.deepStrictEqual(JSON.parse(content), {hello: 'world'});
      } finally {
        await fs.rm(filePath, {force: true});
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
          const extensionEvaluateScript = evaluateScript({
            categoryExtensions: true,
          } as ParsedArguments);
          await extensionEvaluateScript.handler(
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

          response.resetResponseLineForTesting();
          await extensionEvaluateScript.handler(
            {
              params: {
                function:
                  '"chrome" in globalThis ? "has-chrome-script" : "no-chrome"',
                format: 'script',
                serviceWorkerId: swId,
              },
            },
            response,
            context,
          );
          const scriptEvaluation = response.responseLines.at(2);
          assert.ok(scriptEvaluation);
          assert.strictEqual(JSON.parse(scriptEvaluation), 'has-chrome-script');

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
                  pageId: 1,
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

    it('makes pageId optional in schema when categoryExtensions is true and pageIdRouting is true', () => {
      const tool = evaluateScript({
        categoryExtensions: true,
        pageIdRouting: true,
      } as ParsedArguments);
      const schema = zod.object(tool.schema);
      const validSw = schema.safeParse({
        function: '() => 1',
        serviceWorkerId: 'sw_1',
      });
      assert.strictEqual(validSw.success, true);

      const validPage = schema.safeParse({
        function: '() => 1',
        pageId: 1,
      });
      assert.strictEqual(validPage.success, true);
    });

    it('makes pageId required in schema when categoryExtensions is false and pageIdRouting is true', () => {
      const tool = evaluateScript({
        pageIdRouting: true,
      } as ParsedArguments);
      const schema = zod.object(tool.schema);
      const resultWithoutPageId = schema.safeParse({
        function: '() => 1',
      });
      assert.strictEqual(resultWithoutPageId.success, false);

      const resultWithPageId = schema.safeParse({
        function: '() => 1',
        pageId: 1,
      });
      assert.strictEqual(resultWithPageId.success, true);
    });
  });
});
