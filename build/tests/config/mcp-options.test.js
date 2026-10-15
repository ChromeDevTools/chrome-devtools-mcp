/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import assert from 'node:assert';
import fs from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import sinon from 'sinon';
import { ConfigLocator } from '../../src/config/ConfigLocator.js';
import { ConfigParser } from '../../src/config/ConfigParser.js';
import { DEFAULT_FILESYSTEM_ROOT } from '../../src/config/mcp-options.js';
import { createTempFile } from '../utils.js';
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
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_1, createTempFile(JSON.stringify({
                    headless: true,
                    blockedUrlPattern: ['https://a.com/*'],
                }), 'cd4a.steps.config.json'), false);
                const args = parser.parseConfigFile(configFile.path);
                assert.strictEqual(args.headless, true);
                assert.deepStrictEqual(args.blockedUrlPattern, ['https://a.com/*']);
                assert.strictEqual(args.isolated, undefined);
                assert.strictEqual(args.channel, undefined);
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        });
        it('rejects unknown keys', () => {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_2, createTempFile(JSON.stringify({ notAnOption: true }), 'cd4a.steps.config.unknown.json'), false);
                assert.throws(() => parser.parseConfigFile(configFile.path), /Invalid JSON config file: .*notAnOption/);
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        });
        it('rejects non-object JSON', () => {
            const env_3 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_3, createTempFile(JSON.stringify([]), 'cd4a.steps.config.array.json'), false);
                assert.throws(() => parser.parseConfigFile(configFile.path), /Invalid JSON config file: Config must be a JSON object/);
            }
            catch (e_3) {
                env_3.error = e_3;
                env_3.hasError = true;
            }
            finally {
                __disposeResources(env_3);
            }
        });
    });
    describe('validateConflicts', () => {
        it('accepts a single argument from a conflict group', () => {
            ConfigParser.validateConflicts({ browserUrl: 'http://localhost:9222' });
        });
        it('ignores false and undefined values', () => {
            ConfigParser.validateConflicts({
                browserUrl: 'http://localhost:9222',
                wsEndpoint: undefined,
                categoryExtensions: false,
            });
        });
        it('rejects two arguments from the same group', () => {
            assert.throws(() => ConfigParser.validateConflicts({
                browserUrl: 'http://localhost:9222',
                channel: 'canary',
            }), /Arguments channel and browserUrl are mutually exclusive/);
        });
        describe('validateImplications', () => {
            it('accepts when implying key is not set', () => {
                ConfigParser.validateImplications({ wsEndpoint: 'ws://localhost:9222' });
            });
            it('accepts when both implying and implied keys are set', () => {
                ConfigParser.validateImplications({
                    wsHeaders: { Auth: 'token' },
                    wsEndpoint: 'ws://localhost:9222',
                });
            });
            it('rejects when implying key is set but implied key is missing', () => {
                assert.throws(() => ConfigParser.validateImplications({ wsHeaders: { Auth: 'token' } }), /Implications failed:\n {2}wsHeaders -> wsEndpoint/);
            });
            it('rejects when implying key is set but implied key is negated', () => {
                assert.throws(() => ConfigParser.validateImplications({
                    experimentalFfmpegPath: '/bin/ffmpeg',
                    experimentalScreencast: false,
                }), /Implications failed:\n {2}experimentalFfmpegPath -> experimentalScreencast/);
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
            { browserUrl: 'http://localhost:9222' },
            { wsEndpoint: 'ws://localhost:9222' },
            { executablePath: '/tmp/chrome' },
        ]) {
            it(`does not default channel with ${Object.keys(explicitArgs)[0]}`, () => {
                assert.strictEqual(new ConfigParser('0.0.0', [], {}).applyDefaults(explicitArgs).channel, undefined);
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
        it('keeps the default filesystem root for viaCli with explicit allowUnrestrictedPaths=false', () => {
            const args = new ConfigParser('0.0.0', [], {}).applyDefaults({
                viaCli: true,
                allowUnrestrictedPaths: false,
            });
            assert.strictEqual(args.allowUnrestrictedPaths, false);
            assert.deepStrictEqual(args.filesystemRoot, DEFAULT_FILESYSTEM_ROOT);
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
        it('prints the usage statistics notice once', () => {
            const consoleError = sinon.stub(console, 'error');
            const parser = new ConfigParser('0.0.0', [], { CI: 'true' });
            parser.applyDefaults({});
            const args = parser.applyDefaults({});
            assert.strictEqual(args.usageStatistics, false);
            sinon.assert.calledOnce(consoleError);
        });
    });
    describe('config discovery', () => {
        it('does not discover a config file when locator returns undefined', () => {
            const locator = new ConfigLocator();
            sinon.stub(locator, 'locate').returns(undefined);
            const parser = new ConfigParser('0.0.0', ['node', 'main.js'], {}, false, locator);
            assert.strictEqual(parser.parse().config, undefined);
            assert.strictEqual(parser.configPath, undefined);
        });
        it('uses the config file found by the locator', () => {
            const env_4 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_4, createTempFile(JSON.stringify({ headless: true }), 'cd4a.config.json'), false);
                const parser = new ConfigParser('0.0.0', ['node', 'main.js'], {}, false);
                sinon.stub(parser.configLocator, 'locate').returns(configFile.path);
                const args = parser.parse();
                assert.strictEqual(args.headless, true);
                assert.strictEqual(args.config, configFile.path);
                assert.strictEqual(parser.configPath, configFile.path);
            }
            catch (e_4) {
                env_4.error = e_4;
                env_4.hasError = true;
            }
            finally {
                __disposeResources(env_4);
            }
        });
        it('prefers --config over a discovered config file', () => {
            const env_5 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_5, createTempFile(JSON.stringify({ headless: true }), 'cd4a.explicit.config.json'), false);
                const parser = new ConfigParser('0.0.0', ['node', 'main.js', '--config', configFile.path], {}, false);
                const locateStub = sinon.stub(parser.configLocator, 'locate');
                assert.strictEqual(parser.parse().headless, true);
                sinon.assert.notCalled(locateStub);
            }
            catch (e_5) {
                env_5.error = e_5;
                env_5.hasError = true;
            }
            finally {
                __disposeResources(env_5);
            }
        });
    });
    describe('reload', () => {
        function createParser(configPath, argv = []) {
            const parser = new ConfigParser('0.0.0', ['node', 'main.js', ...argv], {}, false);
            const locateStub = sinon
                .stub(parser.configLocator, 'locate')
                .returns(configPath);
            return { parser, locateStub };
        }
        it('re-reads the config file without discovering it again', () => {
            const env_6 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_6, createTempFile(JSON.stringify({ memoryDebugging: false }), 'cd4a.config.json'), false);
                const { parser, locateStub } = createParser(configFile.path);
                assert.strictEqual(parser.parse().memoryDebugging, false);
                fs.writeFileSync(configFile.path, JSON.stringify({ memoryDebugging: true }));
                assert.strictEqual(parser.reload().memoryDebugging, true);
                sinon.assert.calledOnce(locateStub);
            }
            catch (e_6) {
                env_6.error = e_6;
                env_6.hasError = true;
            }
            finally {
                __disposeResources(env_6);
            }
        });
        it('keeps CLI arguments over the config file', () => {
            const env_7 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_7, createTempFile(JSON.stringify({ headless: false }), 'cd4a.config.json'), false);
                const { parser } = createParser(configFile.path, ['--headless']);
                parser.parse();
                fs.writeFileSync(configFile.path, JSON.stringify({ headless: false, memoryDebugging: true }));
                const args = parser.reload();
                assert.strictEqual(args.headless, true);
                assert.strictEqual(args.memoryDebugging, true);
            }
            catch (e_7) {
                env_7.error = e_7;
                env_7.hasError = true;
            }
            finally {
                __disposeResources(env_7);
            }
        });
        it('throws on an invalid config file', () => {
            const env_8 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_8, createTempFile('{}', 'cd4a.config.json'), false);
                const { parser } = createParser(configFile.path);
                parser.parse();
                fs.writeFileSync(configFile.path, '{');
                assert.throws(() => parser.reload(), /Invalid JSON config file/);
            }
            catch (e_8) {
                env_8.error = e_8;
                env_8.hasError = true;
            }
            finally {
                __disposeResources(env_8);
            }
        });
    });
    describe('mergeReloadableOptions', () => {
        function parseArgs(argv = []) {
            const locator = new ConfigLocator();
            sinon.stub(locator, 'locate').returns(undefined);
            return new ConfigParser('0.0.0', ['node', 'main.js', ...argv], {}, false, locator).parse();
        }
        it('applies reloadable options', () => {
            const merged = ConfigParser.mergeReloadableOptions(parseArgs(), parseArgs([
                '--memoryDebugging',
                '--no-category-network',
                '--no-file-navigations',
                '--slim',
            ]));
            assert.strictEqual(merged.memoryDebugging, true);
            assert.strictEqual(merged.categoryNetwork, false);
            assert.strictEqual(merged.fileNavigations, false);
            assert.strictEqual(merged.slim, true);
        });
        it('keeps restart-required options', () => {
            const merged = ConfigParser.mergeReloadableOptions(parseArgs(), parseArgs([
                '--categoryExtensions',
                '--blockedUrlPattern=https://example.com/*',
                '--experimentalDevtools',
            ]));
            assert.strictEqual(merged.categoryExtensions, undefined);
            assert.strictEqual(merged.blockedUrlPattern, undefined);
            assert.strictEqual(merged.experimentalDevtools, false);
        });
        it('keeps options derived from restart-required options', () => {
            const previous = parseArgs(['--viaCli']);
            const next = parseArgs([
                '--viaCli',
                '--browserUrl=http://127.0.0.1:9222',
            ]);
            const merged = ConfigParser.mergeReloadableOptions(previous, next);
            assert.strictEqual(merged.categoryExtensions, true);
            assert.strictEqual(merged.browserUrl, undefined);
        });
        it('rejects reloadable options that conflict with startup restart-required options', () => {
            const previous = parseArgs(['--browserUrl=http://127.0.0.1:9222']);
            const next = parseArgs(['--categoryPwa']);
            assert.throws(() => ConfigParser.mergeReloadableOptions(previous, next), /Arguments categoryPwa and browserUrl are mutually exclusive/);
        });
        it('does not conflict with default options', () => {
            const merged = ConfigParser.mergeReloadableOptions(parseArgs(), parseArgs(['--allow-unrestricted-paths']));
            assert.strictEqual(merged.allowUnrestrictedPaths, true);
            assert.strictEqual(merged.filesystemRoot, DEFAULT_FILESYSTEM_ROOT);
        });
    });
});
//# sourceMappingURL=mcp-options.test.js.map