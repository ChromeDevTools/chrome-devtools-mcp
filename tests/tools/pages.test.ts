/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import type {Dialog} from 'puppeteer-core';
import sinon from 'sinon';

import type {ParsedArguments} from '../../src/cli.js';
import {installExtension} from '../../src/tools/extensions.js';
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
import {html, withMcpContext} from '../utils.js';

const EXTENSION_PATH = path.join(
  import.meta.dirname,
  '../../../tests/tools/fixtures/extension-sw',
);

describe('pages', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('list_pages', () => {
    it('list pages', async () => {
      await withMcpContext(async (response, context) => {
        await listPages().handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.ok(response.includePages);
      });
    });
    for (const categoryExtensions of [true, false]) {
      it(`list pages ${categoryExtensions ? 'with' : 'without'} --category-extensions`, async () => {
        await withMcpContext(
          async (response, context) => {
            await installExtension.handler(
              {params: {path: EXTENSION_PATH}},
              response,
              context,
            );

            const swTarget = await context.browser.waitForTarget(
              t =>
                t.type() === 'service_worker' &&
                t.url().includes('chrome-extension://'),
            );
            const swUrl = swTarget.url();

            response.resetResponseLineForTesting();

            const listPageDef = listPages({
              categoryExtensions,
            } as ParsedArguments);
            await listPageDef.handler(
              {params: {}, page: context.getSelectedMcpPage()},
              response,
              context,
            );

            const result = await response.handle(listPageDef.name, context);
            const textContent = result.content.find(c => c.type === 'text') as {
              type: 'text';
              text: string;
            };
            assert.ok(textContent);

            if (categoryExtensions) {
              assert.ok(textContent.text.includes(swUrl));
              const structured = result.structuredContent as {
                extensionServiceWorkers: Array<{url: string}>;
              };
              assert.deepStrictEqual(
                structured.extensionServiceWorkers.map(sw => sw.url),
                [swUrl],
              );
            } else {
              assert.ok(!textContent.text.includes(swUrl));
            }
          },
          {},
          {
            categoryExtensions,
          } as ParsedArguments,
        );
      });
    }
  });
  describe('new_page', () => {
    it('create a page', async () => {
      await withMcpContext(async (response, context) => {
        assert.strictEqual(
          context.getPageById(1),
          context.getSelectedMcpPage(),
        );
        await newPage.handler(
          {params: {url: 'about:blank'}},
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
    it('create a page in the background', async () => {
      await withMcpContext(async (response, context) => {
        const originalPage = context.getPageById(1);
        assert.strictEqual(originalPage, context.getSelectedMcpPage());
        // Ensure original page has focus
        await originalPage.pptrPage.bringToFront();
        assert.strictEqual(
          await originalPage.pptrPage.evaluate(() => document.hasFocus()),
          true,
        );
        await newPage.handler(
          {params: {url: 'about:blank', background: true}},
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
  });
  describe('new_page with isolatedContext', () => {
    it('creates a page in an isolated context', async () => {
      await withMcpContext(async (response, context) => {
        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'session-a'}},
          response,
          context,
        );
        const page = context.getSelectedPptrPage();
        assert.strictEqual(context.getIsolatedContextName(page), 'session-a');
        assert.ok(response.includePages);
      });
    });

    it('reuses the same context for the same isolatedContext name', async () => {
      await withMcpContext(async (response, context) => {
        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'session-a'}},
          response,
          context,
        );
        const page1 = context.getSelectedPptrPage();
        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'session-a'}},
          response,
          context,
        );
        const page2 = context.getSelectedPptrPage();
        assert.notStrictEqual(page1, page2);
        assert.strictEqual(context.getIsolatedContextName(page1), 'session-a');
        assert.strictEqual(context.getIsolatedContextName(page2), 'session-a');
        assert.strictEqual(page1.browserContext(), page2.browserContext());
      });
    });

    it('creates separate contexts for different isolatedContext names', async () => {
      await withMcpContext(async (response, context) => {
        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'session-a'}},
          response,
          context,
        );
        const pageA = context.getSelectedPptrPage();
        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'session-b'}},
          response,
          context,
        );
        const pageB = context.getSelectedPptrPage();
        assert.strictEqual(context.getIsolatedContextName(pageA), 'session-a');
        assert.strictEqual(context.getIsolatedContextName(pageB), 'session-b');
        assert.notStrictEqual(pageA.browserContext(), pageB.browserContext());
      });
    });

    it('includes isolatedContext in page listing', async () => {
      await withMcpContext(async (response, context) => {
        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'session-a'}},
          response,
          context,
        );
        const result = await response.handle('new_page', context);
        const pages = (
          result.structuredContent as {pages: Array<{isolatedContext?: string}>}
        ).pages;
        const isolatedPage = pages.find(p => p.isolatedContext === 'session-a');
        assert.ok(isolatedPage);
      });
    });

    it('does not set isolatedContext for pages in the default context', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        assert.strictEqual(context.getIsolatedContextName(page), undefined);
        await newPage.handler(
          {params: {url: 'about:blank'}},
          response,
          context,
        );
        assert.strictEqual(
          context.getIsolatedContextName(context.getSelectedPptrPage()),
          undefined,
        );
      });
    });

    it('closes an isolated page without errors', async () => {
      await withMcpContext(async (response, context) => {
        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'session-a'}},
          response,
          context,
        );
        const page = context.getSelectedPptrPage();
        const pageId = context.getPageId(page)!;
        assert.ok(!page.isClosed());
        await closePage.handler({params: {pageId}}, response, context);
        assert.ok(page.isClosed());
      });
    });
  });

  it('navigate_page targets the pageId page, not the global selection', async () => {
    await withMcpContext(async (response, context) => {
      await newPage.handler(
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
      await selectPage.handler({params: {pageId: 1}}, response, context);
      assert.notStrictEqual(context.getSelectedMcpPage(), isolatedPage);

      // Navigate using page; should target the isolated page.
      await navigatePage.handler(
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
        .getSelectedPptrPage()
        .evaluate(() => document.querySelector('h1')?.textContent);
      assert.notStrictEqual(defaultContent, 'Navigated');
    });
  });

  describe('close_page', () => {
    it('closes a page', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        assert.strictEqual(context.getPageById(2), page);
        await closePage.handler({params: {pageId: 2}}, response, context);
        assert.ok(page.pptrPage.isClosed());
        assert.ok(response.includePages);
      });
    });
    it('cannot close the last page', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await closePage.handler({params: {pageId: 1}}, response, context);
        assert.deepStrictEqual(
          response.responseLines[0],
          `The last open page cannot be closed. It is fine to keep it open.`,
        );
        assert.ok(response.includePages);
        assert.ok(!page.isClosed());
      });
    });
  });
  describe('select_page', () => {
    it('selects a page', async () => {
      await withMcpContext(async (response, context) => {
        await context.newPage();
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        await selectPage.handler({params: {pageId: 1}}, response, context);
        assert.strictEqual(
          context.getPageById(1),
          context.getSelectedMcpPage(),
        );
        assert.ok(response.includePages);
      });
    });
    it('selects a page and keeps it focused in the background', async () => {
      await withMcpContext(async (response, context) => {
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
        await selectPage.handler({params: {pageId: 1}}, response, context);
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
      await withMcpContext(async (response, context) => {
        // Create pages in separate isolated contexts.
        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'ctx-a'}},
          response,
          context,
        );
        const pageA = context.getSelectedPptrPage();
        const pageAId = context.getPageId(pageA)!;

        await newPage.handler(
          {params: {url: 'about:blank', isolatedContext: 'ctx-b'}},
          response,
          context,
        );
        const pageB = context.getSelectedPptrPage();

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
        await selectPage.handler(
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
  });
  describe('navigate_page', () => {
    it('navigates to correct page', async () => {
      await withMcpContext(async (response, context) => {
        await navigatePage.handler(
          {
            params: {url: 'data:text/html,<div>Hello MCP</div>'},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        const page = context.getSelectedPptrPage();
        assert.equal(
          await page.evaluate(() => document.querySelector('div')?.textContent),
          'Hello MCP',
        );
        assert.ok(response.includePages);
      });
    });

    it('throws an error if the page was closed not by the MCP server', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        assert.strictEqual(
          context.getPageById(2),
          context.getSelectedMcpPage(),
        );
        assert.strictEqual(context.getPageById(2), page);

        await page.pptrPage.close();

        try {
          await navigatePage.handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        const stub = sinon.stub(page, 'waitForNavigation').resolves(null);

        try {
          await navigatePage.handler(
            {
              params: {
                url: 'about:blank',
                timeout: 12345,
              },
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );
        } finally {
          stub.restore();
        }

        assert.strictEqual(
          stub.firstCall.args[0]?.timeout,
          12345,
          'The timeout parameter should be passed to waitForNavigation',
        );
      });
    });
    it('go back', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await navigatePage.handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await page.goBack();
        await navigatePage.handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await navigatePage.handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html` <script>
            window.addEventListener('beforeunload', e => {
              e.preventDefault();
              e.returnValue = '';
            });
          </script>`,
        );

        await navigatePage.handler(
          {params: {type: 'reload'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().getDialog(), undefined);
        assert.ok(response.includePages);
        assert.strictEqual(
          response.responseLines.join('\n'),
          'Accepted a beforeunload dialog.\nSuccessfully reloaded the page.',
        );
      });
    });

    it('reload with declining the beforeunload dialog', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setContent(
          html` <script>
            window.addEventListener('beforeunload', e => {
              e.preventDefault();
              e.returnValue = '';
            });
          </script>`,
        );

        await navigatePage.handler(
          {
            params: {
              type: 'reload',
              handleBeforeUnload: 'decline',
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
          'Declined a beforeunload dialog.\nUnable to reload the selected page: Navigation timeout of 500 ms exceeded.',
        );
      });
    });

    it('go forward with error', async () => {
      await withMcpContext(async (response, context) => {
        await navigatePage.handler(
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
      await withMcpContext(async (response, context) => {
        await navigatePage.handler(
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
      await withMcpContext(async (response, context) => {
        await navigatePage.handler(
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
        const page = context.getSelectedPptrPage();

        // wait for up to 1s for the global variable to set by the initScript to exist
        await page.waitForFunction("window.initScript==='completed'", {
          timeout: 1000,
        });

        assert.ok(response.includePages);
      });
    });
  });
  describe('resize', () => {
    it('resize the page', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        const resizePromise = page.evaluate(() => {
          return new Promise(resolve => {
            window.addEventListener('resize', resolve, {once: true});
          });
        });
        await resizePage.handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
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
        await resizePage.handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
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
        await resizePage.handler(
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
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
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
        await resizePage.handler(
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

    it('resize when window state is fullscreen', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
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
        await resizePage.handler(
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
    });
  });

  describe('dialogs', () => {
    it('can accept dialogs', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        const dialogPromise = new Promise<void>(resolve => {
          page.on('dialog', () => {
            resolve();
          });
        });
        page.evaluate(() => {
          alert('test');
        });
        await dialogPromise;
        await handleDialog.handler(
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
      });
    });
    it('can dismiss dialogs', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        const dialogPromise = new Promise<void>(resolve => {
          page.on('dialog', () => {
            resolve();
          });
        });
        page.evaluate(() => {
          alert('test');
        });
        await dialogPromise;
        await handleDialog.handler(
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
      });
    });
    it('can dismiss already dismissed dialog dialogs', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        const dialogPromise = new Promise<Dialog>(resolve => {
          page.on('dialog', dialog => {
            resolve(dialog);
          });
        });
        page.evaluate(() => {
          alert('test');
        });
        const dialog = await dialogPromise;
        await dialog.dismiss();
        await handleDialog.handler(
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
      });
    });
    it('can handle a dialog on a non-selected page via pageId', async () => {
      await withMcpContext(async (response, context) => {
        const page1 = context.getSelectedMcpPage();
        await context.newPage(); // page2 is now selected

        const dialogPromise = new Promise<void>(resolve => {
          page1.pptrPage.once('dialog', () => {
            resolve();
          });
        });
        page1.pptrPage.evaluate(() => {
          alert('test');
        });
        await dialogPromise;

        // page1 is not selected, but its dialog should be accessible via page.
        await handleDialog.handler(
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
      });
    });
    it('tracks dialogs independently per page', async () => {
      await withMcpContext(async (response, context) => {
        const page1 = context.getSelectedMcpPage();
        await context.newPage();
        const page2 = context.getSelectedMcpPage();

        // Trigger dialog on page1.
        const dialog1Promise = new Promise<void>(resolve => {
          page1.pptrPage.once('dialog', () => {
            resolve();
          });
        });
        page1.pptrPage.evaluate(() => {
          alert('dialog1');
        });
        await dialog1Promise;

        // Trigger dialog on page2.
        const dialog2Promise = new Promise<void>(resolve => {
          page2.pptrPage.once('dialog', () => {
            resolve();
          });
        });
        page2.pptrPage.evaluate(() => {
          alert('dialog2');
        });
        await dialog2Promise;

        // Both dialogs should be tracked.
        assert.ok(page1.getDialog());
        assert.ok(page2.getDialog());

        // Handle page1's dialog; page2's should remain.
        await handleDialog.handler(
          {params: {action: 'accept'}, page: page1},
          response,
          context,
        );
        assert.strictEqual(page1.getDialog(), undefined);
        assert.ok(page2.getDialog());

        // Handle page2's dialog.
        await handleDialog.handler(
          {params: {action: 'dismiss'}, page: page2},
          response,
          context,
        );
        assert.strictEqual(page2.getDialog(), undefined);
      });
    });
  });

  describe('get_tab_id', () => {
    it('returns the tab id', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        // @ts-expect-error _tabId is internal.
        assert.ok(typeof page._tabId === 'string');
        // @ts-expect-error _tabId is internal.
        page._tabId = 'test-tab-id';
        await getTabId.handler(
          {params: {pageId: 1}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        const result = await response.handle('get_tab_id', context);
        // @ts-expect-error _tabId is internal.
        assert.strictEqual(result.structuredContent.tabId, 'test-tab-id');
        assert.deepStrictEqual(response.responseLines, []);
      });
    });
  });
});
