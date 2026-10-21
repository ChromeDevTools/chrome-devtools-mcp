/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {UncaughtError} from '../src/collectors/PageCollector.js';
import type {ReadonlyServerConfig} from '../src/config/ServerConfig.js';
import type {TargetUniverse} from '../src/devtools/DevtoolsUtils.js';
import {McpPage, replaceHtmlElementsWithUids} from '../src/McpPage.js';
import {
  DevTools,
  Frame,
  Locator,
  ScreenRecorder,
} from '../src/third_party/index.js';
import type {JSONSchema7Definition} from '../src/third_party/index.js';
import {TextSnapshot} from '../src/TextSnapshot.js';
import type {TextSnapshotNode} from '../src/types.js';
import {
  createMockCDPSession,
  createMockDialog,
  createMockMcpResponse,
  createMockPuppeteerBrowser,
  createMockPuppeteerPage,
  createMockPuppeteerTarget,
  createMockServerConfig,
  createMockWebMCPTool,
} from './mocks.js';
import {serverHooks} from './server.js';
import {getMockRequest, html, withMcpContext} from './utils.js';

describe('replaceHtmlElementsWithUids', () => {
  it('does nothing for boolean schemas', () => {
    const schemaTrue: JSONSchema7Definition = true;
    const schemaFalse: JSONSchema7Definition = false;

    replaceHtmlElementsWithUids(schemaTrue);
    replaceHtmlElementsWithUids(schemaFalse);

    assert.strictEqual(schemaTrue, true);
    assert.strictEqual(schemaFalse, false);
  });

  it('replaces HTMLElement type with uid string', () => {
    const schema: JSONSchema7Definition = {
      type: 'object',
      properties: {
        foo: {type: 'string'},
        bar: {type: 'number'},
      },
      required: ['foo'],
    };
    Object.assign(schema, {'x-mcp-type': 'HTMLElement'});

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object') {
      assert.deepStrictEqual(schema.properties, {
        uid: {type: 'string'},
      });
      assert.deepStrictEqual(schema.required, ['uid']);
    } else {
      assert.fail('Schema should be an object');
    }
  });

  it('does not replace if x-mcp-type is not HTMLElement', () => {
    const schema: JSONSchema7Definition = {
      type: 'object',
      properties: {
        foo: {type: 'string'},
      },
    };
    Object.assign(schema, {'x-mcp-type': 'OtherType'});

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object') {
      assert.deepStrictEqual(schema.properties, {
        foo: {type: 'string'},
      });
      assert.strictEqual(schema.required, undefined);
    } else {
      assert.fail('Schema should be an object');
    }
  });

  it('recurses into nested properties', () => {
    const schema: JSONSchema7Definition = {
      type: 'object',
      properties: {
        element: {
          type: 'object',
          properties: {
            foo: {type: 'string'},
          },
        },
        other: {
          type: 'string',
        },
      },
    };
    if (typeof schema === 'object' && schema.properties) {
      Object.assign(schema.properties.element, {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (
      typeof schema === 'object' &&
      schema.properties &&
      typeof schema.properties.element === 'object'
    ) {
      const elementSchema = schema.properties.element;
      assert.deepStrictEqual(elementSchema.properties, {
        uid: {type: 'string'},
      });
      assert.deepStrictEqual(elementSchema.required, ['uid']);
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into array items (single schema object)', () => {
    const schema: JSONSchema7Definition = {
      type: 'array',
      items: {
        type: 'object',
      },
    };
    if (typeof schema === 'object' && typeof schema.items === 'object') {
      Object.assign(schema.items, {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && typeof schema.items === 'object') {
      const itemsSchema = schema.items;
      if (!Array.isArray(itemsSchema)) {
        assert.deepStrictEqual(itemsSchema.properties, {
          uid: {type: 'string'},
        });
        assert.deepStrictEqual(itemsSchema.required, ['uid']);
      } else {
        assert.fail('items should not be an array in this test case');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into array items (array of schemas)', () => {
    const schema: JSONSchema7Definition = {
      type: 'array',
      items: [
        {
          type: 'object',
        },
        {
          type: 'string',
        },
      ],
    };
    if (typeof schema === 'object' && Array.isArray(schema.items)) {
      Object.assign(schema.items[0], {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && Array.isArray(schema.items)) {
      const firstItem = schema.items[0];
      if (typeof firstItem === 'object') {
        assert.deepStrictEqual(firstItem.properties, {
          uid: {type: 'string'},
        });
        assert.deepStrictEqual(firstItem.required, ['uid']);
      } else {
        assert.fail('First item should be an object');
      }

      const secondItem = schema.items[1];
      if (typeof secondItem === 'object') {
        assert.strictEqual(secondItem.properties, undefined);
      } else {
        assert.fail('Second item should be an object');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into anyOf', () => {
    const schema: JSONSchema7Definition = {
      anyOf: [
        {
          type: 'object',
        },
        {
          type: 'string',
        },
      ],
    };
    if (typeof schema === 'object' && Array.isArray(schema.anyOf)) {
      Object.assign(schema.anyOf[0], {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && Array.isArray(schema.anyOf)) {
      const firstItem = schema.anyOf[0];
      if (typeof firstItem === 'object') {
        assert.deepStrictEqual(firstItem.properties, {
          uid: {type: 'string'},
        });
      } else {
        assert.fail('First item should be an object');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into allOf', () => {
    const schema: JSONSchema7Definition = {
      allOf: [
        {
          type: 'object',
        },
      ],
    };
    if (typeof schema === 'object' && Array.isArray(schema.allOf)) {
      Object.assign(schema.allOf[0], {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && Array.isArray(schema.allOf)) {
      const firstItem = schema.allOf[0];
      if (typeof firstItem === 'object') {
        assert.deepStrictEqual(firstItem.properties, {
          uid: {type: 'string'},
        });
      } else {
        assert.fail('First item should be an object');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into oneOf', () => {
    const schema: JSONSchema7Definition = {
      oneOf: [
        {
          type: 'object',
        },
      ],
    };
    if (typeof schema === 'object' && Array.isArray(schema.oneOf)) {
      Object.assign(schema.oneOf[0], {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && Array.isArray(schema.oneOf)) {
      const firstItem = schema.oneOf[0];
      if (typeof firstItem === 'object') {
        assert.deepStrictEqual(firstItem.properties, {
          uid: {type: 'string'},
        });
      } else {
        assert.fail('First item should be an object');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });
});

describe('McpPage', () => {
  async function createMcpPage(options: {config?: ReadonlyServerConfig} = {}) {
    const pptrPage = createMockPuppeteerPage();
    pptrPage.emulateFocusedPage.resolves();
    const target = createMockPuppeteerTarget({page: pptrPage});
    const mcpPage = new McpPage(target, 1, {
      config: options.config ?? createMockServerConfig(),
      locatorClass: Locator,
    });
    const mockSession = {
      send: sinon.stub().resolves(),
    };
    sinon
      .stub(mcpPage, 'devtoolsUniverse')
      .get(() => ({session: mockSession}) as unknown as TargetUniverse);
    await mcpPage.init();
    return {mcpPage, pptrPage, target, mockSession};
  }

  function getUidForNode(mcpPage: McpPage, matcher: string): string {
    const textSnapshot = mcpPage.textSnapshot;
    if (!textSnapshot) {
      throw new Error('No textSnapshot on mcpPage');
    }
    for (const [uid, node] of textSnapshot.idToNode) {
      if (node.name?.includes(matcher)) {
        return uid;
      }
    }
    throw new Error(`Target element "${matcher}" not found in snapshot`);
  }

  describe('lazy initialization', () => {
    for (const replaceNetworkCollector of [false, true]) {
      it(`forwards the navigation limit to collectors (replacement: ${replaceNetworkCollector})`, async () => {
        const pptrPage = createMockPuppeteerPage();
        const target = createMockPuppeteerTarget({page: pptrPage});
        const mcpPage = new McpPage(target, 1, {
          config: createMockServerConfig({maxNavigationSaved: 5}),
          locatorClass: Locator,
        });
        await mcpPage.init();
        if (replaceNetworkCollector) {
          await mcpPage.setUpNetworkCollectorForTesting();
        }
        const requests = [];
        const errors = [];
        for (let navigation = 0; navigation < 7; navigation++) {
          const request = getMockRequest({
            url: `http://example.com/nav${navigation}`,
            navigationRequest: true,
            frame: pptrPage.mainFrame(),
          });
          requests.push(request);
          pptrPage.emit('request', request);
          pptrPage.emit('framenavigated', pptrPage.mainFrame());
          const error = new UncaughtError(
            {
              exceptionId: navigation,
              text: `error-${navigation}`,
              lineNumber: 0,
              columnNumber: 0,
            },
            '<mock>',
          );
          errors.push(error);
          pptrPage.emit('uncaughtError', error);
        }
        assert.deepStrictEqual(
          mcpPage.networkCollector.getData(true),
          requests.slice(-5),
        );
        assert.deepStrictEqual(
          mcpPage.consoleCollector.getData(true),
          errors.slice(-5),
        );
        mcpPage.dispose();
      });
    }

    it('does not initialize Puppeteer Page in constructor and throws if pptrPage is accessed before init()', async () => {
      const pptrPage = createMockPuppeteerPage();
      pptrPage.emulateFocusedPage.resolves();
      const target = createMockPuppeteerTarget({
        page: pptrPage,
        url: 'https://target-only.example.com',
        title: 'Target Title',
      });
      const mcpPage = new McpPage(target, 1, {
        config: createMockServerConfig(),
        locatorClass: Locator,
      });

      sinon.assert.notCalled(target.page);
      sinon.assert.notCalled(target.asPage);
      assert.throws(() => mcpPage.pptrPage, /not initialized/);
      await assert.rejects(
        () => mcpPage.discoverThirdPartyDeveloperTools(),
        /not initialized/,
      );
      assert.throws(() => mcpPage.getWebMcpTools(), /not initialized/);
      assert.strictEqual(mcpPage.url(), 'https://target-only.example.com');
      assert.strictEqual(mcpPage.getTitle(), 'Target Title');

      await mcpPage.init();

      sinon.assert.calledOnce(target.page);
      assert.strictEqual(mcpPage.pptrPage, pptrPage);
      assert.strictEqual(mcpPage.getTitle(), 'Target Title');
      sinon.assert.notCalled(pptrPage.title);
    });

    it('falls back to target.asPage() when target.page() returns null', async () => {
      const pptrPage = createMockPuppeteerPage();
      pptrPage.emulateFocusedPage.resolves();
      const target = createMockPuppeteerTarget({page: pptrPage});
      target.page.resolves(null);

      const mcpPage = new McpPage(target, 1, {
        config: createMockServerConfig(),
        locatorClass: Locator,
      });

      await mcpPage.init();

      sinon.assert.calledOnce(target.page);
      sinon.assert.calledOnce(target.asPage);
      assert.strictEqual(mcpPage.pptrPage, pptrPage);
    });

    it('disposes safely before init() is called and rejects subsequent init()', async () => {
      const target = createMockPuppeteerTarget();
      const mcpPage = new McpPage(target, 1, {
        config: createMockServerConfig(),
        locatorClass: Locator,
      });

      assert.strictEqual(mcpPage.isClosed(), false);
      mcpPage.dispose();
      assert.strictEqual(mcpPage.isClosed(), true);
      await assert.rejects(
        () => mcpPage.init(),
        /McpPage \(id=1\) has already been disposed/,
      );
      sinon.assert.notCalled(target.page);
    });

    it('closes the underlying page without running init()', async () => {
      const pptrPage = createMockPuppeteerPage();
      const target = createMockPuppeteerTarget({page: pptrPage});
      const mcpPage = new McpPage(target, 1, {
        config: createMockServerConfig(),
        locatorClass: Locator,
      });

      await mcpPage.close();

      assert.strictEqual(mcpPage.isClosed(), true);
      sinon.assert.calledOnceWithExactly(pptrPage.close, {
        runBeforeUnload: false,
      });
      sinon.assert.notCalled(pptrPage.emulateFocusedPage);
    });

    it('stops and clears an active screenRecorder on dispose()', async () => {
      const target = createMockPuppeteerTarget();
      const mcpPage = new McpPage(target, 1, {
        config: createMockServerConfig(),
        locatorClass: Locator,
      });
      const recorder = sinon.createStubInstance(ScreenRecorder);
      recorder.stop.resolves();
      mcpPage.setScreenRecorder({recorder, filePath: '/tmp/video.mp4'});

      mcpPage.dispose();

      sinon.assert.calledOnceWithExactly(recorder.stop);
      assert.strictEqual(mcpPage.getScreenRecorder(), null);
    });
  });

  describe('focus emulation', () => {
    function createPage() {
      const pptrPage = createMockPuppeteerPage();
      pptrPage.emulateFocusedPage.resolves();
      const target = createMockPuppeteerTarget({page: pptrPage});
      const mcpPage = new McpPage(target, 1, {
        config: createMockServerConfig(),
        locatorClass: Locator,
      });
      return {mcpPage, pptrPage, target};
    }

    it('requests focus once on default initialization', async () => {
      const {mcpPage, pptrPage, target} = createPage();

      await mcpPage.init();
      await mcpPage.init();
      await mcpPage.init({emulateFocus: false});

      sinon.assert.calledOnceWithExactly(pptrPage.emulateFocusedPage, true);
      sinon.assert.calledOnceWithExactly(target.page);
    });

    it('initializes without focus until a tool requests it', async () => {
      const {mcpPage, pptrPage, target} = createPage();

      await mcpPage.init({emulateFocus: false});
      await mcpPage.init({emulateFocus: false});

      assert.strictEqual(mcpPage.pptrPage, pptrPage);
      sinon.assert.notCalled(pptrPage.emulateFocusedPage);

      await mcpPage.init();
      await mcpPage.init();

      sinon.assert.calledOnceWithExactly(pptrPage.emulateFocusedPage, true);
      sinon.assert.calledOnceWithExactly(target.page);
    });

    it('shares initialization and requests focus once for concurrent callers', async () => {
      const {mcpPage, pptrPage, target} = createPage();

      await Promise.all([
        mcpPage.init({emulateFocus: false}),
        mcpPage.init(),
        mcpPage.init(),
      ]);

      sinon.assert.calledOnceWithExactly(target.page);
      sinon.assert.calledOnceWithExactly(pptrPage.emulateFocusedPage, true);
    });

    it('retries a failed focus request and retains successful emulation', async () => {
      const {mcpPage, pptrPage} = createPage();
      pptrPage.emulateFocusedPage
        .onFirstCall()
        .rejects(new Error('Target closed'));

      await mcpPage.init();
      await mcpPage.init();
      await mcpPage.init();

      assert.strictEqual(mcpPage.pptrPage, pptrPage);
      sinon.assert.calledTwice(pptrPage.emulateFocusedPage);
      sinon.assert.alwaysCalledWithExactly(pptrPage.emulateFocusedPage, true);
    });

    it('does not wait for or duplicate a pending focus request', async () => {
      const {mcpPage, pptrPage} = createPage();
      const focus = Promise.withResolvers<void>();
      pptrPage.emulateFocusedPage.returns(focus.promise);

      try {
        await Promise.all([mcpPage.init(), mcpPage.init()]);
        sinon.assert.calledOnceWithExactly(pptrPage.emulateFocusedPage, true);
      } finally {
        focus.resolve();
      }
    });

    it('skips focus when disposed during initialization', async () => {
      const {mcpPage, pptrPage, target} = createPage();
      const page = Promise.withResolvers<typeof pptrPage>();
      target.page.returns(page.promise);

      const initialization = mcpPage.init();
      mcpPage.dispose();
      page.resolve(pptrPage);
      await initialization;

      sinon.assert.notCalled(pptrPage.emulateFocusedPage);
      await assert.rejects(mcpPage.init(), /already been disposed/);
    });

    it('retries base initialization after a failure before requesting focus', async () => {
      const {mcpPage, pptrPage, target} = createPage();
      target.page.onFirstCall().rejects(new Error('Target unavailable'));

      await assert.rejects(mcpPage.init(), /Target unavailable/);
      sinon.assert.notCalled(pptrPage.emulateFocusedPage);

      await mcpPage.init();

      sinon.assert.calledTwice(target.page);
      sinon.assert.calledOnceWithExactly(pptrPage.emulateFocusedPage, true);
    });
  });

  describe('getTitle()', () => {
    function createPage(url: string, title: string): McpPage {
      const target = createMockPuppeteerTarget({url, title});
      return new McpPage(target, 1, {
        config: createMockServerConfig(),
        locatorClass: Locator,
      });
    }

    function targetInfo(url: string, title: string) {
      return {
        targetId: '<mock-target-id>',
        type: 'page',
        title,
        url,
        attached: true,
        canAccessOpener: false,
      };
    }

    it('prefers fresh target info over cached target info', () => {
      const mcpPage = createPage(
        'http://127.0.0.1:8080/titled.html',
        '127.0.0.1:8080/titled.html',
      );
      assert.strictEqual(
        mcpPage.getTitle(
          targetInfo('http://127.0.0.1:8080/titled.html', 'Real Title'),
        ),
        'Real Title',
      );
    });

    it('ignores Chrome URL placeholder titles', () => {
      assert.strictEqual(
        createPage(
          'http://127.0.0.1:8080/titled.html',
          '127.0.0.1:8080/titled.html',
        ).getTitle(),
        '',
      );
      assert.strictEqual(
        createPage('https://example.com/', 'example.com').getTitle(),
        '',
      );
      assert.strictEqual(
        createPage('about:blank', 'about:blank').getTitle(),
        '',
      );
    });

    it('exposes the target id', () => {
      assert.strictEqual(
        createPage('https://example.com', '').targetId,
        '<mock-target-id>',
      );
    });
  });

  describe('emulate()', () => {
    it('calls emulateNetworkConditions with offline settings', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({networkConditions: 'Offline'});
      assert.strictEqual(mcpPage.networkConditions, 'Offline');
      sinon.assert.calledOnceWithExactly(pptrPage.emulateNetworkConditions, {
        offline: true,
        download: 0,
        upload: 0,
        latency: 0,
      });
    });

    it('calls emulateNetworkConditions with the predefined condition', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({networkConditions: 'Slow 3G'});
      assert.strictEqual(mcpPage.networkConditions, 'Slow 3G');
      sinon.assert.calledOnceWithExactly(pptrPage.emulateNetworkConditions, {
        download: 50000,
        upload: 50000,
        latency: 2000,
      });
    });

    it('calls emulateNetworkConditions(null) when networkConditions is omitted', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({networkConditions: 'Slow 3G'});
      await mcpPage.emulate({});
      assert.strictEqual(mcpPage.networkConditions, null);
      sinon.assert.calledTwice(pptrPage.emulateNetworkConditions);
      sinon.assert.calledWithExactly(
        pptrPage.emulateNetworkConditions.secondCall,
        null,
      );
    });

    it('does not call emulateNetworkConditions for unknown values', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({networkConditions: 'Slow 11G'});
      assert.strictEqual(mcpPage.networkConditions, null);
      sinon.assert.notCalled(pptrPage.emulateNetworkConditions);
    });

    it('throws when networkConditions is set with network blocking enabled', async () => {
      const {mcpPage, pptrPage} = await createMcpPage({
        config: createMockServerConfig({
          blockedUrlPattern: ['*://blocked.example.com/*'],
        }),
      });
      await assert.rejects(
        () => mcpPage.emulate({networkConditions: 'Slow 3G'}),
        /Network throttling is not supported when network blocking/,
      );
      sinon.assert.notCalled(pptrPage.emulateNetworkConditions);
    });

    it('calls emulateCPUThrottling with the given rate', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({cpuThrottlingRate: 4});
      assert.strictEqual(mcpPage.cpuThrottlingRate, 4);
      sinon.assert.calledOnceWithExactly(pptrPage.emulateCPUThrottling, 4);
    });

    it('calls emulateCPUThrottling(1) to reset throttling', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({cpuThrottlingRate: 4});
      await mcpPage.emulate({cpuThrottlingRate: 1});
      assert.strictEqual(mcpPage.cpuThrottlingRate, 1);
      sinon.assert.calledTwice(pptrPage.emulateCPUThrottling);
      sinon.assert.calledWithExactly(
        pptrPage.emulateCPUThrottling.secondCall,
        1,
      );
    });

    it('sends Emulation.setCPUThrottlingRate to secondary session if present', async () => {
      const {mcpPage, pptrPage, mockSession} = await createMcpPage();
      await mcpPage.emulate({cpuThrottlingRate: 4});
      sinon.assert.calledOnceWithExactly(pptrPage.emulateCPUThrottling, 4);
      sinon.assert.calledOnceWithExactly(
        mockSession.send,
        'Emulation.setCPUThrottlingRate',
        {rate: 4},
      );
    });

    it('sends Emulation.setCPUThrottlingRate with rate 1 to secondary session when cpuThrottlingRate is omitted', async () => {
      const {mcpPage, pptrPage, mockSession} = await createMcpPage();
      await mcpPage.emulate({});
      sinon.assert.calledOnceWithExactly(pptrPage.emulateCPUThrottling, 1);
      sinon.assert.calledOnceWithExactly(
        mockSession.send,
        'Emulation.setCPUThrottlingRate',
        {rate: 1},
      );
    });

    it('calls setGeolocation with the given coordinates', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({
        geolocation: {latitude: 48.137154, longitude: 11.576124},
      });
      assert.deepStrictEqual(mcpPage.geolocation, {
        latitude: 48.137154,
        longitude: 11.576124,
      });
      sinon.assert.calledOnceWithExactly(pptrPage.setGeolocation, {
        latitude: 48.137154,
        longitude: 11.576124,
      });
    });

    it('clears the geolocation override when geolocation is omitted', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({
        geolocation: {latitude: 48.137154, longitude: 11.576124},
      });
      await mcpPage.emulate({});
      assert.strictEqual(mcpPage.geolocation, null);
      sinon.assert.calledTwice(pptrPage.setGeolocation);
      sinon.assert.calledWithExactly(pptrPage.setGeolocation.secondCall, null);
    });

    it('calls setUserAgent with the given user agent', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({userAgent: 'TestUA/1.0'});
      assert.strictEqual(mcpPage.userAgent, 'TestUA/1.0');
      sinon.assert.calledOnceWithExactly(pptrPage.setUserAgent, {
        userAgent: 'TestUA/1.0',
      });
    });

    it('calls setUserAgent with undefined to clear the user agent', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({userAgent: 'TestUA/1.0'});
      await mcpPage.emulate({userAgent: ''});
      assert.strictEqual(mcpPage.userAgent, null);
      sinon.assert.calledTwice(pptrPage.setUserAgent);
      sinon.assert.calledWithExactly(pptrPage.setUserAgent.secondCall, {
        userAgent: undefined,
      });
    });

    describe('media features', () => {
      it('emulates all media features in a single call', async () => {
        const {mcpPage, pptrPage} = await createMcpPage();
        await mcpPage.emulate({
          colorScheme: 'dark',
          forcedColors: 'active',
          prefersContrast: 'more',
          prefersReducedMotion: 'reduce',
        });
        assert.strictEqual(mcpPage.colorScheme, 'dark');
        assert.strictEqual(mcpPage.forcedColors, 'active');
        assert.strictEqual(mcpPage.prefersContrast, 'more');
        assert.strictEqual(mcpPage.prefersReducedMotion, 'reduce');
        sinon.assert.calledOnceWithExactly(pptrPage.emulateMediaFeatures, [
          {name: 'prefers-color-scheme', value: 'dark'},
          {name: 'forced-colors', value: 'active'},
          {name: 'prefers-contrast', value: 'more'},
          {name: 'prefers-reduced-motion', value: 'reduce'},
        ]);
      });

      it('resets media features set to auto', async () => {
        const {mcpPage, pptrPage} = await createMcpPage();
        await mcpPage.emulate({
          colorScheme: 'dark',
          forcedColors: 'active',
          prefersContrast: 'more',
          prefersReducedMotion: 'reduce',
        });
        await mcpPage.emulate({
          colorScheme: 'auto',
          forcedColors: 'auto',
          prefersContrast: 'auto',
          prefersReducedMotion: 'auto',
        });
        assert.strictEqual(mcpPage.colorScheme, null);
        assert.strictEqual(mcpPage.forcedColors, null);
        assert.strictEqual(mcpPage.prefersContrast, null);
        assert.strictEqual(mcpPage.prefersReducedMotion, null);
        sinon.assert.calledTwice(pptrPage.emulateMediaFeatures);
        sinon.assert.calledWithExactly(
          pptrPage.emulateMediaFeatures.secondCall,
          [
            {name: 'prefers-color-scheme', value: ''},
            {name: 'forced-colors', value: ''},
            {name: 'prefers-contrast', value: ''},
            {name: 'prefers-reduced-motion', value: ''},
          ],
        );
      });

      it('resets omitted media features', async () => {
        const {mcpPage, pptrPage} = await createMcpPage();
        await mcpPage.emulate({forcedColors: 'active'});
        await mcpPage.emulate({prefersContrast: 'less'});
        assert.strictEqual(mcpPage.forcedColors, null);
        assert.strictEqual(mcpPage.prefersContrast, 'less');
        sinon.assert.calledTwice(pptrPage.emulateMediaFeatures);
        sinon.assert.calledWithExactly(
          pptrPage.emulateMediaFeatures.secondCall,
          [
            {name: 'prefers-color-scheme', value: ''},
            {name: 'forced-colors', value: ''},
            {name: 'prefers-contrast', value: 'less'},
            {name: 'prefers-reduced-motion', value: ''},
          ],
        );
      });
    });

    it('calls setViewport with the given dimensions merged with defaults', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({
        viewport: {
          width: 400,
          height: 400,
        },
      });
      assert.deepStrictEqual(mcpPage.viewport, {
        width: 400,
        height: 400,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      });
      sinon.assert.calledOnceWithExactly(pptrPage.setViewport, {
        width: 400,
        height: 400,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      });
    });

    it('calls setViewport(null) when viewport is omitted', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({viewport: {width: 400, height: 400}});
      await mcpPage.emulate({});
      assert.strictEqual(mcpPage.viewport, null);
      sinon.assert.calledTwice(pptrPage.setViewport);
      sinon.assert.calledWithExactly(pptrPage.setViewport.secondCall, null);
    });

    it('does not store a viewport that setViewport rejects', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      pptrPage.setViewport.rejects(new Error('Invalid parameters'));

      await assert.rejects(
        () => mcpPage.emulate({viewport: {width: 800.5, height: 600}}),
        /Invalid parameters/,
      );

      assert.strictEqual(mcpPage.viewport, null);
    });

    it('keeps the previous viewport when setViewport rejects a new one', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({viewport: {width: 400, height: 400}});
      pptrPage.setViewport.rejects(new Error('Invalid parameters'));

      await assert.rejects(
        () =>
          mcpPage.emulate({
            viewport: {width: 20000000, height: 600},
            cpuThrottlingRate: 4,
          }),
        /Invalid parameters/,
      );

      assert.deepStrictEqual(mcpPage.viewport, {
        width: 400,
        height: 400,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      });
      assert.strictEqual(mcpPage.cpuThrottlingRate, 4);
    });

    it('calls setExtraHTTPHeaders with the given headers', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({
        extraHttpHeaders: {'X-Custom-Header': 'test-value'},
      });
      assert.deepStrictEqual(mcpPage.emulationSettings.extraHttpHeaders, {
        'X-Custom-Header': 'test-value',
      });
      sinon.assert.calledOnceWithExactly(pptrPage.setExtraHTTPHeaders, {
        'X-Custom-Header': 'test-value',
      });
    });

    it('clears extraHttpHeaders when empty object is passed', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({
        extraHttpHeaders: {'X-Custom-Header': 'test-value'},
      });
      await mcpPage.emulate({extraHttpHeaders: {}});
      assert.strictEqual(mcpPage.emulationSettings.extraHttpHeaders, undefined);
      sinon.assert.calledTwice(pptrPage.setExtraHTTPHeaders);
      sinon.assert.calledWithExactly(
        pptrPage.setExtraHTTPHeaders.secondCall,
        {},
      );
    });
  });

  describe('restoreEmulation()', () => {
    it('re-applies previously configured viewport emulation', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({
        viewport: {
          width: 400,
          height: 400,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
          isLandscape: false,
        },
      });
      sinon.assert.calledOnce(pptrPage.setViewport);

      await mcpPage.restoreEmulation();

      // A different width first, because Chrome ignores an override that is
      // identical to the last one of this session (see restoreEmulation).
      sinon.assert.calledThrice(pptrPage.setViewport);
      sinon.assert.calledWithExactly(pptrPage.setViewport.secondCall, {
        width: 399,
        height: 400,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      });
      sinon.assert.calledWithExactly(pptrPage.setViewport.thirdCall, {
        width: 400,
        height: 400,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      });
    });

    it('does not send a scratch viewport when none was configured', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({cpuThrottlingRate: 4});
      pptrPage.setViewport.resetHistory();

      await mcpPage.restoreEmulation();

      sinon.assert.calledOnceWithExactly(pptrPage.setViewport, null);
    });

    it('re-applies previously configured network and cpu throttling emulation', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      await mcpPage.emulate({
        networkConditions: 'Slow 3G',
        cpuThrottlingRate: 4,
      });
      sinon.assert.calledOnce(pptrPage.emulateNetworkConditions);
      sinon.assert.calledOnce(pptrPage.emulateCPUThrottling);

      await mcpPage.restoreEmulation();

      sinon.assert.calledTwice(pptrPage.emulateNetworkConditions);
      sinon.assert.calledTwice(pptrPage.emulateCPUThrottling);
    });
  });

  describe('clearNetworkConditions()', () => {
    it('clears networkConditions and updates timeouts while keeping other emulation settings', async () => {
      const config = createMockServerConfig();
      const {mcpPage, pptrPage} = await createMcpPage({config});
      await mcpPage.emulate({
        networkConditions: 'Slow 3G',
        cpuThrottlingRate: 2,
      });
      pptrPage.setDefaultTimeout.resetHistory();
      pptrPage.setDefaultNavigationTimeout.resetHistory();
      config.commit(
        createMockServerConfig({
          blockedUrlPattern: ['https://example.com/*'],
        }),
      );

      mcpPage.clearNetworkConditions();

      assert.strictEqual(mcpPage.networkConditions, null);
      assert.strictEqual(mcpPage.cpuThrottlingRate, 2);
      sinon.assert.calledOnceWithExactly(pptrPage.setDefaultTimeout, 10_000);
      sinon.assert.calledOnceWithExactly(
        pptrPage.setDefaultNavigationTimeout,
        20_000,
      );
      await mcpPage.restoreEmulation();
    });

    it('does nothing when networkConditions is not set', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      pptrPage.setDefaultTimeout.resetHistory();
      pptrPage.setDefaultNavigationTimeout.resetHistory();

      mcpPage.clearNetworkConditions();

      sinon.assert.notCalled(pptrPage.setDefaultTimeout);
      sinon.assert.notCalled(pptrPage.setDefaultNavigationTimeout);
    });
  });

  describe('getNetworkRequests', () => {
    it('delegates to networkCollector.getData with includePreservedRequests', async () => {
      const {mcpPage} = await createMcpPage();
      const stub = sinon.stub(mcpPage.networkCollector, 'getData').returns([]);

      mcpPage.getNetworkRequests(true);
      sinon.assert.calledOnceWithExactly(stub, true);

      mcpPage.getNetworkRequests(false);
      sinon.assert.calledWithExactly(stub.secondCall, false);

      mcpPage.getNetworkRequests();
      sinon.assert.calledWithExactly(stub.thirdCall, undefined);
    });
  });

  describe('getNetworkRequestById', () => {
    it('delegates to networkCollector.getById', async () => {
      const {mcpPage} = await createMcpPage();
      const mockRequest = getMockRequest();
      const stub = sinon
        .stub(mcpPage.networkCollector, 'getById')
        .returns(mockRequest);

      const result = mcpPage.getNetworkRequestById(42);
      sinon.assert.calledOnceWithExactly(stub, 42);
      assert.strictEqual(result, mockRequest);
    });
  });

  describe('network collection with redirects', () => {
    const server = serverHooks();

    it('collects real browser requests across server-side and client-side redirects', async () => {
      server.addRoute('/redirect', async (_req, res) => {
        res.writeHead(302, {
          Location: server.getRoute('/redirected'),
        });
        res.end();
      });

      server.addHtmlRoute(
        '/redirected',
        html`<script>
          document.location.href = '/redirected-page';
        </script>`,
      );

      server.addHtmlRoute('/redirected-page', html`<main>Redirected</main>`);

      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.setUpNetworkCollectorForTesting();
        const page = mcpPage.pptrPage;

        await page.goto(server.getRoute('/redirect'), {
          waitUntil: 'networkidle0',
        });

        const requests = mcpPage.getNetworkRequests(true);
        const urls = requests.map(req => req.url());

        assert.ok(urls.some(url => url.includes('/redirect')));
        assert.ok(urls.some(url => url.includes('/redirected')));
        assert.ok(urls.some(url => url.includes('/redirected-page')));
      });
    });
  });

  describe('waitForTextOnPage()', () => {
    it('finds text on the page', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;

        await page.setContent(
          html`<main><span>Hello</span><span> </span><div>World</div></main>`,
        );

        const element = await mcpPage.waitForTextOnPage(['Hello']);
        assert.ok(element);
      });
    });

    it('works with any-match array', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;

        await page.setContent(
          html`<main><span>Status</span><div>Error</div></main>`,
        );

        const element = await mcpPage.waitForTextOnPage(['Complete', 'Error']);
        assert.ok(element);
      });
    });

    it('works with any-match array when element shows up later', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;

        const waitPromise = mcpPage.waitForTextOnPage(['Complete', 'Error']);

        await page.setContent(
          html`<main
            ><span>Hello</span><span> </span><div>Complete</div></main
          >`,
        );

        const element = await waitPromise;
        assert.ok(element);
      });
    });

    it('works with element that shows up later', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;

        const waitPromise = mcpPage.waitForTextOnPage(['Hello World']);

        await page.setContent(
          html`<main><span>Hello</span><span> </span><div>World</div></main>`,
        );

        const element = await waitPromise;
        assert.ok(element);
      });
    });

    it('works with aria elements', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;

        await page.setContent(
          html`<main><h1>Header</h1><div>Text</div></main>`,
        );

        const element = await mcpPage.waitForTextOnPage(['Header']);
        assert.ok(element);
      });
    });

    it('works with iframe content', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;

        await page.setContent(
          html`<h1>Top level</h1>
            <iframe srcdoc="<p>Hello iframe</p>"></iframe>`,
        );

        const element = await mcpPage.waitForTextOnPage(['Hello iframe']);
        assert.ok(element);
      });
    });

    it('preserves default matching for hidden DOM text', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          '<p style="display:none">Saved successfully</p>',
        );

        const element = await mcpPage.waitForTextOnPage(
          ['Saved successfully'],
          {timeout: 500},
        );
        assert.ok(element);
      });
    });

    it('waits for hidden text to become visible when requested', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;
        await page.setContent(
          '<p id="saved" style="display:none">Saved successfully</p>',
        );

        await page.evaluate(() => {
          setTimeout(() => {
            document.getElementById('saved')!.style.display = 'block';
          }, 250);
        });
        const element = await mcpPage.waitForTextOnPage(
          ['Saved successfully'],
          {timeout: 1500, visible: true},
        );
        assert.ok(element);
      });
    });

    it('times out when visible text never appears', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent(
          '<p style="display:none">Saved successfully</p>',
        );

        await assert.rejects(
          mcpPage.waitForTextOnPage(['Saved successfully'], {
            timeout: 300,
            visible: true,
          }),
          /Timed out/,
        );
      });
    });

    it('visible text remains immediately matchable when requested', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.setContent('<p>Visible from the start</p>');
        assert.ok(
          await mcpPage.waitForTextOnPage(['Visible from the start'], {
            timeout: 500,
            visible: true,
          }),
        );
      });
    });

    it('finds text in an iframe attached while waiting', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;
        await page.setContent('<main>Waiting for the frame</main>');

        const listenersBefore = page.listenerCount('frameattached');
        const waitPromise = mcpPage.waitForTextOnPage(
          ['Arrived in a late iframe'],
          {timeout: 1500},
        );
        await page.evaluate(() => {
          const frame = document.createElement('iframe');
          frame.srcdoc = '<p>Arrived in a late iframe</p>';
          document.body.appendChild(frame);
        });

        const element = await waitPromise;
        assert.ok(element);
        assert.strictEqual(
          page.listenerCount('frameattached'),
          listenersBefore,
        );
      });
    });

    it('cleans the frame listener after a timed out wait', async () => {
      await withMcpContext(async (_response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const page = mcpPage.pptrPage;
        await page.setContent('<main>No matching text</main>');

        const listenersBefore = page.listenerCount('frameattached');
        await assert.rejects(
          mcpPage.waitForTextOnPage(['Text that never appears'], {
            timeout: 250,
          }),
        );
        assert.strictEqual(
          page.listenerCount('frameattached'),
          listenersBefore,
        );
      });
    });

    it('applies visible matching to frames attached while waiting', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      pptrPage.frames.returns([]);
      const initialRace = Locator.race([]);
      sinon.stub(initialRace, 'wait').returns(new Promise(() => {}));
      const lateRace = Locator.race([]);
      const lateRaceSetTimeout = sinon
        .stub(lateRace, 'setTimeout')
        .returns(lateRace);
      sinon.stub(lateRace, 'wait').resolves();
      const race = sinon.stub(Locator, 'race');
      race.onFirstCall().returns(initialRace);
      race.onSecondCall().returns(lateRace);
      const frameLocator = sinon.createStubInstance<Locator<Element>>(Locator);
      frameLocator.setVisibility.returns(frameLocator);
      const lateFrame = sinon.createStubInstance(Frame);
      lateFrame.locator.returns(frameLocator);

      const waitPromise = mcpPage.waitForTextOnPage(['Saved'], {visible: true});
      pptrPage.emit('frameattached', lateFrame);
      await waitPromise;

      sinon.assert.calledWithExactly(lateFrame.locator.firstCall, 'aria/Saved');
      sinon.assert.calledWithExactly(
        lateFrame.locator.secondCall,
        'text/Saved',
      );
      sinon.assert.calledTwice(frameLocator.setVisibility);
      sinon.assert.alwaysCalledWithExactly(
        frameLocator.setVisibility,
        'visible',
      );
      sinon.assert.calledOnceWithExactly(lateRaceSetTimeout, 0);
    });
  });

  describe('DevToolsCommentBridge lifecycle', () => {
    it('does not create commentBridge on construction or getDevToolsPage', async () => {
      const {mcpPage, pptrPage} = await createMcpPage({
        config: createMockServerConfig({devtoolsComments: true}),
      });
      pptrPage.hasDevTools.resolves(true);
      const devtoolsPage = createMockPuppeteerPage();
      pptrPage.openDevTools.resolves(devtoolsPage);

      assert.strictEqual(mcpPage.commentBridge, undefined);

      const retrieved = await mcpPage.getDevToolsPage();
      assert.strictEqual(retrieved, devtoolsPage);
      assert.strictEqual(mcpPage.commentBridge, undefined);
    });

    it('creates and attaches commentBridge when openDevTools is called', async () => {
      const {mcpPage, pptrPage} = await createMcpPage({
        config: createMockServerConfig({devtoolsComments: true}),
      });
      const devtoolsPage = createMockPuppeteerPage();
      devtoolsPage.evaluate.resolves(true);
      pptrPage.openDevTools.resolves(devtoolsPage);

      assert.strictEqual(mcpPage.commentBridge, undefined);

      const result = await mcpPage.openDevTools();
      assert.strictEqual(result, devtoolsPage);
      assert.notStrictEqual(mcpPage.commentBridge, undefined);
      sinon.assert.calledOnce(devtoolsPage.exposeFunction);
    });

    it('does not attach commentBridge in openDevTools() when devtoolsComments is disabled', async () => {
      const config = createMockServerConfig({devtoolsComments: true});
      const {mcpPage, pptrPage} = await createMcpPage({config});
      const devtoolsPage = createMockPuppeteerPage();
      devtoolsPage.evaluate.resolves(true);
      pptrPage.openDevTools.resolves(devtoolsPage);

      await mcpPage.openDevTools();
      assert.notStrictEqual(mcpPage.commentBridge, undefined);

      config.commit(createMockServerConfig());
      mcpPage.disposeCommentBridge();
      devtoolsPage.exposeFunction.resetHistory();

      const result = await mcpPage.openDevTools();
      assert.strictEqual(result, devtoolsPage);
      assert.strictEqual(mcpPage.commentBridge, undefined);
      sinon.assert.notCalled(devtoolsPage.exposeFunction);
    });

    it('returns the commentBridge when the DevTools page has a CD4A bridge', async () => {
      const {mcpPage} = await createMcpPage();
      const devtoolsPage = createMockPuppeteerPage();
      devtoolsPage.evaluate.resolves(true);

      const bridge = await mcpPage.ensureDevToolsCommentBridge(devtoolsPage);

      assert.notStrictEqual(bridge, undefined);
      assert.strictEqual(bridge, mcpPage.commentBridge);
    });

    it('returns undefined when the DevTools page has no CD4A bridge', async () => {
      const {mcpPage} = await createMcpPage();
      const devtoolsPage = createMockPuppeteerPage();
      devtoolsPage.evaluate.resolves(false);

      const bridge = await mcpPage.ensureDevToolsCommentBridge(devtoolsPage);

      assert.strictEqual(bridge, undefined);
      sinon.assert.notCalled(devtoolsPage.exposeFunction);
    });

    it('disposes commentBridge on mcpPage.dispose()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage({
        config: createMockServerConfig({devtoolsComments: true}),
      });
      const devtoolsPage = createMockPuppeteerPage();
      pptrPage.openDevTools.resolves(devtoolsPage);

      await mcpPage.openDevTools();
      const bridge = mcpPage.commentBridge;
      assert.ok(bridge);

      const disposeSpy = sinon.spy(bridge, 'dispose');
      mcpPage.dispose();

      sinon.assert.calledOnce(disposeSpy);
      assert.strictEqual(mcpPage.commentBridge, undefined);
    });

    it('creates and attaches commentBridge when getDevToolsData is called', async () => {
      const {mcpPage, pptrPage} = await createMcpPage({
        config: createMockServerConfig({devtoolsComments: true}),
      });
      pptrPage.hasDevTools.resolves(true);
      const devtoolsPage = createMockPuppeteerPage();
      devtoolsPage.evaluate.resolves(true);
      devtoolsPage.evaluate.onThirdCall().resolves({
        cdpRequestId: 'req-1',
        cdpBackendNodeId: 10,
      });
      pptrPage.openDevTools.resolves(devtoolsPage);

      assert.strictEqual(mcpPage.commentBridge, undefined);

      const data = await mcpPage.getDevToolsData();
      assert.deepStrictEqual(data, {
        cdpRequestId: 'req-1',
        cdpBackendNodeId: 10,
      });
      assert.notStrictEqual(mcpPage.commentBridge, undefined);
      sinon.assert.calledOnce(devtoolsPage.exposeFunction);
      sinon.assert.calledThrice(devtoolsPage.evaluate);
    });

    it('disposes and clears commentBridge on mcpPage.disposeCommentBridge()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage({
        config: createMockServerConfig({devtoolsComments: true}),
      });
      const devtoolsPage = createMockPuppeteerPage();
      pptrPage.openDevTools.resolves(devtoolsPage);

      await mcpPage.openDevTools();
      const bridge = mcpPage.commentBridge;
      assert.ok(bridge);

      const disposeSpy = sinon.spy(bridge, 'dispose');
      mcpPage.disposeCommentBridge();

      sinon.assert.calledOnceWithExactly(disposeSpy);
      assert.strictEqual(mcpPage.commentBridge, undefined);
    });

    it('does not re-attach commentBridge in getDevToolsData() when devtoolsComments is disabled', async () => {
      const config = createMockServerConfig({devtoolsComments: true});
      const {mcpPage, pptrPage} = await createMcpPage({config});
      pptrPage.hasDevTools.resolves(true);
      const devtoolsPage = createMockPuppeteerPage();
      devtoolsPage.evaluate.resolves(true);
      pptrPage.openDevTools.resolves(devtoolsPage);

      await mcpPage.openDevTools();
      assert.notStrictEqual(mcpPage.commentBridge, undefined);

      config.commit(createMockServerConfig());
      mcpPage.disposeCommentBridge();
      assert.strictEqual(mcpPage.commentBridge, undefined);
      devtoolsPage.exposeFunction.resetHistory();
      devtoolsPage.evaluate.reset();
      devtoolsPage.evaluate.resolves({
        cdpRequestId: 'req-2',
        cdpBackendNodeId: 20,
      });

      const data = await mcpPage.getDevToolsData();

      assert.deepStrictEqual(data, {
        cdpRequestId: 'req-2',
        cdpBackendNodeId: 20,
      });
      assert.strictEqual(mcpPage.commentBridge, undefined);
      sinon.assert.notCalled(devtoolsPage.exposeFunction);
      sinon.assert.calledOnce(devtoolsPage.evaluate);
    });

    it('re-attaches commentBridge when ensureDevToolsCommentBridge() is called after disposeCommentBridge()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage({
        config: createMockServerConfig({devtoolsComments: true}),
      });
      const devtoolsPage = createMockPuppeteerPage();
      devtoolsPage.evaluate.resolves(true);
      pptrPage.openDevTools.resolves(devtoolsPage);

      await mcpPage.openDevTools();
      mcpPage.disposeCommentBridge();
      assert.strictEqual(mcpPage.commentBridge, undefined);

      const bridge = await mcpPage.ensureDevToolsCommentBridge(devtoolsPage);

      assert.notStrictEqual(bridge, undefined);
      assert.strictEqual(bridge, mcpPage.commentBridge);
    });
  });

  describe('syncSourceMaps()', () => {
    it('does nothing before init() initializes the DevTools universe', () => {
      const config = createMockServerConfig({sourceMaps: false});
      const target = createMockPuppeteerTarget();
      const mcpPage = new McpPage(target, 1, {
        config,
        locatorClass: Locator,
      });

      mcpPage.syncSourceMaps();

      assert.strictEqual(mcpPage.devtoolsUniverse, undefined);
      sinon.assert.notCalled(target.page);
    });

    it('updates JS and CSS source map settings on an initialized DevTools universe', async () => {
      const config = createMockServerConfig();
      const pptrPage = createMockPuppeteerPage();
      pptrPage.createCDPSession.resolves(createMockCDPSession());
      const target = createMockPuppeteerTarget({page: pptrPage});
      const mcpPage = new McpPage(target, 1, {
        config,
        locatorClass: Locator,
      });
      await mcpPage.init();

      config.commit(createMockServerConfig({sourceMaps: false}));
      mcpPage.syncSourceMaps();

      const settings = mcpPage.devtoolsUniverse?.universe.settings;
      assert.ok(settings);
      assert.strictEqual(
        settings
          .resolve(DevTools.SDKSettings.jsSourceMapsEnabledSettingDescriptor)
          .get(),
        false,
      );
      assert.strictEqual(
        settings
          .resolve(DevTools.SDKSettings.cssSourceMapsEnabledSettingDescriptor)
          .get(),
        false,
      );
    });

    it('reads updated sourceMaps from config when initialized later', async () => {
      const config = createMockServerConfig();
      const pptrPage = createMockPuppeteerPage();
      pptrPage.createCDPSession.resolves(createMockCDPSession());
      const target = createMockPuppeteerTarget({page: pptrPage});
      const mcpPage = new McpPage(target, 1, {
        config,
        locatorClass: Locator,
      });

      config.commit(createMockServerConfig({sourceMaps: false}));
      await mcpPage.init();

      const settings = mcpPage.devtoolsUniverse?.universe.settings;
      assert.ok(settings);
      assert.strictEqual(
        settings
          .resolve(DevTools.SDKSettings.jsSourceMapsEnabledSettingDescriptor)
          .get(),
        false,
      );
      assert.strictEqual(
        settings
          .resolve(DevTools.SDKSettings.cssSourceMapsEnabledSettingDescriptor)
          .get(),
        false,
      );
    });
  });

  describe('resolveBackendNodeId()', () => {
    function createSnapshotWithNodes(
      nodes: Array<{id: string; backendNodeId?: number}>,
      verbose = false,
    ): TextSnapshot {
      const idToNode = new Map<string, TextSnapshotNode>();
      const children: TextSnapshotNode[] = [];
      for (const n of nodes) {
        const node: TextSnapshotNode = {
          id: n.id,
          role: 'generic',
          backendNodeId: n.backendNodeId,
          children: [],
          elementHandle: async () => null,
        };
        idToNode.set(n.id, node);
        children.push(node);
      }
      const rootNode: TextSnapshotNode = {
        id: '1_0',
        role: 'root',
        children,
        elementHandle: async () => null,
      };
      return new TextSnapshot({
        root: rootNode,
        idToNode,
        snapshotId: '1',
        hasSelectedElement: false,
        verbose,
      });
    }

    it('returns uid from existing textSnapshot without regenerating', async () => {
      const {mcpPage} = await createMcpPage();
      mcpPage.textSnapshot = createSnapshotWithNodes([
        {id: '1_1', backendNodeId: 42},
      ]);
      const createStub = sinon.stub(TextSnapshot, 'create');

      const uid = await mcpPage.resolveBackendNodeId(42);

      assert.strictEqual(uid, '1_1');
      sinon.assert.notCalled(createStub);
    });

    it('creates textSnapshot when textSnapshot is null', async () => {
      const {mcpPage} = await createMcpPage();
      const snapshot = createSnapshotWithNodes([
        {id: '1_1', backendNodeId: 42},
      ]);
      const createStub = sinon.stub(TextSnapshot, 'create').resolves(snapshot);

      const uid = await mcpPage.resolveBackendNodeId(42);

      assert.strictEqual(uid, '1_1');
      sinon.assert.calledOnceWithExactly(createStub, mcpPage, {verbose: false});
      assert.strictEqual(mcpPage.textSnapshot, snapshot);
    });

    it('regenerates textSnapshot when backendNodeId is not in existing snapshot', async () => {
      const {mcpPage} = await createMcpPage();
      mcpPage.textSnapshot = createSnapshotWithNodes([
        {id: '1_1', backendNodeId: 10},
      ]);
      const updatedSnapshot = createSnapshotWithNodes([
        {id: '2_1', backendNodeId: 42},
      ]);
      const createStub = sinon
        .stub(TextSnapshot, 'create')
        .resolves(updatedSnapshot);

      const uid = await mcpPage.resolveBackendNodeId(42);

      assert.strictEqual(uid, '2_1');
      sinon.assert.calledOnceWithExactly(createStub, mcpPage, {verbose: false});
      assert.strictEqual(mcpPage.textSnapshot, updatedSnapshot);
    });

    it('falls back to verbose textSnapshot when backendNodeId is not in non-verbose snapshot', async () => {
      const {mcpPage} = await createMcpPage();
      const nonVerboseSnapshot = createSnapshotWithNodes(
        [{id: '1_1', backendNodeId: 10}],
        false,
      );
      const verboseSnapshot = createSnapshotWithNodes(
        [{id: '2_5', backendNodeId: 30}],
        true,
      );
      const createStub = sinon.stub(TextSnapshot, 'create');
      createStub.onFirstCall().resolves(nonVerboseSnapshot);
      createStub.onSecondCall().resolves(verboseSnapshot);

      const uid = await mcpPage.resolveBackendNodeId(30);

      assert.strictEqual(uid, '2_5');
      sinon.assert.calledTwice(createStub);
      sinon.assert.calledWithExactly(createStub.firstCall, mcpPage, {
        verbose: false,
      });
      sinon.assert.calledWithExactly(createStub.secondCall, mcpPage, {
        verbose: true,
      });
      assert.strictEqual(mcpPage.textSnapshot, verboseSnapshot);
    });
  });

  describe('getMatchedStylesForUid()', () => {
    const server = serverHooks();

    function getSelectors(
      matchedStyles: DevTools.CSSMatchedStyles.CSSMatchedStyles,
    ): string[] {
      const styles = matchedStyles.nodeStyles();
      assert.ok(styles.length > 0);
      const selectors: string[] = [];
      for (const s of styles) {
        if (s.parentRule instanceof DevTools.CSSRule.CSSStyleRule) {
          selectors.push(s.parentRule.selectorText());
        }
      }
      return selectors;
    }

    async function getSelectorsForUid(
      uid: string,
      mcpPage: McpPage,
    ): Promise<string[]> {
      const matchedStyles = await mcpPage.getMatchedStylesForUid(uid);
      assert.ok(matchedStyles);
      return getSelectors(matchedStyles);
    }

    it('throws when snapshot has not been captured', async () => {
      const {mcpPage} = await createMcpPage();
      await assert.rejects(
        () => mcpPage.getMatchedStylesForUid('node_1'),
        /No snapshot found for page/,
      );
    });

    it('throws when element uid is not found in snapshot', async () => {
      const {mcpPage} = await createMcpPage();
      const rootNode: TextSnapshotNode = {
        id: '1_0',
        role: 'root',
        children: [],
        elementHandle: async () => null,
      };
      mcpPage.textSnapshot = new TextSnapshot({
        root: rootNode,
        idToNode: new Map<string, TextSnapshotNode>(),
        snapshotId: '1',
        hasSelectedElement: false,
        verbose: false,
      });
      await assert.rejects(
        () => mcpPage.getMatchedStylesForUid('node_1'),
        /Element uid "node_1" not found on page/,
      );
    });

    it('throws when element has no backendNodeId', async () => {
      const {mcpPage} = await createMcpPage();
      const node: TextSnapshotNode = {
        id: '1_1',
        role: 'button',
        children: [],
        elementHandle: async () => null,
      };
      const idToNode = new Map<string, TextSnapshotNode>([['node_1', node]]);
      mcpPage.textSnapshot = new TextSnapshot({
        root: node,
        idToNode,
        snapshotId: '1',
        hasSelectedElement: false,
        verbose: false,
      });
      await assert.rejects(
        () => mcpPage.getMatchedStylesForUid('node_1'),
        /Failed to resolve backend node ID for element with uid "node_1"/,
      );
    });

    it('retrieves matched styles across elements, shadow roots, and iframes', async () => {
      server.addHtmlRoute(
        '/iframe_content.html',
        html`
          <style>
            .frame-btn {
              background-color: purple;
              color: white;
            }
          </style>
          <button
            id="iframe-btn"
            class="frame-btn"
            >Iframe Button</button
          >
        `,
      );
      server.addHtmlRoute(
        '/styles_combined_test.html',
        html`
          <style>
            .btn-primary {
              color: blue;
              font-size: 14px;
            }
            #my-button {
              color: green;
            }
          </style>
          <button
            id="my-button"
            class="btn-primary"
            style="font-size: 16px; padding: 8px;"
          >
            Click Me
          </button>
          <div id="open-host"></div>
          <div id="closed-host"></div>
          <iframe
            id="child-frame"
            src="/iframe_content.html"
          ></iframe>
          <script>
            const openHost = document.getElementById('open-host');
            const openRoot = openHost.attachShadow({mode: 'open'});
            openRoot.innerHTML = \`
              <style>
                .shadow-btn-open {
                  color: rgb(100, 200, 50);
                }
              </style>
              <button class="shadow-btn-open">Open Shadow Button</button>
            \`;

            const closedHost = document.getElementById('closed-host');
            const closedRoot = closedHost.attachShadow({mode: 'closed'});
            closedRoot.innerHTML = \`
              <style>
                .shadow-btn-closed {
                  color: rgb(200, 50, 100);
                }
              </style>
              <button class="shadow-btn-closed">Closed Shadow Button</button>
            \`;
          </script>
        `,
      );

      await withMcpContext(async (_, context) => {
        const mcpPage = context.getSelectedMcpPage();
        await mcpPage.pptrPage.goto(
          server.getRoute('/styles_combined_test.html'),
        );
        const frame = await mcpPage.pptrPage.waitForFrame(
          f => f.url() === server.getRoute('/iframe_content.html'),
        );
        if (!frame) {
          throw new Error('Child frame not found');
        }
        await frame.waitForSelector('#iframe-btn');

        mcpPage.textSnapshot = await TextSnapshot.create(mcpPage);

        // 1. Regular element
        {
          const uid = getUidForNode(mcpPage, 'Click Me');
          const matchedStyles = await mcpPage.getMatchedStylesForUid(uid);
          const inlineStyle = matchedStyles
            .nodeStyles()
            .find(s => s.type === DevTools.CSSStyleDeclaration.Type.Inline);
          assert.ok(inlineStyle);
          const selectors = getSelectors(matchedStyles);
          assert.ok(selectors.includes('#my-button'));
          assert.ok(selectors.includes('.btn-primary'));
        }

        // 2. Open shadow root
        {
          const uid = getUidForNode(mcpPage, 'Open Shadow Button');
          const selectors = await getSelectorsForUid(uid, mcpPage);
          assert.ok(selectors.includes('.shadow-btn-open'));
        }

        // 3. Closed shadow root
        {
          const uid = getUidForNode(mcpPage, 'Closed Shadow Button');
          const selectors = await getSelectorsForUid(uid, mcpPage);
          assert.ok(selectors.includes('.shadow-btn-closed'));
        }

        // 4. Iframe
        {
          const uid = getUidForNode(mcpPage, 'Iframe Button');
          const selectors = await getSelectorsForUid(uid, mcpPage);
          assert.ok(selectors.includes('.frame-btn'));
        }
      });
    });
  });

  describe('executeThirdPartyDeveloperTool()', () => {
    it('appends "Tool returned no result." and skips cleanup evaluate when the tool returns undefined and stashed is 0', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const response = createMockMcpResponse();
      pptrPage.evaluate.resolves({result: undefined, stashed: 0});

      await mcpPage.executeThirdPartyDeveloperTool('my-tool', {}, response);

      sinon.assert.calledOnce(pptrPage.evaluate);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Tool returned no result.',
      );
    });

    it('preserves the original evaluateHandle error when stashedElements cleanup fails', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const response = createMockMcpResponse();
      pptrPage.evaluate
        .onFirstCall()
        .resolves({result: '{"stashedId":"stashed-0"}', stashed: 1});
      pptrPage.evaluateHandle.rejects(
        new Error('Execution context was destroyed'),
      );
      pptrPage.evaluate.onSecondCall().rejects(new Error('Target closed'));

      await assert.rejects(
        () => mcpPage.executeThirdPartyDeveloperTool('my-tool', {}, response),
        /Execution context was destroyed/,
      );

      sinon.assert.calledTwice(pptrPage.evaluate);
      sinon.assert.notCalled(response.appendResponseLine);
    });
  });

  describe('WebMCP third-party developer tools', () => {
    it('filters WebMCP tools by annotations.debugging in discoverThirdPartyDeveloperTools()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();

      const debuggingTool = createMockWebMCPTool({
        name: 'debug_tool',
        description: 'A debugging WebMCP tool',
        inputSchema: {type: 'object'},
        annotations: {debugging: true},
      });
      const nonDebuggingTool = createMockWebMCPTool({
        name: 'user_tool',
        description: 'A non-debugging WebMCP tool',
        inputSchema: {type: 'object'},
        annotations: {debugging: false},
      });
      const unannotatedTool = createMockWebMCPTool({
        name: 'legacy_webmcp_tool',
        description: 'A WebMCP tool without debugging annotation',
        inputSchema: {type: 'object'},
      });
      pptrPage.webmcp.tools.returns([
        debuggingTool,
        nonDebuggingTool,
        unannotatedTool,
      ]);

      const groups = await mcpPage.discoverThirdPartyDeveloperTools();
      assert.deepStrictEqual(groups, [
        {
          name: 'WebMCP Tools',
          description: 'Tools exposed via WebMCP',
          tools: [
            {
              name: 'debug_tool',
              description: 'A debugging WebMCP tool',
              inputSchema: {type: 'object'},
            },
          ],
        },
      ]);
    });

    it('combines WebMCP debugging tools and devtoolstooldiscovery tools in discoverThirdPartyDeveloperTools()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();

      const debuggingTool = createMockWebMCPTool({
        name: 'debug_tool',
        description: 'A debugging WebMCP tool',
        annotations: {debugging: true},
      });
      pptrPage.webmcp.tools.returns([debuggingTool]);
      pptrPage.cdpSession.send.resolves({
        listeners: [{type: 'devtoolstooldiscovery'}],
      });
      pptrPage.evaluate.resolves([
        {
          name: 'Custom Tools',
          description: 'Tools exposed via event',
          tools: [
            {
              name: 'custom_tool',
              description: 'A custom tool',
              inputSchema: {
                type: 'object',
                properties: {
                  el: {
                    'x-mcp-type': 'HTMLElement',
                  },
                },
              },
            },
          ],
        },
      ]);

      const groups = await mcpPage.discoverThirdPartyDeveloperTools();
      assert.deepStrictEqual(groups, [
        {
          name: 'WebMCP Tools',
          description: 'Tools exposed via WebMCP',
          tools: [
            {
              name: 'debug_tool',
              description: 'A debugging WebMCP tool',
              inputSchema: {},
            },
          ],
        },
        {
          name: 'Custom Tools',
          description: 'Tools exposed via event',
          tools: [
            {
              name: 'custom_tool',
              description: 'A custom tool',
              inputSchema: {
                type: 'object',
                properties: {
                  el: {
                    'x-mcp-type': 'HTMLElement',
                    properties: {uid: {type: 'string'}},
                    required: ['uid'],
                  },
                },
              },
            },
          ],
        },
      ]);
    });

    it('reflects dynamically added and removed WebMCP debugging tools in discoverThirdPartyDeveloperTools()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();

      assert.deepStrictEqual(
        await mcpPage.discoverThirdPartyDeveloperTools(),
        [],
      );

      const debuggingTool = createMockWebMCPTool({
        name: 'dynamic_debug_tool',
        description: 'Added dynamically',
        inputSchema: {type: 'object'},
        annotations: {debugging: true},
      });
      pptrPage.webmcp.tools.returns([debuggingTool]);

      assert.deepStrictEqual(await mcpPage.discoverThirdPartyDeveloperTools(), [
        {
          name: 'WebMCP Tools',
          description: 'Tools exposed via WebMCP',
          tools: [
            {
              name: 'dynamic_debug_tool',
              description: 'Added dynamically',
              inputSchema: {type: 'object'},
            },
          ],
        },
      ]);

      pptrPage.webmcp.tools.returns([]);
      assert.deepStrictEqual(
        await mcpPage.discoverThirdPartyDeveloperTools(),
        [],
      );
    });

    it('executes a WebMCP tool in executeThirdPartyDeveloperTool()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const mockTool = createMockWebMCPTool({
        name: 'webmcp_tool',
        description: 'A WebMCP tool',
        annotations: {debugging: true},
      });
      mockTool.execute.resolves({
        id: 'call-1',
        status: 'Completed',
        output: {result: 42},
      });
      pptrPage.webmcp.tools.returns([mockTool]);
      const response = createMockMcpResponse();

      await mcpPage.executeThirdPartyDeveloperTool(
        'webmcp_tool',
        {x: 21},
        response,
      );

      sinon.assert.calledOnceWithExactly(mockTool.execute, {x: 21});
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        JSON.stringify({result: 42}, null, 2),
      );
      sinon.assert.notCalled(pptrPage.evaluate);
    });

    it('appends "Tool returned no result." when WebMCP tool output is undefined in executeThirdPartyDeveloperTool()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const mockTool = createMockWebMCPTool({
        name: 'webmcp_void_tool',
        annotations: {debugging: true},
      });
      mockTool.execute.resolves({
        id: 'call-1',
        status: 'Completed',
        output: undefined,
      });
      pptrPage.webmcp.tools.returns([mockTool]);
      const response = createMockMcpResponse();

      await mcpPage.executeThirdPartyDeveloperTool(
        'webmcp_void_tool',
        {},
        response,
      );

      sinon.assert.calledOnceWithExactly(mockTool.execute, {});
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Tool returned no result.',
      );
    });

    it('does not execute non-debugging WebMCP tools in executeThirdPartyDeveloperTool()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const nonDebuggingTool = createMockWebMCPTool({
        name: 'user_tool',
        annotations: {debugging: false},
      });
      pptrPage.webmcp.tools.returns([nonDebuggingTool]);
      pptrPage.evaluate.rejects(new Error('No tools found on the page'));
      const response = createMockMcpResponse();

      await assert.rejects(
        () => mcpPage.executeThirdPartyDeveloperTool('user_tool', {}, response),
        /No tools found on the page/,
      );
      sinon.assert.notCalled(nonDebuggingTool.execute);
    });

    it('throws when WebMCP tool execution fails in executeThirdPartyDeveloperTool()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const mockTool = createMockWebMCPTool({
        name: 'webmcp_tool',
        annotations: {debugging: true},
      });
      mockTool.execute.resolves({
        id: 'call-1',
        status: 'Error',
        errorText: 'Execution failed in page',
      });
      pptrPage.webmcp.tools.returns([mockTool]);
      const response = createMockMcpResponse();

      await assert.rejects(
        () =>
          mcpPage.executeThirdPartyDeveloperTool('webmcp_tool', {}, response),
        /Execution failed in page/,
      );
    });

    it('throws the exception description when the WebMCP tool throws in executeThirdPartyDeveloperTool()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const mockTool = createMockWebMCPTool({
        name: 'webmcp_tool',
        annotations: {debugging: true},
      });
      mockTool.execute.resolves({
        id: 'call-1',
        status: 'Error',
        errorText: '',
        exception: {
          type: 'object',
          subtype: 'error',
          className: 'Error',
          description: 'Error: boom\n    at foo (app.js:1:1)',
          objectId: '1',
        },
      });
      pptrPage.webmcp.tools.returns([mockTool]);
      const response = createMockMcpResponse();

      await assert.rejects(
        () =>
          mcpPage.executeThirdPartyDeveloperTool('webmcp_tool', {}, response),
        {message: 'Error: boom\n    at foo (app.js:1:1)'},
      );
    });

    it('excludes debugging WebMCP tools from getWebMcpTools()', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();

      const debuggingTool = createMockWebMCPTool({
        name: 'debug_tool',
        description: 'A debugging WebMCP tool',
        annotations: {debugging: true},
      });
      const nonDebuggingTool = createMockWebMCPTool({
        name: 'user_tool',
        description: 'A non-debugging WebMCP tool',
        annotations: {debugging: false},
      });
      const unannotatedTool = createMockWebMCPTool({
        name: 'legacy_webmcp_tool',
        description: 'A WebMCP tool without debugging annotation',
      });
      pptrPage.webmcp.tools.returns([
        debuggingTool,
        nonDebuggingTool,
        unannotatedTool,
      ]);

      assert.deepStrictEqual(mcpPage.getWebMcpTools(), [
        nonDebuggingTool,
        unannotatedTool,
      ]);
    });
  });

  describe('resize()', () => {
    it('resizes the page and returns the resulting cssLayoutViewport dimensions', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const browser = createMockPuppeteerBrowser();
      pptrPage.browser.returns(browser);
      pptrPage.windowId.resolves('win-1');
      browser.getWindowBounds.resolves({windowState: 'normal'});
      pptrPage.cdpSession.send.withArgs('Page.getLayoutMetrics').resolves({
        cssLayoutViewport: {
          clientWidth: 500,
          clientHeight: 232,
          pageX: 0,
          pageY: 0,
        },
      });

      const actualSize = await mcpPage.resize(100, 100);

      sinon.assert.notCalled(browser.setWindowBounds);
      sinon.assert.calledOnceWithExactly(pptrPage.resize, {
        contentWidth: 100,
        contentHeight: 100,
      });
      assert.deepStrictEqual(actualSize, {width: 500, height: 232});
    });

    it('restores normal window state from fullscreen twice before resizing', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const browser = createMockPuppeteerBrowser();
      pptrPage.browser.returns(browser);
      pptrPage.windowId.resolves('win-1');
      browser.getWindowBounds.resolves({windowState: 'fullscreen'});
      pptrPage.cdpSession.send.withArgs('Page.getLayoutMetrics').resolves({
        cssLayoutViewport: {
          clientWidth: 800,
          clientHeight: 600,
          pageX: 0,
          pageY: 0,
        },
      });

      const actualSize = await mcpPage.resize(800, 600);

      sinon.assert.calledTwice(browser.setWindowBounds);
      sinon.assert.calledWithExactly(
        browser.setWindowBounds.firstCall,
        'win-1',
        {windowState: 'normal'},
      );
      sinon.assert.calledWithExactly(
        browser.setWindowBounds.secondCall,
        'win-1',
        {windowState: 'normal'},
      );
      sinon.assert.calledOnceWithExactly(pptrPage.resize, {
        contentWidth: 800,
        contentHeight: 600,
      });
      assert.deepStrictEqual(actualSize, {width: 800, height: 600});
    });

    it('continues resizing when window bounds APIs are unsupported', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      pptrPage.windowId.rejects(new Error('Window APIs not supported'));
      pptrPage.cdpSession.send.withArgs('Page.getLayoutMetrics').resolves({
        cssLayoutViewport: {
          clientWidth: 700,
          clientHeight: 500,
          pageX: 0,
          pageY: 0,
        },
      });

      const actualSize = await mcpPage.resize(700, 500);

      sinon.assert.calledOnceWithExactly(pptrPage.resize, {
        contentWidth: 700,
        contentHeight: 500,
      });
      assert.deepStrictEqual(actualSize, {width: 700, height: 500});
    });

    it('returns undefined without reading layout metrics when a dialog is open', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      pptrPage.windowId.rejects(new Error('Window APIs not supported'));
      pptrPage.emit('dialog', createMockDialog());

      const actualSize = await mcpPage.resize(700, 500);

      sinon.assert.calledOnceWithExactly(pptrPage.resize, {
        contentWidth: 700,
        contentHeight: 500,
      });
      sinon.assert.neverCalledWith(
        pptrPage.cdpSession.send,
        'Page.getLayoutMetrics',
      );
      assert.strictEqual(actualSize, undefined);
    });
  });

  describe('dialogs', () => {
    it('returns the dialog and throws when unhandled', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const dialog = createMockDialog({type: 'alert', message: 'hello'});

      pptrPage.emit('dialog', dialog);

      assert.strictEqual(mcpPage.getDialog(), dialog);
      assert.throws(() => mcpPage.throwIfDialogOpen(), {
        message: 'A dialog is open (alert: hello).',
      });
    });

    it('clears the dialog and does not throw when handled', async () => {
      const {mcpPage, pptrPage} = await createMcpPage();
      const dialog = createMockDialog({
        type: 'alert',
        message: 'hello',
        handled: true,
      });

      pptrPage.emit('dialog', dialog);

      assert.strictEqual(mcpPage.getDialog(), undefined);
      assert.doesNotThrow(() => mcpPage.throwIfDialogOpen());
    });
  });
});
