/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {ConfigLocator} from '../../src/config/ConfigLocator.js';
import {ConfigParser} from '../../src/config/ConfigParser.js';
import {DEFAULT_FILESYSTEM_ROOT} from '../../src/config/mcp-options.js';
import {createTempFile} from '../utils.js';

describe('mcp-options steps', () => {
  afterEach(() => sinon.restore());

  const parser = new ConfigParser('0.0.0');

  describe('constructor', () => {
    it('initializes configLocator', () => {
      const testParser = new ConfigParser('0.0.0');
      assert.ok(testParser.configLocator instanceof ConfigLocator);
    });
  });

  describe('parseCliArgs', () => {
    it('returns only explicitly passed flags', () => {
      const args = new ConfigParser('0.0.0', [
        'node',
        'main.js',
        '--headless',
      ]).parseCliArgs();
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
      const args = parser.parseConfigFile(configFile.path);
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
        () => parser.parseConfigFile(configFile.path),
        /Invalid JSON config file: .*notAnOption/,
      );
    });

    it('rejects non-object JSON', () => {
      using configFile = createTempFile(
        JSON.stringify([]),
        'cd4a.steps.config.array.json',
      );
      assert.throws(
        () => parser.parseConfigFile(configFile.path),
        /Invalid JSON config file: Config must be a JSON object/,
      );
    });
  });

  describe('validateConflicts', () => {
    it('accepts a single argument from a conflict group', () => {
      parser.validateConflicts({browserUrl: 'http://localhost:9222'});
    });

    it('ignores false and undefined values', () => {
      parser.validateConflicts({
        browserUrl: 'http://localhost:9222',
        wsEndpoint: undefined,
        categoryExtensions: false,
      });
    });

    it('rejects two arguments from the same group', () => {
      assert.throws(
        () =>
          parser.validateConflicts({
            browserUrl: 'http://localhost:9222',
            channel: 'canary',
          }),
        /Arguments channel and browserUrl are mutually exclusive/,
      );
    });

    describe('validateImplications', () => {
      it('accepts when implying key is not set', () => {
        parser.validateImplications({wsEndpoint: 'ws://localhost:9222'});
      });

      it('accepts when both implying and implied keys are set', () => {
        parser.validateImplications({
          wsHeaders: {Auth: 'token'},
          wsEndpoint: 'ws://localhost:9222',
        });
      });

      it('rejects when implying key is set but implied key is missing', () => {
        assert.throws(
          () => parser.validateImplications({wsHeaders: {Auth: 'token'}}),
          /Implications failed:\n {2}wsHeaders -> wsEndpoint/,
        );
      });

      it('rejects when implying key is set but implied key is negated', () => {
        assert.throws(
          () =>
            parser.validateImplications({
              experimentalFfmpegPath: '/bin/ffmpeg',
              experimentalScreencast: false,
            }),
          /Implications failed:\n {2}experimentalFfmpegPath -> experimentalScreencast/,
        );
      });
    });
  });
  describe('applyDefaults', () => {
    it('keeps explicit values and fills in defaults', () => {
      const args = new ConfigParser('0.0.0', [], {}).applyDefaults({
        headless: true,
      });
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
        assert.strictEqual(
          new ConfigParser('0.0.0', [], {}).applyDefaults(explicitArgs).channel,
          undefined,
        );
      });
    }

    it('applies viaCli defaults when launching a browser', () => {
      const args = new ConfigParser('0.0.0', [], {}).applyDefaults({
        viaCli: true,
        filesystemRoot: DEFAULT_FILESYSTEM_ROOT,
      });
      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.isolated, true);
      assert.strictEqual(args.categoryExtensions, true);
      assert.strictEqual(args.allowUnrestrictedPaths, true);
      assert.strictEqual(args.filesystemRoot, undefined);
    });

    it('does not enable isolated or extensions for viaCli with browserUrl', () => {
      const args = new ConfigParser('0.0.0', [], {}).applyDefaults({
        viaCli: true,
        browserUrl: 'http://localhost:9222',
      });
      assert.strictEqual(args.isolated, false);
      assert.strictEqual(args.categoryExtensions, undefined);
    });

    it('turns off usage statistics in CI', () => {
      sinon.stub(console, 'error');
      const args = new ConfigParser('0.0.0', [], {
        CI: 'true',
      }).applyDefaults({
        usageStatistics: true,
      });
      assert.strictEqual(args.usageStatistics, false);
    });
  });

  describe('config discovery', () => {
    it('does not discover a config file without a locator', () => {
      const parser = new ConfigParser('0.0.0', ['node', 'main.js'], {}, false);
      sinon.stub(parser.configLocator, 'locate').returns(undefined);
      assert.strictEqual(parser.parse().config, undefined);
    });

    it('uses the config file found by the locator', () => {
      using configFile = createTempFile(
        JSON.stringify({headless: true}),
        'cd4a.config.json',
      );
      const parser = new ConfigParser('0.0.0', ['node', 'main.js'], {}, false);
      const locateStub = sinon
        .stub(parser.configLocator, 'locate')
        .returns(configFile.path);

      const args = parser.parse();

      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.config, configFile.path);
      sinon.assert.calledOnce(locateStub);
    });

    it('prefers --config over a discovered config file', () => {
      using configFile = createTempFile(
        JSON.stringify({headless: true}),
        'cd4a.explicit.config.json',
      );
      const parser = new ConfigParser(
        '0.0.0',
        ['node', 'main.js', '--config', configFile.path],
        {},
        false,
      );
      const locateStub = sinon.stub(parser.configLocator, 'locate');

      assert.strictEqual(parser.parse().headless, true);
      sinon.assert.notCalled(locateStub);
    });
  });

  describe('reload', () => {
    function createParser(configPath: string, argv: string[] = []) {
      const parser = new ConfigParser(
        '0.0.0',
        ['node', 'main.js', ...argv],
        {},
        false,
      );
      const locateStub = sinon
        .stub(parser.configLocator, 'locate')
        .returns(configPath);
      return {parser, locateStub};
    }

    it('re-reads the config file without discovering it again', () => {
      using configFile = createTempFile(
        JSON.stringify({memoryDebugging: false}),
        'cd4a.config.json',
      );
      const {parser, locateStub} = createParser(configFile.path);
      assert.strictEqual(parser.parse().memoryDebugging, false);

      fs.writeFileSync(
        configFile.path,
        JSON.stringify({memoryDebugging: true}),
      );

      assert.strictEqual(parser.reload().memoryDebugging, true);
      sinon.assert.calledOnce(locateStub);
    });

    it('keeps CLI arguments over the config file', () => {
      using configFile = createTempFile(
        JSON.stringify({headless: false}),
        'cd4a.config.json',
      );
      const {parser} = createParser(configFile.path, ['--headless']);
      parser.parse();

      fs.writeFileSync(
        configFile.path,
        JSON.stringify({headless: false, memoryDebugging: true}),
      );
      const args = parser.reload();

      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.memoryDebugging, true);
    });

    it('throws on an invalid config file', () => {
      using configFile = createTempFile('{}', 'cd4a.config.json');
      const {parser} = createParser(configFile.path);
      parser.parse();

      fs.writeFileSync(configFile.path, '{');

      assert.throws(() => parser.reload(), /Invalid JSON config file/);
    });
  });
});
