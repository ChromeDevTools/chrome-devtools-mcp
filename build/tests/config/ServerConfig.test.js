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
import { describe, it } from 'node:test';
import sinon from 'sinon';
import { ConfigLocator } from '../../src/config/ConfigLocator.js';
import { ConfigParser } from '../../src/config/ConfigParser.js';
import { DEFAULT_FILESYSTEM_ROOT } from '../../src/config/mcp-options.js';
import { ServerConfig, } from '../../src/config/ServerConfig.js';
import { createTempFile } from '../utils.js';
describe('ServerConfig', () => {
    function parseConfig(argv = [], env = {}) {
        const locator = new ConfigLocator();
        sinon.stub(locator, 'locate').returns(undefined);
        return new ConfigParser('0.0.0', ['node', 'main.js', ...argv], env, false, locator).parseConfig();
    }
    describe('validateConflicts', () => {
        it('accepts a single argument from a conflict group', () => {
            ServerConfig.validateConflicts({ browserUrl: 'http://localhost:9222' });
        });
        it('ignores false and undefined values', () => {
            ServerConfig.validateConflicts({
                browserUrl: 'http://localhost:9222',
                wsEndpoint: undefined,
                categoryExtensions: false,
            });
        });
        it('rejects two arguments from the same group', () => {
            assert.throws(() => ServerConfig.validateConflicts({
                browserUrl: 'http://localhost:9222',
                channel: 'canary',
            }), /Arguments channel and browserUrl are mutually exclusive/);
        });
    });
    describe('validateImplications', () => {
        it('accepts when implying key is not set', () => {
            ServerConfig.validateImplications({ wsEndpoint: 'ws://localhost:9222' });
        });
        it('accepts when both implying and implied keys are set', () => {
            ServerConfig.validateImplications({
                wsHeaders: { Auth: 'token' },
                wsEndpoint: 'ws://localhost:9222',
            });
        });
        it('rejects when implying key is set but implied key is missing', () => {
            assert.throws(() => ServerConfig.validateImplications({ wsHeaders: { Auth: 'token' } }), /Implications failed:\n {2}wsHeaders -> wsEndpoint/);
        });
        it('rejects when implying key is set but implied key is negated', () => {
            assert.throws(() => ServerConfig.validateImplications({
                experimentalFfmpegPath: '/bin/ffmpeg',
                experimentalScreencast: false,
            }), /Implications failed:\n {2}experimentalFfmpegPath -> experimentalScreencast/);
        });
    });
    describe('applyDefaults', () => {
        it('keeps explicit values and fills in defaults', () => {
            const args = ServerConfig.applyDefaults({ headless: true }, { env: {} });
            assert.strictEqual(args.headless, true);
            assert.strictEqual(args.isolated, false);
            assert.strictEqual(args.channel, 'stable');
            assert.strictEqual(args.categoryExtensions, undefined);
        });
        it('drops unknown CLI keys that are not in mcpOptions', () => {
            sinon.stub(console, 'error');
            const config = parseConfig(['--unknownFlag=value']);
            assert.strictEqual('unknownFlag' in config.resolved, false);
        });
        for (const explicitArgs of [
            { browserUrl: 'http://localhost:9222' },
            { wsEndpoint: 'ws://localhost:9222' },
            { executablePath: '/tmp/chrome' },
        ]) {
            it(`does not default channel with ${Object.keys(explicitArgs)[0]}`, () => {
                assert.strictEqual(ServerConfig.applyDefaults(explicitArgs, { env: {} }).channel, undefined);
            });
        }
        it('applies viaCli defaults when launching a browser', () => {
            const args = ServerConfig.applyDefaults({
                viaCli: true,
                filesystemRoot: DEFAULT_FILESYSTEM_ROOT,
            }, { env: {} });
            assert.strictEqual(args.headless, true);
            assert.strictEqual(args.isolated, true);
            assert.strictEqual(args.categoryExtensions, true);
            assert.strictEqual(args.allowUnrestrictedPaths, true);
            assert.strictEqual(args.filesystemRoot, undefined);
        });
        it('keeps the default filesystem root for viaCli with explicit allowUnrestrictedPaths=false', () => {
            const args = ServerConfig.applyDefaults({
                viaCli: true,
                allowUnrestrictedPaths: false,
            }, { env: {} });
            assert.strictEqual(args.allowUnrestrictedPaths, false);
            assert.deepStrictEqual(args.filesystemRoot, DEFAULT_FILESYSTEM_ROOT);
        });
        it('does not enable isolated or extensions for viaCli with browserUrl', () => {
            const args = ServerConfig.applyDefaults({
                viaCli: true,
                browserUrl: 'http://localhost:9222',
            }, { env: {} });
            assert.strictEqual(args.isolated, false);
            assert.strictEqual(args.categoryExtensions, undefined);
        });
        it('locks slim=false and pageIdRouting=true for viaCli even when set in explicitArgs', () => {
            const args = ServerConfig.applyDefaults({
                viaCli: true,
                slim: true,
                pageIdRouting: false,
            }, { env: {} });
            assert.strictEqual(args.slim, false);
            assert.strictEqual(args.pageIdRouting, true);
        });
        it('turns off usage statistics in CI', () => {
            sinon.stub(console, 'error');
            const args = ServerConfig.applyDefaults({ usageStatistics: true }, { env: { CI: 'true' } });
            assert.strictEqual(args.usageStatistics, false);
        });
        it('prints the usage statistics notice once across reloads', () => {
            const consoleError = sinon.stub(console, 'error');
            const locator = new ConfigLocator();
            sinon.stub(locator, 'locate').returns(undefined);
            const ciParser = new ConfigParser('0.0.0', ['node', 'main.js'], { CI: 'true' }, false, locator);
            ciParser.parseConfig();
            const reloaded = ciParser.reloadConfig();
            assert.strictEqual(reloaded.resolved.usageStatistics, false);
            sinon.assert.calledOnce(consoleError);
        });
        it('prints the usage statistics notice after a failed first parse', () => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_1, createTempFile(JSON.stringify({
                    browserUrl: 'http://localhost:9222',
                    channel: 'canary',
                }), 'cd4a.conflict.config.json'), false);
                const consoleError = sinon.stub(console, 'error');
                const locator = new ConfigLocator();
                sinon.stub(locator, 'locate').returns(configFile.path);
                const ciParser = new ConfigParser('0.0.0', ['node', 'main.js'], { CI: 'true' }, false, locator);
                assert.throws(() => ciParser.parseConfig(), /Arguments channel and browserUrl are mutually exclusive/);
                sinon.assert.notCalled(consoleError);
                fs.writeFileSync(configFile.path, JSON.stringify({ headless: true }));
                const reloaded = ciParser.reloadConfig();
                assert.strictEqual(reloaded.resolved.usageStatistics, false);
                sinon.assert.calledOnceWithExactly(consoleError, "turning off usage statistics. process.env['CI'] || process.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS'] is set.");
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        });
    });
    describe('mergeReloadable', () => {
        it('applies reloadable options', () => {
            const merged = parseConfig().mergeReloadable(parseConfig([
                '--memoryDebugging',
                '--no-category-network',
                '--no-file-navigations',
                '--blockedUrlPattern=https://example.com/*',
                '--slim',
            ])).resolved;
            assert.strictEqual(merged.memoryDebugging, true);
            assert.strictEqual(merged.categoryNetwork, false);
            assert.strictEqual(merged.fileNavigations, false);
            assert.deepStrictEqual(merged.blockedUrlPattern, [
                'https://example.com/*',
            ]);
            assert.strictEqual(merged.slim, true);
        });
        it('switches between blockedUrlPattern and allowedUrlPattern across reloads', () => {
            const withBlocked = parseConfig().mergeReloadable(parseConfig(['--blockedUrlPattern=https://blocked.example.com/*']));
            assert.deepStrictEqual(withBlocked.resolved.blockedUrlPattern, [
                'https://blocked.example.com/*',
            ]);
            assert.strictEqual(withBlocked.resolved.allowedUrlPattern, undefined);
            const withAllowed = withBlocked.mergeReloadable(parseConfig(['--allowedUrlPattern=https://allowed.example.com/*']));
            assert.strictEqual(withAllowed.resolved.blockedUrlPattern, undefined);
            assert.deepStrictEqual(withAllowed.resolved.allowedUrlPattern, [
                'https://allowed.example.com/*',
            ]);
        });
        it('keeps restart-required options', () => {
            const merged = parseConfig().mergeReloadable(parseConfig([
                '--categoryExtensions',
                '--headless',
                '--experimentalDevtools',
            ])).resolved;
            assert.strictEqual(merged.categoryExtensions, undefined);
            assert.strictEqual(merged.headless, false);
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
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const configFile = __addDisposableResource(env_2, createTempFile(JSON.stringify({ memoryDebugging: false, performanceCrux: true }), 'cd4a.config.json'), false);
                const locator = new ConfigLocator();
                sinon.stub(locator, 'locate').returns(configFile.path);
                const parser = new ConfigParser('0.0.0', ['node', 'main.js', '--memoryDebugging'], {}, false, locator);
                const initial = parser.parseConfig();
                fs.writeFileSync(configFile.path, JSON.stringify({ memoryDebugging: false, performanceCrux: false }));
                const reloaded = parser.reloadConfig();
                const merged = initial.mergeReloadable(reloaded).resolved;
                assert.strictEqual(merged.memoryDebugging, true);
                assert.strictEqual(merged.performanceCrux, false);
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        });
        it('rejects reloadable options that conflict with startup restart-required options', () => {
            const previous = parseConfig(['--browserUrl=http://127.0.0.1:9222']);
            const next = parseConfig(['--categoryPwa']);
            assert.throws(() => previous.mergeReloadable(next), /Arguments categoryPwa and browserUrl are mutually exclusive/);
        });
        it('does not conflict with default options', () => {
            const merged = parseConfig().mergeReloadable(parseConfig(['--allow-unrestricted-paths'])).resolved;
            assert.strictEqual(merged.allowUnrestrictedPaths, true);
            assert.strictEqual(merged.filesystemRoot, DEFAULT_FILESYSTEM_ROOT);
        });
        it('applies env overrides when merging reloadable options', () => {
            const initial = parseConfig();
            const next = parseConfig();
            const mergedWithCi = initial.mergeReloadable(next, {
                env: { CI: 'true' },
            }).resolved;
            const mergedWithoutCi = initial.mergeReloadable(next).resolved;
            assert.strictEqual(mergedWithCi.usageStatistics, false);
            assert.strictEqual(mergedWithoutCi.usageStatistics, true);
        });
    });
    describe('ServerConfig.commit()', () => {
        it('updates cliArgs, fileArgs, and resolved in place', () => {
            const initial = ServerConfig.create({
                cliArgs: { headless: true },
                fileArgs: { memoryDebugging: false },
                env: {},
                suppressUsageStatisticsNotice: true,
            });
            const readonlyView = initial;
            const next = initial.mergeReloadable(ServerConfig.create({
                cliArgs: { headless: true, slim: true },
                fileArgs: { memoryDebugging: true },
                env: {},
                suppressUsageStatisticsNotice: true,
            }));
            initial.commit(next);
            assert.deepStrictEqual(initial.cliArgs, { headless: true, slim: true });
            assert.deepStrictEqual(initial.fileArgs, { memoryDebugging: true });
            assert.strictEqual(readonlyView.resolved.slim, true);
            assert.strictEqual(readonlyView.resolved.memoryDebugging, true);
            assert.strictEqual(readonlyView.resolved.headless, true);
        });
    });
    describe('ServerConfig.withFileArgs()', () => {
        it('creates a new ServerConfig with updated fileArgs and preserved cliArgs', () => {
            const initial = ServerConfig.create({
                cliArgs: { headless: true },
                fileArgs: { memoryDebugging: false },
                configPath: '/tmp/cd4a.config.json',
                env: { CI: 'true' },
                suppressUsageStatisticsNotice: true,
            });
            const updated = initial.withFileArgs({ memoryDebugging: true });
            assert.strictEqual(updated.resolved.headless, true);
            assert.strictEqual(updated.resolved.memoryDebugging, true);
            assert.strictEqual(updated.resolved.usageStatistics, false);
            assert.strictEqual(updated.configPath, '/tmp/cd4a.config.json');
        });
    });
    describe('getRestartRequiredChanges', () => {
        it('ignores reloadable option changes', () => {
            const previous = parseConfig();
            const next = parseConfig([
                '--memoryDebugging',
                '--no-category-network',
                '--slim',
            ]);
            assert.deepStrictEqual(previous.getRestartRequiredChanges(next), []);
        });
        it('returns restart-required options that changed', () => {
            const previous = parseConfig();
            const next = parseConfig([
                '--headless',
                '--categoryExtensions',
                '--memoryDebugging',
            ]);
            assert.deepStrictEqual(previous.getRestartRequiredChanges(next), [
                'categoryExtensions',
                'headless',
            ]);
        });
        it('compares restart-required array and object options by value', () => {
            const previous = parseConfig(['--chromeArg=--foo']);
            const same = parseConfig(['--chromeArg=--foo']);
            const changed = parseConfig(['--chromeArg=--bar']);
            assert.deepStrictEqual(previous.getRestartRequiredChanges(same), []);
            assert.deepStrictEqual(previous.getRestartRequiredChanges(changed), [
                'chromeArg',
            ]);
        });
        it('ignores restart-required options whose defaults are derived from other options', () => {
            const previous = parseConfig(['--viaCli']);
            const next = parseConfig([
                '--viaCli',
                '--browserUrl=http://127.0.0.1:9222',
            ]);
            assert.strictEqual(previous.resolved.categoryExtensions, true);
            assert.strictEqual(next.resolved.categoryExtensions, undefined);
            assert.strictEqual(previous.resolved.isolated, true);
            assert.strictEqual(next.resolved.isolated, false);
            assert.strictEqual(previous.resolved.channel, 'stable');
            assert.strictEqual(next.resolved.channel, undefined);
            assert.deepStrictEqual(previous.getRestartRequiredChanges(next), [
                'browserUrl',
            ]);
        });
    });
});
//# sourceMappingURL=ServerConfig.test.js.map