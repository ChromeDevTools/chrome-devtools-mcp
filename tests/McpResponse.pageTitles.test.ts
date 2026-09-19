/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {afterEach, it} from 'node:test';

import sinon from 'sinon';

import {McpResponse} from '../src/McpResponse.js';

import {
  createMockMcpContext,
  createMockMcpPage,
  createMockParsedArguments,
} from './mocks.js';

afterEach(() => sinon.restore());

for (const categoryExtensions of [false, true]) {
  it(`bounds page title collection to one timeout (extensions: ${categoryExtensions})`, async () => {
    const context = createMockMcpContext();
    const pages = Array.from({length: 3}, () => createMockMcpPage());
    for (const page of pages) {
      page.pptrPage.url.returns('https://example.com/');
      page.pptrPage.title.returns(
        new Promise<string>(() => {
          // Simulate a page whose title lookup never responds.
        }),
      );
    }
    context.getPages.returns(pages);
    context.isPageSelected.returns(false);
    pages[2].pptrPage.url.returns('chrome-extension://test/popup.html');
    context.getExtensionServiceWorkers.returns([]);
    const response = new McpResponse(
      createMockParsedArguments({categoryExtensions}),
    );
    response.setIncludePages(true);
    const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const result = response.handle(context);
    await clock.runAllAsync();
    const {structuredContent} = await result;
    assert.equal(clock.now, 1000);
    assert.ok('pages' in structuredContent);
    assert.deepEqual(
      structuredContent.pages,
      pages.slice(0, 2).map(page => ({
        id: page.id,
        url: page.pptrPage.url(),
        title: '',
        selected: false,
      })),
    );
    for (const page of pages.slice(0, 2)) {
      sinon.assert.calledOnceWithExactly(page.pptrPage.title);
    }
    if (categoryExtensions) {
      sinon.assert.calledOnceWithExactly(pages[2].pptrPage.title);
      assert.ok('extensionPages' in structuredContent);
      assert.deepEqual(structuredContent.extensionPages, [
        {
          id: pages[2].id,
          url: pages[2].pptrPage.url(),
          title: '',
          selected: false,
        },
      ]);
    } else {
      sinon.assert.notCalled(pages[2].pptrPage.title);
      assert.ok(!('extensionPages' in structuredContent));
    }
  });
}

it('preserves page order and title fallback when lookups finish out of order', async () => {
  const context = createMockMcpContext();
  const pages = Array.from({length: 3}, () => createMockMcpPage());
  for (const [index, page] of pages.entries()) {
    page.pptrPage.url.returns(`https://example.com/${index}`);
  }
  context.getPages.returns(pages);
  context.isPageSelected.returns(false);
  const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  pages[0].pptrPage.title.callsFake(
    () => new Promise(resolve => setTimeout(() => resolve('First'), 100)),
  );
  pages[1].pptrPage.title.resolves('Second');
  pages[2].pptrPage.title.rejects(new Error('Target closed'));
  const response = new McpResponse(createMockParsedArguments());
  response.setIncludePages(true);
  const result = response.handle(context);
  await clock.runAllAsync();
  const {structuredContent} = await result;
  assert.ok('pages' in structuredContent);
  assert.deepEqual(
    structuredContent.pages,
    pages.map((page, index) => ({
      id: page.id,
      url: page.pptrPage.url(),
      title: ['First', 'Second', ''][index],
      selected: false,
    })),
  );
});
