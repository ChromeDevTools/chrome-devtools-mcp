/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ResourceType} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const FILTERABLE_RESOURCE_TYPES: readonly [ResourceType, ...ResourceType[]] = [
  'document',
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'texttrack',
  'xhr',
  'fetch',
  'prefetch',
  'eventsource',
  'websocket',
  'manifest',
  'signedexchange',
  'ping',
  'cspviolationreport',
  'preflight',
  'fedcm',
  'other',
];

export const listNetworkRequests = defineTool({
  name: 'list_network_requests',
  description: `List all requests for the currently selected page. By default, only shows requests since the last navigation. To preserve requests across navigations, first call enable_network_log_preservation before navigating.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    pageSize: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of requests to return. When omitted, returns all requests.',
      ),
    pageIdx: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
    resourceTypes: z
      .array(z.enum(FILTERABLE_RESOURCE_TYPES))
      .optional()
      .describe(
        'Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.',
      ),
  },
  handler: async (request, response) => {
    response.setIncludeNetworkRequests(true, {
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
      resourceTypes: request.params.resourceTypes,
    });
  },
});

export const getNetworkRequest = defineTool({
  name: 'get_network_request',
  description: `Gets a network request by URL. You can get all requests by calling ${listNetworkRequests.name}.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    url: z.string().describe('The URL of the request.'),
  },
  handler: async (request, response, _context) => {
    response.attachNetworkRequest(request.params.url);
  },
});

export const enableNetworkLogPreservation = defineTool({
  name: 'enable_network_log_preservation',
  description: `Enable network log preservation mode to keep ALL network requests across navigations. IMPORTANT: Call this BEFORE navigating or interacting with the page if you want to analyze request patterns across multiple actions. When enabled, all request/response bodies are automatically captured and cached for later analysis. Use this when you need to compare requests before/after certain actions or track API calls across page transitions.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    includeRequestBodies: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to capture and cache request bodies. Default: true'),
    includeResponseBodies: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to capture and cache response bodies. Default: true'),
    maxRequests: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of requests to preserve. Older requests are automatically removed when limit is reached. When omitted, no limit is applied.',
      ),
  },
  handler: async (request, response, context) => {
    const wasAlreadyEnabled = context.isNetworkLogPreservationEnabled();
    
    context.enableNetworkLogPreservation({
      includeRequestBodies: request.params.includeRequestBodies,
      includeResponseBodies: request.params.includeResponseBodies,
      maxRequests: request.params.maxRequests,
    });
    
    if (wasAlreadyEnabled) {
      response.appendResponseLine(
        '⚠️  Network log preservation was already enabled. Settings updated.',
      );
    } else {
      response.appendResponseLine(
        '✅ Network log preservation enabled. All network requests will be preserved across navigations.',
      );
    }
    
    if (request.params.includeRequestBodies) {
      response.appendResponseLine('📤 Request bodies will be captured.');
    }
    if (request.params.includeResponseBodies) {
      response.appendResponseLine('📥 Response bodies will be captured.');
    }
    if (request.params.maxRequests) {
      response.appendResponseLine(
        `🔢 Maximum ${request.params.maxRequests} requests will be preserved.`,
      );
    }
    response.appendResponseLine(
      '\n💡 TIP: Preservation is now active. Navigate, click buttons, or interact with the page - all network activity will be recorded.',
    );
  },
});

export const disableNetworkLogPreservation = defineTool({
  name: 'disable_network_log_preservation',
  description: `Disable network log preservation mode and optionally clear existing preserved logs. After disabling, network logs will be cleaned on navigation (default behavior). Call this when you're done analyzing preserved requests to restore normal performance.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    clearExisting: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to clear existing preserved logs. Default: true',
      ),
  },
  handler: async (request, response, context) => {
    const wasEnabled = context.isNetworkLogPreservationEnabled();
    
    if (!wasEnabled) {
      response.appendResponseLine(
        '⚠️  Network log preservation was not enabled. No action taken.',
      );
      return;
    }
    
    context.disableNetworkLogPreservation();
    if (request.params.clearExisting) {
      context.clearPreservedNetworkLogs();
      response.appendResponseLine(
        '✅ Network log preservation disabled and existing logs cleared.',
      );
    } else {
      response.appendResponseLine(
        '✅ Network log preservation disabled. Existing logs retained.',
      );
    }
    response.appendResponseLine(
      '💡 Normal behavior restored: network logs will be cleared on navigation.',
    );
  },
});

export const clearPreservedNetworkLogs = defineTool({
  name: 'clear_preserved_network_logs',
  description: `Clear all preserved network logs for the currently selected page without disabling preservation mode. Use this to reset the preserved request history while keeping preservation active for future requests.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (_request, response, context) => {
    if (!context.isNetworkLogPreservationEnabled()) {
      response.appendResponseLine(
        '⚠️  Network log preservation is not enabled. No preserved logs to clear.',
      );
      response.appendResponseLine(
        '💡 TIP: Call enable_network_log_preservation first to start preserving logs.',
      );
      return;
    }
    
    const preservedCount = context.getPreservedNetworkRequests().length;
    context.clearPreservedNetworkLogs();
    response.appendResponseLine(
      `✅ Cleared ${preservedCount} preserved network request(s).`,
    );
    response.appendResponseLine(
      '💡 Preservation mode is still active. New requests will continue to be preserved.',
    );
  },
});
