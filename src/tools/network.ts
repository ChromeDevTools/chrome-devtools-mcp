/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';

import type {ParsedArguments} from '../config/mcp-options.js';
import type {NetworkMockInput} from '../NetworkOverrideManager.js';
import {NetworkOverridesFormatter} from '../formatters/NetworkOverridesFormatter.js';
import {zod, type ResourceType} from '../third_party/index.js';
import {validateUrlPatterns} from '../utils/url.js';

import {ToolCategory} from './categories.js';
import {definePageTool, type PageToolFactory} from './ToolDefinition.js';

type FilterableResourceType = Exclude<ResourceType, 'websocket'>;

const FILTERABLE_RESOURCE_TYPES: readonly [
  FilterableResourceType,
  ...FilterableResourceType[],
] = [
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
  'manifest',
  'signedexchange',
  'ping',
  'cspviolationreport',
  'preflight',
  'fedcm',
  'other',
];

export const listNetworkRequests: PageToolFactory = definePageTool(
  (args: ParsedArguments) => ({
    name: 'list_network_requests',
    description: `Lists the most recent requests for the target page since the last navigation.`,
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
          'Page number to return (0-based). When omitted, returns the first page. Ignored unless pageSize is set.',
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
          `Set to true to return the preserved requests over the last ${args.maxNavigationSaved} navigations.`,
        ),
    },
    blockedByDialog: false,
    concurrency: 'page',
    verifyFilesSchema: {},
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
  }),
);

export const getNetworkRequest: PageToolFactory = definePageTool(() => ({
  name: 'get_network_request',
  description: `Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel. Useful for inspecting request headers (including 'Cookie') and response headers (including 'Set-Cookie' and directives).`,
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
  concurrency: 'page',
  verifyFilesSchema: {
    requestFilePath: true,
    responseFilePath: true,
  },
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
}));

const mockFilterSchema = {
  route: zod
    .string()
    .trim()
    .min(1)
    .refine(
      value => !value.startsWith('/'),
      'route must be an absolute URLPattern, such as https://example.com/app.js or *://*:*/app.js.',
    )
    .superRefine((value, context) => {
      try {
        validateUrlPatterns([value], 'route');
      } catch (error) {
        context.addIssue({
          code: 'custom',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })
    .optional()
    .describe(
      'Absolute URLPattern, e.g. https://example.com/app.js ' +
        'or `*://*:*/app.js`. Use `*` for wildcards; ' +
        'omitted query strings match any query. Regex and `:name` groups ' +
        'are rejected. Inspection and removal compare the stored pattern ' +
        'exactly. Omit to inspect/remove all routes or match any URL.',
    ),
  resourceType: zod
    .enum(FILTERABLE_RESOURCE_TYPES)
    .optional()
    .describe(
      'Restrict requests and stored mock filters to this resource type. Omit to inspect/remove all types or configure a mock for any type.',
    ),
};

const mockNetworkSchema = zod
  // eslint-disable-next-line @local/enforce-zod-schema -- Flat parameters.
  .object({
    ...mockFilterSchema,
    body: zod
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Local response body file, revalidated and reread for every request. Content-Type follows its extension.',
      ),
  });

export const mockNetwork: PageToolFactory = definePageTool(() => ({
  name: 'mock_network',
  description:
    'Inspect or update network mocks for a page. With no actions, list mocks ' +
    'matching the supplied filters, or all mocks when no filters are given. ' +
    'Providing body updates the exact route/resourceType pair. ' +
    'An omitted route matches any URL. Other mocks are preserved. ' +
    'The most recently updated matching mock wins and persists across ' +
    'navigations. Configure before navigating or reloading; inspection shows ' +
    'hit counts and replacement errors. Changes are rejected during ' +
    'a performance trace. Mocks disable the page HTTP cache and intercept ' +
    'every request, affecting measurements. Service workers can bypass mocks. ' +
    'Use remove_network_mock to remove mocks.',
  annotations: {
    category: ToolCategory.NETWORK_MOCKS,
    readOnlyHint: false,
  },
  schema: mockNetworkSchema.shape,
  blockedByDialog: false,
  verifyFilesSchema: {body: true},
  concurrency: 'page',
  handler: async (request, response, context) => {
    const params = mockNetworkSchema.parse(request.params);
    const filter = {
      urlPattern: params.route,
      resourceType: params.resourceType,
    };
    let input: NetworkMockInput | undefined;
    if (params.body !== undefined) {
      const responseFilePath = params.body;
      input = {
        ...filter,
        kind: 'file',
        responseFilePath,
        loadResponseFile: async () => {
          const validatedPath = await context.validatePath(responseFilePath);
          return await fs.readFile(validatedPath);
        },
      };
    }
    let overrides;
    if (input) {
      overrides = [await request.page.mockNetwork(input)];
      response.appendResponseLine(
        'Network mock configured. Reload or navigate the page to apply it.',
      );
    } else {
      overrides = request.page.listNetworkMocks(filter);
    }

    if (overrides.length === 0) {
      response.appendResponseLine('No network mocks match these filters.');
      return;
    }
    response.appendResponseLine(
      new NetworkOverridesFormatter(overrides).toString(),
    );
  },
}));

export const removeNetworkMock: PageToolFactory = definePageTool(() => ({
  name: 'remove_network_mock',
  description:
    'Remove network mocks matching the supplied stored route and/or resource ' +
    'type. Route patterns are compared exactly, not applied as wildcards to ' +
    'other patterns. Omit both filters to remove all mocks for the page. ' +
    'Removing the last mock restores the HTTP cache and stops interception. ' +
    'Changes are rejected during a performance trace.',
  annotations: {
    category: ToolCategory.NETWORK_MOCKS,
    readOnlyHint: false,
  },
  schema: mockFilterSchema,
  blockedByDialog: false,
  verifyFilesSchema: {},
  concurrency: 'page',
  handler: async (request, response) => {
    const count = await request.page.removeNetworkMocks({
      urlPattern: request.params.route,
      resourceType: request.params.resourceType,
    });
    response.appendResponseLine(
      `Removed ${count} network ${count === 1 ? 'mock' : 'mocks'}.`,
    );
  },
}));
