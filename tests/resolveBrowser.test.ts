/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseArguments} from '../src/bin/chrome-devtools-mcp-cli-options.js';
import {resolveBrowser} from '../src/index.js';
import type {Browser} from '../src/third_party/index.js';

describe('resolveBrowser', () => {
  for (const [label, args] of [
    [
      'browserUrl',
      ['--browser-url', 'http://127.0.0.1:9222', '--category-extensions'],
    ],
    [
      'wsEndpoint',
      [
        '--ws-endpoint',
        'ws://127.0.0.1:9222/devtools/browser/test',
        '--category-extensions',
      ],
    ],
    [
      'autoConnect',
      [
        '--auto-connect',
        '--user-data-dir',
        '/tmp/profile',
        '--category-extensions',
      ],
    ],
  ] as const) {
    it(`passes enableExtensions on the connected-browser path via ${label}`, async () => {
      const serverArgs = parseArguments('0.0.0', [
        'node',
        'chrome-devtools-mcp',
        ...args,
      ]);
      const browser = {} as Browser;
      const connectedCalls: Array<Record<string, unknown>> = [];
      let launchedCallCount = 0;

      const resolvedBrowser = await resolveBrowser(
        serverArgs,
        {},
        {
          ensureBrowserConnected: async options => {
            connectedCalls.push(options as Record<string, unknown>);
            return browser;
          },
          ensureBrowserLaunched: async () => {
            launchedCallCount += 1;
            return browser;
          },
        },
      );

      assert.strictEqual(resolvedBrowser, browser);
      assert.strictEqual(launchedCallCount, 0);
      assert.strictEqual(connectedCalls.length, 1);
      assert.strictEqual(connectedCalls[0]?.['enableExtensions'], true);
    });
  }
});
