/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/modelcontextprotocol-sdk/index.js';

import {ToolCategories} from './categories.js';
import {defineTool, networkRequestsSchema} from './ToolDefinition.js';

export const listNetworkRequests = defineTool({
  name: 'list_network_requests',
  description: `List all requests for the currently selected page since the last navigation.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    ...networkRequestsSchema,
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
    reqid: zod
      .number()
      .describe(
        'The reqid of a request on the page from the listed network requests',
      ),
  },
  handler: async (request, response, _context) => {
    response.attachNetworkRequest(request.params.reqid);
  },
});
