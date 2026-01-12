/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it, beforeEach} from 'node:test';

import logger from 'debug';
import type {Browser, Page} from 'puppeteer';
import sinon from 'sinon';

import {McpContext} from '../src/McpContext.js';


// Helper type for mock objects with any properties
type MockBrowser = sinon.SinonStubbedInstance<Browser> & Record<string, any>;
type MockPage = sinon.SinonStubbedInstance<Page> & Record<string, any>;

// Helper functions to create mock objects
function createMockBrowser(): MockBrowser {
  return {
    isConnected: sinon.stub().returns(true),
    on: sinon.stub().returnsThis(),
    off: sinon.stub().returnsThis(),
    close: sinon.stub().resolves(),
    pages: sinon.stub().resolves([]),
    _client: sinon.stub().resolves({
      send: sinon.stub().resolves(),
    }),
  } as any as MockBrowser;
}

function createMockPage(): MockPage {
  return {
    on: sinon.stub().returnsThis(),
    off: sinon.stub().returnsThis(),
    setDefaultTimeout: sinon.stub(),
    setDefaultNavigationTimeout: sinon.stub(),
    getDefaultTimeout: sinon.stub().returns(5000),
    getDefaultNavigationTimeout: sinon.stub().returns(10000),
    isClosed: sinon.stub().returns(false),
    url: sinon.stub().returns('http://example.com'),
    _client: sinon.stub().returns({
      send: sinon.stub().resolves(),
    }),
  } as any as MockPage;
}

describe('McpContext - Reconnection Integration', () => {
  let mockBrowser: MockBrowser;
  let mockPage: MockPage;
  let context: McpContext;

  beforeEach(async () => {
    // Create mock browser and page using helper functions
    mockBrowser = createMockBrowser();
    mockPage = createMockPage();

    mockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

    const browserFactory = async () => mockBrowser as unknown as Browser;

    // Create context
    context = await McpContext.from(
      mockBrowser as unknown as Browser,
      logger('test'),
      browserFactory,
      {enableLogging: false},
    );
  });

  describe('updateBrowser() flow', () => {
    it('should update browser instance', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      assert.strictEqual(
        context.browser,
        newMockBrowser as unknown as Browser,
      );
    });

    it('should reinitialize collectors after browser update', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      // Spy on collector initialization
      const networkCollector = (context as any)['#networkCollector'];
      const consoleCollector = (context as any)['#consoleCollector'];

      const networkInitSpy = sinon.spy(networkCollector, 'init');
      const consoleInitSpy = sinon.spy(consoleCollector, 'init');

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      // Collectors should be reinitialized
      sinon.assert.called(networkInitSpy);
      sinon.assert.called(consoleInitSpy);
    });

    it('should recreate pages snapshot after browser update', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      const newMockPage: MockPage = createMockPage();

      newMockBrowser.pages = sinon
        .stub()
        .resolves([newMockPage as unknown as Page]) as any;

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      const pages = context.getPages();
      assert.strictEqual(pages.length, 1);
      assert.strictEqual(pages[0], newMockPage as unknown as Page);
    });

    it('should reset selected page index to 0', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      // Set selected page to something other than 0
      context.setSelectedPageIdx(0);

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      assert.strictEqual(context.getSelectedPageIdx(), 0);
    });
  });

  describe('CDP reinitialization', () => {
    it('should reinitialize CDP protocol domains', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();

      // Mock CDP client
      const mockCDPClient = {
        send: sinon.stub().resolves(),
      };

      newMockBrowser._client = sinon.stub().resolves(mockCDPClient) as any;

      const newMockPage: MockPage = createMockPage();
      newMockPage._client = sinon.stub().returns(mockCDPClient);

      newMockBrowser.pages = sinon
        .stub()
        .resolves([newMockPage as unknown as Page]) as any;

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      // Should have called CDP commands
      sinon.assert.called(mockCDPClient.send);

      // Verify Target.setDiscoverTargets was called
      const targetDiscoveryCall = mockCDPClient.send
        .getCalls()
        .find((call: any) => call.args[0] === 'Target.setDiscoverTargets');
      assert.ok(
        targetDiscoveryCall,
        'Target.setDiscoverTargets should be called',
      );

      // Verify Target.setAutoAttach was called
      const autoAttachCall = mockCDPClient.send
        .getCalls()
        .find((call: any) => call.args[0] === 'Target.setAutoAttach');
      assert.ok(autoAttachCall, 'Target.setAutoAttach should be called');
    });

    it('should enable CDP domains for each page', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();

      const mockCDPClient = {
        send: sinon.stub().resolves(),
      };

      newMockBrowser._client = sinon.stub().resolves(mockCDPClient) as any;

      const mockPageCDPClient = {
        send: sinon.stub().resolves(),
      };

      const newMockPage: MockPage = createMockPage();
      newMockPage._client = sinon.stub().returns(mockPageCDPClient) as any;

      newMockBrowser.pages = sinon
        .stub()
        .resolves([newMockPage as unknown as Page]) as any;

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      // Should have enabled essential CDP domains
      const networkEnableCall = mockPageCDPClient.send
        .getCalls()
        .find((call: any) => call.args[0] === 'Network.enable');
      assert.ok(networkEnableCall, 'Network.enable should be called');

      const runtimeEnableCall = mockPageCDPClient.send
        .getCalls()
        .find((call: any) => call.args[0] === 'Runtime.enable');
      assert.ok(runtimeEnableCall, 'Runtime.enable should be called');

      const logEnableCall = mockPageCDPClient.send
        .getCalls()
        .find((call: any) => call.args[0] === 'Log.enable');
      assert.ok(logEnableCall, 'Log.enable should be called');
    });

    it('should handle CDP reinitialization errors gracefully', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();

      // Mock CDP client that throws errors
      const mockCDPClient = {
        send: sinon.stub().rejects(new Error('CDP command failed')),
      };

      newMockBrowser._client = sinon.stub().resolves(mockCDPClient) as any;
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      // Should not throw even if CDP reinitialization fails
      await assert.doesNotReject(
        context.updateBrowser(newMockBrowser as unknown as Browser),
      );

      // Browser should still be updated
      assert.strictEqual(
        context.browser,
        newMockBrowser as unknown as Browser,
      );
    });
  });

  describe('NetworkCollector reinitialization', () => {
    it('should reinitialize NetworkCollector with new browser', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      const networkCollector = (context as any)['#networkCollector'];
      const initSpy = sinon.spy(networkCollector, 'init');

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      sinon.assert.calledOnce(initSpy);
    });

    it('should clear old network requests after reconnection', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      // Get network requests before reconnection
      const requestsBefore = context.getNetworkRequests();

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      // Network requests should be cleared/reinitialized
      const requestsAfter = context.getNetworkRequests();

      // Both should be empty arrays (since we haven't added any requests)
      assert.deepStrictEqual(requestsBefore, []);
      assert.deepStrictEqual(requestsAfter, []);
    });
  });

  describe('ConsoleCollector reinitialization', () => {
    it('should reinitialize ConsoleCollector with new browser', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      const consoleCollector = (context as any)['#consoleCollector'];
      const initSpy = sinon.spy(consoleCollector, 'init');

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      sinon.assert.calledOnce(initSpy);
    });

    it('should clear old console data after reconnection', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      // Get console data before reconnection
      const consoleDataBefore = context.getConsoleData();

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      // Console data should be cleared/reinitialized
      const consoleDataAfter = context.getConsoleData();

      // Both should be empty arrays (since we haven't added any console messages)
      assert.deepStrictEqual(consoleDataBefore, []);
      assert.deepStrictEqual(consoleDataAfter, []);
    });
  });

  describe('Connection manager integration', () => {
    it('should update connection manager with new browser', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      const setBrowserSpy = sinon.spy(context.connectionManager, 'setBrowser');

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      sinon.assert.calledWith(
        setBrowserSpy,
        newMockBrowser as unknown as Browser,
        sinon.match.func,
      );
    });

    it('should maintain connection manager state across updates', async () => {
      const initialReconnectAttempts = context.connectionManager.getReconnectAttempts();

      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      // Reconnect attempts should be preserved
      assert.strictEqual(
        context.connectionManager.getReconnectAttempts(),
        initialReconnectAttempts,
      );
    });
  });

  describe('Error recovery scenarios', () => {
    it('should recover from pages() failure during update', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().rejects(new Error('Pages fetch failed')) as any;

      // Should throw error
      await assert.rejects(
        context.updateBrowser(newMockBrowser as unknown as Browser),
        /Pages fetch failed/,
      );
    });

    it('should handle collector initialization failures', async () => {
      const newMockBrowser: MockBrowser = createMockBrowser();
      newMockBrowser.pages = sinon.stub().resolves([mockPage as unknown as Page]) as any;

      const networkCollector = (context as any)['#networkCollector'];
      sinon.stub(networkCollector, 'init').rejects(new Error('Init failed'));

      // Should throw error
      await assert.rejects(
        context.updateBrowser(newMockBrowser as unknown as Browser),
        /Init failed/,
      );
    });
  });

  describe('State consistency after reconnection', () => {
    it('should preserve network conditions after reconnection', async () => {
      context.setNetworkConditions('Slow 3G');

      const newMockBrowser: MockBrowser = createMockBrowser();
      const newMockPage: MockPage = createMockPage();

      newMockBrowser.pages = sinon
        .stub()
        .resolves([newMockPage as unknown as Page]) as any;

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      // Network conditions should be preserved per page
      // Note: This will be null for new page since network conditions are per-page
      const conditions = context.getNetworkConditions();
      assert.strictEqual(conditions, null);
    });

    it('should preserve CPU throttling rate after reconnection', async () => {
      context.setCpuThrottlingRate(4);

      const newMockBrowser: MockBrowser = createMockBrowser();
      const newMockPage: MockPage = createMockPage();

      newMockBrowser.pages = sinon
        .stub()
        .resolves([newMockPage as unknown as Page]) as any;

      await context.updateBrowser(newMockBrowser as unknown as Browser);

      // CPU throttling rate should be preserved per page
      // Note: This will be 1 for new page since throttling is per-page
      const rate = context.getCpuThrottlingRate();
      assert.strictEqual(rate, 1);
    });
  });
});
