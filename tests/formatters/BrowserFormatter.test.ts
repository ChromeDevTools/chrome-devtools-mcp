/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {BrowserFormatter} from '../../src/formatters/BrowserFormatter.js';
import {createMockParsedArguments} from '../mocks.js';

describe('BrowserFormatter', () => {
  describe('launched Chrome', () => {
    it('names the default profile', () => {
      sinon.stub(os, 'homedir').returns('/home/user');
      const formatter = new BrowserFormatter(createMockParsedArguments());

      assert.deepStrictEqual(formatter.toJSON(), {connection: 'launched'});
      assert.strictEqual(
        formatter.toString(),
        'a dedicated Chrome launched by chrome-devtools-mcp',
      );
      const profile = path.join(
        '/home/user',
        '.cache',
        'chrome-devtools-mcp',
        'chrome-profile',
      );
      assert.strictEqual(
        formatter.toInstructions(),
        'This server controls a dedicated Chrome launched by ' +
          `chrome-devtools-mcp (profile: ${profile}).`,
      );
    });

    it('names the --userDataDir profile', () => {
      const formatter = new BrowserFormatter(
        createMockParsedArguments({userDataDir: '/tmp/test-profile'}),
      );

      assert.strictEqual(
        formatter.toInstructions(),
        'This server controls a dedicated Chrome launched by ' +
          'chrome-devtools-mcp (profile: /tmp/test-profile).',
      );
    });

    it('describes the --isolated profile as temporary', () => {
      const formatter = new BrowserFormatter(
        createMockParsedArguments({isolated: true}),
      );

      assert.strictEqual(
        formatter.toInstructions(),
        'This server controls a dedicated Chrome launched by ' +
          'chrome-devtools-mcp (temporary profile, deleted when the browser ' +
          'closes).',
      );
    });
  });

  describe('--autoConnect', () => {
    it("states that the tabs and sessions are the user's", () => {
      const formatter = new BrowserFormatter(
        createMockParsedArguments({autoConnect: true}),
      );

      assert.deepStrictEqual(formatter.toJSON(), {connection: 'autoConnect'});
      assert.strictEqual(
        formatter.toString(),
        "the user's running Chrome, attached via --autoConnect",
      );
      assert.strictEqual(
        formatter.toInstructions(),
        "This server controls the user's running Chrome, attached via " +
          '--autoConnect. Its tabs, cookies and signed-in sessions belong to ' +
          'the user.',
      );
    });

    it('names the --userDataDir profile', () => {
      const formatter = new BrowserFormatter(
        createMockParsedArguments({
          autoConnect: true,
          userDataDir: '/tmp/test-profile',
        }),
      );

      assert.strictEqual(
        formatter.toInstructions(),
        "This server controls the user's running Chrome, attached via " +
          '--autoConnect (profile: /tmp/test-profile). Its tabs, cookies and ' +
          'signed-in sessions belong to the user.',
      );
    });
  });

  describe('--browserUrl and --wsEndpoint', () => {
    it('names the host of --browserUrl', () => {
      const formatter = new BrowserFormatter(
        createMockParsedArguments({browserUrl: 'http://127.0.0.1:9222'}),
      );

      assert.deepStrictEqual(formatter.toJSON(), {
        connection: 'browserUrl',
        host: '127.0.0.1:9222',
      });
      assert.strictEqual(
        formatter.toInstructions(),
        'This server controls a running Chrome at 127.0.0.1:9222, attached ' +
          'via --browserUrl.',
      );
    });

    it('leaves the credentials of --wsEndpoint out', () => {
      const formatter = new BrowserFormatter(
        createMockParsedArguments({
          wsEndpoint:
            'wss://user:password@browser.example:9222' +
            '/devtools/browser/abc?token=SECRET',
        }),
      );

      assert.deepStrictEqual(formatter.toJSON(), {
        connection: 'wsEndpoint',
        host: 'browser.example:9222',
      });
      assert.strictEqual(
        formatter.toString(),
        'a running Chrome at browser.example:9222, attached via --wsEndpoint',
      );
    });

    it('prefers --browserUrl over --autoConnect like BrowserManager', () => {
      const formatter = new BrowserFormatter(
        createMockParsedArguments({
          autoConnect: true,
          browserUrl: 'http://127.0.0.1:9222',
        }),
      );

      assert.deepStrictEqual(formatter.toJSON(), {
        connection: 'browserUrl',
        host: '127.0.0.1:9222',
      });
    });

    it('omits the host of an endpoint that is not a URL', () => {
      // createMcpServer() takes ParsedArguments without validating them.
      const formatter = new BrowserFormatter(
        createMockParsedArguments({browserUrl: 'not a url'}),
      );

      assert.deepStrictEqual(formatter.toJSON(), {connection: 'browserUrl'});
      assert.strictEqual(
        formatter.toString(),
        'a running Chrome, attached via --browserUrl',
      );
    });
  });
});
