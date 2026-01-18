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

/**
 * Consolidated network tool.
 * Combines: list_network_requests, get_network_request
 */
export const network = defineTool({
  name: 'network',
  description: 'Network requests: list all or get by URL.',
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    op: z.enum(['list', 'get']).describe('Operation'),
    url: z.string().optional().describe('Request URL (for get)'),
    pageSize: z.number().int().positive().optional().describe('Max results'),
    pageIdx: z.number().int().min(0).optional().describe('Page number'),
    resourceTypes: z
      .array(z.enum(FILTERABLE_RESOURCE_TYPES))
      .optional()
      .describe('Filter types'),
  },
  handler: async (request, response) => {
    const {op, url, pageSize, pageIdx, resourceTypes} = request.params;

    if (op === 'list') {
      response.setIncludeNetworkRequests(true, {
        pageSize,
        pageIdx,
        resourceTypes,
      });
    } else {
      if (!url) {
        throw new Error('url required for get');
      }
      response.attachNetworkRequest(url);
      response.setIncludeNetworkRequests(true);
    }
  },
});
