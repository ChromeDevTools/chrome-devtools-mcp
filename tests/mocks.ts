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
import {CdpPage, DevTools} from '../src/third_party/index.js';
import type {Page} from '../src/third_party/index.js';

export type MockMcpPage = sinon.SinonStubbedInstance<McpPage> & {
  pptrPage: sinon.SinonStubbedInstance<Page>;
};
export type MockMcpContext = sinon.SinonStubbedInstance<McpContext>;
export type MockMcpResponse = sinon.SinonStubbedInstance<McpResponse>;
export type MockDOMNode = sinon.SinonStubbedInstance<DevTools.DOMModel.DOMNode>;
export type MockCSSProperty =
  sinon.SinonStubbedInstance<DevTools.CSSProperty.CSSProperty>;
export type MockCSSStyleDeclaration =
  sinon.SinonStubbedInstance<DevTools.CSSStyleDeclaration.CSSStyleDeclaration>;
export type MockCSSMatchedStyles =
  sinon.SinonStubbedInstance<DevTools.CSSMatchedStyles.CSSMatchedStyles>;

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

export function createMockMcpPage(
  options: {pptrPage?: sinon.SinonStubbedInstance<Page>} = {},
): MockMcpPage {
  const page = sinon.createStubInstance(McpPage);
  const pptrPage = options.pptrPage ?? createMockPuppeteerPage();
  return Object.assign(page, {pptrPage});
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

function isBackendNodeId(
  id: unknown,
): id is DevTools.Protocol.DOM.BackendNodeId {
  return typeof id === 'number';
}

export interface MockDOMNodeOptions {
  selector?: string;
  backendNodeId?: number;
}

export function createMockDOMNode(
  options: MockDOMNodeOptions = {},
): MockDOMNode {
  const node = sinon.createStubInstance(DevTools.DOMModel.DOMNode);
  const selector = options.selector ?? 'button';
  const backendNodeId = options.backendNodeId ?? 1;
  if (isBackendNodeId(backendNodeId)) {
    node.backendNodeId.returns(backendNodeId);
  }
  node.simpleSelector.returns(selector);
  node.nodeNameInCorrectCase.returns(selector.split(/[#.]/)[0] || selector);
  return node;
}

export interface MockCSSPropertyOptions {
  important?: boolean;
  parsedOk?: boolean;
  disabled?: boolean;
}

export function createMockCSSProperty(
  name: string,
  value: string,
  options: MockCSSPropertyOptions = {},
): MockCSSProperty {
  const prop = sinon.createStubInstance(DevTools.CSSProperty.CSSProperty);
  prop.name = name;
  prop.value = value;
  prop.important = options.important ?? false;
  prop.parsedOk = options.parsedOk ?? true;
  prop.disabled = options.disabled ?? false;
  return prop;
}

export interface MockCSSStyleDeclarationOptions {
  rule?: DevTools.CSSRule.CSSRule | null;
  type?: DevTools.CSSStyleDeclaration.Type;
  animationName?: string;
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export function createMockCSSStyleDeclaration(
  properties: DevTools.CSSProperty.CSSProperty[],
  options: MockCSSStyleDeclarationOptions = {},
): MockCSSStyleDeclaration {
  const style = sinon.createStubInstance(
    DevTools.CSSStyleDeclaration.CSSStyleDeclaration,
  );
  style.type = options.type ?? DevTools.CSSStyleDeclaration.Type.Regular;
  style.allProperties.returns(properties);
  style.leadingProperties.returns(properties);
  style.parentRule = options.rule ?? null;
  style.animationName.returns(options.animationName ?? '');
  if (options.range) {
    Object.assign(style, {range: options.range});
  }
  return style;
}

export function createMockCSSInlineStyle(
  properties: DevTools.CSSProperty.CSSProperty[],
): MockCSSStyleDeclaration {
  return createMockCSSStyleDeclaration(properties, {
    type: DevTools.CSSStyleDeclaration.Type.Inline,
  });
}

export interface MockCSSMatchedStylesParams {
  node?: string | DevTools.DOMModel.DOMNode;
  nodeStyles?: DevTools.CSSStyleDeclaration.CSSStyleDeclaration[];
  parentNode?: string | DevTools.DOMModel.DOMNode;
  nodeForStyleMap?: Map<
    DevTools.CSSStyleDeclaration.CSSStyleDeclaration,
    DevTools.DOMModel.DOMNode
  >;
  propertyStates?: Map<DevTools.CSSProperty.CSSProperty, string>;
  matchingSelectorsMap?: Map<unknown, number[]>;
}

export function createMockCSSMatchedStyles(
  params: MockCSSMatchedStylesParams = {},
): MockCSSMatchedStyles {
  const mockNode =
    typeof params.node === 'string'
      ? createMockDOMNode({selector: params.node})
      : (params.node ?? createMockDOMNode());
  const nodeStyles = params.nodeStyles ?? [];

  const defaultParentNode =
    typeof params.parentNode === 'string'
      ? createMockDOMNode({selector: params.parentNode})
      : params.parentNode;
  const nodeForStyleMap = params.nodeForStyleMap ?? new Map();

  const propertyStates = params.propertyStates ?? new Map();

  const mock = sinon.createStubInstance(
    DevTools.CSSMatchedStyles.CSSMatchedStyles,
  );
  mock.node.returns(mockNode);
  mock.nodeStyles.returns(nodeStyles);

  mock.nodeForStyle.callsFake(
    style => nodeForStyleMap.get(style) ?? defaultParentNode ?? null,
  );

  mock.propertyState.callsFake(prop => propertyStates.get(prop) ?? 'Active');
  mock.getMatchingSelectors.callsFake(
    rule => params.matchingSelectorsMap?.get(rule) ?? [],
  );

  return mock;
}
