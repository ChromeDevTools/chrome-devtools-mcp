/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';
import {Locator} from 'puppeteer';

import {McpPage} from '../src/McpPage.js';
import {replaceHtmlElementsWithUids} from '../src/McpPage.js';
import type {JSONSchema7Definition} from '../src/third_party/index.js';
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

    function createMcpPage() {
      const pptrPage = createMockPuppeteerPage();
      // _client() is an internal Puppeteer API used by ConsoleCollector
      // in the McpPage constructor — stub it on the instance.
      // @ts-expect-error internal API
      pptrPage._client = sinon.stub().returns({
        on: sinon.stub(),
        off: sinon.stub(),
        send: sinon.stub().resolves({}),
        target: sinon.stub().returns({_targetId: '<mock>'}),
      });
      // These methods are on CdpPage (concrete subclass), not on the
      // abstract Page, so createStubInstance(Page) doesn't include them.
      // Stub them individually for the emulate() tests.
      // The intersection type (method & SinonStub) requires an explicit
      // type-aware stub via sinon.stub() on the prototype method signature.
      Object.assign(pptrPage, {
        emulateNetworkConditions: sinon.stub().resolves(),
        emulateCPUThrottling: sinon.stub().resolves(),
        setGeolocation: sinon.stub().resolves(),
        setUserAgent: sinon.stub().resolves(),
        emulateMediaFeatures: sinon.stub().resolves(),
        setViewport: sinon.stub().resolves(),
        setExtraHTTPHeaders: sinon.stub().resolves(),
        setDefaultTimeout: sinon.stub(),
        setDefaultNavigationTimeout: sinon.stub(),
        emulateFocusedPage: sinon.stub().resolves(),
      });
      const mcpPage = new McpPage(pptrPage, 1, {
        hasNetworkBlockOrAllowlist: false,
        locatorClass: Locator,
      });
      return {mcpPage, pptrPage};
    }

    it('calls emulateNetworkConditions with the predefined condition', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({networkConditions: 'Slow 3G'});
      assert.strictEqual(mcpPage.networkConditions, 'Slow 3G');
      sinon.assert.calledOnce(pptrPage.emulateNetworkConditions);
      // First arg must be a non-null network condition object (not null/Offline)
      assert.ok(pptrPage.emulateNetworkConditions.firstCall.args[0] !== null);
    });

    it('calls emulateNetworkConditions(null) when networkConditions is omitted', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({networkConditions: 'Slow 3G'});
      await mcpPage.emulate({});
      assert.strictEqual(mcpPage.networkConditions, null);
      // Second call clears — must pass null
      sinon.assert.calledWith(pptrPage.emulateNetworkConditions.secondCall, null);
    });

    it('does not call emulateNetworkConditions for unknown values', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      // emulate({}) is always called first to initialise; reset call count
      pptrPage.emulateNetworkConditions.resetHistory();
      await mcpPage.emulate({networkConditions: 'Slow 11G'});
      assert.strictEqual(mcpPage.networkConditions, null);
      // Unknown value — no Puppeteer network call should be made
      sinon.assert.notCalled(pptrPage.emulateNetworkConditions);
    });

    it('calls emulateCPUThrottling with the given rate', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({cpuThrottlingRate: 4});
      assert.strictEqual(mcpPage.cpuThrottlingRate, 4);
      sinon.assert.calledWith(pptrPage.emulateCPUThrottling, 4);
    });

    it('calls emulateCPUThrottling(1) to reset throttling', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({cpuThrottlingRate: 4});
      await mcpPage.emulate({cpuThrottlingRate: 1});
      assert.strictEqual(mcpPage.cpuThrottlingRate, 1);
      sinon.assert.calledWith(pptrPage.emulateCPUThrottling.secondCall, 1);
    });

    it('calls setUserAgent with the given user agent', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({userAgent: 'TestUA/1.0'});
      assert.strictEqual(mcpPage.userAgent, 'TestUA/1.0');
      sinon.assert.calledWith(pptrPage.setUserAgent, {userAgent: 'TestUA/1.0'});
    });

    it('calls setUserAgent with undefined to clear the user agent', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({userAgent: 'TestUA/1.0'});
      await mcpPage.emulate({userAgent: ''});
      assert.strictEqual(mcpPage.userAgent, null);
      sinon.assert.calledWith(pptrPage.setUserAgent.secondCall, {
        userAgent: undefined,
      });
    });

    it('calls emulateMediaFeatures with dark color scheme', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({colorScheme: 'dark'});
      assert.strictEqual(mcpPage.colorScheme, 'dark');
      sinon.assert.calledWith(pptrPage.emulateMediaFeatures, [
        {name: 'prefers-color-scheme', value: 'dark'},
      ]);
    });

    it('calls emulateMediaFeatures with empty string to reset color scheme', async () => {
      const {mcpPage, pptrPage} = createMcpPage();
      await mcpPage.emulate({colorScheme: 'dark'});
      await mcpPage.emulate({colorScheme: 'auto'});
      assert.strictEqual(mcpPage.colorScheme, null);
      sinon.assert.calledWith(pptrPage.emulateMediaFeatures.secondCall, [
        {name: 'prefers-color-scheme', value: ''},
      ]);
    });
  });
});
