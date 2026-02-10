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
 */

import WebSocket from 'ws';

import {logger} from './logger.js';
import {getCdpWebSocket, getConnectionGeneration} from './vscode.js';

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

// ── Storage ─────────────────────────────────────────────
// Data is stored per-session and cleared automatically on:
// - Connection reconnect (new generation)
// - Server exit (SIGINT, SIGTERM, uncaughtException)
// - WebSocket close

let consoleMessages: ConsoleMessage[] = [];

let consoleIdCounter = 1;
let subscribedGeneration = -1;
let eventListenerCleanup: (() => void) | undefined;

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

// ── CDP Message Router ──────────────────────────────────

function routeCdpEvent(data: {method?: string; params?: unknown}): void {
  if (!data.method) {return;}

  switch (data.method) {
    case 'Runtime.consoleAPICalled':
      handleConsoleAPICalled(data.params as Parameters<typeof handleConsoleAPICalled>[0]);
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
    return;
  }

  // Clean up previous listeners
  if (eventListenerCleanup) {
    eventListenerCleanup();
    eventListenerCleanup = undefined;
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

  logger('CDP event subscriptions initialized');
}

/**
 * Clear all stored data. Called on navigation or reconnection.
 */
export function clearAllData(): void {
  consoleMessages = [];
  consoleIdCounter = 1;
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

// ── Process Exit Cleanup ────────────────────────────────

function cleanupOnExit(): void {
  clearAllData();
  if (eventListenerCleanup) {
    eventListenerCleanup();
    eventListenerCleanup = undefined;
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
