/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getNetworkRequests, getNetworkRequestById, getNetworkResponseBody} from '../cdp-events.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  CHARACTER_LIMIT,
  checkCharacterLimit,
  createPaginationMetadata,
} from './ToolDefinition.js';

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

const NetworkRequestSchema = zod.object({
  id: zod.number(),
  url: zod.string(),
  method: zod.string(),
  resourceType: zod.string(),
  status: zod.number().optional(),
  statusText: zod.string().optional(),
  failed: zod.boolean().optional(),
  errorText: zod.string().optional(),
});

const ListNetworkRequestsOutputSchema = zod.object({
  total: zod.number(),
  count: zod.number(),
  offset: zod.number(),
  has_more: zod.boolean(),
  next_offset: zod.number().optional(),
  requests: zod.array(NetworkRequestSchema),
});

export const listNetworkRequests = defineTool({
  name: 'list_network_requests',
  description: `List all requests for the currently selected page since the last navigation.

Args:
  - pageSize (number): Maximum requests to return. Default: all
  - pageIdx (number): Page number (0-based) for pagination. Default: 0
  - resourceTypes (string[]): Filter by resource types (document, xhr, fetch, script, etc.)
  - includePreservedRequests (boolean): Include requests from last 3 navigations. Default: false
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { total, count, offset, has_more, next_offset?, requests: [{id, url, method, resourceType, status?, failed?}] }
  Markdown format: Formatted request list with reqid, method, URL, status

Examples:
  - "Show XHR and fetch requests" -> { resourceTypes: ['xhr', 'fetch'] }
  - "Get first 10 requests as JSON" -> { pageSize: 10, response_format: 'json' }

Error Handling:
  - Returns "No network requests found." if no requests match filters
  - Returns error if response exceeds ${CHARACTER_LIMIT} chars`,
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
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
  outputSchema: ListNetworkRequestsOutputSchema,
  handler: async (request, response) => {
    const {requests, total} = getNetworkRequests({
      resourceTypes: request.params.resourceTypes,
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
    });

    const offset = (request.params.pageIdx ?? 0) * (request.params.pageSize ?? requests.length);
    const pagination = createPaginationMetadata(total, requests.length, offset);

    if (requests.length === 0) {
      response.appendResponseLine('No network requests found.');
      return;
    }

    if (request.params.response_format === ResponseFormat.JSON) {
      const structuredOutput = {
        ...pagination,
        requests: requests.map(req => ({
          id: req.id,
          url: req.url,
          method: req.method,
          resourceType: req.resourceType,
          ...(req.status !== undefined ? { status: req.status, statusText: req.statusText } : {}),
          ...(req.failed ? { failed: true, errorText: req.errorText } : {}),
        })),
      };
      const jsonOutput = JSON.stringify(structuredOutput, null, 2);
      checkCharacterLimit(jsonOutput, 'list_network_requests', {
        pageSize: 'Limit results per page (e.g., 20)',
        resourceTypes: 'Filter by specific types (e.g., ["xhr", "fetch"])',
      });
      response.appendResponseLine(jsonOutput);
      return;
    }

    let header = `## Network Requests\n\n`;
    header += `**Results:** ${requests.length} of ${total} total`;
    if (pagination.has_more) {
      header += ` | **Next page:** pageIdx=${pagination.next_offset! / (request.params.pageSize ?? requests.length)}`;
    }
    response.appendResponseLine(header + '\n');

    const lines: string[] = [];
    for (const req of requests) {
      const statusPart = req.status ? ` [${req.status}]` : '';
      const failedPart = req.failed ? ' [FAILED]' : '';
      lines.push(
        `reqid=${req.id} ${req.method} ${req.url}${statusPart}${failedPart} (${req.resourceType})`
      );
    }

    const content = lines.join('\n');
    checkCharacterLimit(content, 'list_network_requests', {
      pageSize: 'Limit results per page (e.g., 20)',
      resourceTypes: 'Filter by specific types (e.g., ["xhr", "fetch"])',
    });

    response.appendResponseLine(content);
  },
});

const GetNetworkRequestOutputSchema = zod.object({
  id: zod.number(),
  url: zod.string(),
  method: zod.string(),
  resourceType: zod.string(),
  status: zod.number().optional(),
  statusText: zod.string().optional(),
  mimeType: zod.string().optional(),
  failed: zod.boolean().optional(),
  errorText: zod.string().optional(),
  responseHeaders: zod.record(zod.string()).optional(),
  requestBody: zod.string().optional(),
  responseBody: zod.string().optional(),
});

export const getNetworkRequest = defineTool({
  name: 'get_network_request',
  description: `Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.

Args:
  - reqid (number): Request ID from list_network_requests output
  - requestFilePath (string): Save request body to file path
  - responseFilePath (string): Save response body to file path
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { id, url, method, resourceType, status?, headers?, requestBody?, responseBody? }
  Markdown format: Formatted request details with headers and bodies

Examples:
  - "Get request 5" -> { reqid: 5 }
  - "Save response to file" -> { reqid: 5, responseFilePath: "./response.json" }

Error Handling:
  - Returns "Please provide a reqid" if reqid is not provided
  - Returns "Network request with id X not found." if request doesn't exist`,
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
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
  outputSchema: GetNetworkRequestOutputSchema,
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

    let responseBody: string | undefined;
    try {
      responseBody = await getNetworkResponseBody(req.requestId);
    } catch {
      // Response body may not be available
    }

    if (request.params.response_format === ResponseFormat.JSON) {
      const structuredOutput = {
        id: req.id,
        url: req.url,
        method: req.method,
        resourceType: req.resourceType,
        ...(req.status !== undefined ? { status: req.status, statusText: req.statusText } : {}),
        ...(req.mimeType ? { mimeType: req.mimeType } : {}),
        ...(req.failed ? { failed: true, errorText: req.errorText } : {}),
        ...(req.responseHeaders ? { responseHeaders: req.responseHeaders } : {}),
        ...(req.requestBody ? { requestBody: req.requestBody } : {}),
        ...(responseBody ? { responseBody: responseBody.length > 10000 ? responseBody.substring(0, 10000) + '...(truncated)' : responseBody } : {}),
      };
      response.appendResponseLine(JSON.stringify(structuredOutput, null, 2));
      return;
    }

    response.appendResponseLine(`## Network Request #${req.id}\n`);
    response.appendResponseLine(`**URL:** ${req.url}`);
    response.appendResponseLine(`**Method:** ${req.method}`);
    response.appendResponseLine(`**Type:** ${req.resourceType}`);

    if (req.status !== undefined) {
      response.appendResponseLine(`**Status:** ${req.status} ${req.statusText || ''}`);
    }

    if (req.mimeType) {
      response.appendResponseLine(`**MIME Type:** ${req.mimeType}`);
    }

    if (req.failed) {
      response.appendResponseLine(`**Failed:** ${req.errorText}`);
    }

    if (req.responseHeaders && Object.keys(req.responseHeaders).length > 0) {
      response.appendResponseLine('\n### Response Headers');
      for (const [key, value] of Object.entries(req.responseHeaders)) {
        response.appendResponseLine(`- **${key}:** ${value}`);
      }
    }

    if (req.requestBody) {
      response.appendResponseLine('\n### Request Body');
      response.appendResponseLine('```');
      response.appendResponseLine(req.requestBody);
      response.appendResponseLine('```');
    }

    if (responseBody) {
      response.appendResponseLine('\n### Response Body');
      response.appendResponseLine('```');
      const maxLen = 10000;
      if (responseBody.length > maxLen) {
        response.appendResponseLine(responseBody.substring(0, maxLen) + `\n... (truncated, ${responseBody.length} total chars)`);
      } else {
        response.appendResponseLine(responseBody);
      }
      response.appendResponseLine('```');
    }
  },
});
