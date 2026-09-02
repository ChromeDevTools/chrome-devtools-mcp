/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sinon-based mock factories for McpPage, McpContext and McpResponse.
 *
 * These helpers let tool-handler unit tests run without a real browser.
 * Use them wherever a full `withMcpContext` / `withBrowser` setup is not
 * required.
 *
 * Usage example:
 *
 *   const page = createMockMcpPage();
 *   const context = createMockMcpContext({selectedPage: page});
 *   const response = createMockMcpResponse();
 *
 *   await myTool.handler({params: {}, page}, response, context);
 *   assert.strictEqual(page.networkConditions, 'Offline');
 */

import sinon from 'sinon';

import type {Context, ContextPage, Response} from '../src/tools/ToolDefinition.js';
import type {EmulationSettings} from '../src/types.js';

// ---------------------------------------------------------------------------
// McpPage mock
// ---------------------------------------------------------------------------

/**
 * A mock that satisfies the `ContextPage` interface expected by all page-scoped
 * tool handlers, plus the `emulationSettings` surface used by emulation tests.
 *
 * `emulate()` mirrors real `McpPage.emulate()` clear/set semantics so handler
 * tests can assert on state without a real browser.
 */
export interface MockMcpPage extends ContextPage {
  emulationSettings: EmulationSettings;
  [key: string]: unknown;
}

export function createMockMcpPage(
  overrides: Partial<MockMcpPage> = {},
): MockMcpPage {
  const emulationSettings: EmulationSettings = {};

  // Mirrors real McpPage.emulate(): falsy → clear key, truthy → store.
  const emulate = sinon.stub().callsFake(
    async (options: EmulationSettings & {colorScheme?: string}) => {
      if (options.networkConditions) {
        emulationSettings.networkConditions = options.networkConditions;
      } else {
        delete emulationSettings.networkConditions;
      }
      if (options.cpuThrottlingRate !== undefined) {
        emulationSettings.cpuThrottlingRate = options.cpuThrottlingRate;
      }
      if (options.geolocation) {
        emulationSettings.geolocation = options.geolocation;
      } else {
        delete emulationSettings.geolocation;
      }
      if (options.userAgent) {
        emulationSettings.userAgent = options.userAgent;
      } else {
        delete emulationSettings.userAgent;
      }
      if (
        options.colorScheme === 'dark' ||
        options.colorScheme === 'light'
      ) {
        emulationSettings.colorScheme = options.colorScheme;
      } else {
        delete emulationSettings.colorScheme;
      }
      if (options.viewport) {
        emulationSettings.viewport = options.viewport;
      } else {
        delete emulationSettings.viewport;
      }
      if (
        options.extraHttpHeaders &&
        Object.keys(options.extraHttpHeaders).length > 0
      ) {
        emulationSettings.extraHttpHeaders = options.extraHttpHeaders;
      } else {
        delete emulationSettings.extraHttpHeaders;
      }
    },
  );

  const page: MockMcpPage = {
    pptrPage: {} as ContextPage['pptrPage'],
    emulationSettings,

    get cpuThrottlingRate() {
      return emulationSettings.cpuThrottlingRate ?? 1;
    },
    get networkConditions() {
      return emulationSettings.networkConditions ?? null;
    },

    getAXNodeByUid: sinon.stub().returns(undefined),
    getElementByUid: sinon.stub().resolves(null),
    resolveCdpRequestId: sinon.stub().returns(undefined),
    getDialog: sinon.stub().returns(undefined),
    clearDialog: sinon.stub(),
    throwIfDialogOpen: sinon.stub(),
    waitForEventsAfterAction: sinon
      .stub()
      .callsFake(async (action: () => Promise<unknown>) => {
        await action();
        return {};
      }),
    getThirdPartyDeveloperTools: sinon.stub().returns([]),
    executeThirdPartyDeveloperTool: sinon.stub().resolves(),
    getDevToolsData: sinon.stub().resolves({}),
    restoreEmulation: sinon.stub().resolves(),
    emulate,
    waitForTextOnPage: sinon.stub().resolves(null),

    ...overrides,
  };

  return page;
}

// ---------------------------------------------------------------------------
// McpContext mock
// ---------------------------------------------------------------------------

export interface MockMcpContext extends Context {
  [key: string]: unknown;
}

export function createMockMcpContext(  options: {selectedPage?: MockMcpPage; pages?: MockMcpPage[]} = {},
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
    installPWA: sinon.stub().resolves(''),
    uninstallPWA: sinon.stub().resolves(),
    launchPWA: sinon.stub().resolves(null),
    getPWAState: sinon.stub().resolves({}),
    ensureExtension: sinon.stub().resolves(''),
    isRunningPerformanceTrace: sinon.stub().returns(false),
    setIsRunningPerformanceTrace: sinon.stub(),
    isCruxEnabled: sinon.stub().returns(false),
    recordedTraces: sinon.stub().returns([]),
    storeTraceRecording: sinon.stub(),
    saveTemporaryFile: sinon.stub().resolves({filepath: ''}),
    saveFile: sinon.stub().resolves({filename: ''}),
    getScreenRecorder: sinon.stub().returns(null),
    setScreenRecorder: sinon.stub(),
    installExtension: sinon.stub().resolves(''),
    uninstallExtension: sinon.stub().resolves(),
    triggerExtensionAction: sinon.stub().resolves(),
    listExtensions: sinon.stub().resolves(new Map()),
    getExtension: sinon.stub().resolves(undefined),
    getExtensionServiceWorkers: sinon.stub().returns([]),
    getExtensionServiceWorkerId: sinon.stub().returns(undefined),
    getHeapSnapshotAggregates: sinon.stub().resolves({}),
    getHeapSnapshotDuplicateStrings: sinon.stub().resolves([]),
    getHeapSnapshotStats: sinon.stub().resolves({}),
    getHeapSnapshotStaticData: sinon.stub().resolves(null),
    getHeapSnapshotNativeContextSizes: sinon.stub().resolves({}),
    getHeapSnapshotRetainedByContextSummary: sinon.stub().resolves({}),
    getHeapSnapshotNodesById: sinon.stub().resolves({}),
    getHeapSnapshotRetainers: sinon.stub().resolves({}),
    getHeapSnapshotObjectDetails: sinon.stub().resolves({}),
    closeHeapSnapshot: sinon.stub().resolves(true),
    getHeapSnapshotRetainingPaths: sinon.stub().resolves({}),
    getHeapSnapshotDominators: sinon.stub().resolves({}),
    getHeapSnapshotEdges: sinon.stub().resolves({}),
    getHeapSnapshotClassDiffs: sinon.stub().resolves([]),
    getHeapSnapshotDetailedClassDiff: sinon.stub().resolves({}),
    queryHeapSnapshotObjects: sinon.stub().resolves({}),
  };
}

// ---------------------------------------------------------------------------
// McpResponse mock
// ---------------------------------------------------------------------------

export interface MockMcpResponse extends Response {
  // Sinon stubs for every Response method so tests can call
  // e.g. response.appendResponseLine.callCount
  appendResponseLine: sinon.SinonStub;
  setHeapSnapshotAggregates: sinon.SinonStub;
  setHeapSnapshotStats: sinon.SinonStub;
  setHeapSnapshotNodes: sinon.SinonStub;
  setHeapSnapshotDuplicateStrings: sinon.SinonStub;
  setHeapSnapshotRetainingPaths: sinon.SinonStub;
  setHeapSnapshotDominators: sinon.SinonStub;
  setHeapSnapshotClassDiffs: sinon.SinonStub;
  setHeapSnapshotDetailedClassDiff: sinon.SinonStub;
  setHeapSnapshotObjectDetails: sinon.SinonStub;
  setIncludePages: sinon.SinonStub;
  setIncludeNetworkRequests: sinon.SinonStub;
  setIncludeConsoleData: sinon.SinonStub;
  includeSnapshot: sinon.SinonStub;
  attachImage: sinon.SinonStub;
  attachNetworkRequest: sinon.SinonStub;
  attachConsoleMessage: sinon.SinonStub;
  attachDevToolsData: sinon.SinonStub;
  setTabId: sinon.SinonStub;
  attachTraceSummary: sinon.SinonStub;
  attachTraceInsight: sinon.SinonStub;
  setListExtensions: sinon.SinonStub;
  attachLighthouseResult: sinon.SinonStub;
  setListThirdPartyDeveloperTools: sinon.SinonStub;
  setListWebMcpTools: sinon.SinonStub;
  attachWaitForResult: sinon.SinonStub;
  setError: sinon.SinonStub;
  // Readable backing store for appendResponseLine calls
  readonly responseLines: readonly string[];
  _lines: string[];
  [key: string]: unknown;
}

/**
 * `appendResponseLine` records calls so tests can assert on the exact text
 * returned to the LLM via `response.responseLines`.
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
    setHeapSnapshotAggregates: sinon.stub(),
    setHeapSnapshotStats: sinon.stub(),
    setHeapSnapshotNodes: sinon.stub(),
    setHeapSnapshotDuplicateStrings: sinon.stub(),
    setHeapSnapshotRetainingPaths: sinon.stub(),
    setHeapSnapshotDominators: sinon.stub(),
    setHeapSnapshotClassDiffs: sinon.stub(),
    setHeapSnapshotDetailedClassDiff: sinon.stub(),
    setHeapSnapshotObjectDetails: sinon.stub(),
    setIncludePages: sinon.stub(),
    setIncludeNetworkRequests: sinon.stub(),
    setIncludeConsoleData: sinon.stub(),
    includeSnapshot: sinon.stub(),
    attachImage: sinon.stub(),
    attachNetworkRequest: sinon.stub(),
    attachConsoleMessage: sinon.stub(),
    attachDevToolsData: sinon.stub(),
    setTabId: sinon.stub(),
    attachTraceSummary: sinon.stub(),
    attachTraceInsight: sinon.stub(),
    setListExtensions: sinon.stub(),
    attachLighthouseResult: sinon.stub(),
    setListThirdPartyDeveloperTools: sinon.stub(),
    setListWebMcpTools: sinon.stub(),
    attachWaitForResult: sinon.stub(),
    setError: sinon.stub(),
  };
}
