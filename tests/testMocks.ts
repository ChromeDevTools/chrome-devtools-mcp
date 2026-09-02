/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sinon-based mock factories for McpPage and McpContext.
 *
 * These helpers let tool-handler and formatter unit tests run without a real
 * browser. Use them wherever a full `withMcpContext` / `withBrowser` setup is
 * not required.
 *
 * Usage example:
 *
 *   const page = createMockMcpPage();
 *   const context = createMockMcpContext({selectedPage: page});
 *   const response = createMockMcpResponse();
 *
 *   await myTool.handler({params: {}, page}, response, context);
 *   assert.strictEqual(response.appendResponseLine.callCount, 1);
 */

import sinon from 'sinon';

import type {McpContext} from '../src/McpContext.js';
import type {McpPage} from '../src/McpPage.js';
import type {McpResponse} from '../src/McpResponse.js';
import type {EmulationSettings} from '../src/types.js';

// ---------------------------------------------------------------------------
// McpPage mock
// ---------------------------------------------------------------------------

export interface MockMcpPage
  extends Pick<
    McpPage,
    | 'id'
    | 'emulationSettings'
    | 'networkConditions'
    | 'cpuThrottlingRate'
    | 'geolocation'
    | 'viewport'
    | 'userAgent'
    | 'colorScheme'
  > {
  emulate: sinon.SinonStub;
  throwIfDialogOpen: sinon.SinonStub;
  getConsoleData: sinon.SinonStub;
  getNetworkRequests: sinon.SinonStub;
  // Allow tests to add extra stub properties without TS complaints.
  [key: string]: unknown;
}

/**
 * Creates a lightweight sinon-stubbed stand-in for `McpPage`.
 *
 * `emulate` is a stub that synchronously applies the supplied options to the
 * `emulationSettings` object, mirroring the real behaviour that most
 * tool-handler tests care about.
 */
export function createMockMcpPage(
  overrides: Partial<MockMcpPage> = {},
): MockMcpPage {
  const emulationSettings: EmulationSettings = {};

  // emulate() mirrors the real McpPage behaviour relevant to handler tests.
  //
  // The real implementation clears an override when its key is absent from the
  // options object (i.e. the caller did not pass it at all) OR when the value
  // is explicitly falsy. We replicate that contract here so that handler tests
  // that call emulate({}) correctly see previously-set values cleared.
  const emulate = sinon.stub().callsFake(async (options: EmulationSettings & {colorScheme?: string}) => {
    // networkConditions: present+truthy → set; absent or falsy → clear
    if (options.networkConditions) {
      emulationSettings.networkConditions = options.networkConditions;
    } else {
      delete emulationSettings.networkConditions;
    }

    // cpuThrottlingRate: always update when provided; absent → leave as-is
    // (rate of 1 means "no throttling"; real impl uses 1 as the default)
    if (options.cpuThrottlingRate !== undefined) {
      emulationSettings.cpuThrottlingRate = options.cpuThrottlingRate;
    }

    // geolocation: present+truthy → set; absent or null → clear
    if (options.geolocation) {
      emulationSettings.geolocation = options.geolocation;
    } else {
      delete emulationSettings.geolocation;
    }

    // userAgent: present+non-empty → set; absent or empty string → clear
    // Matches real McpPage: `if (!options.userAgent) { delete ... }` means
    // absent (undefined) also clears.
    if (options.userAgent) {
      emulationSettings.userAgent = options.userAgent;
    } else {
      delete emulationSettings.userAgent;
    }

    // colorScheme: 'dark'/'light' → set; 'auto' or absent → clear
    if (
      options.colorScheme &&
      (options.colorScheme === 'dark' || options.colorScheme === 'light')
    ) {
      emulationSettings.colorScheme = options.colorScheme as 'dark' | 'light';
    } else {
      delete emulationSettings.colorScheme;
    }

    // viewport: present+truthy → set; absent or null → clear
    if (options.viewport) {
      emulationSettings.viewport = options.viewport;
    } else {
      delete emulationSettings.viewport;
    }

    // extraHttpHeaders: present+non-empty → set; absent or {} → clear
    if (
      options.extraHttpHeaders &&
      Object.keys(options.extraHttpHeaders).length > 0
    ) {
      emulationSettings.extraHttpHeaders = options.extraHttpHeaders;
    } else {
      delete emulationSettings.extraHttpHeaders;
    }
  });

  const page: MockMcpPage = {
    id: 1,
    emulationSettings,

    // Getters that delegate to emulationSettings (matching McpPage getters)
    get networkConditions() {
      return emulationSettings.networkConditions ?? null;
    },
    get cpuThrottlingRate() {
      return emulationSettings.cpuThrottlingRate ?? 1;
    },
    get geolocation() {
      return emulationSettings.geolocation ?? null;
    },
    get viewport() {
      return emulationSettings.viewport ?? null;
    },
    get userAgent() {
      return emulationSettings.userAgent ?? null;
    },
    get colorScheme() {
      return (emulationSettings.colorScheme as 'dark' | 'light' | null) ?? null;
    },

    emulate,
    throwIfDialogOpen: sinon.stub(),
    getConsoleData: sinon.stub().returns([]),
    getNetworkRequests: sinon.stub().returns([]),

    ...overrides,
  };

  return page;
}

// ---------------------------------------------------------------------------
// McpContext mock
// ---------------------------------------------------------------------------

export interface MockMcpContext
  extends Pick<McpContext, 'getSelectedMcpPage' | 'getPages'> {
  getSelectedMcpPage: sinon.SinonStub;
  getPages: sinon.SinonStub;
  getPageById: sinon.SinonStub;
  selectPage: sinon.SinonStub;
  closePage: sinon.SinonStub;
  newPage: sinon.SinonStub;
  // Allow tests to add extra stub properties.
  [key: string]: unknown;
}

/**
 * Creates a sinon-stubbed stand-in for `McpContext`.
 *
 * By default `getSelectedMcpPage()` returns the provided `selectedPage` (or a
 * freshly created mock page if none is supplied). `getPageById` also returns
 * the same page by default.
 */
export function createMockMcpContext(
  options: {selectedPage?: MockMcpPage; pages?: MockMcpPage[]} = {},
): MockMcpContext {
  const page = options.selectedPage ?? createMockMcpPage();
  const pages = options.pages ?? [page];

  return {
    getSelectedMcpPage: sinon.stub().returns(page),
    getPages: sinon.stub().returns(pages),
    getPageById: sinon.stub().returns(page),
    selectPage: sinon.stub(),
    closePage: sinon.stub().resolves(),
    newPage: sinon.stub().resolves(page),
  };
}

// ---------------------------------------------------------------------------
// McpResponse mock
// ---------------------------------------------------------------------------

export interface MockMcpResponse
  extends Pick<McpResponse, 'appendResponseLine' | 'responseLines'> {
  appendResponseLine: sinon.SinonStub;
  setError: sinon.SinonStub;
  setIncludeConsoleData: sinon.SinonStub;
  attachConsoleMessage: sinon.SinonStub;
  setIncludeNetworkRequests: sinon.SinonStub;
  attachNetworkRequest: sinon.SinonStub;
  setIncludePages: sinon.SinonStub;
  setListThirdPartyDeveloperTools: sinon.SinonStub;
  setListWebMcpTools: sinon.SinonStub;
  includeSnapshot: sinon.SinonStub;
  attachDevToolsData: sinon.SinonStub;
  // Backing store for responseLines
  _lines: string[];
  // Allow extra stubs.
  [key: string]: unknown;
}

/**
 * Creates a sinon-stubbed stand-in for `McpResponse`.
 *
 * `appendResponseLine` records calls in the `responseLines` array so tests can
 * assert on the exact text returned to the LLM.
 */
export function createMockMcpResponse(): MockMcpResponse {
  const lines: string[] = [];

  const appendResponseLine = sinon
    .stub()
    .callsFake((line: string) => lines.push(line));

  return {
    _lines: lines,
    get responseLines(): readonly string[] {
      return lines;
    },
    appendResponseLine,
    setError: sinon.stub(),
    // Console
    setIncludeConsoleData: sinon.stub(),
    attachConsoleMessage: sinon.stub(),
    get includeConsoleData(): boolean {
      return false;
    },
    // Network
    setIncludeNetworkRequests: sinon.stub(),
    attachNetworkRequest: sinon.stub(),
    get includeNetworkRequests(): boolean {
      return false;
    },
    // Pages / navigation
    setIncludePages: sinon.stub(),
    setListThirdPartyDeveloperTools: sinon.stub(),
    setListWebMcpTools: sinon.stub(),
    get includePages(): boolean {
      return false;
    },
    // Snapshot
    includeSnapshot: sinon.stub(),
    get snapshotParams(): unknown {
      return undefined;
    },
    // DevTools data
    attachDevToolsData: sinon.stub(),
    // Images
    get images(): unknown[] {
      return [];
    },
  };
}
