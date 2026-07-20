/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {McpResponseFormatter} from '../../src/formatters/McpResponseFormatter.js';
import type {
  FormatData,
  FormatState,
} from '../../src/formatters/McpResponseFormatter.js';
import type {McpContext} from '../../src/McpContext.js';
import {getTextContent} from '../utils.js';

describe('McpResponseFormatter', () => {
  const mockContext = {
    getPages: () => [],
    getSelectedPageFallback: () => undefined,
    saveFile: async () => ({filename: 'saved.txt'}),
  } as unknown as McpContext;

  const defaultState = {
    images: [],
    textResponseLines: [],
    reconnectNotice: false,
    includePages: false,
    includeExtensionPages: false,
    includeExtensionServiceWorkers: false,
    deviceScope: 'ALL',
  } as unknown as FormatState;

  const defaultData = {
    pageTitles: new Map(),
    detailedConsoleMessage: undefined,
    consoleMessages: undefined,
    snapshot: undefined,
    thirdPartyDeveloperTools: [],
  } as unknown as FormatData;

  describe('formats basic response with text lines', () => {
    it('formats basic lines', t => {
      const state: FormatState = {
        ...defaultState,
        textResponseLines: ['Line 1', 'Line 2'],
      };
      const result = McpResponseFormatter.format(
        'test',
        mockContext,
        defaultData,
        state,
      );
      const text = getTextContent(result.content[0]);
      t.assert.snapshot(text);
    });

    it('formats page listing', t => {
      const mockPage1 = {
        id: 1,
        pptrPage: {url: () => 'http://example.com'},
      };
      const mockPage2 = {
        id: 2,
        pptrPage: {url: () => 'http://test.com'},
      };
      const localMockContext = {
        ...mockContext,
        getPages: () => [mockPage1, mockPage2],
        isPageSelected: (p: unknown) => (p as {id: number}).id === 1,
      };
      const data = {
        ...defaultData,
        pageTitles: new Map([
          [1, 'Title 1'],
          [2, 'Title 2'],
        ]),
      };
      const state = {
        ...defaultState,
        includePages: true,
      };
      const result = McpResponseFormatter.format(
        'test',
        localMockContext as unknown as never,
        data,
        state,
      );
      t.assert.snapshot(getTextContent(result.content[0]));
    });

    it('formats extension pages', t => {
      const mockPage = {
        id: 3,
        pptrPage: {url: () => 'chrome-extension://abc/page.html'},
      };
      const localMockContext = {
        ...mockContext,
        getPages: () => [mockPage],
        isPageSelected: () => false,
      };
      const data = {
        ...defaultData,
        pageTitles: new Map([[3, 'Ext Page 1']]),
      };
      const state = {
        ...defaultState,
        includePages: true,
        includeExtensionPages: true,
      };
      const result = McpResponseFormatter.format(
        'test',
        localMockContext as unknown as never,
        data,
        state,
      );
      t.assert.snapshot(getTextContent(result.content[0]));
    });

    it('formats third party tools', t => {
      const data = {
        ...defaultData,
        thirdPartyDeveloperTools: [
          {
            name: 'MyGroup',
            tools: [
              {
                name: 'MyTool',
                description: 'desc',
                inputSchema: {},
              } as unknown as never,
            ],
          } as unknown as never,
        ],
      };
      const result = McpResponseFormatter.format(
        'test',
        mockContext,
        data,
        defaultState,
      );
      t.assert.snapshot(getTextContent(result.content[0]));
    });

    it('formats webmcp tools', t => {
      const data = {
        ...defaultData,
        webmcpTools: [
          {
            name: 'MyWebMCPTool',
            description: 'desc',
            inputSchema: {},
            annotations: {
              category: 'test',
            },
          } as unknown as never,
        ],
      };
      const state = {
        ...defaultState,
        listWebMcpTools: true,
      };
      const result = McpResponseFormatter.format(
        'test',
        mockContext,
        data,
        state,
      );
      t.assert.snapshot(getTextContent(result.content[0]));
    });

    it('formats emulation settings', t => {
      const state = {
        ...defaultState,
        page: {
          cpuThrottlingRate: 2,
          viewport: {width: 800, height: 600, deviceScaleFactor: 1},
          userAgent: 'MockAgent',
          colorScheme: 'dark',
          getDialog: () => undefined,
        },
      };
      const result = McpResponseFormatter.format(
        'test',
        mockContext,
        defaultData,
        state as unknown as never,
      );
      t.assert.snapshot(getTextContent(result.content[0]));
    });

    it('formats dialogs', t => {
      const state = {
        ...defaultState,
        page: {
          getDialog: () => ({
            type: () => 'prompt',
            message: () => 'Prompt dialog',
            defaultValue: () => 'default value',
          }),
        },
      };
      const result = McpResponseFormatter.format(
        'test',
        mockContext,
        defaultData,
        state as unknown as never,
      );
      t.assert.snapshot(getTextContent(result.content[0]));
    });
  });

  it('formats reconnect notice', t => {
    const state: FormatState = {
      ...defaultState,
      reconnectNotice: true,
    };
    const result = McpResponseFormatter.format(
      'test',
      mockContext,
      defaultData,
      state,
    );
    const text = getTextContent(result.content[0]);
    t.assert.snapshot(text);
    assert.strictEqual(
      (result.structuredContent as {reconnected: boolean}).reconnected,
      true,
    );
  });

  it('formats error message', t => {
    const data: FormatData = {
      ...defaultData,
      errorMessage: 'Something went wrong',
    };
    const result = McpResponseFormatter.format(
      'test',
      mockContext,
      data,
      defaultState,
    );
    const text = getTextContent(result.content[0]);
    t.assert.snapshot(text);
  });

  it('formats snapshot', t => {
    const data: FormatData = {
      ...defaultData,
      snapshot: 'Hello World',
    };
    const result = McpResponseFormatter.format(
      'test',
      mockContext,
      data,
      defaultState,
    );
    const text = getTextContent(result.content[0]);
    t.assert.snapshot(text);
    assert.deepStrictEqual(
      (result.structuredContent as {snapshotFilePath: unknown})
        .snapshotFilePath,
      data.snapshot,
    );
  });

  it('formats console messages', t => {
    const data: FormatData = {
      ...defaultData,
      consoleMessages: [
        {
          toJSON: () => ({msgid: 1, text: 'Console log 1'}),
          toString: () => 'Console log 1',
        } as unknown as NonNullable<FormatData['consoleMessages']>[0],
        {
          toJSON: () => ({msgid: 2, text: 'Console log 2'}),
          toString: () => 'Console log 2',
        } as unknown as NonNullable<FormatData['consoleMessages']>[0],
      ],
    };
    const state: FormatState = {
      ...defaultState,
      consoleDataOptions: {include: true},
    };
    const result = McpResponseFormatter.format(
      'test',
      mockContext,
      data,
      state,
    );
    const text = getTextContent(result.content[0]);
    t.assert.snapshot(text);
  });

  it('formats network requests', t => {
    const data: FormatData = {
      ...defaultData,
      networkRequests: [
        {
          toJSON: () => ({
            url: 'http://example.com',
            method: 'GET',
            status: '200',
          }),
          toString: () => 'GET http://example.com 200',
        } as unknown as NonNullable<FormatData['networkRequests']>[0],
      ],
    };
    const state: FormatState = {
      ...defaultState,
      networkRequestsOptions: {include: true},
    };
    const result = McpResponseFormatter.format(
      'test',
      mockContext,
      data,
      state,
    );
    const text = getTextContent(result.content[0]);
    t.assert.snapshot(text);
  });

  it('formats paginated network requests', t => {
    const mockRequests = Array.from(
      {length: 15},
      (_, i) =>
        ({
          toJSON: () => ({
            url: `http://example.com/${i}`,
            method: 'GET',
            status: '200',
          }),
          toString: () => `GET http://example.com/${i} 200`,
        }) as unknown as NonNullable<FormatData['networkRequests']>[0],
    );

    const data: FormatData = {
      ...defaultData,
      networkRequests: mockRequests,
    };
    const state: FormatState = {
      ...defaultState,
      networkRequestsOptions: {
        include: true,
        pagination: {pageIdx: 0, pageSize: 10},
      },
    };
    const result = McpResponseFormatter.format(
      'test',
      mockContext,
      data,
      state,
    );
    const text = getTextContent(result.content[0]);
    t.assert.snapshot(text);
    assert.ok(text.includes('Showing 1-10 of 15'));
  });
});
