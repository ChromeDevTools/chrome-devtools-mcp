/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {mcpOptions, parser} from '../src/config/mcp-options.js';

function parseArguments(argv: string[], env: NodeJS.ProcessEnv = {}) {
  return parser('0.0.0', ['node', 'main.js', ...argv], env)
    .exitProcess(false)
    .parseSync();
}

describe('cli args parsing', () => {
  const defaultArgs = {
    categoryEmulation: true,
    categoryPerformance: true,
    categoryNetwork: true,
    categoryExtensions: false,
    categoryExperimentalThirdParty: false,
    autoConnect: undefined,
    performanceCrux: true,
    usageStatistics: true,
    javascriptEvaluation: true,
    redactNetworkHeaders: false,
    allowUnrestrictedPaths: false,
    memoryDebugging: false,
    experimentalStructuredContent: false,
    pageIdRouting: true,
  };

  it('parses with default args', async () => {
    const args = parseArguments([]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
    });
  });

  it('parses with viaCli args', async () => {
    const args = parseArguments(['--viaCli']);
    assert.strictEqual(args.allowUnrestrictedPaths, true);
    assert.strictEqual(args.headless, true);
    assert.strictEqual(args.memoryDebugging, true);
    assert.strictEqual(args.categoryExtensions, true);
    assert.strictEqual(args.experimentalStructuredContent, true);
    assert.strictEqual(args.viaCli, true);
  });

  it('parses with browser url', async () => {
    const args = parseArguments(['--browserUrl', 'http://localhost:3000']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      browserUrl: 'http://localhost:3000',
    });
  });

  it('rejects unknown options', async () => {
    let output = '';
    const originalError = console.error;
    console.error = (msg: string) => {
      output += msg;
    };
    try {
      parseArguments(['--browserURL', 'http://localhost:3000']);
      assert.match(output, /Unknown arguments: --browserURL/);
    } finally {
      console.error = originalError;
    }
  });

  it('parses mixed-form option names', async () => {
    const args = parseArguments(['--category-experimentalWebmcp']);

    assert.strictEqual(args.categoryExperimentalWebmcp, true);
  });

  it('parses with user data dir', async () => {
    const args = parseArguments(['--user-data-dir', '/tmp/chrome-profile']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      userDataDir: '/tmp/chrome-profile',
    });
  });

  it('parses an empty browser url', async () => {
    const args = parseArguments(['--browserUrl', ''], {});
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      browserUrl: undefined,
      channel: 'stable',
    });
  });

  it('parses with executable path', async () => {
    const args = parseArguments(['--executablePath', '/tmp/test 123/chrome']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      executablePath: '/tmp/test 123/chrome',
    });
  });

  it('parses viewport', async () => {
    const args = parseArguments(['--viewport', '888x777']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      viewport: {
        width: 888,
        height: 777,
      },
    });
  });

  it('parses chrome args', async () => {
    const args = parseArguments([
      `--chrome-arg='--no-sandbox'`,
      `--chrome-arg='--disable-setuid-sandbox'`,
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      chromeArg: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  it('parses ignore chrome args', async () => {
    const args = parseArguments([
      `--ignore-default-chrome-arg='--disable-extensions'`,
      `--ignore-default-chrome-arg='--disable-cancel-all-touches'`,
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      ignoreDefaultChromeArg: [
        '--disable-extensions',
        '--disable-cancel-all-touches',
      ],
    });
  });

  it('parses wsEndpoint with ws:// protocol', async () => {
    const args = parseArguments([
      '--wsEndpoint',
      'ws://127.0.0.1:9222/devtools/browser/abc123',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc123',
    });
  });

  it('parses wsEndpoint with wss:// protocol', async () => {
    const args = parseArguments([
      '--wsEndpoint',
      'wss://example.com:9222/devtools/browser/abc123',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      wsEndpoint: 'wss://example.com:9222/devtools/browser/abc123',
    });
  });

  it('parses wsHeaders with valid JSON', async () => {
    const args = parseArguments([
      '--wsEndpoint',
      'ws://127.0.0.1:9222/devtools/browser/abc123',
      '--wsHeaders',
      '{"Authorization":"Bearer token","X-Custom":"value"}',
    ]);
    assert.deepStrictEqual(args.wsHeaders, {
      Authorization: 'Bearer token',
      'X-Custom': 'value',
    });
  });

  it('parses disabled category', async () => {
    const args = parseArguments(['--no-category-emulation']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      categoryEmulation: false,
    });
  });
  it('parses auto-connect', async () => {
    const args = parseArguments(['--auto-connect'], {});
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      autoConnect: true,
    });
  });

  it('rejects invalid screencast fps values', async () => {
    const coerce = mcpOptions.experimentalScreencastFps.coerce;
    assert.ok(coerce);

    assert.strictEqual(coerce(undefined), undefined);
    assert.strictEqual(coerce(10), 10);

    for (const value of [0, -1, 10.5, Number.NaN]) {
      assert.throws(
        () => coerce(value),
        /Invalid experimentalScreencastFps .* Expected a positive integer\./,
      );
    }
  });

  it('parses usage statistics flag', async () => {
    // Test default (should be true).
    const defaultArgs = parseArguments(['main.js'], {});
    assert.strictEqual(defaultArgs.usageStatistics, true);

    // Test enabling it
    const enabledArgs = parseArguments(['--usage-statistics']);
    assert.strictEqual(enabledArgs.usageStatistics, true);

    // Test disabling it
    const disabledArgs = parseArguments(['--no-usage-statistics']);
    assert.strictEqual(disabledArgs.usageStatistics, false);
  });

  it('parses javascript evaluation flag', async () => {
    // Test default (should be true).
    const defaultArgs = parseArguments(['main.js'], {});
    assert.strictEqual(defaultArgs.javascriptEvaluation, true);

    // Test enabling it
    const enabledArgs = parseArguments(['--javascript-evaluation']);
    assert.strictEqual(enabledArgs.javascriptEvaluation, true);

    // Test disabling it
    const disabledArgs = parseArguments(['--no-javascript-evaluation']);
    assert.strictEqual(disabledArgs.javascriptEvaluation, false);
  });

  it('respects env variable', async () => {
    // Test default (should be true).
    const defaultArgs = parseArguments(['main.js'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });
    assert.strictEqual(defaultArgs.usageStatistics, false);

    // Test enabling it
    const enabledArgs = parseArguments(['--usage-statistics'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });
    assert.strictEqual(enabledArgs.usageStatistics, false);

    // Test disabling it
    const disabledArgs = parseArguments(['--no-usage-statistics'], {
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
    });
    assert.strictEqual(disabledArgs.usageStatistics, false);
  });

  it('parses performance crux flag', async () => {
    const defaultArgs = parseArguments(['main.js']);
    assert.strictEqual(defaultArgs.performanceCrux, true);

    // force enable
    const enabledArgs = parseArguments(['--performance-crux']);
    assert.strictEqual(enabledArgs.performanceCrux, true);

    const disabledArgs = parseArguments(['--no-performance-crux']);
    assert.strictEqual(disabledArgs.performanceCrux, false);
  });

  it('parses blocked-url-pattern flags as array', async () => {
    const defaultArgs = parseArguments(['main.js']);
    assert.strictEqual(defaultArgs.blockedUrlPattern, undefined);

    const singleArgs = parseArguments([
      '--blocked-url-pattern=https://example.com/*',
    ]);
    assert.deepStrictEqual(singleArgs.blockedUrlPattern, [
      'https://example.com/*',
    ]);

    const repeatedArgs = parseArguments([
      '--blocked-url-pattern=https://a.com/*',
      '--blocked-url-pattern=https://b.com/*',
    ]);
    assert.deepStrictEqual(repeatedArgs.blockedUrlPattern, [
      'https://a.com/*',
      'https://b.com/*',
    ]);

    const spaceSeparatedArgs = parseArguments([
      '--blocked-url-pattern',
      'https://a.com/*',
      'https://b.com/*',
    ]);
    assert.deepStrictEqual(spaceSeparatedArgs.blockedUrlPattern, [
      'https://a.com/*',
      'https://b.com/*',
    ]);
  });

  it('parses allowed-url-pattern flags as array', async () => {
    const defaultArgs = parseArguments(['main.js']);
    assert.strictEqual(defaultArgs.allowedUrlPattern, undefined);

    const singleArgs = parseArguments([
      '--allowed-url-pattern=https://example.com/*',
    ]);
    assert.deepStrictEqual(singleArgs.allowedUrlPattern, [
      'https://example.com/*',
    ]);

    const repeatedArgs = parseArguments([
      '--allowed-url-pattern=https://a.com/*',
      '--allowed-url-pattern=https://b.com/*',
    ]);
    assert.deepStrictEqual(repeatedArgs.allowedUrlPattern, [
      'https://a.com/*',
      'https://b.com/*',
    ]);

    const spaceSeparatedArgs = parseArguments([
      '--allowed-url-pattern',
      'https://a.com/*',
      'https://b.com/*',
    ]);
    assert.deepStrictEqual(spaceSeparatedArgs.allowedUrlPattern, [
      'https://a.com/*',
      'https://b.com/*',
    ]);
  });
});
