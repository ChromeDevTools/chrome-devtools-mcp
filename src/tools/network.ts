/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';

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
  description: `List all requests for the currently selected page since the last navigation.`,
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
  blockedByDialog: false,
  verifyFilesSchema: [],
  handler: async (request, response) => {
    const data = await request.page.getDevToolsData();
    response.attachDevToolsData(data);
    const reqid = data?.cdpRequestId
      ? request.page.resolveCdpRequestId(data.cdpRequestId)
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
  description: `Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
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
        'The absolute or relative path to a .network-request file to save the request body to. If omitted, the body is returned inline.',
      ),
    responseFilePath: zod
      .string()
      .optional()
      .describe(
        'The absolute or relative path to a .network-response file to save the response body to. If omitted, the body is returned inline.',
      ),
  },
  blockedByDialog: true,
  verifyFilesSchema: ['requestFilePath', 'responseFilePath'],
  handler: async (request, response) => {
    if (request.params.reqid) {
      response.attachNetworkRequest(request.params.reqid, {
        requestFilePath: request.params.requestFilePath,
        responseFilePath: request.params.responseFilePath,
      });
    } else {
      const data = await request.page.getDevToolsData();
      response.attachDevToolsData(data);
      const reqid = data?.cdpRequestId
        ? request.page.resolveCdpRequestId(data.cdpRequestId)
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

export const addNetworkOverride = definePageTool({
  name: 'add_network_override',
  description:
    'Adds a page-scoped network override that redirects matching requests or fulfills them from a local file. Add the override before navigating or reloading the page.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    urlPattern: zod
      .string()
      .min(1)
      .describe(
        "CDP URL pattern to match. Use '*' for any sequence, '?' for one character, and a backslash to escape a wildcard.",
      ),
    resourceType: zod
      .enum(FILTERABLE_RESOURCE_TYPES)
      .optional()
      .describe(
        'Only override requests of this resource type. When omitted, all resource types can match.',
      ),
    redirectUrl: zod
      .string()
      .optional()
      .describe(
        'Absolute HTTP(S) URL to load instead. Exactly one of redirectUrl or responseFilePath is required.',
      ),
    responseFilePath: zod
      .string()
      .optional()
      .describe(
        'Local file to serve as the response. The file is read again for every matching request so rebuilds are picked up. Exactly one of responseFilePath or redirectUrl is required.',
      ),
    contentType: zod
      .string()
      .optional()
      .describe(
        'Content-Type for a local-file response. When omitted, it is inferred from the file extension.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: ['responseFilePath'],
  handler: async (request, response, context) => {
    const {params} = request;
    if (
      (params.redirectUrl === undefined) ===
      (params.responseFilePath === undefined)
    ) {
      throw new Error(
        'Exactly one of redirectUrl or responseFilePath must be provided.',
      );
    }
    if (params.redirectUrl !== undefined) {
      if (params.contentType !== undefined) {
        throw new Error('contentType can only be used with responseFilePath.');
      }
      context.validateNetworkUrl(params.redirectUrl);
      const override = await request.page.addNetworkOverride({
        kind: 'redirect',
        urlPattern: params.urlPattern,
        resourceType: params.resourceType,
        redirectUrl: params.redirectUrl,
      });
      response.appendResponseLine(
        'Added network override ' +
          override.id +
          '. Reload or navigate the page to apply it.',
      );
      return;
    }

    const responseFilePath = params.responseFilePath;
    if (responseFilePath === undefined) {
      throw new Error('responseFilePath is required.');
    }
    if (
      params.contentType !== undefined &&
      (params.contentType.trim() === '' || /[\r\n]/.test(params.contentType))
    ) {
      throw new Error(
        'contentType must be non-empty and cannot contain line breaks.',
      );
    }
    await context.validatePath(responseFilePath);
    const override = await request.page.addNetworkOverride({
      kind: 'file',
      urlPattern: params.urlPattern,
      resourceType: params.resourceType,
      responseFilePath,
      contentType: params.contentType,
      loadResponseFile: async () => {
        await context.validatePath(responseFilePath);
        return await fs.readFile(responseFilePath);
      },
    });
    response.appendResponseLine(
      'Added network override ' +
        override.id +
        '. Reload or navigate the page to apply it.',
    );
  },
});

export const listNetworkOverrides = definePageTool({
  name: 'list_network_overrides',
  description: 'Lists the network overrides configured for the selected page.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {},
  blockedByDialog: false,
  verifyFilesSchema: [],
  handler: async (request, response) => {
    const overrides = request.page.listNetworkOverrides();
    if (overrides.length === 0) {
      response.appendResponseLine(
        'No network overrides are configured for this page.',
      );
      return;
    }

    for (const override of overrides) {
      const resourceType = override.resourceType
        ? ' [' + override.resourceType + ']'
        : '';
      if (override.kind === 'redirect') {
        response.appendResponseLine(
          override.id +
            ': ' +
            override.urlPattern +
            resourceType +
            ' -> ' +
            override.redirectUrl,
        );
      } else {
        response.appendResponseLine(
          override.id +
            ': ' +
            override.urlPattern +
            resourceType +
            ' -> ' +
            override.responseFilePath +
            ' (' +
            override.contentType +
            ')',
        );
      }
    }
  },
});

export const removeNetworkOverride = definePageTool({
  name: 'remove_network_override',
  description: 'Removes a network override from the selected page.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    id: zod
      .number()
      .int()
      .positive()
      .describe('ID returned by add_network_override.'),
  },
  blockedByDialog: false,
  verifyFilesSchema: [],
  handler: async (request, response) => {
    if (!(await request.page.removeNetworkOverride(request.params.id))) {
      throw new Error(
        'Network override ' + request.params.id + ' was not found.',
      );
    }
    response.appendResponseLine(
      'Removed network override ' + request.params.id + '.',
    );
  },
});
