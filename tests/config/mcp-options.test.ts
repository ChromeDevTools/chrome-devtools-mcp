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
import {
  HTTP_ONLY_OPTION_KEYS,
  isLoopbackHost,
} from '../../src/config/http-options.js';
import {getCliOptions} from '../../src/config/mcp-options.js';
import {redactDaemonArgsForLogging} from '../../src/utils/logger.js';
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

    it('accepts --transport http with valid --host and --port bounds', () => {
      const zeroPort = new ConfigParser('0.0.0', [
        'node',
        'main.js',
        '--transport',
        'http',
        '--host',
        ' localhost ',
        '--port',
        '0',
      ]).parseCliArgs();
      assert.deepStrictEqual(zeroPort, {
        transport: 'http',
        host: 'localhost',
        port: 0,
      });

      const maxPort = new ConfigParser('0.0.0', [
        'node',
        'main.js',
        '--transport',
        'http',
        '--port',
        '65535',
      ]).parseCliArgs();
      assert.strictEqual(maxPort.port, 65535);
    });

    for (const invalidPort of ['-1', '65536', '3.5']) {
      it(`rejects invalid --port ${invalidPort}`, () => {
        assert.throws(
          () =>
            new ConfigParser('0.0.0', [
              'node',
              'main.js',
              '--transport',
              'http',
              `--port=${invalidPort}`,
            ]).parseCliArgs(),
          /Invalid port .*Expected an integer between 0 and 65535/,
        );
      });
    }

    it('rejects empty or whitespace-only --host', () => {
      assert.throws(
        () =>
          new ConfigParser('0.0.0', [
            'node',
            'main.js',
            '--transport',
            'http',
            '--host',
            '   ',
          ]).parseCliArgs(),
        /Invalid host: expected a non-empty hostname or IP address/,
      );
    });

    for (const argv of [
      ['--httpToken', 'secret'],
      ['--httpToken=secret'],
      ['--http-token', 'secret'],
      ['--http-token=secret'],
    ]) {
      it(`rejects ${argv.join(' ')} on the command line`, () => {
        assert.throws(
          () =>
            new ConfigParser('0.0.0', [
              'node',
              'main.js',
              ...argv,
            ]).parseCliArgs(),
          /CHROME_DEVTOOLS_MCP_HTTP_TOKEN.*"httpToken"/,
        );
      });
    }
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

    it('accepts httpToken in a config file and rejects empty values', () => {
      using validFile = createTempFile(
        JSON.stringify({
          transport: 'http',
          httpToken: 'file-secret',
        }),
        'cd4a.http-token.valid.json',
      );
      const args = parser.parseConfigFile(validFile.path);
      assert.strictEqual(args.transport, 'http');
      assert.strictEqual(args.httpToken, 'file-secret');

      using emptyFile = createTempFile(
        JSON.stringify({
          transport: 'http',
          httpToken: '   ',
        }),
        'cd4a.http-token.empty.json',
      );
      assert.throws(
        () => parser.parseConfigFile(emptyFile.path),
        /Invalid httpToken: expected a non-empty Bearer token/,
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

  describe('isLoopbackHost', () => {
    for (const host of [
      '127.0.0.1',
      '127.1.2.3',
      'localhost',
      'LOCALHOST.',
      '::1',
      '[::1]',
      '0:0:0:0:0:0:0:1',
      '::ffff:127.0.0.1',
      '[::ffff:127.0.0.1]',
      '::ffff:7f00:1',
    ]) {
      it(`recognizes ${JSON.stringify(host)} as loopback`, () => {
        assert.strictEqual(isLoopbackHost(host), true);
      });
    }

    for (const host of [
      '0.0.0.0',
      '::',
      '[::]',
      '192.168.1.1',
      '::ffff:192.168.1.1',
      'example.com',
      '',
      '   ',
      '[localhost]',
      '[127.0.0.1]',
      '127.0.0.999',
    ]) {
      it(`rejects ${JSON.stringify(host)} as non-loopback`, () => {
        assert.strictEqual(isLoopbackHost(host), false);
      });
    }
  });

  describe('getCliOptions', () => {
    it('omits transport and all HTTP-only options', () => {
      const cliOptions = getCliOptions();
      assert.strictEqual('transport' in cliOptions, false);
      for (const key of HTTP_ONLY_OPTION_KEYS) {
        assert.strictEqual(key in cliOptions, false);
      }
    });
  });

  describe('redactDaemonArgsForLogging', () => {
    it('redacts --httpToken and --http-token arguments', () => {
      const args = [
        '--httpToken',
        'SECRET_1',
        '--http-token=SECRET_2',
        '--httpToken=SECRET_3',
        '--http-token',
        'SECRET_4',
      ];
      const redacted = redactDaemonArgsForLogging(args);
      assert.deepStrictEqual(redacted, [
        '--httpToken',
        '[REDACTED]',
        '--http-token=[REDACTED]',
        '--httpToken=[REDACTED]',
        '--http-token',
        '[REDACTED]',
      ]);
      assert.strictEqual(args[1], 'SECRET_1');
    });
  });
});
