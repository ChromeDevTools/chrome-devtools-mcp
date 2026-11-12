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
} from '../../src/tools/replSchema.js';
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

const DEFAULT_INNER_REPL_TOOLS = [
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
] as const;

const INNER_REPL_TOOLS = [
  ...DEFAULT_INNER_REPL_TOOLS,
  'click_at',
  'execute_3p_developer_tool',
  'execute_webmcp_tool',
  'list_3p_developer_tools',
  'list_webmcp_tools',
] as const;

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
          ok: zod.boolean(),
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
          ok: zod.boolean(),
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
        /:\s*Promise<\{[\s\S]*\bnetworkRequest\?:\s*\{[\s\S]*\burl:\s*string\b[\s\S]*\bstatus\?:\s*number\b[\s\S]*\}[\s\S]*\}>;?$/,
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

      const byteLength = Buffer.byteLength(declaration, 'utf8');
      assert.ok(
        byteLength <= 4500,
        `Expected McpTools declaration <= 4500 bytes, got ${byteLength}`,
      );
    });
  });

  describe('McpResponse structuredContent contracts', () => {
    it('sets structuredContent.ok = true on non-error action responses and ok = false (or errorMessage) on error responses', async () => {
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
      assert.strictEqual(okFields.get('ok'), true);
      assert.strictEqual(
        okFields.get('navigatedToUrl'),
        'https://example.com/dashboard',
      );
      assert.strictEqual(okFields.get('dialogHandled'), true);

      const actionOutputSchema = zod.object({
        ok: zod.boolean(),
        navigatedToUrl: zod.string().optional(),
        dialogHandled: zod.boolean().optional(),
      });
      assert.strictEqual(
        actionOutputSchema.safeParse(okResult.structuredContent).success,
        true,
      );

      const errorResponse = new McpResponse(createMockServerConfig());
      errorResponse.setPage(page);
      errorResponse.setError(new Error('Element did not become interactive'));

      const errorResult = await errorResponse.handle(context);
      const errorFields = toFieldMap(errorResult.structuredContent);
      assert.notStrictEqual(errorFields.get('ok'), true);
      assert.ok(
        errorFields.get('ok') === false ||
          errorFields.get('errorMessage') ===
            'Element did not become interactive',
      );
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
});
