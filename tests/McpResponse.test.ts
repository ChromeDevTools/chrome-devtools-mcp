/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import type {FormatData} from '../src/formatters/McpResponseFormatter.js';

import {withMcpContext, stabilizeResponseOutput} from './utils.js';

function serializeDataForSnapshot(data: FormatData): string {
  // Convert maps to objects for snapshotting
  const copy: Record<string, unknown> = {...data};
  if (copy.pageTitles instanceof Map) {
    copy.pageTitles = Object.fromEntries(copy.pageTitles);
  }
  return stabilizeResponseOutput(JSON.stringify(copy, null, 2));
}

describe('McpResponse data fetching', () => {
  it('fetches page titles when includePages is true', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludePages(true);
      const {data} = await response.handle(context);

      t.assert.snapshot(serializeDataForSnapshot(data));
    });
  });

  it('fetches network requests correctly', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.goto(
        'data:text/html,<html><body>Hello</body></html>',
      );

      response.setIncludeNetworkRequests(true);
      const {data} = await response.handle(context);

      // We only snapshot the keys to avoid flakiness with actual network request IDs
      const keys = Object.keys(data);
      t.assert.snapshot(JSON.stringify(keys, null, 2));
    });
  });

  it('fetches third party developer tools', async t => {
    await withMcpContext(async (response, context) => {
      response.setListThirdPartyDeveloperTools();
      const {data} = await response.handle(context);

      t.assert.snapshot(serializeDataForSnapshot(data));
    });
  });
});
