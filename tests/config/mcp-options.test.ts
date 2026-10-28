/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {ConfigLocator} from '../../src/config/ConfigLocator.js';
import {ConfigParser} from '../../src/config/ConfigParser.js';
import {createTempFile} from '../utils.js';

describe('mcp-options steps', () => {
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

    it('accepts a config file with a UTF-8 BOM', () => {
      using configFile = createTempFile(
        `\uFEFF${JSON.stringify({headless: true})}`,
        'cd4a.steps.config.bom.json',
      );
      const args = parser.parseConfigFile(configFile.path);
      assert.strictEqual(args.headless, true);
    });

    it('accepts wsHeaders as a JSON object and validates string values', () => {
      using validFile = createTempFile(
        JSON.stringify({
          wsEndpoint: 'ws://localhost:9222',
          wsHeaders: {Authorization: 'Bearer token'},
        }),
        'cd4a.wsheaders.valid.json',
      );
      const args = parser.parseConfigFile(validFile.path);
      assert.deepStrictEqual(args.wsHeaders, {Authorization: 'Bearer token'});

      using invalidFile = createTempFile(
        JSON.stringify({
          wsEndpoint: 'ws://localhost:9222',
          wsHeaders: {Authorization: 123},
        }),
        'cd4a.wsheaders.invalid.json',
      );
      assert.throws(
        () => parser.parseConfigFile(invalidFile.path),
        /Header "Authorization" must have a string value/,
      );
    });

    it('rejects config, help, and version keys inside a config file', () => {
      for (const forbiddenKey of ['config', 'help', 'version']) {
        using configFile = createTempFile(
          JSON.stringify({[forbiddenKey]: true}),
          `cd4a.forbidden.${forbiddenKey}.json`,
        );
        assert.throws(
          () => parser.parseConfigFile(configFile.path),
          new RegExp(`Invalid JSON config file: .*${forbiddenKey}`),
        );
      }
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
});
