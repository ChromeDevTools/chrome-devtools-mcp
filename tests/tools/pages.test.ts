/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import type {Dialog} from 'puppeteer-core';
import sinon from 'sinon';

import {ConfigParser} from '../../src/config/ConfigParser.js';
import {
  listPages,
  newPage,
  closePage,
  selectPage,
  navigatePage,
  resizePage,
  handleDialog,
  getTabId,
} from '../../src/tools/pages.js';
import {evaluateScript} from '../../src/tools/script.js';
import {createMockParsedArguments} from '../mocks.js';
import {assertNoServiceWorkerReported, html, withMcpContext} from '../utils.js';

const EXTENSION_SW_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension-sw',
);
const EXTENSION_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension',
);
const EXTENSION_SIDE_PANEL_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension-side-panel',
);

describe('pages', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('list_pages', () => {
    it('list pages', async () => {
      await withMcpContext(async (response, context, args) => {
        await listPages(args).handler({params: {}}, response, context);
        assert.ok(response.includePages);
      });
    });
    it('list pages after selected page is closed', async () => {
      await withMcpContext(async (response, context, args) => {
        // Create a second page and select it.
        const page2 = await context.newPage();
        assert.strictEqual(context.getSelectedMcpPage(), page2);

        // Close the selected page via puppeteer (simulating external close).
        await page2.pptrPage.close();

        // list_pages should still work even though the selected page is gone.
        await listPages(args).handler({params: {}}, response, context);
        assert.ok(response.includePages);
      });
    });
    it(`list pages for extension pages with --category-extensions`, async t => {
      await withMcpContext(
        async (response, context, args) => {
          const extensionId = await context.installExtension(EXTENSION_PATH);

          assert.ok(extensionId);

          await context.triggerExtensionAction(extensionId);

          const _popupTarget = await context.browser.waitForTarget(
            t => t.type() === 'page' && t.url().includes('chrome-extension://'),
          );

          response.resetResponseLineForTesting();
          const listPageDef = listPages(args);
          await listPageDef.handler({params: {}}, response, context);

          const result = await response.handle(context);
          const textContent = result.content.find(c => c.type === 'text') as {
            type: 'text';
            text: string;
          };
          assert.ok(textContent);

          const text = textContent.text.replaceAll(
            extensionId,
            '<extension-id>',
          );
          t.assert.snapshot(text);
          await context.uninstallExtension(extensionId);
        },
        {},
        {
          categoryExtensions: true,
        },
      );
    });

    for (const categoryExtensions of [true, false]) {
      it(`list pages for extension service workers ${categoryExtensions ? 'with' : 'without'} --category-extensions`, async t => {
        await withMcpContext(
          async (response, context, args) => {
            const extensionId =
              await context.installExtension(EXTENSION_SW_PATH);
            assert.ok(extensionId);

            const swTarget = await context.browser.waitForTarget(
              target =>
                target.type() === 'service_worker' &&
                target.url().includes('chrome-extension://'),
            );
            const swUrl = swTarget.url();

            const listPageDef = listPages(args);
            await listPageDef.handler({params: {}}, response, context);

            const result = await response.handle(context);
            const textContent = result.content.find(c => c.type === 'text') as {
              type: 'text';
              text: string;
            };
            assert.ok(textContent);

            if (categoryExtensions) {
              const structured = result.structuredContent as {
                extensionServiceWorkers: Array<{url: string}>;
              };
              assert.deepStrictEqual(
                structured.extensionServiceWorkers.map(sw => sw.url),
                [swUrl],
              );
            }

            const text = textContent.text.replaceAll(
              extensionId,
              '<extension-id>',
            );
            t.assert.snapshot(text);
            await context.uninstallExtension(extensionId);
            const targets = context.browser.targets();
            assertNoServiceWorkerReported(targets, extensionId);
          },
          {},
          {
            categoryExtensions,
          },
        );
      });
    }

    it('list pages for side panels with --category-extensions', async t => {
      await withMcpContext(
        async (response, context, args) => {
          const extensionId = await context.installExtension(
            EXTENSION_SIDE_PANEL_PATH,
          );

          assert.ok(extensionId);

          const sidePanelPage = await context.newPage();
          await sidePanelPage.pptrPage.goto(
            `chrome-extension://${extensionId}/sidepanel.html`,
          );

          await context.getSelectedMcpPage().waitForTextOnPage(['Side Panel']);

          // Wait for service worker used in the snapshot.
          await context.browser.waitForTarget(
            target => target.type() === 'service_worker',
          );

          const listPageDef = listPages(args);
          await listPageDef.handler({params: {}}, response, context);

          const result = await response.handle(context);
          const textContent = result.content.find(c => c.type === 'text') as {
            type: 'text';
            text: string;
          };
          assert.ok(textContent);

          const text = textContent.text.replaceAll(
            extensionId,
            '<extension-id>',
          );
          t.assert.snapshot(text);
          await context.uninstallExtension(extensionId);
          const targets = context.browser.targets();
          assertNoServiceWorkerReported(targets, extensionId);
        },
        {},
        {
          categoryExtensions: true,
        },
      );
    });

    it('when dialog is open', async t => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;

        const dialogPromise = new Promise<Dialog>(resolve => {
          page.on('dialog', dialog => {
            resolve(dialog);
          });
        });

        const evalPromise = page.evaluate(() => {
          alert('test dialog');
        });
        const dialog = await dialogPromise;

        await listPages(args).handler({params: {}}, response, context);

        const result = await response.handle(context);
        t.assert.snapshot(JSON.stringify(result));
        await dialog.dismiss();
        await evalPromise;
      });
    });
  });
  describe('new_page', () => {
    it('create a page', async () => {
      await withMcpContext(async (response, context, args) => {
        assert.strictEqual(
          context.getPageById(1),
          context.getSelectedMcpPage(),
        );
        await newPage(args).handler(
          {params: {url: 'data:text/html,<html></html>'}},
          response,
          context,
        );
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        assert.ok(response.includePages);
      });
    });
    it('throws when navigating to a javascript URL and javascriptEvaluation is false', async () => {
      await withMcpContext(async (response, context) => {
        const disabledArgs = new ConfigParser(
          '1.0.0',
          ['node', 'script.js', '--no-javascript-evaluation'],
          {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
        ).parse();
        const tool = newPage(disabledArgs);
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'javascript:alert(1)'}},
              response,
              context,
            );
          },
          {
            message:
              'Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled.',
          },
        );
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'data:text/html,<div>test</div>'}},
              response,
              context,
            );
          },
          {
            message:
              'Navigating to data: URLs is not allowed when JavaScript evaluation is disabled.',
          },
        );
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'vbscript:msgbox(1)'}},
              response,
              context,
            );
          },
          {
            message:
              'Navigating to vbscript: URLs is not allowed when JavaScript evaluation is disabled.',
          },
        );
      });
    });
    it('throws when navigating to a file URL and fileNavigations is false', async () => {
      await withMcpContext(async (response, context) => {
        const disabledArgs = new ConfigParser(
          '1.0.0',
          ['node', 'script.js', '--no-file-navigations'],
          {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
        ).parse();
        const tool = newPage(disabledArgs);
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'file:///etc/passwd'}},
              response,
              context,
            );
          },
          {
            message:
              'Navigating to file: URLs is not allowed when --file-navigations is disabled.',
          },
        );
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'view-source:file:///etc/passwd'}},
              response,
              context,
            );
          },
          {
            message:
              'Navigating to file: URLs is not allowed when --file-navigations is disabled.',
          },
        );
      });
    });
    it('throws when URL does not parse with new URL', async () => {
      await withMcpContext(async (response, context, args) => {
        const tool = newPage(args);
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'not a valid url'}},
              response,
              context,
            );
          },
          {
            message:
              'Invalid URL: "not a valid url". URLs must be valid according to the URL standard.',
          },
        );
      });
    });
    it('rejects chrome: and chrome-untrusted: URLs', async () => {
      await withMcpContext(async (response, context, args) => {
        const tool = newPage(args);
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'chrome://settings'}},
              response,
              context,
            );
          },
          {
            message: 'Navigating to chrome: URLs is not allowed.',
          },
        );
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'chrome-untrusted://terminal'}},
              response,
              context,
            );
          },
          {
            message: 'Navigating to chrome-untrusted: URLs is not allowed.',
          },
        );
        assert.strictEqual(context.getPages().length, 1);
      });
    });
    it('rejects chrome-extension: URLs unless categoryExtensions is enabled', async () => {
      await withMcpContext(async (response, context, args) => {
        const tool = newPage(args);
        await assert.rejects(
          async () => {
            await tool.handler(
              {params: {url: 'chrome-extension://abcdef/popup.html'}},
              response,
              context,
            );
          },
          {
            message:
              'Navigating to chrome-extension: URLs is not allowed without --categoryExtensions.',
          },
        );
      });
    });
    it('allows chrome://newtab/', async () => {
      await withMcpContext(async (response, context, args) => {
        const tool = newPage(args);
        await tool.handler(
          {params: {url: 'chrome://newtab/'}},
          response,
          context,
        );
        assert.ok(
          context
            .getSelectedMcpPage()
            .pptrPage.url()
            .startsWith('chrome://new'),
        );
      });
    });
    it('create a page in the background', async () => {
      await withMcpContext(async (response, context, args) => {
        const originalPage = context.getPageById(1);
        assert.strictEqual(originalPage, context.getSelectedMcpPage());
        // Ensure original page has focus
        await originalPage.pptrPage.bringToFront();
        assert.strictEqual(
          await originalPage.pptrPage.evaluate(() => document.hasFocus()),
          true,
        );
        await newPage(args).handler(
          {params: {url: 'data:text/html,<html></html>', background: true}},
          response,
          context,
        );
        // New page should be selected but original should retain focus
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        assert.strictEqual(
          await originalPage.pptrPage.evaluate(() => document.hasFocus()),
          true,
        );
        assert.ok(response.includePages);
      });
    });
    // A loopback port with no listener: the connection is refused, so a
    // navigation to it fails without reaching the network.
    async function unusedPort(): Promise<number> {
      const server = net.createServer();
      await new Promise<void>(resolve =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const port = (server.address() as net.AddressInfo).port;
      await new Promise<void>(resolve => server.close(() => resolve()));
      return port;
    }

    // A server that accepts the connection and never answers, so the only
    // end a navigation to it can reach is its own timeout.
    async function neverRespondingServer(): Promise<{
      port: number;
      close: () => Promise<void>;
    }> {
      const server = http.createServer(() => {
        // Never respond.
      });
      await new Promise<void>(resolve =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const port = (server.address() as net.AddressInfo).port;
      return {
        port,
        close: () =>
          new Promise<void>(resolve => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      };
    }

    it('closes the tab when the navigation is blocked', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const originalPage = context.getSelectedMcpPage();

          await assert.rejects(
            newPage(args).handler(
              {params: {url: 'http://127.0.0.1/blocked'}},
              response,
              context,
            ),
            /blocked by blocklist\/allowlist rules/,
          );

          // The tab this call opened is closed again and the page that was
          // selected before it is selected once more.
          assert.strictEqual(context.getPages().length, 1);
          assert.strictEqual(context.getSelectedMcpPage(), originalPage);
        },
        {blockedUrlPattern: ['http://127.0.0.1/blocked']},
      );
    });

    it('closes the tab when the URL is not in the allowed list', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const originalPage = context.getSelectedMcpPage();

          await assert.rejects(
            newPage(args).handler(
              {params: {url: 'http://127.0.0.1/not-allowed'}},
              response,
              context,
            ),
            /blocked by blocklist\/allowlist rules/,
          );

          assert.strictEqual(context.getPages().length, 1);
          assert.strictEqual(context.getSelectedMcpPage(), originalPage);
        },
        {allowedUrlPattern: ['http://127.0.0.1/allowed']},
      );
    });

    it('closes the tab when the connection is refused', async () => {
      await withMcpContext(async (response, context, args) => {
        const originalPage = context.getSelectedMcpPage();
        const port = await unusedPort();

        await assert.rejects(
          newPage(args).handler(
            {params: {url: `http://127.0.0.1:${port}/`}},
            response,
            context,
          ),
          /net::ERR_CONNECTION_REFUSED/,
        );

        assert.strictEqual(context.getPages().length, 1);
        assert.strictEqual(context.getSelectedMcpPage(), originalPage);
      });
    });

    it('closes the tab when the navigation times out', async () => {
      const stalled = await neverRespondingServer();
      try {
        await withMcpContext(async (response, context, args) => {
          const originalPage = context.getSelectedMcpPage();

          await assert.rejects(
            newPage(args).handler(
              {
                params: {
                  url: `http://127.0.0.1:${stalled.port}/`,
                  timeout: 1000,
                },
              },
              response,
              context,
            ),
            /Navigation timeout of 1000 ms exceeded/,
          );

          assert.strictEqual(context.getPages().length, 1);
          assert.strictEqual(context.getSelectedMcpPage(), originalPage);
        });
      } finally {
        await stalled.close();
      }
    });

    it('closes the tab when it was opened in the background', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const originalPage = context.getSelectedMcpPage();

          await assert.rejects(
            newPage(args).handler(
              {params: {url: 'http://127.0.0.1/blocked', background: true}},
              response,
              context,
            ),
            /blocked by blocklist\/allowlist rules/,
          );

          // `background` keeps the tab from being brought to the front; the
          // selection still moves to it, so a failure still has to undo it.
          assert.strictEqual(context.getPages().length, 1);
          assert.strictEqual(context.getSelectedMcpPage(), originalPage);
        },
        {blockedUrlPattern: ['http://127.0.0.1/blocked']},
      );
    });

    it('closes the tab when a dialog blocks the load', async () => {
      await withMcpContext(async (response, context, args) => {
        const originalPage = context.getSelectedMcpPage();

        // The dialog pauses the renderer, so the load ends in a timeout and
        // the tab stays behind with the dialog on it unless it is closed.
        await assert.rejects(
          newPage(args).handler(
            {
              params: {
                url: 'data:text/html,<script>alert("blocked")</script>',
                timeout: 1000,
              },
            },
            response,
            context,
          ),
          /Navigation timeout of 1000 ms exceeded/,
        );

        assert.strictEqual(context.getPages().length, 1);
        assert.strictEqual(context.getSelectedMcpPage(), originalPage);
      });
    });

    it('keeps another page and its dialog when the load fails', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const withDialog = context.getPageById(1);
          await withDialog.pptrPage.goto(
            'data:text/html,<script>setTimeout(() => alert("keep me"), 0)</script>',
          );
          for (let i = 0; i < 100 && !withDialog.getDialog(); i++) {
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          assert.ok(
            withDialog.getDialog(),
            'the first page should hold a dialog',
          );

          await assert.rejects(
            newPage(args).handler(
              {params: {url: 'http://127.0.0.1/blocked'}},
              response,
              context,
            ),
            /blocked by blocklist\/allowlist rules/,
          );

          // Only the tab this call opened is closed: the page that was
          // selected before it keeps its dialog and stays selected.
          assert.strictEqual(context.getPages().length, 1);
          assert.strictEqual(context.getSelectedMcpPage(), withDialog);
          assert.strictEqual(withDialog.getDialog()?.message(), 'keep me');
        },
        {blockedUrlPattern: ['http://127.0.0.1/blocked']},
      );
    });

    it('reports a tab it could not close and keeps the navigation error', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const originalPage = context.getSelectedMcpPage();
          sinon.stub(context, 'closePage').rejects(new Error('close failed'));

          await assert.rejects(
            newPage(args).handler(
              {params: {url: 'http://127.0.0.1/blocked'}},
              response,
              context,
            ),
            // The navigation error is what the caller is told about, cleanup
            // failure included.
            /blocked by blocklist\/allowlist rules/,
          );
          sinon.restore();

          // The tab is still open, and the response says so — with the page it
          // is — rather than leaving it unreported, while the selection that
          // was restored is the one marked [selected].
          assert.strictEqual(context.getPages().length, 2);
          assert.strictEqual(context.getSelectedMcpPage(), originalPage);
          const {content} = await response.handle(context);
          const text = content
            .map(part => ('text' in part ? part.text : ''))
            .join('\n');
          assert.match(text, /still open as page 2/);
          assert.match(text, /Page 1 is selected again/);
          assert.match(text, /^1: .*\[selected\]$/m);
        },
        {blockedUrlPattern: ['http://127.0.0.1/blocked']},
      );
    });

    it('leaves the pages and the selection alone when the URL is rejected before a tab exists', async () => {
      await withMcpContext(async (response, context, args) => {
        const originalPage = context.getSelectedMcpPage();
        const before = context.getPages().map(page => page.id);

        await assert.rejects(
          newPage(args).handler(
            {params: {url: 'chrome://settings'}},
            response,
            context,
          ),
          /Navigating to chrome: URLs is not allowed./,
        );

        // No tab was created, so nothing is closed and nothing is re-selected.
        assert.deepStrictEqual(
          context.getPages().map(page => page.id),
          before,
        );
        assert.strictEqual(context.getSelectedMcpPage(), originalPage);
      });
    });

    it('leaves page-scoped calls on the page selected before a failed new_page', async () => {
      await withMcpContext(
        async (response, context, args) => {
          const originalPage = context.getSelectedMcpPage();
          await originalPage.pptrPage.goto(
            'data:text/html,<title>the original page</title>',
          );

          await assert.rejects(
            newPage(args).handler(
              {params: {url: 'http://127.0.0.1/blocked'}},
              response,
              context,
            ),
            /blocked by blocklist\/allowlist rules/,
          );

          // With pageId routing off, a page-scoped call without a pageId
          // follows the selection, which the failed call must have put back.
          await evaluateScript(args).handler(
            {params: {function: '() => document.title'}},
            response,
            context,
          );
          assert.ok(
            response.responseLines.some(line =>
              line.includes('the original page'),
            ),
            response.responseLines.join('\n'),
          );
        },
        {blockedUrlPattern: ['http://127.0.0.1/blocked']},
        {pageIdRouting: false},
      );
    });
  });
  describe('new_page with isolatedContext', () => {
    it('creates a page in an isolated context', async () => {
      await withMcpContext(async (response, context, args) => {
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'session-a',
            },
          },
          response,
          context,
        );
        const mcpPage = context.getSelectedMcpPage();
        assert.strictEqual(mcpPage.isolatedContextName, 'session-a');
        assert.ok(response.includePages);
      });
    });

    it('keeps focus when background is true with isolatedContext', async () => {
      await withMcpContext(async (response, context, args) => {
        const originalPage = context.getPageById(1);
        assert.strictEqual(originalPage, context.getSelectedMcpPage());
        // Ensure original page has focus
        await originalPage.pptrPage.bringToFront();
        assert.strictEqual(
          await originalPage.pptrPage.evaluate(() => document.hasFocus()),
          true,
        );
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              background: true,
              isolatedContext: 'session-a',
            },
          },
          response,
          context,
        );
        // New page should be selected but original should retain focus
        const mcpPage = context.getSelectedMcpPage();
        assert.strictEqual(mcpPage.isolatedContextName, 'session-a');
        assert.strictEqual(
          await originalPage.pptrPage.evaluate(() => document.hasFocus()),
          true,
        );
        assert.ok(response.includePages);
      });
    });

    it('reuses the same context for the same isolatedContext name', async () => {
      await withMcpContext(async (response, context, args) => {
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'session-a',
            },
          },
          response,
          context,
        );
        const mcpPage1 = context.getSelectedMcpPage();
        const page1 = mcpPage1.pptrPage;
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'session-a',
            },
          },
          response,
          context,
        );
        const mcpPage2 = context.getSelectedMcpPage();
        const page2 = mcpPage2.pptrPage;
        assert.notStrictEqual(page1, page2);
        assert.strictEqual(mcpPage1.isolatedContextName, 'session-a');
        assert.strictEqual(mcpPage2.isolatedContextName, 'session-a');
        assert.strictEqual(page1.browserContext(), page2.browserContext());
      });
    });

    it('creates separate contexts for different isolatedContext names', async () => {
      await withMcpContext(async (response, context, args) => {
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'session-a',
            },
          },
          response,
          context,
        );
        const mcpPageA = context.getSelectedMcpPage();
        const pageA = mcpPageA.pptrPage;
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'session-b',
            },
          },
          response,
          context,
        );
        const mcpPageB = context.getSelectedMcpPage();
        const pageB = mcpPageB.pptrPage;
        assert.strictEqual(mcpPageA.isolatedContextName, 'session-a');
        assert.strictEqual(mcpPageB.isolatedContextName, 'session-b');
        assert.notStrictEqual(pageA.browserContext(), pageB.browserContext());
      });
    });

    it('includes isolatedContext in page listing', async () => {
      await withMcpContext(async (response, context, args) => {
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'session-a',
            },
          },
          response,
          context,
        );
        const result = await response.handle(context);
        const pages = (
          result.structuredContent as {pages: Array<{isolatedContext?: string}>}
        ).pages;
        const isolatedPage = pages.find(p => p.isolatedContext === 'session-a');
        assert.ok(isolatedPage);
      });
    });

    it('does not set isolatedContext for pages in the default context', async () => {
      await withMcpContext(async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        assert.strictEqual(mcpPage.isolatedContextName, undefined);
        await newPage(args).handler(
          {params: {url: 'data:text/html,<html></html>'}},
          response,
          context,
        );
        assert.strictEqual(
          context.getSelectedMcpPage().isolatedContextName,
          undefined,
        );
      });
    });

    it('closes an isolated page without errors', async () => {
      await withMcpContext(async (response, context, args) => {
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'session-a',
            },
          },
          response,
          context,
        );
        const page = context.getSelectedMcpPage().pptrPage;
        const pageId = context.getSelectedMcpPage().id;
        assert.ok(!page.isClosed());
        await closePage(args).handler({params: {pageId}}, response, context);
        assert.ok(page.isClosed());
      });
    });

    it('when dialog is open', async t => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;

        const dialogPromise = new Promise<Dialog>(resolve => {
          page.on('dialog', dialog => {
            resolve(dialog);
          });
        });

        const evalPromise = page.evaluate(() => {
          alert('test dialog');
        });
        const dialog = await dialogPromise;

        await newPage(args).handler(
          {params: {url: 'data:text/html,<html></html>'}},
          response,
          context,
        );

        const result = await response.handle(context);
        t.assert.snapshot(JSON.stringify(result));
        await dialog.dismiss();
        await evalPromise;
      });
    });
  });

  it('navigate_page targets the pageId page, not the global selection', async () => {
    await withMcpContext(async (response, context, args) => {
      await newPage(args).handler(
        {
          params: {
            url: 'data:text/html,<h1>Initial</h1>',
            isolatedContext: 'nav-ctx',
          },
        },
        response,
        context,
      );
      const isolatedPage = context.getSelectedMcpPage();

      // Switch global selection back to the default page.
      await selectPage(args).handler({params: {pageId: 1}}, response, context);
      assert.notStrictEqual(context.getSelectedMcpPage(), isolatedPage);

      // Navigate using page; should target the isolated page.
      await navigatePage(args).handler(
        {
          params: {
            url: 'data:text/html,<h1>Navigated</h1>',
          },
          page: isolatedPage,
        },
        response,
        context,
      );

      // Verify the isolated page was navigated.
      const content = await isolatedPage.pptrPage.evaluate(
        () => document.querySelector('h1')?.textContent,
      );
      assert.strictEqual(content, 'Navigated');

      // Verify the default page was NOT affected.
      const defaultContent = await context
        .getSelectedMcpPage()
        .pptrPage.evaluate(() => document.querySelector('h1')?.textContent);
      assert.notStrictEqual(defaultContent, 'Navigated');
    });
  });

  describe('close_page', () => {
    it('closes a page', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = await context.newPage();
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        assert.strictEqual(context.getPageById(2), page);
        await closePage(args).handler({params: {pageId: 2}}, response, context);
        assert.ok(page.pptrPage.isClosed());
        assert.ok(response.includePages);
      });
    });
    it('cannot close the last page', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await closePage(args).handler({params: {pageId: 1}}, response, context);
        assert.deepStrictEqual(
          response.responseLines[0],
          `The last open page cannot be closed. It is fine to keep it open.`,
        );
        assert.ok(response.includePages);
        assert.ok(!page.isClosed());
      });
    });

    it('when dialog is open', async t => {
      await withMcpContext(async (response, context, args) => {
        const page = await context.newPage();
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        assert.strictEqual(context.getPageById(2), page);

        const dialogPromise = new Promise<void>(resolve => {
          page.pptrPage.on('dialog', () => resolve());
        });

        page.pptrPage
          .evaluate(() => {
            alert('test dialog');
          })
          .catch(() => {
            // Ignore TargetCloseError when page is closed with open dialog
          });
        await dialogPromise;

        await closePage(args).handler({params: {pageId: 2}}, response, context);

        const result = await response.handle(context);
        t.assert.snapshot(JSON.stringify(result));
      });
    });
  });
  describe('select_page', () => {
    it('selects a page', async () => {
      await withMcpContext(async (response, context, args) => {
        await context.newPage();
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        await selectPage(args).handler(
          {params: {pageId: 1}},
          response,
          context,
        );
        assert.strictEqual(
          context.getPageById(1),
          context.getSelectedMcpPage(),
        );
        assert.ok(response.includePages);
      });
    });
    it('selects a page and keeps it focused in the background', async () => {
      await withMcpContext(async (response, context, args) => {
        await context.newPage();
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        assert.strictEqual(
          await context
            .getPageById(1)
            .pptrPage.evaluate(() => document.hasFocus()),
          true,
        );
        await selectPage(args).handler(
          {params: {pageId: 1}},
          response,
          context,
        );
        assert.strictEqual(
          context.getPageById(1),
          context.getSelectedMcpPage(),
        );
        assert.strictEqual(
          await context
            .getPageById(1)
            .pptrPage.evaluate(() => document.hasFocus()),
          true,
        );
        assert.ok(response.includePages);
      });
    });
    it('preserves focus across different browser contexts', async () => {
      await withMcpContext(async (response, context, args) => {
        // Create pages in separate isolated contexts.
        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'ctx-a',
            },
          },
          response,
          context,
        );
        const pageA = context.getSelectedMcpPage().pptrPage;
        const pageAId = context.getSelectedMcpPage().id;

        await newPage(args).handler(
          {
            params: {
              url: 'data:text/html,<html></html>',
              isolatedContext: 'ctx-b',
            },
          },
          response,
          context,
        );
        const pageB = context.getSelectedMcpPage().pptrPage;

        // Selecting pageB (ctx-b) should not defocus pageA (ctx-a).
        assert.strictEqual(
          await pageA.evaluate(() => document.hasFocus()),
          true,
        );
        assert.strictEqual(
          await pageB.evaluate(() => document.hasFocus()),
          true,
        );

        // Switching back to pageA should preserve pageB's focus.
        await selectPage(args).handler(
          {params: {pageId: pageAId}},
          response,
          context,
        );
        assert.strictEqual(
          await pageA.evaluate(() => document.hasFocus()),
          true,
        );
        assert.strictEqual(
          await pageB.evaluate(() => document.hasFocus()),
          true,
        );
      });
    });

    it('when dialog is open', async t => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;

        const dialogPromise = new Promise<Dialog>(resolve => {
          page.on('dialog', dialog => {
            resolve(dialog);
          });
        });

        const evalPromise = page.evaluate(() => {
          alert('test dialog');
        });
        const dialog = await dialogPromise;

        await selectPage(args).handler(
          {params: {pageId: 1}},
          response,
          context,
        );

        const result = await response.handle(context);
        t.assert.snapshot(JSON.stringify(result));
        await dialog.dismiss();
        await evalPromise;
      });
    });
  });
  describe('navigate_page', () => {
    it('navigates to correct page', async () => {
      await withMcpContext(async (response, context, args) => {
        await navigatePage(args).handler(
          {
            params: {url: 'data:text/html,<div>Hello MCP</div>'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const page = context.getSelectedMcpPage().pptrPage;
        assert.equal(
          await page.evaluate(() => document.querySelector('div')?.textContent),
          'Hello MCP',
        );
        assert.ok(response.includePages);
      });
    });

    it('throws when navigating to a file URL and fileNavigations is false', async () => {
      await withMcpContext(async (response, context) => {
        const disabledArgs = new ConfigParser(
          '1.0.0',
          ['node', 'script.js', '--no-file-navigations'],
          {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
        ).parse();
        await assert.rejects(
          async () => {
            await navigatePage(disabledArgs).handler(
              {
                params: {url: 'file:///etc/passwd'},
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {
            message:
              'Navigating to file: URLs is not allowed when --file-navigations is disabled.',
          },
        );
        // The page must not have left about:blank.
        assert.strictEqual(
          context.getSelectedMcpPage().pptrPage.url(),
          'about:blank',
        );
      });
    });

    it('throws an error if the page was closed not by the MCP server', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = await context.newPage();
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        assert.strictEqual(context.getPageById(2), page);

        await page.pptrPage.close();

        try {
          await navigatePage(args).handler(
            {
              params: {url: 'data:text/html,<div>Hello MCP</div>'},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
          assert.fail('should not reach here');
        } catch (err) {
          assert.strictEqual(
            err.message,
            'The selected page has been closed. Call list_pages to see open pages.',
          );
        }
      });
    });

    it('respects the timeout parameter', async () => {
      await withMcpContext(async (response, context, args) => {
        const mcpPage = context.getSelectedMcpPage();
        const waitForEventsSpy = sinon.spy(mcpPage, 'waitForEventsAfterAction');
        const gotoSpy = sinon.spy(mcpPage.pptrPage, 'goto');

        try {
          await navigatePage(args).handler(
            {
              params: {
                url: 'data:text/html,<html></html>',
                timeout: 12345,
              },
              page: mcpPage,
            },
            response,
            context,
          );
        } finally {
          waitForEventsSpy.restore();
          gotoSpy.restore();
        }

        sinon.assert.calledOnceWithExactly(
          gotoSpy,
          'data:text/html,<html></html>',
          {timeout: 12345},
        );
        assert.strictEqual(
          waitForEventsSpy.firstCall.args[1]?.timeout,
          12345,
          'The timeout parameter should be passed to waitForEventsAfterAction',
        );
      });
    });
    it('go back', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await navigatePage(args).handler(
          {params: {type: 'back'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.equal(
          await page.evaluate(() => document.location.href),
          'about:blank',
        );
        assert.ok(response.includePages);
      });
    });
    it('go forward', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await page.goBack();
        await navigatePage(args).handler(
          {params: {type: 'forward'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.equal(
          await page.evaluate(() => document.querySelector('div')?.textContent),
          'Hello MCP',
        );
        assert.ok(response.includePages);
      });
    });
    it('reload', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await navigatePage(args).handler(
          {params: {type: 'reload'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.equal(
          await page.evaluate(() => document.location.href),
          'data:text/html,<div>Hello MCP</div>',
        );
        assert.ok(response.includePages);
      });
    });

    it('reload with accpeting the beforeunload dialog', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(
          html` <script>
            window.addEventListener('beforeunload', e => {
              e.preventDefault();
              e.returnValue = '';
            });
          </script>`,
        );
        // Grant user activation so Chrome permits the beforeunload dialog
        await page.mouse.click(10, 10);

        await navigatePage(args).handler(
          {params: {type: 'reload'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().getDialog(), undefined);
        assert.ok(response.includePages);
        assert.strictEqual(
          response.responseLines.join('\n'),
          'Successfully reloaded the page.\nAccepted a beforeunload dialog.',
        );
      });
    });

    it('reload with declining the beforeunload dialog', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(
          html` <script>
            window.addEventListener('beforeunload', e => {
              e.preventDefault();
              e.returnValue = '';
            });
          </script>`,
        );
        // Grant user activation so Chrome permits the beforeunload dialog
        await page.mouse.click(10, 10);

        await navigatePage(args).handler(
          {
            params: {
              type: 'reload',
              handleBeforeUnload: 'dismiss',
              timeout: 500,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().getDialog(), undefined);
        assert.ok(response.includePages);
        assert.strictEqual(
          response.responseLines.join('\n'),
          'Unable to reload the selected page: Navigation timeout of 500 ms exceeded.\nDismissed a beforeunload dialog.',
        );
      });
    });

    it('go forward with error', async () => {
      await withMcpContext(async (response, context, args) => {
        await navigatePage(args).handler(
          {params: {type: 'forward'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.ok(
          response.responseLines
            .at(0)
            ?.startsWith('Unable to navigate forward in the selected page:'),
        );
        assert.ok(response.includePages);
      });
    });
    it('go back with error', async () => {
      await withMcpContext(async (response, context, args) => {
        await navigatePage(args).handler(
          {params: {type: 'back'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.ok(
          response.responseLines
            .at(0)
            ?.startsWith('Unable to navigate back in the selected page:'),
        );
        assert.ok(response.includePages);
      });
    });
    it('navigates to correct page with initScript', async () => {
      await withMcpContext(async (response, context, args) => {
        await navigatePage(args).handler(
          {
            params: {
              url: 'data:text/html,<div>Hello MCP</div>',
              initScript: 'window.initScript = "completed"',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const page = context.getSelectedMcpPage().pptrPage;

        // wait for up to 1s for the global variable to set by the initScript to exist
        await page.waitForFunction("window.initScript==='completed'", {
          timeout: 1000,
        });

        assert.ok(response.includePages);
      });
    });

    it('omits initScript from schema when javascriptEvaluation is false', () => {
      const defaultTool = navigatePage(createMockParsedArguments());
      assert.strictEqual('initScript' in defaultTool.schema, true);

      const disabledArgs = new ConfigParser(
        '1.0.0',
        ['node', 'script.js', '--no-javascript-evaluation'],
        {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
      ).parse();
      const disabledTool = navigatePage(disabledArgs);
      assert.strictEqual('initScript' in disabledTool.schema, false);
    });

    it('throws when navigating to a javascript, data, or vbscript URL and javascriptEvaluation is false', async () => {
      await withMcpContext(async (response, context) => {
        const disabledArgs = new ConfigParser(
          '1.0.0',
          ['node', 'script.js', '--no-javascript-evaluation'],
          {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
        ).parse();
        const tool = navigatePage(disabledArgs);
        await assert.rejects(
          async () => {
            await tool.handler(
              {
                params: {
                  url: 'javascript:alert(1)',
                },
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {
            message:
              'Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled.',
          },
        );
        await assert.rejects(
          async () => {
            await tool.handler(
              {
                params: {
                  url: 'data:text/html,<div>test</div>',
                },
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {
            message:
              'Navigating to data: URLs is not allowed when JavaScript evaluation is disabled.',
          },
        );
        await assert.rejects(
          async () => {
            await tool.handler(
              {
                params: {
                  url: 'vbscript:msgbox(1)',
                },
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {
            message:
              'Navigating to vbscript: URLs is not allowed when JavaScript evaluation is disabled.',
          },
        );
      });
    });

    it('throws when URL does not parse with new URL', async () => {
      await withMcpContext(async (response, context, args) => {
        const tool = navigatePage(args);
        await assert.rejects(
          async () => {
            await tool.handler(
              {
                params: {
                  url: 'not a valid url',
                },
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {
            message:
              'Invalid URL: "not a valid url". URLs must be valid according to the URL standard.',
          },
        );
      });
    });

    it('rejects chrome: and chrome-untrusted: URLs', async () => {
      await withMcpContext(async (response, context, args) => {
        const tool = navigatePage(args);
        await assert.rejects(
          async () => {
            await tool.handler(
              {
                params: {url: 'chrome://settings'},
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {
            message: 'Navigating to chrome: URLs is not allowed.',
          },
        );
        await assert.rejects(
          async () => {
            await tool.handler(
              {
                params: {url: 'chrome-untrusted://terminal'},
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {
            message: 'Navigating to chrome-untrusted: URLs is not allowed.',
          },
        );
      });
    });

    it('rejects chrome-extension: URLs unless categoryExtensions is enabled', async () => {
      await withMcpContext(async (response, context, args) => {
        const tool = navigatePage(args);
        await assert.rejects(
          async () => {
            await tool.handler(
              {
                params: {url: 'chrome-extension://abcdef/popup.html'},
                page: context.getSelectedMcpPage(),
              },
              response,
              context,
            );
          },
          {
            message:
              'Navigating to chrome-extension: URLs is not allowed without --categoryExtensions.',
          },
        );
      });
    });

    it('allows chrome://newtab/', async () => {
      await withMcpContext(async (response, context, args) => {
        const tool = navigatePage(args);
        await tool.handler(
          {
            params: {url: 'chrome://newtab/'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.ok(
          context
            .getSelectedMcpPage()
            .pptrPage.url()
            .startsWith('chrome://new'),
        );
      });
    });

    it('when dialog is open', async t => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const dialogPromise = new Promise<void>(resolve => {
          page.on('dialog', () => resolve());
        });

        page
          .evaluate(() => {
            alert('test dialog');
          })
          .catch(() => {
            // Ignore error when navigation destroys the execution context
          });
        await dialogPromise;

        await navigatePage(args).handler(
          {
            params: {url: 'data:text/html,<div>Navigated</div>'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const result = await response.handle(context);
        t.assert.snapshot(JSON.stringify(result));
      });
    });
  });
  describe('resize', () => {
    it('resize the page', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const resizePromise = page.evaluate(() => {
          return new Promise(resolve => {
            window.addEventListener('resize', resolve, {once: true});
          });
        });
        await resizePage(args).handler(
          {
            params: {width: 700, height: 500},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        await resizePromise;
        await page.waitForFunction(
          () => window.innerWidth === 700 && window.innerHeight === 500,
        );
        const dimensions = await page.evaluate(() => {
          return [window.innerWidth, window.innerHeight];
        });
        assert.deepStrictEqual(dimensions, [700, 500]);
      });
    });

    it('resize when window state is normal', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const browser = page.browser();
        const windowId = await page.windowId();
        await browser.setWindowBounds(windowId, {windowState: 'normal'});

        const {windowState} = await browser.getWindowBounds(windowId);
        assert.strictEqual(windowState, 'normal');

        const resizePromise = page.evaluate(() => {
          return new Promise(resolve => {
            window.addEventListener('resize', resolve, {once: true});
          });
        });
        await resizePage(args).handler(
          {
            params: {width: 650, height: 450},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        await resizePromise;
        await page.waitForFunction(
          () => window.innerWidth === 650 && window.innerHeight === 450,
        );
        const dimensions = await page.evaluate(() => {
          return [window.innerWidth, window.innerHeight];
        });
        assert.deepStrictEqual(dimensions, [650, 450]);
      });
    });

    it('resize when window state is minimized', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const browser = page.browser();
        const windowId = await page.windowId();
        await browser.setWindowBounds(windowId, {windowState: 'minimized'});

        const {windowState} = await browser.getWindowBounds(windowId);
        assert.strictEqual(windowState, 'minimized');

        const resizePromise = page.evaluate(() => {
          return new Promise(resolve => {
            window.addEventListener('resize', resolve, {once: true});
          });
        });
        await resizePage(args).handler(
          {
            params: {width: 750, height: 550},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        await resizePromise;
        await page.waitForFunction(
          () => window.innerWidth === 750 && window.innerHeight === 550,
        );
        const dimensions = await page.evaluate(() => {
          return [window.innerWidth, window.innerHeight];
        });
        assert.deepStrictEqual(dimensions, [750, 550]);
      });
    });

    it('resize when window state is maximized', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const browser = page.browser();
        const windowId = await page.windowId();
        await browser.setWindowBounds(windowId, {windowState: 'maximized'});

        const {windowState} = await browser.getWindowBounds(windowId);
        assert.strictEqual(windowState, 'maximized');

        const resizePromise = page.evaluate(() => {
          return new Promise(resolve => {
            window.addEventListener('resize', resolve, {once: true});
          });
        });
        await resizePage(args).handler(
          {
            params: {width: 725, height: 525},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        await resizePromise;
        await page.waitForFunction(
          () => window.innerWidth === 725 && window.innerHeight === 525,
        );
        const dimensions = await page.evaluate(() => {
          return [window.innerWidth, window.innerHeight];
        });
        assert.deepStrictEqual(dimensions, [725, 525]);
      });
    });

    /*
     * The following test fails after the release of chrome 152.
     * */
    it(
      'resize when window state is fullscreen',
      {skip: process.platform === 'darwin'},
      async () => {
        await withMcpContext(async (response, context, args) => {
          const page = context.getSelectedMcpPage().pptrPage;
          const browser = page.browser();
          const windowId = await page.windowId();
          await browser.setWindowBounds(windowId, {windowState: 'fullscreen'});

          const {windowState} = await browser.getWindowBounds(windowId);
          assert.strictEqual(windowState, 'fullscreen');

          const resizePromise = page.evaluate(() => {
            return new Promise(resolve => {
              window.addEventListener('resize', resolve, {once: true});
            });
          });
          await resizePage(args).handler(
            {
              params: {width: 850, height: 650},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
          await resizePromise;
          await page.waitForFunction(
            () => window.innerWidth === 850 && window.innerHeight === 650,
          );
          const dimensions = await page.evaluate(() => {
            return [window.innerWidth, window.innerHeight];
          });
          assert.deepStrictEqual(dimensions, [850, 650]);
        });
      },
    );

    it('when dialog is open', async t => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const dialogPromise = new Promise<Dialog>(resolve => {
          page.on('dialog', dialog => {
            resolve(dialog);
          });
        });

        const evalPromise = page.evaluate(() => {
          alert('test dialog');
        });
        const dialog = await dialogPromise;

        await resizePage(args).handler(
          {
            params: {width: 1600, height: 1400},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const result = await response.handle(context);
        t.assert.snapshot(JSON.stringify(result));
        await dialog.dismiss();
        await evalPromise;
      });
    });
  });

  describe('dialogs', () => {
    it('can accept dialogs', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const dialogPromise = new Promise<void>(resolve => {
          page.on('dialog', () => {
            resolve();
          });
        });
        const evalPromise = page.evaluate(() => {
          alert('test');
        });
        await dialogPromise;
        await handleDialog(args).handler(
          {
            params: {
              action: 'accept',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().getDialog(), undefined);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully accepted the dialog',
        );
        await evalPromise;
      });
    });
    it('can dismiss dialogs', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const dialogPromise = new Promise<void>(resolve => {
          page.on('dialog', () => {
            resolve();
          });
        });
        const evalPromise = page.evaluate(() => {
          alert('test');
        });
        await dialogPromise;
        await handleDialog(args).handler(
          {
            params: {
              action: 'dismiss',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().getDialog(), undefined);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully dismissed the dialog',
        );
        await evalPromise;
      });
    });
    it('can dismiss already dismissed dialog dialogs', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        const dialogPromise = new Promise<Dialog>(resolve => {
          page.on('dialog', dialog => {
            resolve(dialog);
          });
        });
        const evalPromise = page.evaluate(() => {
          alert('test');
        });
        const dialog = await dialogPromise;
        await dialog.dismiss();
        await handleDialog(args).handler(
          {
            params: {
              action: 'dismiss',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().getDialog(), undefined);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully dismissed the dialog',
        );
        await evalPromise;
      });
    });
    it('can handle a dialog on a non-selected page via pageId', async () => {
      await withMcpContext(async (response, context, args) => {
        const page1 = context.getSelectedMcpPage();
        await context.newPage(); // page2 is now selected

        const dialogPromise = new Promise<void>(resolve => {
          page1.pptrPage.once('dialog', () => {
            resolve();
          });
        });
        const evalPromise = page1.pptrPage.evaluate(() => {
          alert('test');
        });
        await dialogPromise;

        // page1 is not selected, but its dialog should be accessible via page.
        await handleDialog(args).handler(
          {
            params: {
              action: 'accept',
            },
            page: page1,
          },
          response,
          context,
        );
        assert.strictEqual(page1.getDialog(), undefined);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully accepted the dialog',
        );
        await evalPromise;
      });
    });
    it('tracks dialogs independently per page', async () => {
      await withMcpContext(async (response, context, args) => {
        const page1 = context.getSelectedMcpPage();
        await context.newPage();
        const page2 = context.getSelectedMcpPage();

        // Trigger dialog on page1.
        const dialog1Promise = new Promise<void>(resolve => {
          page1.pptrPage.once('dialog', () => {
            resolve();
          });
        });
        const eval1Promise = page1.pptrPage.evaluate(() => {
          alert('dialog1');
        });
        await dialog1Promise;

        // Trigger dialog on page2.
        const dialog2Promise = new Promise<void>(resolve => {
          page2.pptrPage.once('dialog', () => {
            resolve();
          });
        });
        const eval2Promise = page2.pptrPage.evaluate(() => {
          alert('dialog2');
        });
        await dialog2Promise;

        // Both dialogs should be tracked.
        assert.ok(page1.getDialog());
        assert.ok(page2.getDialog());

        // Handle page1's dialog; page2's should remain.
        await handleDialog(args).handler(
          {params: {action: 'accept'}, page: page1},
          response,
          context,
        );
        assert.strictEqual(page1.getDialog(), undefined);
        assert.ok(page2.getDialog());

        // Handle page2's dialog.
        await handleDialog(args).handler(
          {params: {action: 'dismiss'}, page: page2},
          response,
          context,
        );
        assert.strictEqual(page2.getDialog(), undefined);

        await Promise.all([eval1Promise, eval2Promise]);
      });
    });
  });

  describe('get_tab_id', () => {
    it('returns the tab id', async () => {
      await withMcpContext(async (response, context, args) => {
        const page = context.getSelectedMcpPage().pptrPage;
        // @ts-expect-error _tabId is internal.
        assert.ok(typeof page._tabId === 'string');
        // @ts-expect-error _tabId is internal.
        page._tabId = 'test-tab-id';
        await getTabId(args).handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        const result = await response.handle(context);
        // @ts-expect-error _tabId is internal.
        assert.strictEqual(result.structuredContent.tabId, 'test-tab-id');
        assert.deepStrictEqual(response.responseLines, ['Tab ID: test-tab-id']);
      });
    });
  });
});
