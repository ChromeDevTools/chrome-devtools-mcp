/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {McpResponse} from '../../src/McpResponse.js';
import {zod} from '../../src/third_party/index.js';
import {ToolCategory} from '../../src/tools/categories.js';
import {
  buildReplApiDeclaration,
  formatReplToolMethodSignature,
  zodShapeToTs,
} from '../../src/tools/repl/replSchema.js';
import {
  definePageTool,
  type AnyToolDefinition,
} from '../../src/tools/ToolDefinition.js';
import {createTools} from '../../src/tools/tools.js';
import {
  createMockMcpContext,
  createMockMcpPage,
  createMockParsedArguments,
  createMockServerConfig,
} from '../mocks.js';

const DEFAULT_INNER_REPL_TOOLS: readonly string[] = [
  'click',
  'drag',
  'fill',
  'fill_form',
  'get_console_message',
  'get_css_styles',
  'get_network_request',
  'hover',
  'list_console_messages',
  'list_network_requests',
  'press_key',
  'take_screenshot',
  'take_snapshot',
  'type_text',
  'wait_for',
];

const INNER_REPL_TOOLS: readonly string[] = [
  ...DEFAULT_INNER_REPL_TOOLS,
  'click_at',
  'execute_3p_developer_tool',
  'execute_webmcp_tool',
  'list_3p_developer_tools',
  'list_webmcp_tools',
];

function toFieldMap(structuredContent: object): Map<string, unknown> {
  return new Map<string, unknown>(Object.entries(structuredContent));
}

describe('replSchema', () => {
  describe('inner REPL tool outputSchema declarations', () => {
    it('defines a non-empty outputSchema on every inner REPL ToolDefinition', () => {
      assert.strictEqual(INNER_REPL_TOOLS.length, 20);
      const tools = createTools(
        createMockParsedArguments({
          repl: false,
          experimentalVision: true,
          categoryExperimentalWebmcp: true,
          categoryExperimentalThirdParty: true,
        }),
      );
      const byName = new Map<string, AnyToolDefinition>();
      for (const tool of tools) {
        byName.set(tool.name, tool);
      }

      for (const toolName of INNER_REPL_TOOLS) {
        const tool = byName.get(toolName);
        assert.ok(tool, `Expected inner REPL tool "${toolName}" to exist`);
        assert.ok(
          tool.outputSchema && Object.keys(tool.outputSchema).length > 0,
          `Expected "${toolName}" to declare a non-empty outputSchema`,
        );
      }
    });
  });

  describe('zodShapeToTs', () => {
    it('renders required/optional primitives, enums, arrays, nested objects, and transforms', () => {
      const rendered = zodShapeToTs({
        uid: zod.string(),
        count: zod.number(),
        dblClick: zod.boolean().optional(),
        format: zod.enum(['png', 'jpeg', 'webp']).default('png'),
        tags: zod.array(zod.string()),
        elements: zod.array(
          zod.object({
            uid: zod.string(),
            value: zod.string(),
            checked: zod.boolean().optional(),
          }),
        ),
        key: zod.string().transform(value => [value]),
      });

      assert.match(rendered, /^\{[\s\S]*\}$/);
      assert.match(rendered, /\buid:\s*string\b/);
      assert.match(rendered, /\bcount:\s*number\b/);
      assert.match(rendered, /\bdblClick\?:\s*boolean\b/);
      assert.match(
        rendered,
        /\bformat\?:\s*['"]png['"]\s*\|\s*['"]jpeg['"]\s*\|\s*['"]webp['"]/,
      );
      assert.match(rendered, /\btags:\s*(?:string\[\]|Array<string>)/);
      assert.match(rendered, /\belements:\s*(?:\{|Array<\{)/);
      assert.match(rendered, /\bvalue:\s*string\b/);
      assert.match(rendered, /\bchecked\?:\s*boolean\b/);
      assert.match(rendered, /\bkey:\s*string\b/);
      assert.doesNotMatch(rendered, /\bToolResult\b/);
    });

    it('renders an empty object type for an empty Zod shape', () => {
      const rendered = zodShapeToTs({});
      assert.match(rendered, /^\{\s*\}$|^Record<string,\s*never>$/);
    });
  });

  describe('formatReplToolMethodSignature', () => {
    it('strips pageId, filePath, requestFilePath, responseFilePath, and serviceWorkerId and renders concrete Promise<{ ... }> return types', () => {
      const args = createMockParsedArguments({pageIdRouting: true});
      const syntheticSnapshotTool = definePageTool(() => ({
        name: 'take_snapshot',
        description: 'Take snapshot',
        annotations: {
          category: ToolCategory.DEBUGGING,
          readOnlyHint: false,
        },
        schema: {
          verbose: zod.boolean().optional(),
          filePath: zod.string().optional(),
        },
        outputSchema: {
          snapshot: zod.object({
            id: zod.string(),
            role: zod.string(),
          }),
        },
        blockedByDialog: true,
        concurrency: 'page',
        verifyFilesSchema: {filePath: true},
        handler: async () => {},
      }))(args);

      const snapshotSig = formatReplToolMethodSignature(syntheticSnapshotTool);
      assert.match(snapshotSig, /^take_snapshot\(/);
      assert.match(snapshotSig, /\bverbose\?:\s*boolean\b/);
      assert.doesNotMatch(snapshotSig, /\bpageId\b/);
      assert.doesNotMatch(snapshotSig, /\bfilePath\b/);
      assert.match(
        snapshotSig,
        /:\s*Promise<\{[\s\S]*\bok:\s*boolean\b[\s\S]*\bsnapshot:\s*\{[\s\S]*\bid:\s*string\b[\s\S]*\brole:\s*string\b[\s\S]*\}[\s\S]*\}>;?$/,
      );
      assert.doesNotMatch(snapshotSig, /Promise<unknown>|ToolResult/);

      const syntheticNetworkTool = definePageTool(() => ({
        name: 'get_network_request',
        description: 'Get network request',
        annotations: {
          category: ToolCategory.NETWORK,
          readOnlyHint: false,
        },
        schema: {
          reqid: zod.number().optional(),
          requestFilePath: zod.string().optional(),
          responseFilePath: zod.string().optional(),
        },
        outputSchema: {
          networkRequest: zod
            .object({
              url: zod.string(),
              status: zod.number().optional(),
            })
            .optional(),
        },
        blockedByDialog: true,
        concurrency: 'page',
        verifyFilesSchema: {
          requestFilePath: true,
          responseFilePath: true,
        },
        handler: async () => {},
      }))(args);

      const networkSig = formatReplToolMethodSignature(syntheticNetworkTool);
      assert.match(networkSig, /^get_network_request\(/);
      assert.match(networkSig, /\breqid\?:\s*number\b/);
      assert.doesNotMatch(networkSig, /\bpageId\b/);
      assert.doesNotMatch(networkSig, /\brequestFilePath\b/);
      assert.doesNotMatch(networkSig, /\bresponseFilePath\b/);
      assert.match(
        networkSig,
        /:\s*Promise<\{[\s\S]*\bok:\s*boolean\b[\s\S]*\bnetworkRequest\?:\s*\{[\s\S]*\burl:\s*string\b[\s\S]*\bstatus\?:\s*number\b[\s\S]*\}[\s\S]*\}>;?$/,
      );
      assert.doesNotMatch(networkSig, /Promise<unknown>|ToolResult/);
    });

    it('renders concrete typed Promise<{ ... }> signatures for all 20 real inner REPL tools without untyped fallback', () => {
      const tools = createTools(
        createMockParsedArguments({
          repl: false,
          pageIdRouting: true,
          experimentalVision: true,
          categoryExperimentalWebmcp: true,
          categoryExperimentalThirdParty: true,
        }),
      );
      const byName = new Map<string, AnyToolDefinition>();
      for (const tool of tools) {
        byName.set(tool.name, tool);
      }

      for (const toolName of INNER_REPL_TOOLS) {
        const tool = byName.get(toolName);
        assert.ok(tool, `Expected inner REPL tool "${toolName}" to exist`);

        const sig = formatReplToolMethodSignature(tool);
        assert.ok(
          sig.startsWith(`${toolName}(`),
          `Expected signature for "${toolName}" to start with "${toolName}(", got: "${sig}"`,
        );
        assert.match(
          sig,
          /:\s*Promise<\{[\s\S]+\}>;?$/,
          `Expected "${toolName}" signature to have a concrete Promise<{ ... }> return type, got: "${sig}"`,
        );
        assert.doesNotMatch(
          sig,
          /\b(pageId|filePath|requestFilePath|responseFilePath|serviceWorkerId)\b/,
          `Expected "${toolName}" signature to strip pageId, serviceWorkerId, and file-write params, got: "${sig}"`,
        );
        assert.doesNotMatch(
          sig,
          /Promise<unknown>|Promise<any>|\bToolResult\b/,
          `Expected "${toolName}" signature not to fall back to untyped Promise<unknown> or ToolResult, got: "${sig}"`,
        );
      }
    });
  });

  describe('buildReplApiDeclaration', () => {
    it('builds a compact McpTools TypeScript declaration <= 4500 bytes including getElement and getEventListeners', () => {
      const defaultNameSet = new Set<string>(DEFAULT_INNER_REPL_TOOLS);
      const defaultInnerTools = createTools(
        createMockParsedArguments({
          repl: false,
          slim: false,
          experimentalVision: false,
        }),
      ).filter(tool => defaultNameSet.has(tool.name));
      assert.strictEqual(defaultInnerTools.length, 15);

      const declaration = buildReplApiDeclaration(defaultInnerTools);
      assert.ok(
        declaration.length > 0,
        'Expected buildReplApiDeclaration to return a non-empty declaration',
      );
      assert.match(declaration, /\binterface\s+McpTools\b/);
      assert.match(declaration, /\bgetElement\s*\(/);
      assert.match(declaration, /\bgetEventListeners\s*\(/);

      for (const toolName of DEFAULT_INNER_REPL_TOOLS) {
        assert.ok(
          declaration.includes(`${toolName}(`),
          `Expected McpTools declaration to include "${toolName}("`,
        );
      }
      assert.ok(
        !declaration.includes('handle_dialog('),
        'Expected handle_dialog to stay off McpTools',
      );

      const trimmedLines = declaration.split('\n').map(line => line.trim());
      const clickLine = trimmedLines.find(line => line.startsWith('click('));
      assert.ok(clickLine, 'Expected click method line in McpTools');
      assert.match(clickLine, /\belement\?:\s*Element\b/);
      assert.doesNotMatch(
        clickLine,
        /\belement\?:\s*Element\b[\s\S]*\belement\?:\s*Element\b/,
      );

      const dragLine = trimmedLines.find(line => line.startsWith('drag('));
      assert.ok(dragLine, 'Expected drag method line in McpTools');
      assert.match(dragLine, /\bfromElement\?:\s*Element\b/);
      assert.match(dragLine, /\btoElement\?:\s*Element\b/);

      const fillFormLine = trimmedLines.find(line =>
        line.startsWith('fill_form('),
      );
      assert.ok(fillFormLine, 'Expected fill_form method line in McpTools');
      assert.match(
        fillFormLine,
        /\belements:\s*(?:\{|Array<\{)[\s\S]*\belement\?:\s*Element\b/,
      );

      const byteLength = Buffer.byteLength(declaration, 'utf8');
      assert.ok(
        byteLength <= 4500,
        `Expected McpTools declaration <= 4500 bytes, got ${byteLength}`,
      );
    });
  });

  describe('McpResponse structuredContent contracts', () => {
    it('does not synthesize structuredContent.ok in McpResponse.handle() while preserving message, waitFor fields, and errorMessage', async () => {
      const page = createMockMcpPage();
      const context = createMockMcpContext({selectedPage: page});

      const okResponse = new McpResponse(createMockServerConfig());
      okResponse.setPage(page);
      okResponse.appendResponseLine('Successfully clicked on the element');
      okResponse.attachWaitForResult({
        navigatedToUrl: 'https://example.com/dashboard',
        dialogHandled: true,
      });

      const okResult = await okResponse.handle(context);
      const okFields = toFieldMap(okResult.structuredContent);
      assert.strictEqual(okFields.get('ok'), undefined);
      assert.strictEqual(
        okFields.get('message'),
        'Successfully clicked on the element',
      );
      assert.strictEqual(
        okFields.get('navigatedToUrl'),
        'https://example.com/dashboard',
      );
      assert.strictEqual(okFields.get('dialogHandled'), true);

      const errorResponse = new McpResponse(createMockServerConfig());
      errorResponse.setPage(page);
      errorResponse.setError(new Error('Element did not become interactive'));

      const errorResult = await errorResponse.handle(context);
      const errorFields = toFieldMap(errorResult.structuredContent);
      assert.strictEqual(errorFields.get('ok'), undefined);
      assert.strictEqual(
        errorFields.get('errorMessage'),
        'Element did not become interactive',
      );
    });

    it('emits empty arrays for consoleMessages and networkRequests when 0 items are present', async () => {
      const page = createMockMcpPage();
      page.getConsoleData.returns([]);
      page.getNetworkRequests.returns([]);
      const context = createMockMcpContext({selectedPage: page});

      const consoleResponse = new McpResponse(createMockServerConfig());
      consoleResponse.setPage(page);
      consoleResponse.setIncludeConsoleData(true);
      const consoleResult = await consoleResponse.handle(context);
      const consoleFields = toFieldMap(consoleResult.structuredContent);
      assert.deepStrictEqual(consoleFields.get('consoleMessages'), []);

      const networkResponse = new McpResponse(createMockServerConfig());
      networkResponse.setPage(page);
      networkResponse.setIncludeNetworkRequests(true);
      const networkResult = await networkResponse.handle(context);
      const networkFields = toFieldMap(networkResult.structuredContent);
      assert.deepStrictEqual(networkFields.get('networkRequests'), []);
    });
  });

  describe('strict outputSchema drift & formatter parity', () => {
    function buildInnerToolMap(): Map<string, AnyToolDefinition> {
      const tools = createTools(
        createMockParsedArguments({
          repl: false,
          experimentalVision: true,
          categoryExperimentalWebmcp: true,
          categoryExperimentalThirdParty: true,
        }),
      );
      const byName = new Map<string, AnyToolDefinition>();
      for (const tool of tools) {
        byName.set(tool.name, tool);
      }
      return byName;
    }

    function parseStrictOutput(
      byName: Map<string, AnyToolDefinition>,
      toolName: string,
      payload: unknown,
    ): {success: boolean; errorSummary: string} {
      const tool = byName.get(toolName);
      assert.ok(tool, `Expected inner REPL tool "${toolName}" to exist`);
      assert.ok(
        tool.outputSchema,
        `Expected "${toolName}" to declare outputSchema`,
      );
      const parsed = zod.object(tool.outputSchema).strict().safeParse(payload);
      return {
        success: parsed.success,
        errorSummary: parsed.success ? '' : parsed.error.message,
      };
    }

    it('rejects undeclared drifted fields across inner tool outputSchemas', () => {
      const byName = buildInnerToolMap();
      const driftedCases: Array<{
        label: string;
        toolName: string;
        payload: unknown;
      }> = [
        {
          label: 'click top-level undeclared field',
          toolName: 'click',
          payload: {
            ok: true,
            unexpectedDriftField: 'bad',
          },
        },
        {
          label: 'list_network_requests pagination undeclared field',
          toolName: 'list_network_requests',
          payload: {
            networkRequests: [],
            pagination: {
              currentPage: 0,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
              startIndex: 0,
              endIndex: 0,
              invalidPage: false,
              unexpectedDriftField: 'bad',
            },
          },
        },
        {
          label: 'list_network_requests networkRequests[0] undeclared field',
          toolName: 'list_network_requests',
          payload: {
            networkRequests: [
              {
                method: 'GET',
                url: 'https://example.com',
                status: '200',
                unexpectedDriftField: 'bad',
              },
            ],
          },
        },
        {
          label: 'get_network_request networkRequest undeclared field',
          toolName: 'get_network_request',
          payload: {
            networkRequest: {
              method: 'GET',
              url: 'https://example.com',
              status: '200',
              requestHeaders: {},
              unexpectedDriftField: 'bad',
            },
          },
        },
        {
          label: 'list_console_messages consoleMessages[0] undeclared field',
          toolName: 'list_console_messages',
          payload: {
            consoleMessages: [
              {
                id: 1,
                type: 'log',
                text: 'hi',
                argsCount: 0,
                unexpectedDriftField: 'bad',
              },
            ],
          },
        },
        {
          label: 'get_console_message consoleMessage undeclared field',
          toolName: 'get_console_message',
          payload: {
            consoleMessage: {
              id: 1,
              type: 'log',
              text: 'hi',
              argsCount: 0,
              args: [],
              unexpectedDriftField: 'bad',
            },
          },
        },
        {
          label: 'get_css_styles matchedStyles undeclared field',
          toolName: 'get_css_styles',
          payload: {
            matchedStyles: {
              element: {uid: '1_1', selector: 'div'},
              rules: [],
              unexpectedDriftField: 'bad',
            },
          },
        },
        {
          label: 'get_css_styles matchedStyles.rules[0] undeclared field',
          toolName: 'get_css_styles',
          payload: {
            matchedStyles: {
              element: {uid: '1_1', selector: 'div'},
              rules: [
                {
                  type: 'inline',
                  selector: 'element.style',
                  properties: [],
                  unexpectedDriftField: 'bad',
                },
              ],
            },
          },
        },
        {
          label: 'list_webmcp_tools webmcpTools[0] undeclared field',
          toolName: 'list_webmcp_tools',
          payload: {
            webmcpTools: [
              {
                name: 'search',
                description: 'Search items',
                unexpectedDriftField: 'bad',
              },
            ],
          },
        },
        {
          label:
            'list_3p_developer_tools thirdPartyDeveloperTools[0] undeclared field',
          toolName: 'list_3p_developer_tools',
          payload: {
            thirdPartyDeveloperTools: [
              {
                name: 'devtools-ext',
                description: 'Extension tools',
                tools: [],
                unexpectedDriftField: 'bad',
              },
            ],
          },
        },
        {
          label:
            'list_3p_developer_tools thirdPartyDeveloperTools[0].tools[0] undeclared field',
          toolName: 'list_3p_developer_tools',
          payload: {
            thirdPartyDeveloperTools: [
              {
                name: 'devtools-ext',
                description: 'Extension tools',
                tools: [
                  {
                    name: 'inspect',
                    description: 'Inspect state',
                    unexpectedDriftField: 'bad',
                  },
                ],
              },
            ],
          },
        },
      ];

      const wronglyAccepted: string[] = [];
      for (const testCase of driftedCases) {
        const result = parseStrictOutput(
          byName,
          testCase.toolName,
          testCase.payload,
        );
        if (result.success) {
          wronglyAccepted.push(testCase.label);
        }
      }

      assert.deepStrictEqual(
        wronglyAccepted,
        [],
        `Expected strict outputSchema to reject all drifted payloads, but accepted: ${wronglyAccepted.join(', ')}`,
      );
    });

    it('accepts all real formatter shapes on strict outputSchemas and rejects non-primitive snapshot attributes', () => {
      const byName = buildInnerToolMap();
      const validFormatterCases: Array<{
        label: string;
        toolName: string;
        payload: unknown;
      }> = [
        {
          label:
            'get_network_request with string requestId, body file paths, and redirectChain',
          toolName: 'get_network_request',
          payload: {
            networkRequest: {
              requestId: 'str-req-1',
              method: 'POST',
              url: 'https://example.com/api',
              status: '200',
              requestHeaders: {'content-type': 'application/octet-stream'},
              requestBodyFilePath: '/tmp/req.bin',
              responseHeaders: {'content-type': 'application/octet-stream'},
              responseBodyFilePath: '/tmp/res.bin',
              redirectChain: [
                {
                  requestId: 1,
                  method: 'GET',
                  url: 'https://example.com/old',
                  status: '302',
                },
              ],
            },
          },
        },
        {
          label:
            'list_console_messages with concise console message and concise issue',
          toolName: 'list_console_messages',
          payload: {
            consoleMessages: [
              {
                id: 1,
                type: 'log',
                text: 'hello',
                argsCount: 2,
                count: 3,
                stackTrace: 'at fn (a.js:1:1)',
              },
              {
                id: 2,
                type: 'issue',
                title: 'Mixed Content',
                count: 1,
              },
            ],
          },
        },
        {
          label: 'get_console_message detailed console message with argsCount',
          toolName: 'get_console_message',
          payload: {
            consoleMessage: {
              id: 1,
              type: 'error',
              text: 'boom',
              argsCount: 1,
              args: ['detail'],
              stackTrace: 'at fn (a.js:1:1)',
            },
          },
        },
        {
          label:
            'get_console_message detailed issue with count, links, and affectedResources',
          toolName: 'get_console_message',
          payload: {
            consoleMessage: {
              id: 2,
              type: 'issue',
              count: 1,
              title: 'CORS Issue',
              description: 'Blocked',
              links: [{link: 'https://web.dev', linkTitle: 'Learn more'}],
              affectedResources: [
                {uid: '1_2', request: 4, data: {status: 403}},
              ],
            },
          },
        },
        {
          label:
            'take_snapshot with dynamic primitive AX attributes and child node without id',
          toolName: 'take_snapshot',
          payload: {
            snapshot: {
              id: '1_0',
              role: 'RootWebArea',
              name: 'App',
              focused: true,
              focusable: true,
              level: 2,
              value: 'abc',
              children: [{role: 'StaticText', name: 'Hello'}],
            },
          },
        },
        {
          label: 'list_webmcp_tools with annotations object',
          toolName: 'list_webmcp_tools',
          payload: {
            webmcpTools: [
              {
                name: 'add_todo',
                description: 'Add todo item',
                inputSchema: {type: 'object'},
                annotations: {readOnlyHint: true},
              },
            ],
          },
        },
      ];

      const rejectedValidCases: string[] = [];
      for (const testCase of validFormatterCases) {
        const result = parseStrictOutput(
          byName,
          testCase.toolName,
          testCase.payload,
        );
        if (!result.success) {
          rejectedValidCases.push(`${testCase.label}: ${result.errorSummary}`);
        }
      }

      assert.deepStrictEqual(
        rejectedValidCases,
        [],
        `Expected strict outputSchema to accept all real formatter shapes, but rejected:\n${rejectedValidCases.join('\n')}`,
      );

      const badRootSnapshot = parseStrictOutput(byName, 'take_snapshot', {
        snapshot: {
          id: '1_1',
          role: 'WebArea',
          bogusNestedObj: {bad: 1},
        },
      });
      assert.strictEqual(
        badRootSnapshot.success,
        false,
        'Expected take_snapshot outputSchema to reject non-primitive nested object attribute on root node',
      );

      const badChildSnapshot = parseStrictOutput(byName, 'take_snapshot', {
        snapshot: {
          id: '1_0',
          role: 'RootWebArea',
          children: [
            {
              role: 'StaticText',
              name: 'Hello',
              bogusNestedObj: {bad: 1},
            },
          ],
        },
      });
      assert.strictEqual(
        badChildSnapshot.success,
        false,
        'Expected take_snapshot outputSchema to reject non-primitive nested object attribute on child node',
      );
    });
  });
});
