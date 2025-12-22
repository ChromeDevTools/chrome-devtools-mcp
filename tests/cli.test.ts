/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseArguments} from '../src/cli.js';

describe('cli args parsing', () => {
  const defaultArgs = {
    'category-emulation': true,
    categoryEmulation: true,
    'category-performance': true,
    categoryPerformance: true,
    'category-network': true,
    categoryNetwork: true,
    'auto-connect': undefined,
    autoConnect: undefined,
  };

  it('parses with default args', async () => {
    const args = parseArguments('1.0.0', ['node', 'main.js']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
    });
  });

  it('parses with browser url', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--browserUrl',
      'http://localhost:3000',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      'browser-url': 'http://localhost:3000',
      browserUrl: 'http://localhost:3000',
      u: 'http://localhost:3000',
    });
  });

  it('parses with user data dir', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--user-data-dir',
      '/tmp/chrome-profile',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      'user-data-dir': '/tmp/chrome-profile',
      userDataDir: '/tmp/chrome-profile',
    });
  });

  it('parses an empty browser url', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--browserUrl',
      '',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      'browser-url': undefined,
      browserUrl: undefined,
      u: undefined,
      channel: 'stable',
    });
  });

  it('parses with executable path', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--executablePath',
      '/tmp/test 123/chrome',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      'executable-path': '/tmp/test 123/chrome',
      e: '/tmp/test 123/chrome',
      executablePath: '/tmp/test 123/chrome',
    });
  });

  it('parses viewport', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--viewport',
      '888x777',
    ]);
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

  it('parses viewport', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      `--chrome-arg='--no-sandbox'`,
      `--chrome-arg='--disable-setuid-sandbox'`,
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      'chrome-arg': ['--no-sandbox', '--disable-setuid-sandbox'],
      chromeArg: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  it('parses wsEndpoint with ws:// protocol', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--wsEndpoint',
      'ws://127.0.0.1:9222/devtools/browser/abc123',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      'ws-endpoint': 'ws://127.0.0.1:9222/devtools/browser/abc123',
      wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc123',
      w: 'ws://127.0.0.1:9222/devtools/browser/abc123',
    });
  });

  it('parses wsEndpoint with wss:// protocol', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--wsEndpoint',
      'wss://example.com:9222/devtools/browser/abc123',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      'ws-endpoint': 'wss://example.com:9222/devtools/browser/abc123',
      wsEndpoint: 'wss://example.com:9222/devtools/browser/abc123',
      w: 'wss://example.com:9222/devtools/browser/abc123',
    });
  });

  it('parses wsHeaders with valid JSON', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
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
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--no-category-emulation',
    ]);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      'category-emulation': false,
      categoryEmulation: false,
    });
  });
  it('parses auto-connect', async () => {
    const args = parseArguments('1.0.0', ['node', 'main.js', '--auto-connect']);
    assert.deepStrictEqual(args, {
      ...defaultArgs,
      _: [],
      headless: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      'auto-connect': true,
      autoConnect: true,
    });
  });

  it('parses headers with valid JSON', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--headers',
      '{"x-env":"visit_from_mcp","x-mock-user":"mcp"}',
    ]);
    assert.deepStrictEqual(args.headers, {
      'x-env': 'visit_from_mcp',
      'x-mock-user': 'mcp',
    });
  });

  it('throws error for invalid headers JSON', async () => {
    assert.throws(
      () => {
        parseArguments('1.0.0', [
          'node',
          'main.js',
          '--headers',
          '{"invalid": json}',
        ]);
      },
      /Invalid JSON for headers/
    );
  });

  it('throws error for non-object headers', async () => {
    assert.throws(
      () => {
        parseArguments('1.0.0', [
          'node',
          'main.js',
          '--headers',
          '["array", "of", "headers"]',
        ]);
      },
      /Headers must be a JSON object/
    );
  });
});
