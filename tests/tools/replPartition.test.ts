/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {ConfigLocator} from '../../src/config/ConfigLocator.js';
import {ConfigParser} from '../../src/config/ConfigParser.js';
import {
  getCliOptions,
  mcpOptions,
  type ParsedArguments,
} from '../../src/config/mcp-options.js';
import {zod} from '../../src/third_party/index.js';
import {
  INNER_REPL_TOOL_NAMES,
  partitionToolsForRepl,
  STRIPPED_INNER_PARAMS,
} from '../../src/tools/replPartition.js';
import type {AnyToolDefinition} from '../../src/tools/ToolDefinition.js';
import {createTools} from '../../src/tools/tools.js';
import {createMockParsedArguments} from '../mocks.js';

const EXPECTED_INNER_ONLY_TOOLS = [
  'click',
  'click_at',
  'drag',
  'execute_3p_developer_tool',
  'execute_webmcp_tool',
  'fill',
  'fill_form',
  'get_console_message',
  'get_css_styles',
  'get_network_request',
  'hover',
  'list_3p_developer_tools',
  'list_console_messages',
  'list_network_requests',
  'list_webmcp_tools',
  'press_key',
  'take_screenshot',
  'take_snapshot',
  'type_text',
] as const;

const EXPECTED_ALL_INNER_TOOLS = [
  ...EXPECTED_INNER_ONLY_TOOLS,
  'wait_for',
].sort();

const EXPECTED_DEFAULT_INNER_TOOLS = [
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

const EXPECTED_OUTER_REPL_TOOLS = [
  // DEBUGGING (session, browser, and REPL host entrypoint)
  'evaluate_script',
  'get_devtools_comments',
  'lighthouse_audit',
  'open_devtools',
  'resolve_devtools_comment',
  'reveal_in_devtools',
  'screencast_start',
  'screencast_stop',
  'set_logpoints',
  // NAVIGATION (including wait_for shared with inner REPL)
  'close_page',
  'get_tab_id',
  'list_pages',
  'navigate_page',
  'new_page',
  'select_page',
  'wait_for',
  // EMULATION
  'emulate',
  'resize_page',
  // EXTENSIONS
  'install_extension',
  'list_extensions',
  'reload_extension',
  'trigger_extension_action',
  'uninstall_extension',
  // NETWORK_MOCKS
  'mock_network',
  'remove_network_mock',
  // WEBAUTHN
  'configure_webauthn',
  // INPUT (host file upload and renderer-pausing JS modal dialog handling stay outer)
  'handle_dialog',
  'upload_file',
  // PERFORMANCE
  'performance_analyze_insight',
  'performance_start_trace',
  'performance_stop_trace',
  // MEMORY
  'analyze_heapsnapshot_contexts',
  'close_heapsnapshot',
  'compare_heapsnapshots',
  'get_heapsnapshot_class_nodes',
  'get_heapsnapshot_details',
  'get_heapsnapshot_dominators',
  'get_heapsnapshot_duplicate_strings',
  'get_heapsnapshot_edges',
  'get_heapsnapshot_object_details',
  'get_heapsnapshot_retainers',
  'get_heapsnapshot_retaining_paths',
  'get_heapsnapshot_summary',
  'query_heapsnapshot_objects',
  'take_heapsnapshot',
  // PWA
  'get_os_app_state',
  'install_pwa',
  'launch_pwa',
  'uninstall_pwa',
];

function parseCliArgs(argv: string[]): ParsedArguments {
  const locator = new ConfigLocator();
  sinon.stub(locator, 'locate').returns(undefined);
  return new ConfigParser(
    '1.0.0',
    ['node', 'main.js', ...argv],
    {CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true'},
    false,
    locator,
  ).parse();
}

function createUnpartitionedTools(
  overrides: Partial<ParsedArguments> = {},
): AnyToolDefinition[] {
  return createTools(createMockParsedArguments({...overrides, repl: false}));
}

function findTool(
  tools: readonly AnyToolDefinition[],
  name: string,
): AnyToolDefinition {
  const found = tools.find(tool => tool.name === name);
  assert.ok(found, `Expected tool "${name}" to exist`);
  return found;
}

describe('replPartition', () => {
  describe('CLI options and config validation', () => {
    it('defines repl and replMainWorld boolean options defaulting to false and omits them from getCliOptions', () => {
      assert.strictEqual(mcpOptions.repl.type, 'boolean');
      assert.strictEqual(mcpOptions.repl.default, false);
      assert.ok(mcpOptions.repl.describe);

      assert.strictEqual(mcpOptions.replMainWorld.type, 'boolean');
      assert.strictEqual(mcpOptions.replMainWorld.default, false);
      assert.ok(mcpOptions.replMainWorld.describe);

      const defaultArgs = createMockParsedArguments();
      assert.strictEqual(defaultArgs.repl, false);
      assert.strictEqual(defaultArgs.replMainWorld, false);

      const replOnly = parseCliArgs(['--repl']);
      assert.strictEqual(replOnly.repl, true);
      assert.strictEqual(replOnly.replMainWorld, false);

      const cliOptions = getCliOptions();
      assert.strictEqual('repl' in cliOptions, false);
      assert.strictEqual('replMainWorld' in cliOptions, false);
    });

    it('rejects --repl with --slim or --no-javascript-evaluation and implies repl=true from --repl-main-world', () => {
      assert.throws(() => parseCliArgs(['--repl', '--slim']));
      assert.throws(() =>
        parseCliArgs(['--repl', '--no-javascript-evaluation']),
      );

      const mainWorldOnly = parseCliArgs(['--repl-main-world']);
      assert.strictEqual(mainWorldOnly.replMainWorld, true);
      assert.strictEqual(mainWorldOnly.repl, true);
    });
  });

  describe('constants', () => {
    it('declares the exact 20 inner REPL tools (excluding handle_dialog) and stripped inner params', () => {
      assert.strictEqual(EXPECTED_ALL_INNER_TOOLS.length, 20);
      assert.deepStrictEqual(
        [...INNER_REPL_TOOL_NAMES].sort(),
        EXPECTED_ALL_INNER_TOOLS,
      );
      assert.ok(!INNER_REPL_TOOL_NAMES.has('handle_dialog'));
      assert.deepStrictEqual([...STRIPPED_INNER_PARAMS].sort(), [
        'filePath',
        'requestFilePath',
        'responseFilePath',
        'serviceWorkerId',
      ]);
    });
  });

  describe('createTools outer surface', () => {
    it('keeps all standard tools on the outer surface when repl is false', () => {
      const names = new Set(
        createTools(createMockParsedArguments({repl: false})).map(
          tool => tool.name,
        ),
      );

      for (const expected of [
        'click',
        'take_snapshot',
        'take_screenshot',
        'list_console_messages',
        'list_network_requests',
        'get_network_request',
        'navigate_page',
        'evaluate_script',
        'wait_for',
        'handle_dialog',
        'upload_file',
      ]) {
        assert.ok(
          names.has(expected),
          `Expected outer tools with repl=false to include "${expected}"`,
        );
      }
    });

    it('keeps lifecycle/session/dialog/file tools and excludes inner-only tools when repl is true and slim is false', () => {
      const outerTools = createTools(
        createMockParsedArguments({repl: true, slim: false}),
      );
      const outerNames = new Set(outerTools.map(tool => tool.name));

      for (const expectedOuter of EXPECTED_OUTER_REPL_TOOLS) {
        assert.ok(
          outerNames.has(expectedOuter),
          `Expected outer tools with repl=true to include "${expectedOuter}"`,
        );
      }

      for (const innerOnly of EXPECTED_INNER_ONLY_TOOLS) {
        assert.ok(
          !outerNames.has(innerOnly),
          `Expected outer tools with repl=true to exclude inner-only tool "${innerOnly}"`,
        );
      }
    });

    it('does not partition slim tools when slim is true even if repl is true', () => {
      const tools = createTools(
        createMockParsedArguments({repl: true, slim: true}),
      );
      const names = new Set(tools.map(tool => tool.name));

      assert.ok(names.has('navigate'));
      assert.ok(names.has('evaluate'));
      assert.ok(names.has('screenshot'));
    });
  });

  describe('partitionToolsForRepl', () => {
    it('includes the 15 default enabled in-page primitives on innerTools, keeps wait_for in both, and keeps handle_dialog outer-only', () => {
      const replArgs = createMockParsedArguments({
        repl: true,
        slim: false,
        experimentalVision: false,
      });
      const allTools = createUnpartitionedTools({
        slim: false,
        experimentalVision: false,
      });

      const {outerTools, innerTools} = partitionToolsForRepl(
        allTools,
        replArgs,
      );
      const outerNames = new Set(outerTools.map(tool => tool.name));
      const innerNames = innerTools.map(tool => tool.name).sort();

      assert.strictEqual(EXPECTED_DEFAULT_INNER_TOOLS.length, 15);
      assert.deepStrictEqual(innerNames, EXPECTED_DEFAULT_INNER_TOOLS);
      assert.ok(outerNames.has('wait_for'));
      assert.ok(innerNames.includes('wait_for'));
      assert.ok(outerNames.has('handle_dialog'));
      assert.ok(!innerNames.includes('handle_dialog'));
      assert.ok(!innerNames.includes('click_at'));
      assert.ok(!innerNames.includes('upload_file'));
      assert.ok(!innerNames.includes('evaluate_script'));
      assert.ok(!innerNames.includes('navigate_page'));
    });

    it('respects experimentalVision, WebMCP, third-party, and disabled category flags on innerTools', () => {
      const allEnabledOverrides: Partial<ParsedArguments> = {
        slim: false,
        experimentalVision: true,
        categoryExperimentalWebmcp: true,
        categoryExperimentalThirdParty: true,
      };
      const enabledResult = partitionToolsForRepl(
        createUnpartitionedTools(allEnabledOverrides),
        createMockParsedArguments({...allEnabledOverrides, repl: true}),
      );
      assert.deepStrictEqual(
        enabledResult.innerTools.map(tool => tool.name).sort(),
        EXPECTED_ALL_INNER_TOOLS,
      );

      const noNetworkOverrides: Partial<ParsedArguments> = {
        slim: false,
        categoryNetwork: false,
      };
      const noNetworkResult = partitionToolsForRepl(
        createUnpartitionedTools(noNetworkOverrides),
        createMockParsedArguments({...noNetworkOverrides, repl: true}),
      );
      const noNetworkInnerNames = new Set(
        noNetworkResult.innerTools.map(tool => tool.name),
      );
      assert.ok(!noNetworkInnerNames.has('list_network_requests'));
      assert.ok(!noNetworkInnerNames.has('get_network_request'));
      assert.ok(noNetworkInnerNames.has('click'));
      assert.ok(noNetworkInnerNames.has('take_snapshot'));
    });

    it('strips filePath, requestFilePath, responseFilePath, and serviceWorkerId from inner tool schemas and rejects them under strict validation', () => {
      const rawTools = createUnpartitionedTools({slim: false});
      const {innerTools} = partitionToolsForRepl(
        rawTools,
        createMockParsedArguments({repl: true, slim: false}),
      );

      const innerSnapshot = findTool(innerTools, 'take_snapshot');
      assert.ok(!('filePath' in innerSnapshot.schema));
      assert.ok(!('filePath' in innerSnapshot.verifyFilesSchema));
      assert.ok('verbose' in innerSnapshot.schema);
      assert.strictEqual(
        zod
          .object(innerSnapshot.schema)
          .strict()
          .safeParse({filePath: '/tmp/snapshot.txt'}).success,
        false,
      );
      assert.ok(
        'filePath' in findTool(rawTools, 'take_snapshot').schema,
        'Original take_snapshot schema should not be mutated in place',
      );

      const innerScreenshot = findTool(innerTools, 'take_screenshot');
      assert.ok(!('filePath' in innerScreenshot.schema));
      assert.ok(!('filePath' in innerScreenshot.verifyFilesSchema));
      assert.ok('format' in innerScreenshot.schema);
      assert.ok('uid' in innerScreenshot.schema);
      assert.ok('fullPage' in innerScreenshot.schema);
      assert.strictEqual(
        zod
          .object(innerScreenshot.schema)
          .strict()
          .safeParse({filePath: '/tmp/screenshot.png'}).success,
        false,
      );

      const innerGetNetwork = findTool(innerTools, 'get_network_request');
      assert.ok(!('requestFilePath' in innerGetNetwork.schema));
      assert.ok(!('responseFilePath' in innerGetNetwork.schema));
      assert.ok(!('requestFilePath' in innerGetNetwork.verifyFilesSchema));
      assert.ok(!('responseFilePath' in innerGetNetwork.verifyFilesSchema));
      assert.ok('reqid' in innerGetNetwork.schema);
      assert.strictEqual(
        zod
          .object(innerGetNetwork.schema)
          .strict()
          .safeParse({reqid: 1, requestFilePath: '/tmp/req.bin'}).success,
        false,
      );
      assert.strictEqual(
        zod
          .object(innerGetNetwork.schema)
          .strict()
          .safeParse({reqid: 1, responseFilePath: '/tmp/res.bin'}).success,
        false,
      );

      const innerListConsole = findTool(innerTools, 'list_console_messages');
      assert.ok(!('serviceWorkerId' in innerListConsole.schema));
      assert.ok('types' in innerListConsole.schema);
      assert.strictEqual(
        zod
          .object(innerListConsole.schema)
          .strict()
          .safeParse({serviceWorkerId: 'sw-1'}).success,
        false,
      );
      assert.ok(
        'serviceWorkerId' in findTool(rawTools, 'list_console_messages').schema,
        'Original list_console_messages schema should not be mutated in place',
      );
    });
  });
});
