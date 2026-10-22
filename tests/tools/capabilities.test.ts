/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import sinon from 'sinon';

import {BrowserManager} from '../../src/BrowserManager.js';
import {ConfigParser} from '../../src/config/ConfigParser.js';
import {McpServer} from '../../src/index.js';
import {McpContext} from '../../src/McpContext.js';
import {createMockMcpContext, createMockPuppeteerBrowser} from '../mocks.js';

function getFirstTextContent(result: {
  content: Array<{type: string; text?: string}>;
}): string {
  const first = result.content[0];
  return first && 'text' in first && typeof first.text === 'string'
    ? first.text
    : '';
}

async function createTestServer(extraArgs: string[] = []) {
  const browserManager = sinon.createStubInstance(BrowserManager);
  const browser = createMockPuppeteerBrowser();
  browserManager.ensureBrowser.resolves(browser);

  const context = createMockMcpContext();
  context.browser = browser;
  context.getPages.returns([]);
  sinon.stub(McpContext, 'from').callsFake(async (_b, _l, opts) => {
    context.mcpServer = opts.mcpServer;
    return context;
  });

  const serverArgs = new ConfigParser(
    '1.0.0',
    ['node', 'script.js', ...extraArgs],
    {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    },
  ).parse();
  const server = await McpServer.from(serverArgs, {browserManager});
  return {server, browserManager, context};
}

describe('manage_capabilities tool', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('Integration: full server capability lifecycle and >30% token reduction', async () => {
    const {server, browserManager, context} = await createTestServer([
      '--meta-feature-system',
    ]);

    const listRes = await server.callTool('manage_capabilities', {
      action: 'list',
    });
    if (listRes.isError) {
      console.error('Error from listRes:', listRes);
    }
    assert.strictEqual(listRes.isError, undefined);
    sinon.assert.notCalled(browserManager.ensureBrowser);
    const listContent = JSON.parse(getFirstTextContent(listRes)) as {
      packs: Array<{id: string; tools: string[]}>;
      startupTokenSavingsPercent: number;
      coreTokens: number;
      activeTokens: number;
      totalCatalogTokens: number;
    };

    assert(
      listContent.startupTokenSavingsPercent >= 30,
      `Expected token savings >= 30, got ${listContent.startupTokenSavingsPercent}`,
    );
    assert(listContent.coreTokens > 0);
    assert.strictEqual(listContent.activeTokens, listContent.coreTokens);
    assert(listContent.totalCatalogTokens > listContent.coreTokens);

    const corePack = listContent.packs.find(p => p.id === 'core');
    assert(corePack);
    assert(!corePack.tools.includes('get_devtools_comments'));
    assert(!corePack.tools.includes('open_devtools'));

    assert.strictEqual(
      server.capabilityManager.isToolActive('performance_start_trace'),
      false,
    );
    assert.strictEqual(
      server.capabilityManager.isToolActive('take_heapsnapshot'),
      false,
    );
    assert.strictEqual(
      server.capabilityManager.isToolActive('list_extensions'),
      false,
    );
    assert.strictEqual(
      server.capabilityManager.isToolActive('navigate_page'),
      true,
    );

    const enableRes = await server.callTool('manage_capabilities', {
      action: 'enable',
      capabilities: ['performance', 'memory'],
    });
    assert.strictEqual(enableRes.isError, undefined);
    const enableContent = JSON.parse(getFirstTextContent(enableRes)) as {
      results: Array<{
        success: boolean;
        microSkill?: string;
        tools?: Array<{
          name: string;
          parameters: Record<string, unknown>;
        }>;
      }>;
      fallbackInstruction?: string;
    };
    assert.strictEqual(enableContent.results[0].success, true);
    assert(
      typeof enableContent.results[0].microSkill === 'string' &&
        enableContent.results[0].microSkill.length > 0,
    );
    assert(
      Array.isArray(enableContent.results[0].tools) &&
        enableContent.results[0].tools.length === 3,
    );
    const analyzeToolSchema = enableContent.results[0].tools.find(
      t => t.name === 'performance_analyze_insight',
    );
    assert(
      analyzeToolSchema &&
        analyzeToolSchema.parameters.insightSetId &&
        analyzeToolSchema.parameters.insightName,
    );
    assert(typeof enableContent.fallbackInstruction === 'string');

    assert.strictEqual(
      server.capabilityManager.isToolActive('performance_start_trace'),
      true,
    );
    assert.strictEqual(
      server.capabilityManager.isToolActive('take_heapsnapshot'),
      true,
    );

    // Verify action: 'call' executes active tools without mutex deadlock
    const callRes = await server.callTool('manage_capabilities', {
      action: 'call',
      tool: 'list_pages',
      toolArgs: {},
    });
    assert.strictEqual(callRes.isError, undefined);
    sinon.assert.calledOnce(browserManager.ensureBrowser);
    sinon.assert.calledOnce(context.createPagesSnapshot);

    const lockedRes = await server.callTool('manage_capabilities', {
      action: 'enable',
      capability: 'extensions',
    });
    const lockedContent = JSON.parse(getFirstTextContent(lockedRes)) as {
      results: Array<{success: boolean}>;
    };
    assert.strictEqual(lockedContent.results[0].success, false);
    assert.strictEqual(
      server.capabilityManager.isToolActive('list_extensions'),
      false,
    );

    const lockedCallRes = await server.callTool('manage_capabilities', {
      action: 'call',
      tool: 'list_extensions',
      toolArgs: {},
    });
    assert.strictEqual(lockedCallRes.isError, true);
    assert(
      getFirstTextContent(lockedCallRes).includes('locked by security policy'),
    );

    const disableRes = await server.callTool('manage_capabilities', {
      action: 'disable',
      capability: 'performance',
    });
    const disableContent = JSON.parse(getFirstTextContent(disableRes)) as {
      results: Array<{success: boolean}>;
      fallbackInstruction?: string;
    };
    assert.strictEqual(disableContent.results[0].success, true);
    assert.strictEqual(disableContent.fallbackInstruction, undefined);
  });

  it('Enforces --tool-policy=on-demand for core tools, --no-category-* flags, and PWA pipe requirement', async () => {
    const {server} = await createTestServer([
      '--meta-feature-system',
      '--tool-policy=click=on-demand',
      '--no-category-network',
      '--browserUrl=http://127.0.0.1:9222',
    ]);

    // 1. Core tool with --tool-policy=click=on-demand starts inactive until core is explicitly enabled
    assert.strictEqual(server.capabilityManager.isToolActive('click'), false);
    const inactiveClickRes = await server.callTool('click', {
      pageId: 1,
      uid: '1_1',
    });
    assert.strictEqual(inactiveClickRes.isError, true);
    assert(
      getFirstTextContent(inactiveClickRes).includes(
        'in an on-demand capability pack',
      ),
    );

    const enableCoreRes = await server.callTool('manage_capabilities', {
      action: 'enable',
      capability: 'core',
    });
    assert.strictEqual(enableCoreRes.isError, undefined);
    assert.strictEqual(server.capabilityManager.isToolActive('click'), true);

    // 2. Explicit --no-category-network is respected even under --meta-feature-system
    const networkRes = await server.callTool('list_network_requests', {
      pageId: 1,
    });
    assert.strictEqual(networkRes.isError, true);
    assert(getFirstTextContent(networkRes).includes('--categoryNetwork'));

    // 3. PWA pack cannot be enabled when connected via --browserUrl
    const enablePwaRes = await server.callTool('manage_capabilities', {
      action: 'enable',
      capability: 'pwa',
    });
    const enablePwaContent = JSON.parse(getFirstTextContent(enablePwaRes)) as {
      results: Array<{success: boolean; error?: string}>;
    };
    assert.strictEqual(enablePwaContent.results[0].success, false);
    assert(
      enablePwaContent.results[0].error?.includes(
        'only supported with a pipe connection',
      ),
    );
  });

  it('Eval scenarios pass expectations both without and with --meta-feature-system', async () => {
    const scriptsDir = path.resolve(process.cwd(), 'scripts');
    const evalResultUrl = pathToFileURL(
      path.join(scriptsDir, 'eval_result.ts'),
    ).href;
    const evalResultMod = (await import(evalResultUrl)) as Record<
      string,
      new (
        calls: Array<{
          name: string;
          args: Record<string, unknown>;
          isError?: boolean;
        }>,
        serverArgs: string[],
        text?: string,
      ) => unknown
    >;
    const ResultCtor = evalResultMod['Result'];
    const loadScenario = async (fileName: string) => {
      const scenarioUrl = pathToFileURL(
        path.join(scriptsDir, 'eval_scenarios', fileName),
      ).href;
      const mod = (await import(scenarioUrl)) as {
        scenario: {expectations: (res: unknown) => void};
      };
      return mod.scenario;
    };
    const snapshotScenario = await loadScenario('snapshot_test.ts');
    const lighthouseScenario = await loadScenario('lighthouse_a11y_test.ts');
    const memoryScenario = await loadScenario('memory_heapsnapshot_test.ts');
    const perfPolicyScenario = await loadScenario(
      'performance_and_policy_test.ts',
    );

    // 1. snapshot_test without and with --meta-feature-system
    snapshotScenario.expectations(
      new ResultCtor(
        [
          {
            name: 'navigate_page',
            args: {pageId: 1, type: 'url', url: 'http://127.0.0.1/test.html'},
          },
          {name: 'take_snapshot', args: {pageId: 1}},
        ],
        ['--isolated', '--headless'],
        'Hello World',
      ),
    );
    snapshotScenario.expectations(
      new ResultCtor(
        [
          {
            name: 'navigate_page',
            args: {pageId: 1, type: 'url', url: 'http://127.0.0.1/test.html'},
          },
          {name: 'take_snapshot', args: {pageId: 1}},
        ],
        ['--isolated', '--headless', '--meta-feature-system'],
        'Hello World',
      ),
    );

    // 2. lighthouse_a11y_test without and with --meta-feature-system
    lighthouseScenario.expectations(
      new ResultCtor(
        [
          {
            name: 'navigate_page',
            args: {
              pageId: 1,
              type: 'url',
              url: 'http://127.0.0.1/lighthouse_test.html',
            },
          },
          {name: 'lighthouse_audit', args: {pageId: 1}},
        ],
        ['--isolated', '--headless'],
        'Audit complete',
      ),
    );
    lighthouseScenario.expectations(
      new ResultCtor(
        [
          {name: 'manage_capabilities', args: {action: 'list'}},
          {
            name: 'manage_capabilities',
            args: {action: 'enable', capability: 'audits'},
          },
          {
            name: 'navigate_page',
            args: {
              pageId: 1,
              type: 'url',
              url: 'http://127.0.0.1/lighthouse_test.html',
            },
          },
          {
            name: 'manage_capabilities',
            args: {
              action: 'call',
              tool: 'lighthouse_audit',
              toolArgs: {pageId: 1},
            },
          },
        ],
        ['--isolated', '--headless', '--meta-feature-system'],
        'Audit complete',
      ),
    );

    // 3. memory_heapsnapshot_test without and with --meta-feature-system
    memoryScenario.expectations(
      new ResultCtor(
        [
          {
            name: 'navigate_page',
            args: {
              pageId: 1,
              type: 'url',
              url: 'http://127.0.0.1/memory_leak_test.html',
            },
          },
          {
            name: 'take_heapsnapshot',
            args: {pageId: 1, filePath: '/tmp/eval-heap.heapsnapshot'},
          },
          {
            name: 'get_heapsnapshot_summary',
            args: {filePath: '/tmp/eval-heap.heapsnapshot'},
          },
        ],
        ['--isolated', '--headless', '--memory-debugging'],
        'DetachedCheckoutCartListener',
      ),
    );
    memoryScenario.expectations(
      new ResultCtor(
        [
          {
            name: 'manage_capabilities',
            args: {action: 'enable', capability: 'memory'},
          },
          {
            name: 'navigate_page',
            args: {
              pageId: 1,
              type: 'url',
              url: 'http://127.0.0.1/memory_leak_test.html',
            },
          },
          {
            name: 'take_heapsnapshot',
            args: {pageId: 1, filePath: '/tmp/eval-heap.heapsnapshot'},
          },
          {
            name: 'get_heapsnapshot_summary',
            args: {filePath: '/tmp/eval-heap.heapsnapshot'},
          },
        ],
        ['--isolated', '--headless', '--meta-feature-system'],
        'DetachedCheckoutCartListener',
      ),
    );

    // 4. performance_and_policy_test without and with --meta-feature-system
    perfPolicyScenario.expectations(
      new ResultCtor(
        [
          {
            name: 'navigate_page',
            args: {
              pageId: 1,
              type: 'url',
              url: 'http://127.0.0.1/perf_and_policy_test.html',
            },
          },
          {
            name: 'performance_start_trace',
            args: {pageId: 1, reload: true, autoStop: true},
          },
        ],
        ['--isolated', '--headless'],
        'Trace complete',
      ),
    );
    perfPolicyScenario.expectations(
      new ResultCtor(
        [
          {
            name: 'manage_capabilities',
            args: {
              action: 'enable',
              capabilities: ['performance', 'extensions'],
            },
          },
          {
            name: 'navigate_page',
            args: {
              pageId: 1,
              type: 'url',
              url: 'http://127.0.0.1/perf_and_policy_test.html',
            },
          },
          {
            name: 'performance_start_trace',
            args: {pageId: 1, reload: true, autoStop: true},
          },
          {
            name: 'manage_capabilities',
            args: {
              action: 'call',
              tool: 'list_extensions',
              toolArgs: {},
            },
            isError: true,
          },
        ],
        ['--isolated', '--headless', '--meta-feature-system'],
        'Trace complete; extensions locked by security policy.',
      ),
    );
  });
});
