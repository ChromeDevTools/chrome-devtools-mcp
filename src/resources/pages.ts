/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ConsoleFormatter,
  type ConsoleFormatterOptions,
} from '../formatters/ConsoleFormatter.js';
import {NetworkFormatter} from '../formatters/NetworkFormatter.js';
import {SnapshotFormatter} from '../formatters/SnapshotFormatter.js';
import type {McpPage} from '../McpPage.js';
import type {Context} from '../tools/ToolDefinition.js';

import {definePageResource} from './ResourceDefinition.js';

export const pageSourceResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/source',
    name: 'Page Source',
    description: 'The HTML content of the page',
    mimeType: 'text/html',
  },
  handler: async (page: McpPage) => {
    const content = await page.pptrPage.content();
    return {content, mimeType: 'text/html'};
  },
});

export const consoleLogsResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/console',
    name: 'Console Logs',
    description: 'Console messages and logs from the page',
    mimeType: 'text/plain',
  },
  handler: async (page: McpPage, context: Context) => {
    const data = context.getConsoleData(page);
    const devTools = context.getDevToolsUniverse(page);
    const formatters = await Promise.all(
      data.map(item =>
        ConsoleFormatter.from(
          item as Parameters<typeof ConsoleFormatter.from>[0],
          {
            id: context.getConsoleMessageStableId(item),
            fetchDetailedData: false,
            devTools: devTools as ConsoleFormatterOptions['devTools'],
          },
        ),
      ),
    );
    const content = formatters.map(f => f.toString()).join('\n');
    return {content, mimeType: 'text/plain'};
  },
});

export const screenshotResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/screenshot',
    name: 'Screenshot',
    description: 'A screenshot of the current viewport',
    mimeType: 'image/png',
  },
  handler: async (page: McpPage) => {
    const data = await page.pptrPage.screenshot({encoding: 'binary'});
    return {content: Buffer.from(data), mimeType: 'image/png'};
  },
});

export const networkActivityResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/network',
    name: 'Network Activity',
    description: 'Network requests and responses from the page',
    mimeType: 'text/plain',
  },
  handler: async (page: McpPage, context: Context) => {
    const data = context.getNetworkRequests(page);
    const formatters = await Promise.all(
      data.map(request =>
        NetworkFormatter.from(
          request as Parameters<typeof NetworkFormatter.from>[0],
          {
            requestId: context.getNetworkRequestStableId(request),
            fetchData: false,
            saveFile: (data, filename) => context.saveFile(data, filename),
          },
        ),
      ),
    );
    const content = formatters.map(f => f.toString()).join('\n');
    return {content, mimeType: 'text/plain'};
  },
});

export const a11yTreeResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/a11y',
    name: 'Accessibility Tree',
    description: 'The accessibility tree of the page',
    mimeType: 'text/plain',
  },
  handler: async (page: McpPage, context: Context) => {
    await context.createTextSnapshot(page);
    if (!page.textSnapshot) {
      return {content: 'No a11y tree available', mimeType: 'text/plain'};
    }
    const formatter = new SnapshotFormatter(page.textSnapshot);
    return {content: formatter.toString(), mimeType: 'text/plain'};
  },
});

export const selectedElementResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/selected-element',
    name: 'Selected Element',
    description: 'The currently selected element in DevTools',
    mimeType: 'text/plain',
  },
  handler: async (page: McpPage, context: Context) => {
    const data = await context.getDevToolsData(page);
    if (!data.cdpBackendNodeId) {
      return {content: 'No element selected', mimeType: 'text/plain'};
    }
    await context.createTextSnapshot(page, false, data);
    const uid = context.resolveCdpElementId(page, data.cdpBackendNodeId);
    if (!uid) {
      return {
        content: 'Selected element not found in snapshot',
        mimeType: 'text/plain',
      };
    }
    const node = page.getAXNodeByUid(uid);
    if (!node) {
      return {
        content: 'Selected element node not found',
        mimeType: 'text/plain',
      };
    }
    const formatter = new SnapshotFormatter({
      root: node,
      snapshotId: 'selected',
      idToNode: new Map(),
      hasSelectedElement: true,
      selectedElementUid: uid,
      verbose: true,
    });
    return {content: formatter.toString(), mimeType: 'text/plain'};
  },
});

export const selectedRequestResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/selected-request',
    name: 'Selected Network Request',
    description: 'The currently selected network request in DevTools',
    mimeType: 'text/plain',
  },
  handler: async (page: McpPage, context: Context) => {
    const data = await context.getDevToolsData(page);
    if (!data.cdpRequestId) {
      return {content: 'No network request selected', mimeType: 'text/plain'};
    }
    const reqid = context.resolveCdpRequestId(page, data.cdpRequestId);
    if (reqid === undefined) {
      return {
        content: 'Selected network request not found',
        mimeType: 'text/plain',
      };
    }
    const request = context.getNetworkRequestById(page, reqid);
    const formatter = await NetworkFormatter.from(
      request as Parameters<typeof NetworkFormatter.from>[0],
      {
        requestId: context.getNetworkRequestStableId(request),
        fetchData: false,
        saveFile: (data, filename) => context.saveFile(data, filename),
      },
    );
    return {content: formatter.toString(), mimeType: 'text/plain'};
  },
});

export const devtoolsMessagesResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/devtools-messages',
    name: 'DevTools Messages',
    description: 'Messages from DevTools to the MCP client',
    mimeType: 'application/json',
  },
  handler: async (page: McpPage) => {
    const messages = page.devtoolsMessages;
    return {
      content: JSON.stringify(messages, null, 2),
      mimeType: 'application/json',
    };
  },
});

export const traceResource = definePageResource({
  template: {
    uriTemplate: 'page://{pageId}/trace',
    name: 'Performance Trace',
    description: 'The latest performance trace recorded for this page',
    mimeType: 'application/json',
  },
  handler: async (page: McpPage, context: Context) => {
    const traces = context.recordedTraces();
    if (traces.length === 0) {
      return {content: 'No trace recorded', mimeType: 'text/plain'};
    }
    return {
      content: JSON.stringify(traces[traces.length - 1], null, 2),
      mimeType: 'application/json',
    };
  },
});
