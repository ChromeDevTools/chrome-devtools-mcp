/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getNetworkRequests, getNetworkRequestById, getNetworkResponseBody} from '../cdp-events.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const FILTERABLE_RESOURCE_TYPES: readonly [string, ...string[]] = [
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
  description: `List all requests for the currently selected page since the last navigation.`,
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
    conditions: ['directCdp'],
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of requests to return. When omitted, returns all requests.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
    resourceTypes: zod
      .array(zod.enum(FILTERABLE_RESOURCE_TYPES))
      .optional()
      .describe(
        'Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.',
      ),
    includePreservedRequests: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Set to true to return the preserved requests over the last 3 navigations.',
      ),
  },
  handler: async (request, response) => {
    const {requests, total} = getNetworkRequests({
      resourceTypes: request.params.resourceTypes,
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
    });

    if (requests.length === 0) {
      response.appendResponseLine('No network requests found.');
      return;
    }

    response.appendResponseLine(`Network requests (${requests.length} of ${total} total):\n`);

    for (const req of requests) {
      const statusPart = req.status ? ` [${req.status}]` : '';
      const failedPart = req.failed ? ' [FAILED]' : '';
      response.appendResponseLine(
        `reqid=${req.id} ${req.method} ${req.url}${statusPart}${failedPart} (${req.resourceType})`
      );
    }
  },
});

export const getNetworkRequest = defineTool({
  name: 'get_network_request',
  description: `Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.`,
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    reqid: zod
      .number()
      .optional()
      .describe(
        'The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel.',
      ),
    requestFilePath: zod
      .string()
      .optional()
      .describe(
        'The absolute or relative path to save the request body to. If omitted, the body is returned inline.',
      ),
    responseFilePath: zod
      .string()
      .optional()
      .describe(
        'The absolute or relative path to save the response body to. If omitted, the body is returned inline.',
      ),
  },
  handler: async (request, response) => {
    if (!request.params.reqid) {
      response.appendResponseLine(
        'Please provide a reqid. Use list_network_requests to see available requests.',
      );
      return;
    }

    const req = getNetworkRequestById(request.params.reqid);

    if (!req) {
      response.appendResponseLine(`Network request with id ${request.params.reqid} not found.`);
      return;
    }

    response.appendResponseLine(`reqid=${req.id}`);
    response.appendResponseLine(`url=${req.url}`);
    response.appendResponseLine(`method=${req.method}`);
    response.appendResponseLine(`resourceType=${req.resourceType}`);

    if (req.status !== undefined) {
      response.appendResponseLine(`status=${req.status} ${req.statusText || ''}`);
    }

    if (req.mimeType) {
      response.appendResponseLine(`mimeType=${req.mimeType}`);
    }

    if (req.failed) {
      response.appendResponseLine(`failed=true`);
      response.appendResponseLine(`errorText=${req.errorText}`);
    }

    if (req.responseHeaders && Object.keys(req.responseHeaders).length > 0) {
      response.appendResponseLine('\nResponse Headers:');
      for (const [key, value] of Object.entries(req.responseHeaders)) {
        response.appendResponseLine(`  ${key}: ${value}`);
      }
    }

    if (req.requestBody) {
      response.appendResponseLine('\nRequest Body:');
      response.appendResponseLine(req.requestBody);
    }

    // Attempt to get response body
    try {
      const body = await getNetworkResponseBody(req.requestId);
      if (body) {
        response.appendResponseLine('\nResponse Body:');
        // Truncate if too long
        const maxLen = 10000;
        if (body.length > maxLen) {
          response.appendResponseLine(body.substring(0, maxLen) + `\n... (truncated, ${body.length} total chars)`);
        } else {
          response.appendResponseLine(body);
        }
      }
    } catch {
      // Response body may not be available
    }
  },
});
