/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {listPages, navigatePage, selectPage} from '../../src/tools/pages.js';
import {withMcpContext} from '../utils.js';

describe('webmcp', () => {
  it('list webmcp tools in navigate_page response', async () => {
    await withMcpContext(async (response, context) => {
      await navigatePage.handler(
        {params: {url: 'about:blank'}, page: context.getSelectedMcpPage()},
        response,
        context,
      );
      assert.ok(response.listWebMcpTools);
    });
  });

  it('list webmcp tools in list_pages response', async () => {
    await withMcpContext(async (response, context) => {
      await listPages().handler({params: {}}, response, context);
      assert.ok(response.listWebMcpTools);
    });
  });

  it('list webmcp tools in select_page response', async () => {
    await withMcpContext(async (response, context) => {
      const pageId =
        context.getPageId(context.getSelectedMcpPage().pptrPage) ?? 1;
      await selectPage.handler({params: {pageId}}, response, context);
      assert.ok(response.listWebMcpTools);
    });
  });
});
