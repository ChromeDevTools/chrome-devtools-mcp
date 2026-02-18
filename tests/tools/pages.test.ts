/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {Dialog} from 'puppeteer-core';
import sinon from 'sinon';

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

describe('pages', () => {
  describe('list_pages', () => {
    it('list pages', async () => {
      await withMcpContext(async (response, context) => {
        await listPages.handler({params: {}}, response, context);
        assert.ok(response.includePages);
      });
    });
  });
  describe('new_page', () => {
    it('create a page', async () => {
      await withMcpContext(async (response, context) => {
        assert.strictEqual(context.getPageById(1), context.getSelectedPage());
        await newPage.handler(
          {params: {url: 'about:blank'}},
          response,
          context,
        );
        assert.strictEqual(context.getPageById(2), context.getSelectedPage());
        assert.ok(response.includePages);
      });
    });
    it('create a page in the background', async () => {
      await withMcpContext(async (response, context) => {
        const originalPage = context.getPageById(1);
        assert.strictEqual(originalPage, context.getSelectedPage());
        // Ensure original page has focus
        await originalPage.bringToFront();
        assert.strictEqual(
          await originalPage.evaluate(() => document.hasFocus()),
          true,
        );
        await newPage.handler(
          {params: {url: 'about:blank', background: true}},
          response,
          context,
        );
        // New page should be selected but original should retain focus
        assert.strictEqual(context.getPageById(2), context.getSelectedPage());
        assert.strictEqual(
          await originalPage.evaluate(() => document.hasFocus()),
          true,
        );
        assert.ok(response.includePages);
      });
    });
  });
  describe('close_page', () => {
    it('closes a page', async () => {
      await withMcpContext(async (response, context) => {
        const page = await context.newPage();
        assert.strictEqual(context.getPageById(2), context.getSelectedPage());
        assert.strictEqual(context.getPageById(2), page);
        await closePage.handler({params: {pageId: 2}}, response, context);
        assert.ok(page.isClosed());
        assert.ok(response.includePages);
      });
    });
    it('cannot close the last page', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
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
        assert.strictEqual(context.getPageById(2), context.getSelectedPage());
        await selectPage.handler({params: {pageId: 1}}, response, context);
        assert.strictEqual(context.getPageById(1), context.getSelectedPage());
        assert.ok(response.includePages);
      });
    });
    it('selects a page and keeps it focused in the background', async () => {
      await withMcpContext(async (response, context) => {
        await context.newPage();
        assert.strictEqual(context.getPageById(2), context.getSelectedPage());
        assert.strictEqual(
          await context.getPageById(1).evaluate(() => document.hasFocus()),
          false,
        );
        await selectPage.handler({params: {pageId: 1}}, response, context);
        assert.strictEqual(context.getPageById(1), context.getSelectedPage());
        assert.strictEqual(
          await context.getPageById(1).evaluate(() => document.hasFocus()),
          true,
        );
        assert.ok(response.includePages);
      });
    });
  });
  describe('navigate_page', () => {
    it('navigates to correct page', async () => {
      await withMcpContext(async (response, context) => {
        await navigatePage.handler(
          {params: {url: 'data:text/html,<div>Hello MCP</div>'}},
          response,
          context,
        );
        const page = context.getSelectedPage();
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
        assert.strictEqual(context.getPageById(2), context.getSelectedPage());
        assert.strictEqual(context.getPageById(2), page);

        await page.close();

        try {
          await navigatePage.handler(
            {params: {url: 'data:text/html,<div>Hello MCP</div>'}},
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
        const page = context.getSelectedPage();
        const stub = sinon.stub(page, 'waitForNavigation').resolves(null);

        try {
          await navigatePage.handler(
            {
              params: {
                url: 'about:blank',
                timeout: 12345,
              },
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
        const page = context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await navigatePage.handler({params: {type: 'back'}}, response, context);

        assert.equal(
          await page.evaluate(() => document.location.href),
          'about:blank',
        );
        assert.ok(response.includePages);
      });
    });
    it('go forward', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await page.goBack();
        await navigatePage.handler(
          {params: {type: 'forward'}},
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
        const page = context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await navigatePage.handler(
          {params: {type: 'reload'}},
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
        const page = context.getSelectedPage();
        await page.setContent(
          html` <script>
            window.addEventListener('beforeunload', e => {
              e.preventDefault();
              e.returnValue = '';
            });
          </script>`,
        );

        await navigatePage.handler(
          {params: {type: 'reload'}},
          response,
          context,
        );

        assert.strictEqual(context.getDialog(), undefined);
        assert.ok(response.includePages);
        assert.strictEqual(
          response.responseLines.join('\n'),
          'Accepted a beforeunload dialog.\nSuccessfully reloaded the page.',
        );
      });
    });

    it('reload with declining the beforeunload dialog', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
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
          },
          response,
          context,
        );

        assert.strictEqual(context.getDialog(), undefined);
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
          {params: {type: 'forward'}},
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
        await navigatePage.handler({params: {type: 'back'}}, response, context);

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
          },
          response,
          context,
        );
        const page = context.getSelectedPage();

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
        const page = context.getSelectedPage();
        const resizePromise = page.evaluate(() => {
          return new Promise(resolve => {
            window.addEventListener('resize', resolve, {once: true});
          });
        });
        await resizePage.handler(
          {params: {width: 700, height: 500}},
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
        const page = context.getSelectedPage();
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
          {params: {width: 650, height: 450}},
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
        const page = context.getSelectedPage();
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
          {params: {width: 750, height: 550}},
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
        const page = context.getSelectedPage();
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
          {params: {width: 725, height: 525}},
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
        const page = context.getSelectedPage();
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
          {params: {width: 850, height: 650}},
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
        const page = context.getSelectedPage();
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
          },
          response,
          context,
        );
        assert.strictEqual(context.getDialog(), undefined);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully accepted the dialog',
        );
      });
    });
    it('can dismiss dialogs', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
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
          },
          response,
          context,
        );
        assert.strictEqual(context.getDialog(), undefined);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully dismissed the dialog',
        );
      });
    });
    it('can dismiss already dismissed dialog dialogs', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
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
          },
          response,
          context,
        );
        assert.strictEqual(context.getDialog(), undefined);
        assert.strictEqual(
          response.responseLines[0],
          'Successfully dismissed the dialog',
        );
      });
    });
  });

  describe('get_tab_id', () => {
    it('returns the tab id', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        // @ts-expect-error _tabId is internal.
        assert.ok(typeof page._tabId === 'string');
        // @ts-expect-error _tabId is internal.
        page._tabId = 'test-tab-id';
        await getTabId.handler({params: {pageId: 1}}, response, context);
        const result = await response.handle('get_tab_id', context);
        // @ts-expect-error _tabId is internal.
        assert.strictEqual(result.structuredContent.tabId, 'test-tab-id');
        assert.deepStrictEqual(response.responseLines, []);
      });
    });
  });
});
