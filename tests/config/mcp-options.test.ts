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
import {ServerConfig} from '../../src/config/ServerConfig.js';
import {createTempFile} from '../utils.js';

describe('mcp-options steps', () => {
  afterEach(() => sinon.restore());

  const parser = new ConfigParser('0.0.0');

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
      ServerConfig.validateConflicts({browserUrl: 'http://localhost:9222'});
    });

    it('ignores false and undefined values', () => {
      ServerConfig.validateConflicts({
        browserUrl: 'http://localhost:9222',
        wsEndpoint: undefined,
        categoryExtensions: false,
      });
    });

    it('rejects two arguments from the same group', () => {
      assert.throws(
        () =>
          ServerConfig.validateConflicts({
            browserUrl: 'http://localhost:9222',
            channel: 'canary',
          }),
        /Arguments channel and browserUrl are mutually exclusive/,
      );
    });

    describe('validateImplications', () => {
      it('accepts when implying key is not set', () => {
        ServerConfig.validateImplications({wsEndpoint: 'ws://localhost:9222'});
      });

      it('accepts when both implying and implied keys are set', () => {
        ServerConfig.validateImplications({
          wsHeaders: {Auth: 'token'},
          wsEndpoint: 'ws://localhost:9222',
        });
      });

      it('rejects when implying key is set but implied key is missing', () => {
        assert.throws(
          () => ServerConfig.validateImplications({wsHeaders: {Auth: 'token'}}),
          /Implications failed:\n {2}wsHeaders -> wsEndpoint/,
        );
      });

      it('rejects when implying key is set but implied key is negated', () => {
        assert.throws(
          () =>
            ServerConfig.validateImplications({
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
      const args = ServerConfig.applyDefaults({headless: true}, {env: {}});
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
          ServerConfig.applyDefaults(explicitArgs, {env: {}}).channel,
          undefined,
        );
      });
    }

    it('applies viaCli defaults when launching a browser', () => {
      const args = ServerConfig.applyDefaults(
        {
          viaCli: true,
          filesystemRoot: DEFAULT_FILESYSTEM_ROOT,
        },
        {env: {}},
      );
      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.isolated, true);
      assert.strictEqual(args.categoryExtensions, true);
      assert.strictEqual(args.allowUnrestrictedPaths, true);
      assert.strictEqual(args.filesystemRoot, undefined);
    });

    it('keeps the default filesystem root for viaCli with explicit allowUnrestrictedPaths=false', () => {
      const args = ServerConfig.applyDefaults(
        {
          viaCli: true,
          allowUnrestrictedPaths: false,
        },
        {env: {}},
      );
      assert.strictEqual(args.allowUnrestrictedPaths, false);
      assert.deepStrictEqual(args.filesystemRoot, DEFAULT_FILESYSTEM_ROOT);
    });

    it('does not enable isolated or extensions for viaCli with browserUrl', () => {
      const args = ServerConfig.applyDefaults(
        {
          viaCli: true,
          browserUrl: 'http://localhost:9222',
        },
        {env: {}},
      );
      assert.strictEqual(args.isolated, false);
      assert.strictEqual(args.categoryExtensions, undefined);
    });

    it('turns off usage statistics in CI', () => {
      sinon.stub(console, 'error');
      const args = ServerConfig.applyDefaults(
        {usageStatistics: true},
        {env: {CI: 'true'}},
      );
      assert.strictEqual(args.usageStatistics, false);
    });

    it('prints the usage statistics notice once across parse and reload', () => {
      const consoleError = sinon.stub(console, 'error');
      const locator = new ConfigLocator();
      sinon.stub(locator, 'locate').returns(undefined);
      const ciParser = new ConfigParser(
        '0.0.0',
        ['node', 'main.js'],
        {CI: 'true'},
        false,
        locator,
      );

      ciParser.parseConfig();
      const reloaded = ciParser.reloadConfig();

      assert.strictEqual(reloaded.resolved.usageStatistics, false);
      sinon.assert.calledOnce(consoleError);
    });
  });

  describe('config discovery', () => {
    it('does not discover a config file when locator returns undefined', () => {
      const locator = new ConfigLocator();
      sinon.stub(locator, 'locate').returns(undefined);
      const parser = new ConfigParser(
        '0.0.0',
        ['node', 'main.js'],
        {},
        false,
        locator,
      );
      assert.strictEqual(parser.parse().config, undefined);
      assert.strictEqual(parser.configPath, undefined);
    });

    it('uses the config file found by the locator', () => {
      using configFile = createTempFile(
        JSON.stringify({headless: true}),
        'cd4a.config.json',
      );
      const parser = new ConfigParser('0.0.0', ['node', 'main.js'], {}, false);
      sinon.stub(parser.configLocator, 'locate').returns(configFile.path);

      const args = parser.parse();

      assert.strictEqual(args.headless, true);
      assert.strictEqual(args.config, configFile.path);
      assert.strictEqual(parser.configPath, configFile.path);
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

  describe('mergeReloadable', () => {
    function parseConfig(argv: string[] = []) {
      const locator = new ConfigLocator();
      sinon.stub(locator, 'locate').returns(undefined);
      return new ConfigParser(
        '0.0.0',
        ['node', 'main.js', ...argv],
        {},
        false,
        locator,
      ).parseConfig();
    }

    it('applies reloadable options', () => {
      const merged = parseConfig().mergeReloadable(
        parseConfig([
          '--memoryDebugging',
          '--no-category-network',
          '--no-file-navigations',
          '--slim',
        ]),
      ).resolved;

      assert.strictEqual(merged.memoryDebugging, true);
      assert.strictEqual(merged.categoryNetwork, false);
      assert.strictEqual(merged.fileNavigations, false);
      assert.strictEqual(merged.slim, true);
    });

    it('keeps restart-required options', () => {
      const merged = parseConfig().mergeReloadable(
        parseConfig([
          '--categoryExtensions',
          '--blockedUrlPattern=https://example.com/*',
          '--experimentalDevtools',
        ]),
      ).resolved;

      assert.strictEqual(merged.categoryExtensions, undefined);
      assert.strictEqual(merged.blockedUrlPattern, undefined);
      assert.strictEqual(merged.experimentalDevtools, false);
    });

    it('keeps options derived from restart-required options', () => {
      const previous = parseConfig(['--viaCli']);
      const next = parseConfig([
        '--viaCli',
        '--browserUrl=http://127.0.0.1:9222',
      ]);

      const merged = previous.mergeReloadable(next).resolved;

      assert.strictEqual(merged.categoryExtensions, true);
      assert.strictEqual(merged.browserUrl, undefined);
    });

    it('preserves CLI precedence over reloaded config file values', () => {
      using configFile = createTempFile(
        JSON.stringify({memoryDebugging: false, performanceCrux: true}),
        'cd4a.config.json',
      );
      const locator = new ConfigLocator();
      sinon.stub(locator, 'locate').returns(configFile.path);
      const parser = new ConfigParser(
        '0.0.0',
        ['node', 'main.js', '--memoryDebugging'],
        {},
        false,
        locator,
      );
      const initial = parser.parseConfig();

      fs.writeFileSync(
        configFile.path,
        JSON.stringify({memoryDebugging: false, performanceCrux: false}),
      );
      const reloaded = parser.reloadConfig();
      const merged = initial.mergeReloadable(reloaded).resolved;

      assert.strictEqual(merged.memoryDebugging, true);
      assert.strictEqual(merged.performanceCrux, false);
    });

    it('rejects reloadable options that conflict with startup restart-required options', () => {
      const previous = parseConfig(['--browserUrl=http://127.0.0.1:9222']);
      const next = parseConfig(['--categoryPwa']);

      assert.throws(
        () => previous.mergeReloadable(next),
        /Arguments categoryPwa and browserUrl are mutually exclusive/,
      );
    });

    it('does not conflict with default options', () => {
      const merged = parseConfig().mergeReloadable(
        parseConfig(['--allow-unrestricted-paths']),
      ).resolved;

      assert.strictEqual(merged.allowUnrestrictedPaths, true);
      assert.strictEqual(merged.filesystemRoot, DEFAULT_FILESYSTEM_ROOT);
    });
  });
});
