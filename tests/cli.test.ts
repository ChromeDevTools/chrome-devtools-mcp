/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseArguments} from '../src/cli.js';

describe.only('cli args parsing', () => {
  const defaultCategories = [
    'core',
    'input',
    'emulation',
    'performance',
    'network',
    'debugging',
  ];
  it('parses with default args', async () => {
    const args = parseArguments('1.0.0', ['node', 'main.js']);
    assert.deepStrictEqual(args, {
      _: [],
      headless: false,
      isolated: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      categories: defaultCategories,
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
      _: [],
      headless: false,
      isolated: false,
      $0: 'npx chrome-devtools-mcp@latest',
      'browser-url': 'http://localhost:3000',
      browserUrl: 'http://localhost:3000',
      u: 'http://localhost:3000',
      categories: defaultCategories,
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
      _: [],
      headless: false,
      isolated: false,
      $0: 'npx chrome-devtools-mcp@latest',
      'browser-url': undefined,
      browserUrl: undefined,
      u: undefined,
      channel: 'stable',
      categories: defaultCategories,
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
      _: [],
      headless: false,
      isolated: false,
      $0: 'npx chrome-devtools-mcp@latest',
      'executable-path': '/tmp/test 123/chrome',
      e: '/tmp/test 123/chrome',
      executablePath: '/tmp/test 123/chrome',
      categories: defaultCategories,
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
      _: [],
      headless: false,
      isolated: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      viewport: {
        width: 888,
        height: 777,
      },
      categories: defaultCategories,
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
      _: [],
      headless: false,
      isolated: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      'chrome-arg': ['--no-sandbox', '--disable-setuid-sandbox'],
      chromeArg: ['--no-sandbox', '--disable-setuid-sandbox'],
      categories: defaultCategories,
    });
  });

  it('parses custom categories', async () => {
    const args = parseArguments('1.0.0', [
      'node',
      'main.js',
      '--categories',
      'core,input',
    ]);
    assert.deepStrictEqual(args, {
      _: [],
      headless: false,
      isolated: false,
      $0: 'npx chrome-devtools-mcp@latest',
      channel: 'stable',
      categories: ['core', 'input'],
    });
  });
});
