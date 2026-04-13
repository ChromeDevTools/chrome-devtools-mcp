/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ResourceType} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

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

export const listNetworkRequests = definePageTool({
  name: 'list_network_requests',
  description: `List all requests for the page`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Max requests to return. If omitted: all'),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Page number (0-based). If omitted: 0'),
    resourceTypes: zod
      .array(zod.enum(FILTERABLE_RESOURCE_TYPES))
      .optional()
      .describe('Filter by resource types. If omitted: all'),
    includePreservedRequests: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Returns requests from last 3 navigations. If omitted: only last navigation',
      ),
  },
  handler: async (request, response, context) => {
    const data = await context.getDevToolsData(request.page);
    response.attachDevToolsData(data);
    const reqid = data?.cdpRequestId
      ? context.resolveCdpRequestId(request.page, data.cdpRequestId)
      : undefined;
    response.setIncludeNetworkRequests(true, {
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
      resourceTypes: request.params.resourceTypes,
      includePreservedRequests: request.params.includePreservedRequests,
      networkRequestIdInDevToolsUI: reqid,
    });
  },
});

export const getNetworkRequest = definePageTool({
  name: 'get_network_request',
  description: `Gets a network request by an optional reqid. If omitted: selected request`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    reqid: zod
      .number()
      .optional()
      .describe(
        'The reqid of the network request. If omitted: selected request',
      ),
    requestFilePath: zod
      .string()
      .optional()
      .describe(
        'The absolute or relative path to save the request body to. If omitted: inline',
      ),
    responseFilePath: zod
      .string()
      .optional()
      .describe(
        'The absolute or relative path to save the response body to. If omitted: inline',
      ),
  },
  handler: async (request, response, context) => {
    if (request.params.reqid) {
      response.attachNetworkRequest(request.params.reqid, {
        requestFilePath: request.params.requestFilePath,
        responseFilePath: request.params.responseFilePath,
      });
    } else {
      const data = await context.getDevToolsData(request.page);
      response.attachDevToolsData(data);
      const reqid = data?.cdpRequestId
        ? context.resolveCdpRequestId(request.page, data.cdpRequestId)
        : undefined;
      if (reqid) {
        response.attachNetworkRequest(reqid, {
          requestFilePath: request.params.requestFilePath,
          responseFilePath: request.params.responseFilePath,
        });
      } else {
        response.appendResponseLine(
          `Nothing is currently selected in the DevTools Network panel.`,
        );
      }
    }
  },
});
