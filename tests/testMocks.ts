/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sinon-based mock factories for McpPage, McpContext and McpResponse.
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
 *   sinon.assert.calledWith(page.emulate, sinon.match({networkConditions: 'Slow 3G'}));
 */

import sinon from 'sinon';

import {McpContext} from '../src/McpContext.js';
import {McpPage} from '../src/McpPage.js';
import {McpResponse} from '../src/McpResponse.js';

export type MockMcpPage = sinon.SinonStubbedInstance<McpPage>;
export type MockMcpContext = sinon.SinonStubbedInstance<McpContext>;
export type MockMcpResponse = sinon.SinonStubbedInstance<McpResponse>;

/**
 * Returns a sinon stub instance of McpPage.
 * Every method is automatically stubbed. Override per-test as needed, e.g.:
 *   page.emulate.resolves();
 */
export function createMockMcpPage(): MockMcpPage {
  return sinon.createStubInstance(McpPage);
}

/**
 * Returns a sinon stub instance of McpContext.
 * `getSelectedMcpPage()` is pre-configured to return the provided page.
 */
export function createMockMcpContext(
  options: {selectedPage?: MockMcpPage} = {},
): MockMcpContext {
  const context = sinon.createStubInstance(McpContext);
  const page = options.selectedPage ?? createMockMcpPage();
  // SinonStubbedInstance<McpPage> satisfies McpPage structurally; the cast
  // is expressed via satisfies to avoid the banned `as` keyword.
  context.getSelectedMcpPage.returns(page satisfies McpPage);
  return context;
}

/**
 * Returns a sinon stub instance of McpResponse.
 */
export function createMockMcpResponse(): MockMcpResponse {
  return sinon.createStubInstance(McpResponse);
}
