/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {Dialog} from 'puppeteer-core';

import {
  listPages,
  newPage,
  closePage,
  selectPage,
  navigatePage,
  navigatePageHistory,
  resizePage,
  handleDialog,
} from '../../src/tools/pages.js';
import {withBrowser} from '../utils.js';

describe('pages', () => {
  describe('list_pages', () => {
    it('list pages', async () => {
      await withBrowser(async (response, context) => {
        await listPages.handler({params: {}}, response, context);
        assert.ok(response.includePages);
      });
    });
  });
  describe('browser_new_page', () => {
    it('create a page', async () => {
      await withBrowser(async (response, context) => {
        assert.strictEqual(context.getSelectedPageIdx(), 0);
        await newPage.handler(
          {params: {url: 'about:blank'}},
          response,
          context,
        );
        assert.strictEqual(context.getSelectedPageIdx(), 1);
        assert.ok(response.includePages);
      });
    });
  });
  describe('browser_close_page', () => {
    it('closes a page', async () => {
      await withBrowser(async (response, context) => {
        const page = await context.newPage();
        assert.strictEqual(context.getSelectedPageIdx(), 1);
        assert.strictEqual(context.getPageByIdx(1), page);
        await closePage.handler({params: {pageIdx: 1}}, response, context);
        assert.ok(page.isClosed());
        assert.ok(response.includePages);
      });
    });
    it('cannot close the last page', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await closePage.handler({params: {pageIdx: 0}}, response, context);
        assert.deepStrictEqual(
          response.responseLines[0],
          `The last open page cannot be closed. It is fine to keep it open.`,
        );
        assert.ok(response.includePages);
        assert.ok(!page.isClosed());
      });
    });
  });
  describe('browser_select_page', () => {
    it('selects a page', async () => {
      await withBrowser(async (response, context) => {
        await context.newPage();
        assert.strictEqual(context.getSelectedPageIdx(), 1);
        await selectPage.handler({params: {pageIdx: 0}}, response, context);
        assert.strictEqual(context.getSelectedPageIdx(), 0);
        assert.ok(response.includePages);
      });
    });
  });
  describe('browser_navigate_page', () => {
    it('navigates to correct page', async () => {
      await withBrowser(async (response, context) => {
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
      await withBrowser(async (response, context) => {
        const page = await context.newPage();
        assert.strictEqual(context.getSelectedPageIdx(), 1);
        assert.strictEqual(context.getPageByIdx(1), page);

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
  });
  describe('browser_navigate_page_history', () => {
    it('go back', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await navigatePageHistory.handler(
          {params: {navigate: 'back'}},
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
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto('data:text/html,<div>Hello MCP</div>');
        await page.goBack();
        await navigatePageHistory.handler(
          {params: {navigate: 'forward'}},
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
    it('go forward with error', async () => {
      await withBrowser(async (response, context) => {
        await navigatePageHistory.handler(
          {params: {navigate: 'forward'}},
          response,
          context,
        );

        assert.equal(
          response.responseLines.at(0),
          'Unable to navigate forward in currently selected page.',
        );
        assert.ok(response.includePages);
      });
    });
    it('go back with error', async () => {
      await withBrowser(async (response, context) => {
        await navigatePageHistory.handler(
          {params: {navigate: 'back'}},
          response,
          context,
        );

        assert.equal(
          response.responseLines.at(0),
          'Unable to navigate back in currently selected page.',
        );
        assert.ok(response.includePages);
      });
    });
  });
  describe('browser_resize', () => {
    it('create a page', async () => {
      await withBrowser(async (response, context) => {
        assert.strictEqual(context.getSelectedPageIdx(), 0);
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
        const dimensions = await page.evaluate(() => {
          return [window.innerWidth, window.innerHeight];
        });
        assert.deepStrictEqual(dimensions, [700, 500]);
      });
    });
  });

  describe('dialogs', () => {
    it('can accept dialogs', async () => {
      await withBrowser(async (response, context) => {
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
      await withBrowser(async (response, context) => {
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
      await withBrowser(async (response, context) => {
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
});
