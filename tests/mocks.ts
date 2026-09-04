/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sinon-based mock factories for McpPage, McpContext, McpResponse and
 * the underlying Puppeteer Page.
 *
 * Uses sinon.createStubInstance() so all methods are automatically stubbed
 * from the real class prototype — no hand-rolled interface definitions needed.
 *
 * Usage example:
 *
 *   const page = createMockMcpPage();
 *   const context = createMockMcpContext({selectedPage: page});
 *   const response = createMockMcpResponse();
 *
 *   await myTool.handler({params: {networkConditions: 'Slow 3G'}, page}, response, context);
 *
 *   sinon.assert.calledOnceWithExactly(page.emulate, {networkConditions: 'Slow 3G'});
 */

import type {Frame} from 'puppeteer-core';
import sinon from 'sinon';

import {McpContext} from '../src/McpContext.js';
import {McpPage} from '../src/McpPage.js';
import {McpResponse} from '../src/McpResponse.js';
import {CdpPage} from '../src/third_party/index.js';
import type {Page} from '../src/third_party/index.js';

export type MockMcpPage = sinon.SinonStubbedInstance<McpPage>;
export type MockMcpContext = sinon.SinonStubbedInstance<McpContext>;
export type MockMcpResponse = sinon.SinonStubbedInstance<McpResponse>;

/**
 * A minimal event emitter used to back mocked `on`/`off`/`emit` methods on
 * Puppeteer objects (Page, CDPSession, Browser) so tests can trigger events
 * synchronously without a real browser.
 */
export function mockListener() {
  const listeners: Record<
    string | symbol | number,
    Array<(data: unknown) => void>
  > = {};
  return {
    on(eventName: string | symbol | number, listener: (data: unknown) => void) {
      const arr = listeners[eventName];
      if (arr) {
        arr.push(listener);
      } else {
        listeners[eventName] = [listener];
      }
    },
    off(
      _eventName: string | symbol | number,
      _listener?: (data: unknown) => void,
    ) {
      // no-op
    },
    emit(eventName: string | symbol | number, data?: unknown) {
      for (const listener of listeners[eventName] ?? []) {
        listener(data);
      }
    },
  };
}

export function createMockPuppeteerPage(): sinon.SinonStubbedInstance<Page> {
  const page = sinon.createStubInstance(
    CdpPage,
  ) as unknown as sinon.SinonStubbedInstance<Page>;

  // mainFrame() must return a stable object so tests can pass it back into
  // page.emit('framenavigated', mainFrame) and have it recognized as the
  // same frame instance across calls.
  page.mainFrame.returns({} as Frame);

  // _client() is a private internal Puppeteer API used by ConsoleCollector
  // in the McpPage constructor. Not on the CdpPage prototype, so added
  // explicitly. It needs real on/off/emit behavior so tests can trigger CDP
  // events directly via cdpSession.emit(...).
  const cdpListener = mockListener();
  const cdpSession = {
    on: sinon.stub().callsFake(cdpListener.on),
    off: sinon.stub().callsFake(cdpListener.off),
    send: sinon.stub().resolves({}),
    target: sinon.stub().returns({_targetId: '<mock>'}),
    emit: cdpListener.emit,
  };
  // @ts-expect-error internal API
  page._client = sinon.stub().returns(cdpSession);

  return page;
}

export function createMockMcpPage(): MockMcpPage {
  return sinon.createStubInstance(McpPage);
}

export function createMockMcpContext(
  options: {selectedPage?: MockMcpPage} = {},
): MockMcpContext {
  const context = sinon.createStubInstance(McpContext);
  const page = options.selectedPage ?? createMockMcpPage();
  context.getSelectedMcpPage.returns(page satisfies McpPage);
  return context;
}

export function createMockMcpResponse(): MockMcpResponse {
  return sinon.createStubInstance(McpResponse);
}

/**
 * Convenience helper — creates a mock page, context and response in one call.
 *
 *   const {page, context, response} = createHandlerMocks();
 */
export function createHandlerMocks(): {
  page: MockMcpPage;
  context: MockMcpContext;
  response: MockMcpResponse;
} {
  const page = createMockMcpPage();
  const context = createMockMcpContext({selectedPage: page});
  const response = createMockMcpResponse();
  return {page, context, response};
}
