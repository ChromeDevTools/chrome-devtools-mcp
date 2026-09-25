/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {buildCommand} from '../src/config/cli-commands.js';
import {commands} from '../src/config/cli-options.js';
import {
  DEFAULT_FILESYSTEM_ROOT,
  getCliOptions,
  mcpOptions,
  parseArguments as parseArgumentsImpl,
} from '../src/config/mcp-options.js';

import {createTempFile} from './utils.js';

function parseArguments(argv: string[], env: NodeJS.ProcessEnv = {}) {
  return parseArgumentsImpl('0.0.0', ['node', 'main.js', ...argv], env);
}

describe('cli args parsing', () => {
  const defaultArgs = {
    categoryInput: true,
    categoryNavigation: true,
    categoryEmulation: true,
    categoryPerformance: true,
    categoryNetwork: true,
    categoryDebugging: true,
    categoryMemory: true,
    categoryExperimentalWebmcp: false,
    categoryExtensions: false,
    categoryExperimentalThirdParty: false,
    categoryPwa: false,
    autoConnect: false,
    headless: false,
    isolated: false,
    channel: 'stable',
    acceptInsecureCerts: false,
    performanceCrux: true,
    usageStatistics: true,
    javascriptEvaluation: true,
    redactNetworkHeaders: false,
    allowUnrestrictedPaths: false,
    filesystemRoot: DEFAULT_FILESYSTEM_ROOT,
    experimentalDevtools: false,
    experimentalVision: false,
    experimentalDataFormat: 'default',
    experimentalToonFormat: false,
    experimentalIncludeAllPages: false,
    experimentalInteropTools: false,
    experimentalScreencast: false,
    memoryDebugging: false,
    experimentalStructuredContent: false,
    pageIdRouting: true,
    sourceMaps: true,
    clearcutIncludePidHeader: false,
    screenshotFormat: 'png',
    slim: false,
    viaCli: false,
    devtoolsComments: false,
  };

  it('parses with default args', async () => {
    const args = parseArguments([]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      $0: 'npx chrome-devtools-mcp@latest',
    });
  });

  it('parses with viaCli args', async () => {
    const args = parseArguments(['--viaCli']);
    assert.strictEqual(args.allowUnrestrictedPaths, true);
    assert.strictEqual(args.headless, true);
    assert.strictEqual(args.isolated, true);
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
      $0: 'npx chrome-devtools-mcp@latest',
      userDataDir: '/tmp/chrome-profile',
    });
  });

  it('parses an empty browser url', async () => {
    const args = parseArguments(['--browserUrl', ''], {});
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      $0: 'npx chrome-devtools-mcp@latest',
      browserUrl: undefined,
    });
  });

  it('parses with executable path', async () => {
    const args = parseArguments(['--executablePath', '/tmp/test 123/chrome']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      $0: 'npx chrome-devtools-mcp@latest',
      executablePath: '/tmp/test 123/chrome',
    });
  });

  it('parses viewport', async () => {
    const args = parseArguments(['--viewport', '888x777']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      $0: 'npx chrome-devtools-mcp@latest',
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
      $0: 'npx chrome-devtools-mcp@latest',
      chromeArg: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  describe('filesystem roots', () => {
    it('parses filesystem roots', async () => {
      const args = parseArguments([
        '--filesystem-root=/tmp/one',
        '--filesystem-root=/tmp/two',
      ]);
      assert.deepStrictEqual(args.filesystemRoot, ['/tmp/one', '/tmp/two']);
    });

    it('parses workspace as an alias for filesystem roots', async () => {
      const args = parseArguments([
        '--workspace=/tmp/one',
        '--workspace=/tmp/two',
      ]);
      assert.deepStrictEqual(args.filesystemRoot, ['/tmp/one', '/tmp/two']);
    });

    it('still accepts unrestricted paths without an explicit root', async () => {
      const args = parseArguments(['--allow-unrestricted-paths']);
      assert.strictEqual(args.allowUnrestrictedPaths, true);
    });

    it('lets an explicit workspace override the CLI unrestricted default', async () => {
      const args = parseArguments(['--viaCli', '--workspace=/tmp/one']);
      assert.strictEqual(args.allowUnrestrictedPaths, false);
      assert.deepStrictEqual(args.filesystemRoot, ['/tmp/one']);
    });

    it('keeps the CLI unrestricted default when no workspace is set', async () => {
      const args = parseArguments(['--viaCli']);
      assert.strictEqual(args.allowUnrestrictedPaths, true);
      assert.strictEqual(args.filesystemRoot, undefined);
    });

    it('uses yargs default identity to detect an unset CLI workspace', async () => {
      const args = parseArguments([]);
      assert.strictEqual(args.filesystemRoot, DEFAULT_FILESYSTEM_ROOT);
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
      $0: 'npx chrome-devtools-mcp@latest',
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
      $0: 'npx chrome-devtools-mcp@latest',
      categoryEmulation: false,
    });
  });
  it('parses auto-connect', async () => {
    const args = parseArguments(['--auto-connect'], {});
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      $0: 'npx chrome-devtools-mcp@latest',
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

  it('parses source-maps flag', async () => {
    const defaultParsed = parseArguments(['main.js']);
    assert.strictEqual(defaultParsed.sourceMaps, true);

    const disabledArgs = parseArguments(['--no-source-maps']);
    assert.strictEqual(disabledArgs.sourceMaps, false);

    const explicitFalseArgs = parseArguments(['--source-maps=false']);
    assert.strictEqual(explicitFalseArgs.sourceMaps, false);

    const explicitTrueArgs = parseArguments(['--source-maps=true']);
    assert.strictEqual(explicitTrueArgs.sourceMaps, true);
  });

  it('parses config option', async () => {
    using testConfig = createTempFile(
      JSON.stringify({
        headless: true,
        categoryInput: false,
        blockedUrlPattern: ['https://example.com/*'],
      }),
      'cd4a.test.config.json',
    );
    const args = parseArguments(['--config', testConfig.path]);
    assert.strictEqual(args.config, testConfig.path);
    assert.strictEqual(args.headless, true);
    assert.strictEqual(args.categoryInput, false);
    assert.deepStrictEqual(args.blockedUrlPattern, ['https://example.com/*']);
  });

  it('parses config option mixed with cli arguments', async () => {
    using testConfig = createTempFile(
      JSON.stringify({
        headless: true,
        categoryInput: false,
      }),
      'cd4a.test.config.mixed.json',
    );
    const args = parseArguments([
      '--config',
      testConfig.path,
      '--headless=false',
      '--category-network=false',
    ]);
    assert.strictEqual(args.config, testConfig.path);
    assert.strictEqual(args.headless, false);
    assert.strictEqual(args.categoryInput, false);
    assert.strictEqual(args.categoryNetwork, false);
    assert.strictEqual(args.categoryMemory, true);
  });

  it('applies config coercion for viewport and wsHeaders', async () => {
    using testConfig = createTempFile(
      JSON.stringify({
        wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc123',
        wsHeaders: '{"Authorization":"Bearer token"}',
        viewport: '1280x720',
      }),
      'cd4a.test.config.coercion.json',
    );
    const args = parseArguments(['--config', testConfig.path]);
    assert.deepStrictEqual(args.viewport, {width: 1280, height: 720});
    assert.deepStrictEqual(args.wsHeaders, {Authorization: 'Bearer token'});
  });

  it('lets cli options override coerced config values', async () => {
    using testConfig = createTempFile(
      JSON.stringify({viewport: '1280x720'}),
      'cd4a.test.config.coercion-override.json',
    );
    const args = parseArguments([
      '--config',
      testConfig.path,
      '--viewport',
      '800x600',
    ]);
    assert.deepStrictEqual(args.viewport, {width: 800, height: 600});
  });

  it('resolves relative config path and respects config with viaCli', async () => {
    using testConfig = createTempFile(
      JSON.stringify({
        userDataDir: '/tmp/custom-profile',
        headless: false,
      }),
      'cd4a.test.config.viacli.json',
    );
    const relativePath = path.relative(process.cwd(), testConfig.path);
    const args = parseArguments(['--viaCli', '--config', relativePath]);
    assert.strictEqual(args.config, testConfig.path);
    assert.strictEqual(args.userDataDir, '/tmp/custom-profile');
    assert.strictEqual(args.isolated, false);
    assert.strictEqual(args.headless, false);
  });

  it('respects isolated=false in config with viaCli', async () => {
    using testConfig = createTempFile(
      JSON.stringify({
        isolated: false,
      }),
      'cd4a.test.config.viacli-isolated.json',
    );
    const args = parseArguments(['--viaCli', '--config', testConfig.path]);
    assert.strictEqual(args.isolated, false);
  });

  it('parses config should not allow no prefix', async () => {
    using testConfig = createTempFile(
      JSON.stringify({
        headless: true,
        'no-category-memory': true,
      }),
      'cd4a.test.config.mixed.json',
    );
    assert.throws(
      () => parseArguments(['--config', testConfig.path]),
      /Invalid JSON config file: Unknown argument: no-category-memory/,
    );
  });

  it('parses config should not allow dashed property', async () => {
    using testConfig = createTempFile(
      JSON.stringify({
        headless: true,
        'category-memory': false,
      }),
      'cd4a.test.config.mixed.json',
    );
    assert.throws(
      () => parseArguments(['--config', testConfig.path]),
      /Invalid JSON config file: Unknown argument: category-memory/,
    );
  });

  it('rejects a config file with malformed JSON', async () => {
    using testConfig = createTempFile(
      '{"headless": true,',
      'cd4a.test.config.malformed.json',
    );
    assert.throws(
      () => parseArguments(['--config', testConfig.path]),
      /Invalid JSON config file:/,
    );
  });

  it('rejects a config file that is not a JSON object', async () => {
    using testConfig = createTempFile(
      JSON.stringify(['--headless']),
      'cd4a.test.config.array.json',
    );
    assert.throws(
      () => parseArguments(['--config', testConfig.path]),
      /Invalid JSON config file: Config must be a JSON object/,
    );
  });

  it('lets explicit cli flags override viaCli dynamic defaults', async () => {
    const args = parseArguments(['--viaCli', '--no-headless']);
    assert.strictEqual(args.headless, false);
  });

  it('parses with devtoolsComments enabled', async () => {
    const args = parseArguments(['--devtoolsComments']);
    assert.strictEqual(args.devtoolsComments, true);
  });

  it('clears default values and populates defaultDescription in getCliOptions', () => {
    const cliOptions = getCliOptions();

    assert.strictEqual(cliOptions.viewport, undefined);
    assert.strictEqual(cliOptions.experimentalStructuredContent, undefined);
    assert.strictEqual(cliOptions.experimentalInteropTools, undefined);

    for (const [key, option] of Object.entries(cliOptions)) {
      assert.strictEqual(
        option && 'default' in option,
        false,
        `Expected 'default' property for ${key} to be omitted`,
      );
    }

    assert.strictEqual(cliOptions.headless?.defaultDescription, 'true');
    assert.strictEqual(cliOptions.memoryDebugging?.defaultDescription, 'true');
    assert.strictEqual(
      cliOptions.filesystemRoot?.defaultDescription,
      'OS temp directory',
    );
  });

  describe('mutual exclusivity', () => {
    it('rejects isolated with userDataDir', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--isolated',
            '--user-data-dir',
            '/tmp/chrome-profile',
          ]),
        /Arguments userDataDir and isolated are mutually exclusive/,
      );
    });

    it('rejects isolated with autoConnect', async () => {
      assert.throws(
        () => parseArguments(['--isolated', '--auto-connect']),
        /Arguments autoConnect and isolated are mutually exclusive/,
      );
    });

    it('rejects autoConnect with executablePath', async () => {
      assert.throws(
        () =>
          parseArguments(['--auto-connect', '--executablePath', '/bin/chrome']),
        /Arguments autoConnect and executablePath are mutually exclusive/,
      );
    });

    it('rejects categoryPwa with autoConnect', async () => {
      assert.throws(
        () => parseArguments(['--category-pwa', '--auto-connect']),
        /Arguments categoryPwa and autoConnect are mutually exclusive/,
      );
    });

    it('rejects categoryPwa with browserUrl', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--category-pwa',
            '--browserUrl',
            'http://localhost:9222',
          ]),
        /Arguments categoryPwa and browserUrl are mutually exclusive/,
      );
    });

    it('rejects categoryPwa with wsEndpoint', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--category-pwa',
            '--wsEndpoint',
            'ws://localhost:9222',
          ]),
        /Arguments categoryPwa and wsEndpoint are mutually exclusive/,
      );
    });

    it('rejects explicit channel with browserUrl', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--channel=canary',
            '--browserUrl',
            'http://localhost:9222',
          ]),
        /Arguments channel and browserUrl are mutually exclusive/,
      );
    });

    it('rejects explicit channel with wsEndpoint', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--channel',
            'canary',
            '--wsEndpoint',
            'ws://localhost:9222',
          ]),
        /Arguments channel and wsEndpoint are mutually exclusive/,
      );
    });

    it('rejects explicit channel with executablePath', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--channel',
            'canary',
            '--executablePath',
            '/bin/chrome',
          ]),
        /Arguments channel and executablePath are mutually exclusive/,
      );
    });

    it('rejects browserUrl with wsEndpoint', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--browserUrl',
            'http://localhost:9222',
            '--wsEndpoint',
            'ws://localhost:9222',
          ]),
        /Arguments browserUrl and wsEndpoint are mutually exclusive/,
      );
    });

    it('rejects executablePath with browserUrl', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--executablePath',
            '/bin/chrome',
            '--browserUrl',
            'http://localhost:9222',
          ]),
        /Arguments executablePath and browserUrl are mutually exclusive/,
      );
    });

    it('rejects executablePath with wsEndpoint', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--executablePath',
            '/bin/chrome',
            '--wsEndpoint',
            'ws://localhost:9222',
          ]),
        /Arguments executablePath and wsEndpoint are mutually exclusive/,
      );
    });

    it('rejects userDataDir with browserUrl', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--user-data-dir',
            '/tmp/dir',
            '--browserUrl',
            'http://localhost:9222',
          ]),
        /Arguments userDataDir and browserUrl are mutually exclusive/,
      );
    });

    it('rejects userDataDir with wsEndpoint', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--user-data-dir',
            '/tmp/dir',
            '--wsEndpoint',
            'ws://localhost:9222',
          ]),
        /Arguments userDataDir and wsEndpoint are mutually exclusive/,
      );
    });

    it('rejects blockedUrlPattern with allowedUrlPattern', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--blocked-url-pattern',
            '*',
            '--allowed-url-pattern',
            '*',
          ]),
        /Arguments blockedUrlPattern and allowedUrlPattern are mutually exclusive/,
      );
    });

    it('rejects config-based channel with browserUrl', async () => {
      using testConfig = createTempFile(
        JSON.stringify({channel: 'canary'}),
        'cd4a.test.config.channel.json',
      );
      assert.throws(
        () =>
          parseArguments([
            '--config',
            testConfig.path,
            '--browserUrl',
            'http://localhost:9222',
          ]),
        /Arguments channel and browserUrl are mutually exclusive/,
      );
    });

    it('rejects cli channel with config-based browserUrl', async () => {
      using testConfig = createTempFile(
        JSON.stringify({browserUrl: 'http://localhost:9222'}),
        'cd4a.test.config.browser-url.json',
      );
      assert.throws(
        () =>
          parseArguments(['--config', testConfig.path, '--channel', 'canary']),
        /Arguments channel and browserUrl are mutually exclusive/,
      );
    });

    it('rejects conflicting arguments within a config file', async () => {
      using testConfig = createTempFile(
        JSON.stringify({
          browserUrl: 'http://localhost:9222',
          wsEndpoint: 'ws://localhost:9222',
        }),
        'cd4a.test.config.conflict.json',
      );
      assert.throws(
        () => parseArguments(['--config', testConfig.path]),
        /Arguments browserUrl and wsEndpoint are mutually exclusive/,
      );
    });

    it('allows explicitly disabled isolated with userDataDir', async () => {
      const args = parseArguments([
        '--isolated=false',
        '--user-data-dir',
        '/tmp/chrome-profile',
      ]);
      assert.strictEqual(args.isolated, false);
      assert.strictEqual(args.userDataDir, '/tmp/chrome-profile');
    });

    it('rejects categoryExtensions with autoConnect', async () => {
      assert.throws(
        () => parseArguments(['--category-extensions', '--auto-connect']),
        /Arguments categoryExtensions and autoConnect are mutually exclusive/,
      );
    });

    it('rejects categoryExtensions with browserUrl', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--category-extensions',
            '--browserUrl',
            'http://localhost:9222',
          ]),
        /Arguments categoryExtensions and browserUrl are mutually exclusive/,
      );
    });

    it('rejects categoryExtensions with wsEndpoint', async () => {
      assert.throws(
        () =>
          parseArguments([
            '--category-extensions',
            '--wsEndpoint',
            'ws://localhost:9222',
          ]),
        /Arguments categoryExtensions and wsEndpoint are mutually exclusive/,
      );
    });

    it('allows default channel with browserUrl without conflict', async () => {
      const args = parseArguments(['--browserUrl', 'http://localhost:9222']);
      assert.strictEqual(args.channel, 'stable');
      assert.strictEqual(args.browserUrl, 'http://localhost:9222');
    });
  });

  describe('dataFormat resolution', () => {
    it('defaults to default', () => {
      const args = parseArguments([]);
      assert.strictEqual(args.experimentalDataFormat, 'default');
    });

    it('resolves toon format from legacy experimentalToonFormat', () => {
      const args = parseArguments(['--experimentalToonFormat']);
      assert.strictEqual(args.experimentalDataFormat, 'toon');
    });

    it('prefers explicit experimentalDataFormat over legacy experimentalToonFormat', () => {
      const args = parseArguments([
        '--experimentalToonFormat',
        '--experimentalDataFormat=gcf',
      ]);
      assert.strictEqual(args.experimentalDataFormat, 'gcf');
    });
  });
});

describe('cli command strings', () => {
  const dummyArgsVariadic = {
    arg1: {name: 'arg1', type: 'string', description: '', required: true},
    arrArg: {name: 'arrArg', type: 'array', description: '', required: true},
  };

  const dummyArgsPlain = {
    arg1: {name: 'arg1', type: 'string', description: '', required: true},
    arg2: {name: 'arg2', type: 'string', description: '', required: true},
  };

  const dummyArgsOptional = {
    arg1: {name: 'arg1', type: 'string', description: '', required: true},
    optArg: {name: 'optArg', type: 'boolean', description: '', required: false},
  };

  it('renders a required array arg as a variadic positional', () => {
    const {command} = buildCommand('dummy_cmd', dummyArgsVariadic);
    assert.strictEqual(command, 'dummy_cmd <arg1> <arrArg..>');
  });

  it('renders required non-array args as plain positionals', () => {
    const {command} = buildCommand('dummy_cmd', dummyArgsPlain);
    assert.strictEqual(command, 'dummy_cmd <arg1> <arg2>');
  });

  it('lists optional args in the usage line, not the command', () => {
    const {command, usage} = buildCommand('dummy_cmd', dummyArgsOptional);
    assert.ok(!command.includes('--'));
    assert.ok(usage.startsWith(`$0 ${command} `));
    assert.ok(usage.includes('[--optArg]'));
  });

  it('keeps every generated command parsable by yargs', () => {
    for (const [name, {args}] of Object.entries(commands)) {
      const {command} = buildCommand(name, args);

      // A `[--flag]` token in the command string is parsed as a positional.
      assert.ok(
        !command.includes('--'),
        `${name}: optional args must not be in the command string`,
      );

      // yargs only allows a variadic positional as the last one.
      const variadic = command.indexOf('..>');
      assert.ok(
        variadic === -1 || variadic === command.length - 3,
        `${name}: a variadic positional must be last`,
      );

      // A required array arg the daemon receives as a string fails validation.
      for (const [argName, arg] of Object.entries(args)) {
        if (arg.required && arg.type === 'array') {
          assert.ok(
            command.includes(`<${argName}..>`),
            `${name}: required array arg ${argName} must be variadic`,
          );
        }
      }
    }
  });
});
