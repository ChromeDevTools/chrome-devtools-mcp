/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import type {TargetUniverse} from '../src/devtools/DevtoolsUtils.js';
import {McpPage} from '../src/McpPage.js';
import {replaceHtmlElementsWithUids} from '../src/McpPage.js';
import {DevTools, Locator} from '../src/third_party/index.js';
import type {JSONSchema7Definition} from '../src/third_party/index.js';
import type {Page} from '../src/third_party/index.js';
import {TextSnapshot} from '../src/TextSnapshot.js';
import type {TextSnapshotNode} from '../src/types.js';
import {createMockPuppeteerPage} from './mocks.js';
import {serverHooks} from './server.js';
import {html, withMcpContext} from './utils.js';

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
  function createMcpPage(options: {hasNetworkBlockOrAllowlist?: boolean} = {}) {
    const pptrPage = createMockPuppeteerPage();
    const mcpPage = new McpPage(pptrPage as unknown as Page, 1, {
      hasNetworkBlockOrAllowlist: options.hasNetworkBlockOrAllowlist ?? false,
      locatorClass: Locator,
    });
    const mockSession = {
      send: sinon.stub().resolves(),
    };
    sinon
      .stub(mcpPage, 'devtoolsUniverse')
      .get(() => ({session: mockSession}) as unknown as TargetUniverse);
    return {mcpPage, pptrPage, mockSession};
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

  describe('emulate()', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('calls emulateNetworkConditions with offline settings', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
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
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({networkConditions: 'Slow 3G'});
      assert.strictEqual(mcpPage.networkConditions, 'Slow 3G');
      sinon.assert.calledOnceWithExactly(pptrPage.emulateNetworkConditions, {
        download: 50000,
        upload: 50000,
        latency: 2000,
      });
    });

    it('calls emulateNetworkConditions(null) when networkConditions is omitted', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
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
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({networkConditions: 'Slow 11G'});
      assert.strictEqual(mcpPage.networkConditions, null);
      sinon.assert.notCalled(pptrPage.emulateNetworkConditions);
    });

    it('throws when networkConditions is set with network blocking enabled', async () => {
      const {mcpPage, pptrPage} = createMcpPage({
        hasNetworkBlockOrAllowlist: true,
      });
      await assert.rejects(
        () => mcpPage.emulate({networkConditions: 'Slow 3G'}),
        /Network throttling is not supported when network blocking/,
      );
      sinon.assert.notCalled(pptrPage.emulateNetworkConditions);
    });

    it('calls emulateCPUThrottling with the given rate', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({cpuThrottlingRate: 4});
      assert.strictEqual(mcpPage.cpuThrottlingRate, 4);
      sinon.assert.calledOnceWithExactly(pptrPage.emulateCPUThrottling, 4);
    });

    it('calls emulateCPUThrottling(1) to reset throttling', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
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
      const {mcpPage, pptrPage, mockSession} = createMcpPage();
      await mcpPage.emulate({cpuThrottlingRate: 4});
      sinon.assert.calledOnceWithExactly(pptrPage.emulateCPUThrottling, 4);
      sinon.assert.calledOnceWithExactly(
        mockSession.send,
        'Emulation.setCPUThrottlingRate',
        {rate: 4},
      );
    });

    it('sends Emulation.setCPUThrottlingRate with rate 1 to secondary session when cpuThrottlingRate is omitted', async () => {
      const {mcpPage, pptrPage, mockSession} = createMcpPage();
      await mcpPage.emulate({});
      sinon.assert.calledOnceWithExactly(pptrPage.emulateCPUThrottling, 1);
      sinon.assert.calledOnceWithExactly(
        mockSession.send,
        'Emulation.setCPUThrottlingRate',
        {rate: 1},
      );
    });

    it('calls setGeolocation with the given coordinates', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
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

    it('calls setGeolocation with (0, 0) when geolocation is omitted', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({
        geolocation: {latitude: 48.137154, longitude: 11.576124},
      });
      await mcpPage.emulate({});
      assert.strictEqual(mcpPage.geolocation, null);
      sinon.assert.calledTwice(pptrPage.setGeolocation);
      sinon.assert.calledWithExactly(pptrPage.setGeolocation.secondCall, {
        latitude: 0,
        longitude: 0,
      });
    });

    it('calls setUserAgent with the given user agent', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({userAgent: 'TestUA/1.0'});
      assert.strictEqual(mcpPage.userAgent, 'TestUA/1.0');
      sinon.assert.calledOnceWithExactly(pptrPage.setUserAgent, {
        userAgent: 'TestUA/1.0',
      });
    });

    it('calls setUserAgent with undefined to clear the user agent', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({userAgent: 'TestUA/1.0'});
      await mcpPage.emulate({userAgent: ''});
      assert.strictEqual(mcpPage.userAgent, null);
      sinon.assert.calledTwice(pptrPage.setUserAgent);
      sinon.assert.calledWithExactly(pptrPage.setUserAgent.secondCall, {
        userAgent: undefined,
      });
    });

    it('calls emulateMediaFeatures with dark color scheme', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({colorScheme: 'dark'});
      assert.strictEqual(mcpPage.colorScheme, 'dark');
      sinon.assert.calledOnceWithExactly(pptrPage.emulateMediaFeatures, [
        {name: 'prefers-color-scheme', value: 'dark'},
      ]);
    });

    it('calls emulateMediaFeatures with empty string to reset color scheme', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({colorScheme: 'dark'});
      await mcpPage.emulate({colorScheme: 'auto'});
      assert.strictEqual(mcpPage.colorScheme, null);
      sinon.assert.calledTwice(pptrPage.emulateMediaFeatures);
      sinon.assert.calledWithExactly(pptrPage.emulateMediaFeatures.secondCall, [
        {name: 'prefers-color-scheme', value: ''},
      ]);
    });

    it('calls setViewport with the given dimensions merged with defaults', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
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
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({viewport: {width: 400, height: 400}});
      await mcpPage.emulate({});
      assert.strictEqual(mcpPage.viewport, null);
      sinon.assert.calledTwice(pptrPage.setViewport);
      sinon.assert.calledWithExactly(pptrPage.setViewport.secondCall, null);
    });

    it('calls setExtraHTTPHeaders with the given headers', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
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
      const {mcpPage, pptrPage} = createMcpPage();
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
    afterEach(() => {
      sinon.restore();
    });

    it('re-applies previously configured viewport emulation', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
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

      sinon.assert.calledTwice(pptrPage.setViewport);
      sinon.assert.calledWithExactly(pptrPage.setViewport.secondCall, {
        width: 400,
        height: 400,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      });
    });

    it('re-applies previously configured network and cpu throttling emulation', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
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
  });

  describe('DevToolsCommentBridge lifecycle', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('does not create commentBridge on construction or getDevToolsPage', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      pptrPage.hasDevTools.resolves(true);
      const devtoolsPage = createMockPuppeteerPage();
      pptrPage.openDevTools.resolves(devtoolsPage);

      assert.strictEqual(mcpPage.commentBridge, undefined);

      const retrieved = await mcpPage.getDevToolsPage();
      assert.strictEqual(retrieved, devtoolsPage);
      assert.strictEqual(mcpPage.commentBridge, undefined);
    });

    it('creates and attaches commentBridge when openDevTools is called', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      const devtoolsPage = createMockPuppeteerPage();
      pptrPage.openDevTools.resolves(devtoolsPage);

      assert.strictEqual(mcpPage.commentBridge, undefined);

      const result = await mcpPage.openDevTools();
      assert.strictEqual(result, devtoolsPage);
      assert.notStrictEqual(mcpPage.commentBridge, undefined);
      sinon.assert.calledOnce(devtoolsPage.exposeFunction);
    });

    it('disposes commentBridge on mcpPage.dispose()', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      const devtoolsPage = createMockPuppeteerPage();
      pptrPage.openDevTools.resolves(devtoolsPage);

      await mcpPage.openDevTools();
      const bridge = mcpPage.commentBridge;
      assert.notStrictEqual(bridge, undefined);

      if (bridge) {
        const disposeSpy = sinon.spy(bridge, 'dispose');
        mcpPage.dispose();

        sinon.assert.calledOnce(disposeSpy);
        assert.strictEqual(mcpPage.commentBridge, undefined);
      }
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

    afterEach(() => {
      sinon.restore();
    });

    it('throws when snapshot has not been captured', async () => {
      const {mcpPage} = createMcpPage();
      await assert.rejects(
        () => mcpPage.getMatchedStylesForUid('node_1'),
        /No snapshot found for page/,
      );
    });

    it('throws when element uid is not found in snapshot', async () => {
      const {mcpPage} = createMcpPage();
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
      const {mcpPage} = createMcpPage();
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
});
