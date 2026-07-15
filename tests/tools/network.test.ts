/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import type {IncomingHttpHeaders} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import {
  addNetworkOverride,
  getNetworkRequest,
  listNetworkOverrides,
  listNetworkRequests,
  removeNetworkOverride,
} from '../../src/tools/network.js';
import {serverHooks} from '../server.js';
import {
  getTextContent,
  html,
  stabilizeResponseOutput,
  withMcpContext,
} from '../utils.js';

describe('network', () => {
  const server = serverHooks();

  function addJavaScriptRoute(
    routePath: string,
    source: string,
    onRequest?: () => void,
  ): void {
    server.addRoute(routePath, (_req, res) => {
      onRequest?.();
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.statusCode = 200;
      res.end(source);
    });
  }

  describe('network overrides', () => {
    it('requires exactly one replacement source', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage();

        await assert.rejects(
          addNetworkOverride.handler(
            {
              params: {urlPattern: 'https://example.com/script.js'},
              page,
            },
            response,
            context,
          ),
          /Exactly one of redirectUrl or responseFilePath must be provided/,
        );

        await assert.rejects(
          addNetworkOverride.handler(
            {
              params: {
                urlPattern: 'https://example.com/script.js',
                redirectUrl: 'https://example.com/replacement.js',
                responseFilePath: join(tmpdir(), 'replacement.js'),
              },
              page,
            },
            response,
            context,
          ),
          /Exactly one of redirectUrl or responseFilePath must be provided/,
        );
      });
    });

    it('redirects matching requests across reloads until removed', async () => {
      let originalRequests = 0;
      let replacementRequests = 0;
      addJavaScriptRoute(
        '/redirect-original.js',
        "document.documentElement.dataset.overrideSource = 'original';",
        () => {
          originalRequests++;
        },
      );
      addJavaScriptRoute(
        '/redirect-replacement.js',
        "document.documentElement.dataset.overrideSource = 'replacement';",
        () => {
          replacementRequests++;
        },
      );
      server.addHtmlRoute(
        '/redirect-page',
        html`<script src="${server.getRoute('/redirect-original.js')}"></script>`,
      );

      await withMcpContext(async (response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;
        await addNetworkOverride.handler(
          {
            params: {
              urlPattern: server.getRoute('/redirect-original.js'),
              redirectUrl: server.getRoute('/redirect-replacement.js'),
            },
            page: mcpPage,
          },
          response,
          context,
        );
        assert.deepStrictEqual(response.responseLines, [
          'Added network override 1. Reload or navigate the page to apply it.',
        ]);

        await page.goto(server.getRoute('/redirect-page'));
        assert.strictEqual(
          await page.evaluate(
            () => document.documentElement.dataset.overrideSource,
          ),
          'replacement',
        );

        await page.reload();
        assert.strictEqual(
          await page.evaluate(
            () => document.documentElement.dataset.overrideSource,
          ),
          'replacement',
        );
        assert.strictEqual(originalRequests, 0);
        assert.strictEqual(replacementRequests, 2);

        response.resetResponseLineForTesting();
        await removeNetworkOverride.handler(
          {params: {id: 1}, page: mcpPage},
          response,
          context,
        );
        await page.reload();
        assert.strictEqual(
          await page.evaluate(
            () => document.documentElement.dataset.overrideSource,
          ),
          'original',
        );
        assert.strictEqual(originalRequests, 1);
      });
    });

    it('sanitizes cross-origin headers while preserving Origin', async () => {
      let replacementHeaders: IncomingHttpHeaders = {};
      server.addHtmlRoute('/cross-origin-setup', html`<main>Setup</main>`);
      addJavaScriptRoute(
        '/cross-origin-original.js',
        "document.documentElement.dataset.overrideSource = 'original';",
      );
      server.addHtmlRoute(
        '/cross-origin-page',
        html`<script src="${server.getRoute('/cross-origin-original.js')}"></script>`,
      );
      server.addRoute('/cross-origin-replacement.js', (req, res) => {
        replacementHeaders = req.headers;
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.statusCode = 200;
        res.end(
          "document.documentElement.dataset.overrideSource = 'replacement';",
        );
      });

      await withMcpContext(async (response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;
        await page.goto(server.getRoute('/cross-origin-setup'));
        await page.evaluate(() => {
          document.cookie = 'override_secret=cookie; path=/';
        });
        await page.setExtraHTTPHeaders({
          Authorization: 'Bearer secret',
          Origin: server.baseUrl,
          'X-Api-Key': 'secret',
        });

        const replacementUrl =
          server.baseUrl.replace('localhost', '127.0.0.1') +
          '/cross-origin-replacement.js';
        await addNetworkOverride.handler(
          {
            params: {
              urlPattern: server.getRoute('/cross-origin-original.js'),
              resourceType: 'script',
              redirectUrl: replacementUrl,
            },
            page: mcpPage,
          },
          response,
          context,
        );

        await page.goto(server.getRoute('/cross-origin-page'));
        assert.strictEqual(
          await page.evaluate(
            () => document.documentElement.dataset.overrideSource,
          ),
          'replacement',
        );
        assert.strictEqual(replacementHeaders.origin, server.baseUrl);
        assert.strictEqual(replacementHeaders.authorization, undefined);
        assert.strictEqual(replacementHeaders.cookie, undefined);
        assert.strictEqual(replacementHeaders.referer, undefined);
        assert.strictEqual(replacementHeaders['x-api-key'], undefined);

        response.resetResponseLineForTesting();
        await removeNetworkOverride.handler(
          {params: {id: 1}, page: mcpPage},
          response,
          context,
        );
      });
    });

    it('enforces redirect URL access policies', async () => {
      const redirectUrl = 'https://blocked.example/replacement.js';
      await withMcpContext(
        async (response, context) => {
          const page = context.getSelectedMcpPage();
          await assert.rejects(
            addNetworkOverride.handler(
              {
                params: {
                  urlPattern: 'https://example.com/original.js',
                  redirectUrl,
                },
                page,
              },
              response,
              context,
            ),
            /Blocked by blocklist/,
          );
        },
        {blockedUrlPattern: ['https://blocked.example/*']},
      );

      await withMcpContext(
        async (response, context) => {
          const page = context.getSelectedMcpPage();
          await assert.rejects(
            addNetworkOverride.handler(
              {
                params: {
                  urlPattern: 'https://example.com/original.js',
                  redirectUrl,
                },
                page,
              },
              response,
              context,
            ),
            /Not allowed by allowlist/,
          );
        },
        {allowedUrlPattern: ['https://allowed.example/*']},
      );
    });

    it('rejects local files outside negotiated roots', async () => {
      await withMcpContext(async (response, context) => {
        context.setRoots([]);
        const page = context.getSelectedMcpPage();
        await assert.rejects(
          addNetworkOverride.handler(
            {
              params: {
                urlPattern: 'https://example.com/original.js',
                responseFilePath: join(process.cwd(), 'package.json'),
              },
              page,
            },
            response,
            context,
          ),
          /Access denied/,
        );
      });
    });

    it('serves the latest contents of a local file', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'network-override-'));
      const filePath = join(directory, 'local-override.js');
      try {
        await writeFile(
          filePath,
          "document.documentElement.dataset.overrideSource = 'caffè-☕';",
        );
        addJavaScriptRoute(
          '/local-original.js',
          "document.documentElement.dataset.overrideSource = 'original';",
        );
        server.addHtmlRoute(
          '/local-page',
          html`<script src="${server.getRoute('/local-original.js')}"></script>`,
        );

        await withMcpContext(async (response, context) => {
          const mcpPage = context.getSelectedMcpPage();
          const page = mcpPage.pptrPage;
          await addNetworkOverride.handler(
            {
              params: {
                urlPattern: server.getRoute('/local-original.js'),
                responseFilePath: filePath,
              },
              page: mcpPage,
            },
            response,
            context,
          );

          await page.goto(server.getRoute('/local-page'));
          assert.strictEqual(
            await page.evaluate(
              () => document.documentElement.dataset.overrideSource,
            ),
            'caffè-☕',
          );

          await writeFile(
            filePath,
            "document.documentElement.dataset.overrideSource = 'rebuilt';",
          );
          await page.reload();
          assert.strictEqual(
            await page.evaluate(
              () => document.documentElement.dataset.overrideSource,
            ),
            'rebuilt',
          );

          response.resetResponseLineForTesting();
          await removeNetworkOverride.handler(
            {params: {id: 1}, page: mcpPage},
            response,
            context,
          );
        });
      } finally {
        await rm(directory, {recursive: true, force: true});
      }
    });

    it('matches cache-busting query strings with a wildcard', async () => {
      let originalRequests = 0;
      addJavaScriptRoute(
        '/query-original.js?v=42',
        "document.documentElement.dataset.overrideSource = 'original';",
        () => {
          originalRequests++;
        },
      );
      addJavaScriptRoute(
        '/query-replacement.js',
        "document.documentElement.dataset.overrideSource = 'replacement';",
      );
      server.addHtmlRoute(
        '/query-page',
        html`<script src="${server.getRoute('/query-original.js?v=42')}"></script>`,
      );

      await withMcpContext(async (response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;
        await addNetworkOverride.handler(
          {
            params: {
              urlPattern: server.baseUrl + '/query-original.js*',
              redirectUrl: server.getRoute('/query-replacement.js'),
            },
            page: mcpPage,
          },
          response,
          context,
        );

        await page.goto(server.getRoute('/query-page'));
        assert.strictEqual(
          await page.evaluate(
            () => document.documentElement.dataset.overrideSource,
          ),
          'replacement',
        );
        assert.strictEqual(originalRequests, 0);

        response.resetResponseLineForTesting();
        await removeNetworkOverride.handler(
          {params: {id: 1}, page: mcpPage},
          response,
          context,
        );
      });
    });

    it('lists and removes overrides by id', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'network-override-'));
      const filePath = join(directory, 'listed-override.js');
      try {
        await writeFile(filePath, 'void 0;');
        addJavaScriptRoute('/listed-replacement.js', 'void 0;');

        await withMcpContext(async (response, context) => {
          const page = context.getSelectedMcpPage();
          await listNetworkOverrides.handler(
            {params: {}, page},
            response,
            context,
          );
          assert.deepStrictEqual(response.responseLines, [
            'No network overrides are configured for this page.',
          ]);

          response.resetResponseLineForTesting();
          await addNetworkOverride.handler(
            {
              params: {
                urlPattern: 'https://example.com/redirect.js',
                redirectUrl: server.getRoute('/listed-replacement.js'),
              },
              page,
            },
            response,
            context,
          );
          response.resetResponseLineForTesting();
          await addNetworkOverride.handler(
            {
              params: {
                urlPattern: 'https://example.com/local.js',
                resourceType: 'script',
                responseFilePath: filePath,
              },
              page,
            },
            response,
            context,
          );

          response.resetResponseLineForTesting();
          await listNetworkOverrides.handler(
            {params: {}, page},
            response,
            context,
          );
          assert.deepStrictEqual(response.responseLines, [
            '1: https://example.com/redirect.js -> ' +
              server.getRoute('/listed-replacement.js'),
            '2: https://example.com/local.js [script] -> ' +
              filePath +
              ' (application/javascript; charset=utf-8)',
          ]);

          response.resetResponseLineForTesting();
          await removeNetworkOverride.handler(
            {params: {id: 1}, page},
            response,
            context,
          );
          assert.deepStrictEqual(response.responseLines, [
            'Removed network override 1.',
          ]);

          response.resetResponseLineForTesting();
          await listNetworkOverrides.handler(
            {params: {}, page},
            response,
            context,
          );
          assert.deepStrictEqual(response.responseLines, [
            '2: https://example.com/local.js [script] -> ' +
              filePath +
              ' (application/javascript; charset=utf-8)',
          ]);

          await assert.rejects(
            removeNetworkOverride.handler(
              {params: {id: 999}, page},
              response,
              context,
            ),
            /Network override 999 was not found/,
          );

          response.resetResponseLineForTesting();
          await removeNetworkOverride.handler(
            {params: {id: 2}, page},
            response,
            context,
          );
        });
      } finally {
        await rm(directory, {recursive: true, force: true});
      }
    });

    it('aborts the request when a local file disappears', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'network-override-'));
      const filePath = join(directory, 'removed-override.js');
      try {
        let originalRequests = 0;
        await writeFile(
          filePath,
          "document.documentElement.dataset.overrideSource = 'local';",
        );
        addJavaScriptRoute(
          '/fallback-original.js',
          "document.documentElement.dataset.overrideSource = 'original';",
          () => {
            originalRequests++;
          },
        );
        server.addHtmlRoute(
          '/fallback-page',
          html`<script src="${server.getRoute('/fallback-original.js')}"></script>`,
        );

        await withMcpContext(async (response, context) => {
          const mcpPage = context.getSelectedMcpPage();
          const page = mcpPage.pptrPage;
          await addNetworkOverride.handler(
            {
              params: {
                urlPattern: server.getRoute('/fallback-original.js'),
                responseFilePath: filePath,
              },
              page: mcpPage,
            },
            response,
            context,
          );

          await rm(filePath);
          await page.goto(server.getRoute('/fallback-page'), {
            waitUntil: 'load',
            timeout: 5_000,
          });
          assert.strictEqual(
            await page.evaluate(
              () => document.documentElement.dataset.overrideSource,
            ),
            undefined,
          );
          assert.strictEqual(originalRequests, 0);

          response.resetResponseLineForTesting();
          await removeNetworkOverride.handler(
            {params: {id: 1}, page: mcpPage},
            response,
            context,
          );
        });
      } finally {
        await rm(directory, {recursive: true, force: true});
      }
    });
  });

  describe('network_list_requests', () => {
    it('list requests', async () => {
      await withMcpContext(async (response, context) => {
        await listNetworkRequests.handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.ok(response.includeNetworkRequests);
        assert.strictEqual(response.networkRequestsPageIdx, undefined);
      });
    });

    it('list requests form current navigations only', async t => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      server.addHtmlRoute('/two', html`<main>Second</main>`);
      server.addHtmlRoute('/three', html`<main>Third</main>`);

      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().setUpNetworkCollectorForTesting();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await listNetworkRequests.handler(
          {
            params: {},

            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });

    it('list requests from previous navigations', async t => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      server.addHtmlRoute('/two', html`<main>Second</main>`);
      server.addHtmlRoute('/three', html`<main>Third</main>`);

      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().setUpNetworkCollectorForTesting();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await listNetworkRequests.handler(
          {
            params: {
              includePreservedRequests: true,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });

    it('list requests from previous navigations from redirects', async t => {
      server.addRoute('/redirect', async (_req, res) => {
        res.writeHead(302, {
          Location: server.getRoute('/redirected'),
        });
        res.end();
      });

      server.addHtmlRoute(
        '/redirected',
        html`<script>
          document.location.href = '/redirected-page';
        </script>`,
      );

      server.addHtmlRoute(
        '/redirected-page',
        html`<main>I was redirected 2 times</main>`,
      );

      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().setUpNetworkCollectorForTesting();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/redirect'), {
          waitUntil: 'networkidle0',
        });
        await listNetworkRequests.handler(
          {
            params: {
              includePreservedRequests: true,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle('list_request', context);
        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });
  });
  describe('network_get_request', () => {
    it('attaches request', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {reqid: 1}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.equal(response.attachedNetworkRequestId, 1);
      });
    });
    it('should not add the request list', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await getNetworkRequest.handler(
          {params: {reqid: 1}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert(!response.includeNetworkRequests);
      });
    });
    it('should get request from previous navigations', async t => {
      server.addHtmlRoute('/one', html`<main>First</main>`);
      server.addHtmlRoute('/two', html`<main>Second</main>`);
      server.addHtmlRoute('/three', html`<main>Third</main>`);

      await withMcpContext(async (response, context) => {
        await context.getSelectedMcpPage().setUpNetworkCollectorForTesting();
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/one'));
        await page.goto(server.getRoute('/two'));
        await page.goto(server.getRoute('/three'));
        await getNetworkRequest.handler(
          {
            params: {
              reqid: 1,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const responseData = await response.handle('get_request', context);

        t.assert.snapshot(
          stabilizeResponseOutput(getTextContent(responseData.content[0])),
        );
      });
    });
  });
});
