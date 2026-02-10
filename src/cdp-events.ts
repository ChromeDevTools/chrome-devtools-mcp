/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CDP Event Collector — Raw CDP event subscription and storage.
 *
 * This module handles CDP event subscriptions via raw WebSocket connection
 * to the VS Code Extension Development Host.
 *
 * It subscribes to CDP events for:
 * - Console messages (Runtime.consoleAPICalled)
 * - Network requests (Network.requestWillBeSent, responseReceived, loadingFinished, loadingFailed)
 * - Tracing (Tracing.dataCollected, Tracing.tracingComplete)
 */

import WebSocket from 'ws';

import {logger} from './logger.js';
import {sendCdp, getCdpWebSocket, getBrowserCdpWebSocket, getConnectionGeneration} from './vscode.js';

// ── Types ───────────────────────────────────────────────

export interface ConsoleMessage {
  id: number;
  type: string;
  text: string;
  args: Array<{type: string; value?: unknown; description?: string}>;
  timestamp: number;
  stackTrace?: Array<{
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  }>;
}

export interface NetworkRequest {
  id: number;
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  timestamp: number;
  status?: number;
  statusText?: string;
  mimeType?: string;
  responseHeaders?: Record<string, string>;
  failed?: boolean;
  errorText?: string;
  responseBody?: string;
  requestBody?: string;
}

export interface TraceData {
  chunks: unknown[];
  complete: boolean;
  filePath?: string;
}

// ── Storage ─────────────────────────────────────────────
// Data is stored per-session and cleared automatically on:
// - Connection reconnect (new generation)
// - Server exit (SIGINT, SIGTERM, uncaughtException)
// - WebSocket close

let consoleMessages: ConsoleMessage[] = [];
let networkRequests = new Map<string, NetworkRequest>();
let traceData: TraceData = {chunks: [], complete: false};

let consoleIdCounter = 1;
let networkIdCounter = 1;
let subscribedGeneration = -1;
let eventListenerCleanup: (() => void) | undefined;
let browserEventListenerCleanup: (() => void) | undefined;

// ── Event Handlers ──────────────────────────────────────

function handleConsoleAPICalled(params: {
  type: string;
  args: Array<{type: string; value?: unknown; description?: string}>;
  timestamp: number;
  stackTrace?: {callFrames: Array<{functionName: string; url: string; lineNumber: number; columnNumber: number}>};
}): void {
  const textParts: string[] = [];
  for (const arg of params.args) {
    if (arg.value !== undefined) {
      textParts.push(String(arg.value));
    } else if (arg.description) {
      textParts.push(arg.description);
    } else {
      textParts.push(`[${arg.type}]`);
    }
  }

  const message: ConsoleMessage = {
    id: consoleIdCounter++,
    type: params.type,
    text: textParts.join(' '),
    args: params.args,
    timestamp: params.timestamp,
  };

  if (params.stackTrace?.callFrames?.length) {
    message.stackTrace = params.stackTrace.callFrames.map(cf => ({
      functionName: cf.functionName,
      url: cf.url,
      lineNumber: cf.lineNumber,
      columnNumber: cf.columnNumber,
    }));
  }

  consoleMessages.push(message);
}

function handleRequestWillBeSent(params: {
  requestId: string;
  request: {url: string; method: string; postData?: string};
  type?: string;
  timestamp: number;
}): void {
  const request: NetworkRequest = {
    id: networkIdCounter++,
    requestId: params.requestId,
    url: params.request.url,
    method: params.request.method,
    resourceType: params.type ?? 'other',
    timestamp: params.timestamp,
  };

  if (params.request.postData) {
    request.requestBody = params.request.postData;
  }

  networkRequests.set(params.requestId, request);
}

function handleResponseReceived(params: {
  requestId: string;
  response: {
    status: number;
    statusText: string;
    mimeType: string;
    headers: Record<string, string>;
  };
  type?: string;
}): void {
  const request = networkRequests.get(params.requestId);
  if (request) {
    request.status = params.response.status;
    request.statusText = params.response.statusText;
    request.mimeType = params.response.mimeType;
    request.responseHeaders = params.response.headers;
    if (params.type) {
      request.resourceType = params.type;
    }
  }
}

function handleLoadingFinished(params: {requestId: string}): void {
  // Request completed successfully - nothing to update, already marked as not failed
}

function handleLoadingFailed(params: {
  requestId: string;
  errorText: string;
}): void {
  const request = networkRequests.get(params.requestId);
  if (request) {
    request.failed = true;
    request.errorText = params.errorText;
  }
}

function handleTracingDataCollected(params: {value: unknown[]}): void {
  traceData.chunks.push(...params.value);
}

function handleTracingComplete(): void {
  traceData.complete = true;
}

// ── CDP Message Router ──────────────────────────────────

function routeCdpEvent(data: {method?: string; params?: unknown}): void {
  if (!data.method) {return;}

  switch (data.method) {
    case 'Runtime.consoleAPICalled':
      handleConsoleAPICalled(data.params as Parameters<typeof handleConsoleAPICalled>[0]);
      break;
    case 'Network.requestWillBeSent':
      handleRequestWillBeSent(data.params as Parameters<typeof handleRequestWillBeSent>[0]);
      break;
    case 'Network.responseReceived':
      handleResponseReceived(data.params as Parameters<typeof handleResponseReceived>[0]);
      break;
    case 'Network.loadingFinished':
      handleLoadingFinished(data.params as Parameters<typeof handleLoadingFinished>[0]);
      break;
    case 'Network.loadingFailed':
      handleLoadingFailed(data.params as Parameters<typeof handleLoadingFailed>[0]);
      break;
    case 'Tracing.dataCollected':
      handleTracingDataCollected(data.params as Parameters<typeof handleTracingDataCollected>[0]);
      break;
    case 'Tracing.tracingComplete':
      handleTracingComplete();
      break;
  }
}

// ── Public API ──────────────────────────────────────────

/**
 * Initialize CDP event subscriptions on the current WebSocket connection.
 * Safe to call multiple times - only subscribes once per connection generation.
 */
export async function initCdpEventSubscriptions(): Promise<void> {
  const ws = getCdpWebSocket();
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logger('CDP WebSocket not available for event subscriptions');
    return;
  }

  const currentGeneration = getConnectionGeneration();
  if (subscribedGeneration === currentGeneration) {
    // Already subscribed to this connection
    return;
  }

  // Clean up previous listeners
  if (eventListenerCleanup) {
    eventListenerCleanup();
    eventListenerCleanup = undefined;
  }
  if (browserEventListenerCleanup) {
    browserEventListenerCleanup();
    browserEventListenerCleanup = undefined;
  }

  // Clear stored data for new connection
  clearAllData();
  subscribedGeneration = currentGeneration;

  // Set up event listener
  const messageHandler = (evt: WebSocket.MessageEvent) => {
    try {
      const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
      const data = JSON.parse(raw);
      routeCdpEvent(data);
    } catch {
      // Ignore parse errors
    }
  };

  ws.addEventListener('message', messageHandler);
  eventListenerCleanup = () => ws.removeEventListener('message', messageHandler);

  // Enable required domains (Runtime is usually already enabled)
  try {
    // Network domain - enable for request/response tracking
    await sendCdp('Network.enable', {});
    logger('Network domain enabled for CDP event collection');
  } catch (err) {
    logger('Warning: Failed to enable Network domain:', err);
  }

  logger('CDP event subscriptions initialized');

  // Set up browser-level WS listener for Tracing domain events
  const browserWs = getBrowserCdpWebSocket();
  if (browserWs && browserWs.readyState === WebSocket.OPEN) {
    const browserMessageHandler = (evt: WebSocket.MessageEvent) => {
      try {
        const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
        const data = JSON.parse(raw);
        if (data.method === 'Tracing.dataCollected' || data.method === 'Tracing.tracingComplete') {
          routeCdpEvent(data);
        }
      } catch {
        // Ignore parse errors
      }
    };

    browserWs.addEventListener('message', browserMessageHandler);
    browserEventListenerCleanup = () => browserWs.removeEventListener('message', browserMessageHandler);
    logger('Browser CDP tracing event listener initialized');
  } else {
    logger('Warning: Browser CDP WebSocket not available — tracing events will not be captured');
  }
}

/**
 * Clear all stored data. Called on navigation or reconnection.
 */
export function clearAllData(): void {
  consoleMessages = [];
  networkRequests = new Map();
  traceData = {chunks: [], complete: false};
  consoleIdCounter = 1;
  networkIdCounter = 1;
}

/**
 * Get all console messages, optionally filtered by type, text content, source URL, recency, and more.
 */
export function getConsoleMessages(options?: {
  types?: string[];
  textFilter?: string;
  sourceFilter?: string;
  isRegex?: boolean;
  secondsAgo?: number;
  filterLogic?: 'and' | 'or';
  pageSize?: number;
  pageIdx?: number;
}): {messages: ConsoleMessage[]; total: number} {
  let filtered = consoleMessages;

  const useOr = options?.filterLogic === 'or';
  const now = Date.now();
  const cutoffTime = options?.secondsAgo
    ? now - options.secondsAgo * 1000
    : null;

  let textRegex: RegExp | null = null;
  if (options?.textFilter && options?.isRegex) {
    try {
      textRegex = new RegExp(options.textFilter, 'i');
    } catch {
      textRegex = null;
    }
  }

  filtered = filtered.filter(m => {
    const checks: boolean[] = [];

    if (options?.types?.length) {
      const typeSet = new Set(options.types);
      checks.push(typeSet.has(m.type));
    }

    if (options?.textFilter) {
      if (textRegex) {
        checks.push(textRegex.test(m.text));
      } else {
        const needle = options.textFilter.toLowerCase();
        checks.push(m.text.toLowerCase().includes(needle));
      }
    }

    if (options?.sourceFilter) {
      const needle = options.sourceFilter.toLowerCase();
      checks.push(
        m.stackTrace?.some(frame => frame.url.toLowerCase().includes(needle)) ??
          false,
      );
    }

    if (cutoffTime !== null) {
      checks.push(m.timestamp >= cutoffTime);
    }

    if (checks.length === 0) {
      return true;
    }

    return useOr ? checks.some(Boolean) : checks.every(Boolean);
  });

  const total = filtered.length;

  if (options?.pageSize !== undefined) {
    const pageIdx = options.pageIdx ?? 0;
    const start = pageIdx * options.pageSize;
    filtered = filtered.slice(start, start + options.pageSize);
  }

  return {messages: filtered, total};
}

/**
 * Get a specific console message by ID.
 */
export function getConsoleMessageById(id: number): ConsoleMessage | undefined {
  return consoleMessages.find(m => m.id === id);
}

/**
 * Get all network requests, optionally filtered by resource type.
 */
export function getNetworkRequests(options?: {
  resourceTypes?: string[];
  pageSize?: number;
  pageIdx?: number;
}): {requests: NetworkRequest[]; total: number} {
  let requests = Array.from(networkRequests.values());

  if (options?.resourceTypes?.length) {
    const typeSet = new Set(options.resourceTypes.map(t => t.toLowerCase()));
    requests = requests.filter(r => typeSet.has(r.resourceType.toLowerCase()));
  }

  const total = requests.length;

  if (options?.pageSize !== undefined) {
    const pageIdx = options.pageIdx ?? 0;
    const start = pageIdx * options.pageSize;
    requests = requests.slice(start, start + options.pageSize);
  }

  return {requests, total};
}

/**
 * Get a specific network request by ID.
 */
export function getNetworkRequestById(id: number): NetworkRequest | undefined {
  for (const req of networkRequests.values()) {
    if (req.id === id) {
      return req;
    }
  }
  return undefined;
}

/**
 * Get response body for a network request.
 */
export async function getNetworkResponseBody(requestId: string): Promise<string | undefined> {
  try {
    const result = await sendCdp('Network.getResponseBody', {requestId});
    if (result.base64Encoded) {
      return Buffer.from(result.body, 'base64').toString('utf-8');
    }
    return result.body;
  } catch {
    return undefined;
  }
}

// ── Tracing API ─────────────────────────────────────────

/**
 * Start a performance trace.
 */
export async function startTrace(options?: {
  categories?: string[];
}): Promise<void> {
  traceData = {chunks: [], complete: false};

  const browserWs = getBrowserCdpWebSocket();
  if (!browserWs || browserWs.readyState !== WebSocket.OPEN) {
    throw new Error(
      'Browser-level CDP WebSocket is not connected. ' +
      'Tracing requires a browser-level connection.',
    );
  }

  const categories = options?.categories ?? [
    '-*',
    'devtools.timeline',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.frame',
    'disabled-by-default-devtools.timeline.stack',
    'v8.execute',
    'blink.console',
    'blink.user_timing',
  ];

  await sendCdp('Tracing.start', {
    categories: categories.join(','),
    transferMode: 'ReportEvents',
  }, browserWs);

  logger('Tracing started (via browser-level CDP)');
}

/**
 * Stop the performance trace and return the collected data.
 * Enriches trace with frame data from Page.getFrameTree() since
 * Electron's browser-level tracing doesn't populate frame info
 * in TracingStartedInBrowser events.
 */
export async function stopTrace(): Promise<unknown[]> {
  const browserWs = getBrowserCdpWebSocket();
  if (!browserWs || browserWs.readyState !== WebSocket.OPEN) {
    throw new Error('Browser-level CDP WebSocket is not connected.');
  }

  await sendCdp('Tracing.end', {}, browserWs);

  // Wait for tracingComplete event or timeout
  const startTime = Date.now();
  while (!traceData.complete && Date.now() - startTime < 30000) {
    await new Promise(r => setTimeout(r, 100));
  }

  logger(`Tracing stopped, collected ${traceData.chunks.length} chunks`);

  // Enrich trace with frame data — Electron's browser-level tracing
  // doesn't populate TracingStartedInBrowser.args with frame info,
  // which the DevTools TraceEngine requires for parsing.
  return enrichTraceWithFrameData(traceData.chunks);
}

// ── Trace Frame Data Enrichment ──────────────────────────

interface TraceEvent {
  name?: string;
  cat?: string;
  ph?: string;
  pid?: number;
  tid?: number;
  ts?: number;
  s?: string;
  args?: Record<string, unknown>;
}

/**
 * Electron's browser-level CDP tracing emits TracingStartedInBrowser with
 * empty args — no frame-to-process mapping. The DevTools TraceEngine needs
 * this mapping to identify the main frame and renderer process.
 *
 * This function patches the trace by:
 * 1. Getting the frame tree from Page.getFrameTree() (page-level CDP)
 * 2. Finding the renderer PID from a navigationStart event in the trace
 * 3. Patching TracingStartedInBrowser.args with frame data
 * 4. Injecting a FrameCommittedInBrowser event
 */
async function enrichTraceWithFrameData(chunks: unknown[]): Promise<unknown[]> {
  try {
    const frameTreeResult = await sendCdp('Page.getFrameTree', {});
    const mainFrame = frameTreeResult?.frameTree?.frame;
    if (!mainFrame?.id) {
      logger('Warning: Could not get frame tree — trace may not parse correctly');
      return chunks;
    }

    const events = chunks as TraceEvent[];

    const tsib = events.find(e => e.name === 'TracingStartedInBrowser');
    if (!tsib) {
      logger('Warning: No TracingStartedInBrowser event found in trace');
      return chunks;
    }

    const navStart = events.find(e => e.name === 'navigationStart');
    const rendererPid = navStart?.pid;
    if (!rendererPid) {
      logger('Warning: Could not determine renderer PID from trace');
      return chunks;
    }

    const browserPid = tsib.pid;
    const browserTid = tsib.tid;
    const traceTs = tsib.ts ?? 0;

    tsib.args = {
      data: {
        frameTreeNodeId: 1,
        persistentIds: true,
        frames: [{
          frame: mainFrame.id,
          url: mainFrame.url ?? '',
          name: mainFrame.name ?? '',
          processId: rendererPid,
        }],
      },
    };

    const frameCommitted: TraceEvent = {
      name: 'FrameCommittedInBrowser',
      cat: 'disabled-by-default-devtools.timeline',
      ph: 'I',
      pid: browserPid,
      tid: browserTid,
      ts: traceTs,
      s: 't',
      args: {
        data: {
          frame: mainFrame.id,
          url: mainFrame.url ?? '',
          name: mainFrame.name ?? '',
          processId: rendererPid,
        },
      },
    };

    const tsibIndex = events.indexOf(tsib);
    events.splice(tsibIndex + 1, 0, frameCommitted);

    logger(`Enriched trace with frame data: frame=${mainFrame.id}, rendererPid=${rendererPid}`);
    return events;
  } catch (err) {
    logger(`Warning: Failed to enrich trace with frame data: ${(err as Error).message}`);
    return chunks;
  }
}

/**
 * Get current trace data (for insight analysis).
 */
export function getTraceData(): TraceData {
  return traceData;
}

// ── Process Exit Cleanup ────────────────────────────────
// Ensure data is cleared when the server exits for any reason

function cleanupOnExit(): void {
  clearAllData();
  if (eventListenerCleanup) {
    eventListenerCleanup();
    eventListenerCleanup = undefined;
  }
  if (browserEventListenerCleanup) {
    browserEventListenerCleanup();
    browserEventListenerCleanup = undefined;
  }
}

// Clean exit
process.on('exit', cleanupOnExit);

// SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  cleanupOnExit();
  process.exit(0);
});

// SIGTERM (kill command)
process.on('SIGTERM', () => {
  cleanupOnExit();
  process.exit(0);
});

// Uncaught exceptions - cleanup before crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanupOnExit();
  process.exit(1);
});

// Unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  cleanupOnExit();
  process.exit(1);
});
