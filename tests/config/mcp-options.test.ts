/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  applyDefaults,
  DEFAULT_FILESYSTEM_ROOT,
  parseCliArgs,
  parseConfigFile,
  validateConflicts,
} from '../../src/config/mcp-options.js';
import {createTempFile} from '../utils.js';

describe('mcp-options steps', () => {
  afterEach(() => sinon.restore());

  describe('parseCliArgs', () => {
    it('returns only explicitly passed flags', () => {
      const args = parseCliArgs('0.0.0', ['node', 'main.js', '--headless']);
      assert.deepStrictEqual(args, {
        headless: true,
      });
    });
  });

  describe('parseConfigFile', () => {
    it('returns only the keys from the file', () => {
      using configFile = createTempFile(
        JSON.stringify({
          headless: true,
          blockedUrlPattern: ['https://a.com/*'],
        }),
        'cd4a.steps.config.json',
      );
      const args = parseConfigFile(configFile.path);
      assert.strictEqual(args.headless, true);
      assert.deepStrictEqual(args.blockedUrlPattern, ['https://a.com/*']);
      assert.strictEqual(args.isolated, undefined);
      assert.strictEqual(args.channel, undefined);
    });

    it('rejects unknown keys', () => {
      using configFile = createTempFile(
        JSON.stringify({notAnOption: true}),
        'cd4a.steps.config.unknown.json',
      );
      assert.throws(
        () => parseConfigFile(configFile.path),
        /Invalid JSON config file: .*notAnOption/,
      );
    });

    it('rejects non-object JSON', () => {
      using configFile = createTempFile(
        JSON.stringify([]),
        'cd4a.steps.config.array.json',
      );
      assert.throws(
        () => parseConfigFile(configFile.path),
        /Invalid JSON config file: Config must be a JSON object/,
      );
    });
  });

  describe('validateConflicts', () => {
    it('accepts a single argument from a conflict group', () => {
      validateConflicts({browserUrl: 'http://localhost:9222'});
    });

    it('ignores false and undefined values', () => {
      validateConflicts({
        browserUrl: 'http://localhost:9222',
        wsEndpoint: undefined,
        categoryExtensions: false,
      });
    });

    it('rejects two arguments from the same group', () => {
      assert.throws(
        () =>
          validateConflicts({
            browserUrl: 'http://localhost:9222',
            channel: 'canary',
          }),
        /Arguments channel and browserUrl are mutually exclusive/,
      );
    });
  });
  describe('applyDefaults', () => {
    it('keeps explicit values and fills in defaults', () => {
      const args = applyDefaults({headless: true}, {});
      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.isolated, false);
      assert.strictEqual(args.channel, 'stable');
      assert.strictEqual(args.categoryExtensions, undefined);
    });

    for (const explicitArgs of [
      {browserUrl: 'http://localhost:9222'},
      {wsEndpoint: 'ws://localhost:9222'},
      {executablePath: '/tmp/chrome'},
    ]) {
      it(`does not default channel with ${Object.keys(explicitArgs)[0]}`, () => {
        assert.strictEqual(applyDefaults(explicitArgs, {}).channel, undefined);
      });
    }

    it('applies viaCli defaults when launching a browser', () => {
      const args = applyDefaults(
        {viaCli: true, filesystemRoot: DEFAULT_FILESYSTEM_ROOT},
        {},
      );
      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.isolated, true);
      assert.strictEqual(args.categoryExtensions, true);
      assert.strictEqual(args.allowUnrestrictedPaths, true);
      assert.strictEqual(args.filesystemRoot, undefined);
    });

    it('does not enable isolated or extensions for viaCli with browserUrl', () => {
      const args = applyDefaults(
        {viaCli: true, browserUrl: 'http://localhost:9222'},
        {},
      );
      assert.strictEqual(args.isolated, false);
      assert.strictEqual(args.categoryExtensions, undefined);
    });

    it('turns off usage statistics in CI', () => {
      sinon.stub(console, 'error');
      const args = applyDefaults({usageStatistics: true}, {CI: 'true'});
      assert.strictEqual(args.usageStatistics, false);
    });
  });
});
