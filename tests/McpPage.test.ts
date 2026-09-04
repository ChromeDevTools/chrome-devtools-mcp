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
import {Locator} from '../src/third_party/index.js';
import type {JSONSchema7Definition} from '../src/third_party/index.js';
import type {Page} from '../src/third_party/index.js';
import {createMockPuppeteerPage} from './mocks.js';

import {withMcpContext} from './utils.js';

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
  it('creates a handle on the page and disposes it as such', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;

      using handle = await page.evaluateHandle('new Set()');

      {
        using _ = handle;
      }

      // @ts-expect-error Internal Puppeteer API
      assert.ok(handle.disposed);
    });
  });

  describe('emulate()', () => {
    afterEach(() => {
      sinon.restore();
    });

    function createMcpPage(
      options: {hasNetworkBlockOrAllowlist?: boolean} = {},
    ) {
      const pptrPage = createMockPuppeteerPage();
      const mcpPage = new McpPage(pptrPage as unknown as Page, 1, {
        hasNetworkBlockOrAllowlist: options.hasNetworkBlockOrAllowlist ?? false,
        locatorClass: Locator,
      });
      return {mcpPage, pptrPage};
    }

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
      sinon.assert.calledWithExactly(
        pptrPage.emulateCPUThrottling.secondCall,
        1,
      );
    });

    it('sends Emulation.setCPUThrottlingRate to secondary session if present', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      const mockSession = {
        send: sinon.stub().resolves(),
      };
      sinon
        .stub(mcpPage, 'devtoolsUniverse')
        .get(() => ({session: mockSession}) as unknown as TargetUniverse);
      await mcpPage.emulate({cpuThrottlingRate: 4});
      sinon.assert.calledOnceWithExactly(pptrPage.emulateCPUThrottling, 4);
      sinon.assert.calledOnceWithExactly(
        mockSession.send,
        'Emulation.setCPUThrottlingRate',
        {rate: 4},
      );
    });

    it('sends Emulation.setCPUThrottlingRate with rate 1 to secondary session when cpuThrottlingRate is omitted', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      const mockSession = {
        send: sinon.stub().resolves(),
      };
      sinon
        .stub(mcpPage, 'devtoolsUniverse')
        .get(() => ({session: mockSession}) as unknown as TargetUniverse);
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
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          isLandscape: false,
        },
      });
      assert.deepStrictEqual(mcpPage.viewport, {
        width: 400,
        height: 400,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        isLandscape: false,
      });
      sinon.assert.calledOnceWithExactly(pptrPage.setViewport, {
        width: 400,
        height: 400,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        isLandscape: false,
      });
    });

    it('calls setViewport(null) when viewport is omitted', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({viewport: {width: 400, height: 400}});
      await mcpPage.emulate({});
      assert.strictEqual(mcpPage.viewport, null);
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
      sinon.assert.calledWithExactly(
        pptrPage.setExtraHTTPHeaders.secondCall,
        {},
      );
    });
  });
});
