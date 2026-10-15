/**
 * @license
 * Copyright 2025 Google LLC
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
import path from 'node:path';
import { describe, it } from 'node:test';
import { ConfigParser } from '../src/config/ConfigParser.js';
import { getCliOptions, mcpOptions, DEFAULT_FILESYSTEM_ROOT, } from '../src/config/mcp-options.js';
import { buildCommand, getCommandArgSpec, shieldLiteralArgs, } from '../src/config/cli-commands.js';
import { commands } from '../src/config/cli-options.js';
import { computeFlagUsage } from '../src/telemetry/flagUtils.js';
import { puppeteerOptions } from '../src/config/puppeteer-options.js';
import { createTempFile } from './utils.js';
function parseConfig(argv, env = {}) {
    return new ConfigParser('0.0.0', ['node', 'main.js', ...argv], env, false).parse();
}
describe('cli args parsing', () => {
    const defaultArgs = {
        categoryInput: true,
        categoryNavigation: true,
        categoryEmulation: true,
        categoryPerformance: true,
        categoryNetwork: true,
        categoryDebugging: true,
        categoryMemory: true,
        autoConnect: false,
        headless: false,
        isolated: false,
        acceptInsecureCerts: false,
        performanceCrux: true,
        usageStatistics: true,
        javascriptEvaluation: true,
        fileNavigations: true,
        redactNetworkHeaders: false,
        allowUnrestrictedPaths: false,
        filesystemRoot: DEFAULT_FILESYSTEM_ROOT,
        experimentalDevtools: false,
        experimentalVision: false,
        experimentalToonFormat: false,
        experimentalIncludeAllPages: false,
        experimentalInteropTools: false,
        experimentalScreencast: false,
        memoryDebugging: false,
        experimentalStructuredContent: false,
        pageIdRouting: true,
        sourceMaps: true,
        clearcutIncludePidHeader: false,
        screenshotFormat: 'png',
        slim: false,
        viaCli: false,
        devtoolsComments: false,
    };
    it('parses with default args', async () => {
        const args = parseConfig([]);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
        });
    });
    it('parses with viaCli args', async () => {
        const args = parseConfig(['--viaCli']);
        assert.strictEqual(args.allowUnrestrictedPaths, true);
        assert.strictEqual(args.headless, true);
        assert.strictEqual(args.isolated, true);
        assert.strictEqual(args.memoryDebugging, true);
        assert.strictEqual(args.categoryExtensions, true);
        assert.strictEqual(args.experimentalStructuredContent, true);
        assert.strictEqual(args.viaCli, true);
    });
    it('parses with browser url', async () => {
        const args = parseConfig(['--browserUrl', 'http://localhost:3000']);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            browserUrl: 'http://localhost:3000',
        });
    });
    it('rejects unknown options', async () => {
        let output = '';
        const originalError = console.error;
        console.error = (msg) => {
            output += msg;
        };
        try {
            parseConfig(['--browserURL', 'http://localhost:3000']);
            assert.match(output, /Unknown arguments: --browserURL/);
        }
        finally {
            console.error = originalError;
        }
    });
    it('parses mixed-form option names', async () => {
        const args = parseConfig(['--category-experimentalWebmcp']);
        assert.strictEqual(args.categoryExperimentalWebmcp, true);
    });
    it('parses with user data dir', async () => {
        const args = parseConfig(['--user-data-dir', '/tmp/chrome-profile']);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            userDataDir: '/tmp/chrome-profile',
        });
    });
    it('parses an empty browser url', async () => {
        const args = parseConfig(['--browserUrl', ''], {});
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            browserUrl: undefined,
        });
    });
    it('parses with executable path', async () => {
        const args = parseConfig(['--executablePath', '/tmp/test 123/chrome']);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            executablePath: '/tmp/test 123/chrome',
        });
    });
    it('parses viewport', async () => {
        const args = parseConfig(['--viewport', '888x777']);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            viewport: {
                width: 888,
                height: 777,
            },
        });
    });
    it('rejects non-positive viewport dimensions', async () => {
        const coerce = puppeteerOptions.viewport.coerce;
        assert.ok(coerce);
        assert.strictEqual(coerce(undefined), undefined);
        for (const value of [
            '800x-1',
            '-100x800',
            '800x0',
            '0x800',
            'Infinityx600',
            '800xInfinity',
            '1280.5x720',
            '1280x720.5',
        ]) {
            assert.throws(() => coerce(value), /Invalid viewport\. Expected format is `1280x720` with positive integer width and height\./);
        }
    });
    it('parses chrome args', async () => {
        const args = parseConfig([
            `--chrome-arg='--no-sandbox'`,
            `--chrome-arg='--disable-setuid-sandbox'`,
        ]);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            chromeArg: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    });
    describe('filesystem roots', () => {
        it('parses filesystem roots', async () => {
            const args = parseConfig([
                '--filesystem-root=/tmp/one',
                '--filesystem-root=/tmp/two',
            ]);
            assert.deepStrictEqual(args.filesystemRoot, ['/tmp/one', '/tmp/two']);
        });
        it('parses workspace as an alias for filesystem roots', async () => {
            const args = parseConfig([
                '--workspace=/tmp/one',
                '--workspace=/tmp/two',
            ]);
            assert.deepStrictEqual(args.filesystemRoot, ['/tmp/one', '/tmp/two']);
        });
        it('still accepts unrestricted paths without an explicit root', async () => {
            const args = parseConfig(['--allow-unrestricted-paths']);
            assert.strictEqual(args.allowUnrestrictedPaths, true);
        });
        it('accepts an explicit unrestricted flag in CLI mode', async () => {
            const args = parseConfig(['--viaCli', '--allow-unrestricted-paths']);
            assert.strictEqual(args.allowUnrestrictedPaths, true);
            assert.strictEqual(args.filesystemRoot, undefined);
        });
        it('rejects unrestricted paths with a CLI workspace', async () => {
            assert.throws(() => parseConfig([
                '--viaCli',
                '--allow-unrestricted-paths',
                '--workspace=/tmp/one',
            ]), /Arguments allowUnrestrictedPaths and filesystemRoot are mutually exclusive/);
        });
        it('rejects unrestricted paths with a direct filesystem root', async () => {
            assert.throws(() => parseConfig([
                '--allow-unrestricted-paths',
                '--filesystem-root=/tmp/one',
            ]), /Arguments allowUnrestrictedPaths and filesystemRoot are mutually exclusive/);
        });
        it('rejects a config unrestricted flag with a CLI workspace', async () => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_1, createTempFile(JSON.stringify({ allowUnrestrictedPaths: true }), 'cd4a.test.config.unrestricted-workspace.json'), false);
                assert.throws(() => parseConfig([
                    '--viaCli',
                    '--config',
                    testConfig.path,
                    '--workspace=/tmp/one',
                ]), /Arguments allowUnrestrictedPaths and filesystemRoot are mutually exclusive/);
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        });
        it('rejects a config filesystem root with a CLI unrestricted flag', async () => {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_2, createTempFile(JSON.stringify({ filesystemRoot: ['/tmp/one'] }), 'cd4a.test.config.root-unrestricted.json'), false);
                assert.throws(() => parseConfig([
                    '--config',
                    testConfig.path,
                    '--allow-unrestricted-paths',
                ]), /Arguments allowUnrestrictedPaths and filesystemRoot are mutually exclusive/);
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        });
        it('lets an explicit false override config unrestricted with a workspace', async () => {
            const env_3 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_3, createTempFile(JSON.stringify({ allowUnrestrictedPaths: true }), 'cd4a.test.config.unrestricted-false.json'), false);
                const args = parseConfig([
                    '--config',
                    testConfig.path,
                    '--no-allow-unrestricted-paths',
                    '--workspace=/tmp/one',
                ]);
                assert.strictEqual(args.allowUnrestrictedPaths, false);
                assert.deepStrictEqual(args.filesystemRoot, ['/tmp/one']);
            }
            catch (e_3) {
                env_3.error = e_3;
                env_3.hasError = true;
            }
            finally {
                __disposeResources(env_3);
            }
        });
        it('lets an explicit workspace override the CLI unrestricted default', async () => {
            const args = parseConfig(['--viaCli', '--workspace=/tmp/one']);
            assert.strictEqual(args.allowUnrestrictedPaths, false);
            assert.deepStrictEqual(args.filesystemRoot, ['/tmp/one']);
        });
        it('keeps the CLI unrestricted default when no workspace is set', async () => {
            const args = parseConfig(['--viaCli']);
            assert.strictEqual(args.allowUnrestrictedPaths, true);
            assert.strictEqual(args.filesystemRoot, undefined);
        });
        it('uses yargs default identity to detect an unset CLI workspace', async () => {
            const args = parseConfig([]);
            assert.strictEqual(args.filesystemRoot, DEFAULT_FILESYSTEM_ROOT);
        });
    });
    it('parses ignore chrome args', async () => {
        const args = parseConfig([
            `--ignore-default-chrome-arg='--disable-extensions'`,
            `--ignore-default-chrome-arg='--disable-cancel-all-touches'`,
        ]);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            ignoreDefaultChromeArg: [
                '--disable-extensions',
                '--disable-cancel-all-touches',
            ],
        });
    });
    it('parses wsEndpoint with ws:// protocol', async () => {
        const args = parseConfig([
            '--wsEndpoint',
            'ws://127.0.0.1:9222/devtools/browser/abc123',
        ]);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc123',
        });
    });
    it('parses wsEndpoint with wss:// protocol', async () => {
        const args = parseConfig([
            '--wsEndpoint',
            'wss://example.com:9222/devtools/browser/abc123',
        ]);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            wsEndpoint: 'wss://example.com:9222/devtools/browser/abc123',
        });
    });
    it('parses wsHeaders with valid JSON', async () => {
        const args = parseConfig([
            '--wsEndpoint',
            'ws://127.0.0.1:9222/devtools/browser/abc123',
            '--wsHeaders',
            '{"Authorization":"Bearer token","X-Custom":"value"}',
        ]);
        assert.deepStrictEqual(args.wsHeaders, {
            Authorization: 'Bearer token',
            'X-Custom': 'value',
        });
    });
    it('parses disabled category', async () => {
        const args = parseConfig(['--no-category-emulation']);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            categoryEmulation: false,
        });
    });
    it('parses auto-connect', async () => {
        const args = parseConfig(['--auto-connect'], {});
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            autoConnect: true,
        });
    });
    it('rejects invalid screencast fps values', async () => {
        const coerce = mcpOptions.screencastFps.coerce;
        assert.ok(coerce);
        assert.strictEqual(coerce(undefined), undefined);
        assert.strictEqual(coerce(10), 10);
        for (const value of [0, -1, 10.5, Number.NaN]) {
            assert.throws(() => coerce(value), /Invalid screencastFps .* Expected a positive integer\./);
        }
    });
    it('parses screencast fps without requiring experimental screencast', async () => {
        const args = parseConfig(['--screencast-fps=5']);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            screencastFps: 5,
        });
    });
    it('accepts --experimental-screencast-fps as an alias for --screencast-fps', async () => {
        const args = parseConfig(['--experimental-screencast-fps=5']);
        assert.deepStrictEqual(args, {
            ...defaultArgs,
            channel: 'stable',
            screencastFps: 5,
        });
    });
    it('parses usage statistics flag', async () => {
        // Test default (should be true).
        const defaultArgs = parseConfig(['main.js'], {});
        assert.strictEqual(defaultArgs.usageStatistics, true);
        // Test enabling it
        const enabledArgs = parseConfig(['--usage-statistics']);
        assert.strictEqual(enabledArgs.usageStatistics, true);
        // Test disabling it
        const disabledArgs = parseConfig(['--no-usage-statistics']);
        assert.strictEqual(disabledArgs.usageStatistics, false);
    });
    it('parses javascript evaluation flag', async () => {
        // Test default (should be true).
        const defaultArgs = parseConfig(['main.js'], {});
        assert.strictEqual(defaultArgs.javascriptEvaluation, true);
        // Test enabling it
        const enabledArgs = parseConfig(['--javascript-evaluation']);
        assert.strictEqual(enabledArgs.javascriptEvaluation, true);
        // Test disabling it
        const disabledArgs = parseConfig(['--no-javascript-evaluation']);
        assert.strictEqual(disabledArgs.javascriptEvaluation, false);
    });
    it('parses file navigations flag', async () => {
        // Test default (should be true).
        const defaultArgs = parseConfig(['main.js'], {});
        assert.strictEqual(defaultArgs.fileNavigations, true);
        // Test enabling it
        const enabledArgs = parseConfig(['--file-navigations']);
        assert.strictEqual(enabledArgs.fileNavigations, true);
        // Test disabling it
        const disabledArgs = parseConfig(['--no-file-navigations']);
        assert.strictEqual(disabledArgs.fileNavigations, false);
        // The camelCase form is equivalent.
        const camelCaseArgs = parseConfig(['--fileNavigations=false']);
        assert.strictEqual(camelCaseArgs.fileNavigations, false);
    });
    it('respects env variable', async () => {
        // Test default (should be true).
        const defaultArgs = parseConfig(['main.js'], {
            CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
        });
        assert.strictEqual(defaultArgs.usageStatistics, false);
        // Test enabling it
        const enabledArgs = parseConfig(['--usage-statistics'], {
            CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
        });
        assert.strictEqual(enabledArgs.usageStatistics, false);
        // Test disabling it
        const disabledArgs = parseConfig(['--no-usage-statistics'], {
            CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
        });
        assert.strictEqual(disabledArgs.usageStatistics, false);
    });
    it('respects CHROME_DEVTOOLS_MCP_CATEGORY_EXPERIMENTAL_THIRD_PARTY env variable', async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const enabledByEnv = parseConfig([], {
                CHROME_DEVTOOLS_MCP_CATEGORY_EXPERIMENTAL_THIRD_PARTY: 'true',
            });
            assert.strictEqual(enabledByEnv.categoryExperimentalThirdParty, true);
            const disabledByCli = parseConfig(['--no-category-experimental-third-party'], {
                CHROME_DEVTOOLS_MCP_CATEGORY_EXPERIMENTAL_THIRD_PARTY: 'true',
            });
            assert.strictEqual(disabledByCli.categoryExperimentalThirdParty, false);
            const testConfig = __addDisposableResource(env_4, createTempFile(JSON.stringify({ categoryExperimentalThirdParty: false }), 'cd4a.test.config.third-party.json'), false);
            const disabledByConfig = parseConfig(['--config', testConfig.path], {
                CHROME_DEVTOOLS_MCP_CATEGORY_EXPERIMENTAL_THIRD_PARTY: 'true',
            });
            assert.strictEqual(disabledByConfig.categoryExperimentalThirdParty, false);
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
    it('parses performance crux flag', async () => {
        const defaultArgs = parseConfig(['main.js']);
        assert.strictEqual(defaultArgs.performanceCrux, true);
        // force enable
        const enabledArgs = parseConfig(['--performance-crux']);
        assert.strictEqual(enabledArgs.performanceCrux, true);
        const disabledArgs = parseConfig(['--no-performance-crux']);
        assert.strictEqual(disabledArgs.performanceCrux, false);
    });
    it('parses blocked-url-pattern flags as array', async () => {
        const defaultArgs = parseConfig(['main.js']);
        assert.strictEqual(defaultArgs.blockedUrlPattern, undefined);
        const singleArgs = parseConfig([
            '--blocked-url-pattern=https://example.com/*',
        ]);
        assert.deepStrictEqual(singleArgs.blockedUrlPattern, [
            'https://example.com/*',
        ]);
        const repeatedArgs = parseConfig([
            '--blocked-url-pattern=https://a.com/*',
            '--blocked-url-pattern=https://b.com/*',
        ]);
        assert.deepStrictEqual(repeatedArgs.blockedUrlPattern, [
            'https://a.com/*',
            'https://b.com/*',
        ]);
        const spaceSeparatedArgs = parseConfig([
            '--blocked-url-pattern',
            'https://a.com/*',
            'https://b.com/*',
        ]);
        assert.deepStrictEqual(spaceSeparatedArgs.blockedUrlPattern, [
            'https://a.com/*',
            'https://b.com/*',
        ]);
    });
    it('parses allowed-url-pattern flags as array', async () => {
        const defaultArgs = parseConfig(['main.js']);
        assert.strictEqual(defaultArgs.allowedUrlPattern, undefined);
        const singleArgs = parseConfig([
            '--allowed-url-pattern=https://example.com/*',
        ]);
        assert.deepStrictEqual(singleArgs.allowedUrlPattern, [
            'https://example.com/*',
        ]);
        const repeatedArgs = parseConfig([
            '--allowed-url-pattern=https://a.com/*',
            '--allowed-url-pattern=https://b.com/*',
        ]);
        assert.deepStrictEqual(repeatedArgs.allowedUrlPattern, [
            'https://a.com/*',
            'https://b.com/*',
        ]);
        const spaceSeparatedArgs = parseConfig([
            '--allowed-url-pattern',
            'https://a.com/*',
            'https://b.com/*',
        ]);
        assert.deepStrictEqual(spaceSeparatedArgs.allowedUrlPattern, [
            'https://a.com/*',
            'https://b.com/*',
        ]);
    });
    it('rejects url-pattern with a regexp group or named group', async () => {
        assert.throws(() => parseConfig([
            String.raw `--blockedUrlPattern=*://(127\.\d+\.\d+\.\d+):*/*`,
        ]), /Invalid --blockedUrlPattern .*is not enforced/);
        assert.throws(() => parseConfig([
            String.raw `--allowedUrlPattern=*://(127\.\d+\.\d+\.\d+):*/*`,
        ]), /Invalid --allowedUrlPattern .*is not enforced/);
        assert.throws(() => parseConfig(['--blockedUrlPattern=*://127.0.0.1::port/secret']), /Invalid --blockedUrlPattern .*is not enforced/);
        assert.throws(() => parseConfig(['--allowedUrlPattern=*://127.0.0.1::port/secret']), /Invalid --allowedUrlPattern .*is not enforced/);
    });
    it('rejects when any pattern in multiple url patterns is unenforceable', async () => {
        assert.throws(() => parseConfig([
            '--blocked-url-pattern=https://a.com/*',
            String.raw `--blocked-url-pattern=*://example.com/(foo|bar)`,
        ]), /Invalid --blockedUrlPattern .*is not enforced/);
        assert.throws(() => parseConfig([
            '--allowed-url-pattern=https://a.com/*',
            String.raw `--allowed-url-pattern=*://example.com/(foo|bar)`,
        ]), /Invalid --allowedUrlPattern .*is not enforced/);
    });
    it('rejects url-pattern with invalid syntax', async () => {
        assert.throws(() => parseConfig(['--blocked-url-pattern=*://example.com/(unterminated']));
        assert.throws(() => parseConfig(['--allowed-url-pattern=*://example.com/(unterminated']));
    });
    it('strips an empty blocked-url-pattern', async () => {
        const args = parseConfig(['--blocked-url-pattern']);
        assert.strictEqual(args.blockedUrlPattern, undefined);
    });
    it('allows an empty config blockedUrlPattern with allowed-url-pattern', async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_5, createTempFile(JSON.stringify({ blockedUrlPattern: [] }), 'cd4a.test.config.empty-blocked.json'), false);
            const args = parseConfig([
                '--config',
                testConfig.path,
                '--allowed-url-pattern',
                'https://a.com/*',
            ]);
            assert.strictEqual(args.blockedUrlPattern, undefined);
            assert.deepStrictEqual(args.allowedUrlPattern, ['https://a.com/*']);
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    });
    it('rejects an empty allowed-url-pattern', async () => {
        assert.throws(() => parseConfig(['--allowed-url-pattern']), /Invalid --allowedUrlPattern: at least one pattern is required/);
    });
    it('rejects an empty config allowedUrlPattern', async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_6, createTempFile(JSON.stringify({ allowedUrlPattern: [] }), 'cd4a.test.config.empty-allowed.json'), false);
            assert.throws(() => parseConfig(['--config', testConfig.path]), /Invalid JSON config file: Invalid --allowedUrlPattern: at least one pattern is required/);
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    });
    it('parses source-maps flag', async () => {
        const defaultParsed = parseConfig(['main.js']);
        assert.strictEqual(defaultParsed.sourceMaps, true);
        const disabledArgs = parseConfig(['--no-source-maps']);
        assert.strictEqual(disabledArgs.sourceMaps, false);
        const explicitFalseArgs = parseConfig(['--source-maps=false']);
        assert.strictEqual(explicitFalseArgs.sourceMaps, false);
        const explicitTrueArgs = parseConfig(['--source-maps=true']);
        assert.strictEqual(explicitTrueArgs.sourceMaps, true);
    });
    it('parses config option', async () => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_7, createTempFile(JSON.stringify({
                headless: true,
                categoryInput: false,
                blockedUrlPattern: ['https://example.com/*'],
            }), 'cd4a.test.config.json'), false);
            const args = parseConfig(['--config', testConfig.path]);
            assert.strictEqual(args.config, testConfig.path);
            assert.strictEqual(args.headless, true);
            assert.strictEqual(args.categoryInput, false);
            assert.deepStrictEqual(args.blockedUrlPattern, ['https://example.com/*']);
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    });
    it('parses config option mixed with cli arguments', async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_8, createTempFile(JSON.stringify({
                headless: true,
                categoryInput: false,
            }), 'cd4a.test.config.mixed.json'), false);
            const args = parseConfig([
                '--config',
                testConfig.path,
                '--headless=false',
                '--category-network=false',
            ]);
            assert.strictEqual(args.config, testConfig.path);
            assert.strictEqual(args.headless, false);
            assert.strictEqual(args.categoryInput, false);
            assert.strictEqual(args.categoryNetwork, false);
            assert.strictEqual(args.categoryMemory, true);
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    });
    it('applies config coercion for viewport and wsHeaders', async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_9, createTempFile(JSON.stringify({
                wsEndpoint: 'ws://127.0.0.1:9222/devtools/browser/abc123',
                wsHeaders: '{"Authorization":"Bearer token"}',
                viewport: '1280x720',
            }), 'cd4a.test.config.coercion.json'), false);
            const args = parseConfig(['--config', testConfig.path]);
            assert.deepStrictEqual(args.viewport, { width: 1280, height: 720 });
            assert.deepStrictEqual(args.wsHeaders, { Authorization: 'Bearer token' });
        }
        catch (e_9) {
            env_9.error = e_9;
            env_9.hasError = true;
        }
        finally {
            __disposeResources(env_9);
        }
    });
    it('lets cli options override coerced config values', async () => {
        const env_10 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_10, createTempFile(JSON.stringify({ viewport: '1280x720' }), 'cd4a.test.config.coercion-override.json'), false);
            const args = parseConfig([
                '--config',
                testConfig.path,
                '--viewport',
                '800x600',
            ]);
            assert.deepStrictEqual(args.viewport, { width: 800, height: 600 });
        }
        catch (e_10) {
            env_10.error = e_10;
            env_10.hasError = true;
        }
        finally {
            __disposeResources(env_10);
        }
    });
    it('resolves relative config path and respects config with viaCli', async () => {
        const env_11 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_11, createTempFile(JSON.stringify({
                userDataDir: '/tmp/custom-profile',
                headless: false,
            }), 'cd4a.test.config.viacli.json'), false);
            const relativePath = path.relative(process.cwd(), testConfig.path);
            const args = parseConfig(['--viaCli', '--config', relativePath]);
            assert.strictEqual(args.config, testConfig.path);
            assert.strictEqual(args.userDataDir, '/tmp/custom-profile');
            assert.strictEqual(args.isolated, false);
            assert.strictEqual(args.headless, false);
        }
        catch (e_11) {
            env_11.error = e_11;
            env_11.hasError = true;
        }
        finally {
            __disposeResources(env_11);
        }
    });
    it('respects isolated=false in config with viaCli', async () => {
        const env_12 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_12, createTempFile(JSON.stringify({
                isolated: false,
            }), 'cd4a.test.config.viacli-isolated.json'), false);
            const args = parseConfig(['--viaCli', '--config', testConfig.path]);
            assert.strictEqual(args.isolated, false);
        }
        catch (e_12) {
            env_12.error = e_12;
            env_12.hasError = true;
        }
        finally {
            __disposeResources(env_12);
        }
    });
    it('parses config should not allow no prefix', async () => {
        const env_13 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_13, createTempFile(JSON.stringify({
                headless: true,
                'no-category-memory': true,
            }), 'cd4a.test.config.mixed.json'), false);
            assert.throws(() => parseConfig(['--config', testConfig.path]), /Invalid JSON config file: Unknown argument: no-category-memory/);
        }
        catch (e_13) {
            env_13.error = e_13;
            env_13.hasError = true;
        }
        finally {
            __disposeResources(env_13);
        }
    });
    it('parses config should not allow dashed property', async () => {
        const env_14 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_14, createTempFile(JSON.stringify({
                headless: true,
                'category-memory': false,
            }), 'cd4a.test.config.mixed.json'), false);
            assert.throws(() => parseConfig(['--config', testConfig.path]), /Invalid JSON config file: Unknown argument: category-memory/);
        }
        catch (e_14) {
            env_14.error = e_14;
            env_14.hasError = true;
        }
        finally {
            __disposeResources(env_14);
        }
    });
    it('rejects a config file with malformed JSON', async () => {
        const env_15 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_15, createTempFile('{"headless": true,', 'cd4a.test.config.malformed.json'), false);
            assert.throws(() => parseConfig(['--config', testConfig.path]), /Invalid JSON config file:/);
        }
        catch (e_15) {
            env_15.error = e_15;
            env_15.hasError = true;
        }
        finally {
            __disposeResources(env_15);
        }
    });
    it('rejects a config file that is not a JSON object', async () => {
        const env_16 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_16, createTempFile(JSON.stringify(['--headless']), 'cd4a.test.config.array.json'), false);
            assert.throws(() => parseConfig(['--config', testConfig.path]), /Invalid JSON config file: Config must be a JSON object/);
        }
        catch (e_16) {
            env_16.error = e_16;
            env_16.hasError = true;
        }
        finally {
            __disposeResources(env_16);
        }
    });
    it('rejects a missing config file', async () => {
        assert.throws(() => parseConfig(['--config', 'cd4a.test.config.missing.json']), /Invalid JSON config file: ENOENT/);
    });
    it('replaces config arrays with cli arrays instead of merging', async () => {
        const env_17 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_17, createTempFile(JSON.stringify({ chromeArg: ['--a'] }), 'cd4a.test.config.array-replace.json'), false);
            const args = parseConfig(['--config', testConfig.path, '--chrome-arg=--b']);
            assert.deepStrictEqual(args.chromeArg, ['--b']);
        }
        catch (e_17) {
            env_17.error = e_17;
            env_17.hasError = true;
        }
        finally {
            __disposeResources(env_17);
        }
    });
    it('lets the CI env disable usage statistics enabled in config', async () => {
        const env_18 = { stack: [], error: void 0, hasError: false };
        try {
            const testConfig = __addDisposableResource(env_18, createTempFile(JSON.stringify({ usageStatistics: true }), 'cd4a.test.config.usage-statistics.json'), false);
            const args = parseConfig(['--config', testConfig.path], { CI: 'true' });
            assert.strictEqual(args.usageStatistics, false);
        }
        catch (e_18) {
            env_18.error = e_18;
            env_18.hasError = true;
        }
        finally {
            __disposeResources(env_18);
        }
    });
    it('lets explicit cli flags override viaCli dynamic defaults', async () => {
        const args = parseConfig(['--viaCli', '--no-headless']);
        assert.strictEqual(args.headless, false);
    });
    describe('viaCli defaults', () => {
        for (const flag of ['--viaCli=true', '--via-cli=true']) {
            it(`applies viaCli defaults for ${flag}`, async () => {
                const args = parseConfig([flag]);
                assert.strictEqual(args.viaCli, true);
                assert.strictEqual(args.headless, true);
                assert.strictEqual(args.isolated, true);
                assert.strictEqual(args.memoryDebugging, true);
            });
        }
        it('does not apply viaCli defaults for --viaCli false', async () => {
            const args = parseConfig(['--viaCli', 'false']);
            assert.strictEqual(args.viaCli, false);
            assert.strictEqual(args.headless, false);
            assert.strictEqual(args.isolated, false);
            assert.strictEqual(args.memoryDebugging, false);
        });
        it('applies viaCli defaults when viaCli is set in the config file', async () => {
            const env_19 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_19, createTempFile(JSON.stringify({ viaCli: true }), 'cd4a.test.config.via-cli.json'), false);
                const args = parseConfig(['--config', testConfig.path]);
                assert.strictEqual(args.viaCli, true);
                assert.strictEqual(args.headless, true);
                assert.strictEqual(args.isolated, true);
            }
            catch (e_19) {
                env_19.error = e_19;
                env_19.hasError = true;
            }
            finally {
                __disposeResources(env_19);
            }
        });
        it('lets cli viaCli=false override config viaCli', async () => {
            const env_20 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_20, createTempFile(JSON.stringify({ viaCli: true }), 'cd4a.test.config.via-cli-override.json'), false);
                const args = parseConfig(['--config', testConfig.path, '--viaCli=false']);
                assert.strictEqual(args.viaCli, false);
                assert.strictEqual(args.headless, false);
                assert.strictEqual(args.isolated, false);
            }
            catch (e_20) {
                env_20.error = e_20;
                env_20.hasError = true;
            }
            finally {
                __disposeResources(env_20);
            }
        });
        for (const connectArgs of [
            ['--auto-connect'],
            ['--browserUrl', 'http://localhost:9222'],
            ['--wsEndpoint', 'ws://localhost:9222'],
            ['--user-data-dir', '/tmp/chrome-profile'],
        ]) {
            it(`does not default to isolated with ${connectArgs[0]}`, async () => {
                const args = parseConfig(['--viaCli', ...connectArgs]);
                assert.strictEqual(args.isolated, false);
            });
        }
        it('does not default to isolated with autoConnect from the config file', async () => {
            const env_21 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_21, createTempFile(JSON.stringify({ autoConnect: true }), 'cd4a.test.config.via-cli-auto-connect.json'), false);
                const args = parseConfig(['--viaCli', '--config', testConfig.path]);
                assert.strictEqual(args.autoConnect, true);
                assert.strictEqual(args.isolated, false);
            }
            catch (e_21) {
                env_21.error = e_21;
                env_21.hasError = true;
            }
            finally {
                __disposeResources(env_21);
            }
        });
    });
    it('parses with devtoolsComments enabled', async () => {
        const args = parseConfig(['--devtoolsComments']);
        assert.strictEqual(args.devtoolsComments, true);
    });
    it('includes usage examples in help output', async () => {
        const parser = new ConfigParser('0.0.0', ['node', 'main.js']);
        const help = await parser.buildCliParser(mcpOptions).getHelp();
        assert.match(help, /Examples:/);
        assert.match(help, /--browserUrl http:\/\/127\.0\.0\.1:9222/);
    });
    it('clears default values and populates defaultDescription in getCliOptions', () => {
        const cliOptions = getCliOptions();
        assert.strictEqual(cliOptions.viewport, undefined);
        assert.strictEqual(cliOptions.experimentalStructuredContent, undefined);
        assert.strictEqual(cliOptions.experimentalInteropTools, undefined);
        for (const [key, option] of Object.entries(cliOptions)) {
            assert.strictEqual(option && 'default' in option, false, `Expected 'default' property for ${key} to be omitted`);
        }
        assert.strictEqual(cliOptions.headless?.defaultDescription, 'true');
        assert.strictEqual(cliOptions.memoryDebugging?.defaultDescription, 'true');
        assert.strictEqual(cliOptions.filesystemRoot?.defaultDescription, 'OS temp directory');
        assert.strictEqual(cliOptions.isolated?.defaultDescription, 'true unless userDataDir, autoConnect, browserUrl or wsEndpoint is set');
        assert.strictEqual(cliOptions.categoryExtensions?.defaultDescription, 'true unless autoConnect, browserUrl or wsEndpoint is set');
    });
    describe('mutual exclusivity', () => {
        it('rejects isolated with userDataDir', async () => {
            assert.throws(() => parseConfig(['--isolated', '--user-data-dir', '/tmp/chrome-profile']), /Arguments userDataDir and isolated are mutually exclusive/);
        });
        it('rejects isolated with autoConnect', async () => {
            assert.throws(() => parseConfig(['--isolated', '--auto-connect']), /Arguments autoConnect and isolated are mutually exclusive/);
        });
        it('rejects autoConnect with executablePath', async () => {
            assert.throws(() => parseConfig(['--auto-connect', '--executablePath', '/bin/chrome']), /Arguments autoConnect and executablePath are mutually exclusive/);
        });
        it('rejects categoryPwa with autoConnect', async () => {
            assert.throws(() => parseConfig(['--category-pwa', '--auto-connect']), /Arguments categoryPwa and autoConnect are mutually exclusive/);
        });
        it('rejects categoryPwa with browserUrl', async () => {
            assert.throws(() => parseConfig([
                '--category-pwa',
                '--browserUrl',
                'http://localhost:9222',
            ]), /Arguments categoryPwa and browserUrl are mutually exclusive/);
        });
        it('rejects categoryPwa with wsEndpoint', async () => {
            assert.throws(() => parseConfig([
                '--category-pwa',
                '--wsEndpoint',
                'ws://localhost:9222',
            ]), /Arguments categoryPwa and wsEndpoint are mutually exclusive/);
        });
        it('rejects explicit channel with browserUrl', async () => {
            assert.throws(() => parseConfig([
                '--channel=canary',
                '--browserUrl',
                'http://localhost:9222',
            ]), /Arguments channel and browserUrl are mutually exclusive/);
        });
        it('rejects explicit channel with wsEndpoint', async () => {
            assert.throws(() => parseConfig([
                '--channel',
                'canary',
                '--wsEndpoint',
                'ws://localhost:9222',
            ]), /Arguments channel and wsEndpoint are mutually exclusive/);
        });
        it('rejects explicit channel with executablePath', async () => {
            assert.throws(() => parseConfig([
                '--channel',
                'canary',
                '--executablePath',
                '/bin/chrome',
            ]), /Arguments channel and executablePath are mutually exclusive/);
        });
        it('rejects browserUrl with wsEndpoint', async () => {
            assert.throws(() => parseConfig([
                '--browserUrl',
                'http://localhost:9222',
                '--wsEndpoint',
                'ws://localhost:9222',
            ]), /Arguments browserUrl and wsEndpoint are mutually exclusive/);
        });
        it('rejects executablePath with browserUrl', async () => {
            assert.throws(() => parseConfig([
                '--executablePath',
                '/bin/chrome',
                '--browserUrl',
                'http://localhost:9222',
            ]), /Arguments executablePath and browserUrl are mutually exclusive/);
        });
        it('rejects executablePath with wsEndpoint', async () => {
            assert.throws(() => parseConfig([
                '--executablePath',
                '/bin/chrome',
                '--wsEndpoint',
                'ws://localhost:9222',
            ]), /Arguments executablePath and wsEndpoint are mutually exclusive/);
        });
        it('rejects userDataDir with browserUrl', async () => {
            assert.throws(() => parseConfig([
                '--user-data-dir',
                '/tmp/dir',
                '--browserUrl',
                'http://localhost:9222',
            ]), /Arguments userDataDir and browserUrl are mutually exclusive/);
        });
        it('rejects userDataDir with wsEndpoint', async () => {
            assert.throws(() => parseConfig([
                '--user-data-dir',
                '/tmp/dir',
                '--wsEndpoint',
                'ws://localhost:9222',
            ]), /Arguments userDataDir and wsEndpoint are mutually exclusive/);
        });
        it('rejects blockedUrlPattern with allowedUrlPattern', async () => {
            assert.throws(() => parseConfig([
                '--blocked-url-pattern',
                'https://a.com/*',
                '--allowed-url-pattern',
                'https://a.com/*',
            ]), /Arguments blockedUrlPattern and allowedUrlPattern are mutually exclusive/);
        });
        it('rejects config-based channel with browserUrl', async () => {
            const env_22 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_22, createTempFile(JSON.stringify({ channel: 'canary' }), 'cd4a.test.config.channel.json'), false);
                assert.throws(() => parseConfig([
                    '--config',
                    testConfig.path,
                    '--browserUrl',
                    'http://localhost:9222',
                ]), /Arguments channel and browserUrl are mutually exclusive/);
            }
            catch (e_22) {
                env_22.error = e_22;
                env_22.hasError = true;
            }
            finally {
                __disposeResources(env_22);
            }
        });
        it('rejects cli channel with config-based browserUrl', async () => {
            const env_23 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_23, createTempFile(JSON.stringify({ browserUrl: 'http://localhost:9222' }), 'cd4a.test.config.browser-url.json'), false);
                assert.throws(() => parseConfig(['--config', testConfig.path, '--channel', 'canary']), /Arguments channel and browserUrl are mutually exclusive/);
            }
            catch (e_23) {
                env_23.error = e_23;
                env_23.hasError = true;
            }
            finally {
                __disposeResources(env_23);
            }
        });
        it('rejects conflicting arguments within a config file', async () => {
            const env_24 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_24, createTempFile(JSON.stringify({
                    browserUrl: 'http://localhost:9222',
                    wsEndpoint: 'ws://localhost:9222',
                }), 'cd4a.test.config.conflict.json'), false);
                assert.throws(() => parseConfig(['--config', testConfig.path]), /Arguments browserUrl and wsEndpoint are mutually exclusive/);
            }
            catch (e_24) {
                env_24.error = e_24;
                env_24.hasError = true;
            }
            finally {
                __disposeResources(env_24);
            }
        });
        it('allows explicitly disabled isolated with userDataDir', async () => {
            const args = parseConfig([
                '--isolated=false',
                '--user-data-dir',
                '/tmp/chrome-profile',
            ]);
            assert.strictEqual(args.isolated, false);
            assert.strictEqual(args.userDataDir, '/tmp/chrome-profile');
        });
        it('allows a config value set to false alongside a conflicting arg', async () => {
            const env_25 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_25, createTempFile(JSON.stringify({ autoConnect: false }), 'cd4a.test.config.false-no-conflict.json'), false);
                const args = parseConfig([
                    '--config',
                    testConfig.path,
                    '--executablePath',
                    '/bin/chrome',
                ]);
                assert.strictEqual(args.autoConnect, false);
                assert.strictEqual(args.executablePath, '/bin/chrome');
            }
            catch (e_25) {
                env_25.error = e_25;
                env_25.hasError = true;
            }
            finally {
                __disposeResources(env_25);
            }
        });
        it('lets a cli false override a conflicting config value', async () => {
            const env_26 = { stack: [], error: void 0, hasError: false };
            try {
                const testConfig = __addDisposableResource(env_26, createTempFile(JSON.stringify({ autoConnect: true }), 'cd4a.test.config.false-override.json'), false);
                const args = parseConfig([
                    '--config',
                    testConfig.path,
                    '--autoConnect=false',
                    '--executablePath',
                    '/bin/chrome',
                ]);
                assert.strictEqual(args.autoConnect, false);
                assert.strictEqual(args.executablePath, '/bin/chrome');
            }
            catch (e_26) {
                env_26.error = e_26;
                env_26.hasError = true;
            }
            finally {
                __disposeResources(env_26);
            }
        });
        for (const connectArgs of [
            ['--auto-connect'],
            ['--browserUrl', 'http://localhost:9222'],
            ['--wsEndpoint', 'ws://localhost:9222'],
        ]) {
            it(`allows categoryExtensions with ${connectArgs[0]}`, async () => {
                const args = parseConfig(['--category-extensions', ...connectArgs]);
                assert.strictEqual(args.categoryExtensions, true);
            });
        }
        for (const connectArgs of [
            ['--browserUrl', 'http://localhost:9222'],
            ['--wsEndpoint', 'ws://localhost:9222'],
            ['--executablePath', '/tmp/chrome'],
        ]) {
            it(`does not default channel with ${connectArgs[0]}`, async () => {
                const args = parseConfig(connectArgs);
                assert.strictEqual(args.channel, undefined);
            });
        }
        for (const connectArgs of [
            ['--browserUrl', 'http://localhost:9222'],
            ['--wsEndpoint', 'ws://localhost:9222'],
            ['--auto-connect'],
        ]) {
            it(`allows viaCli with ${connectArgs[0]} without enabling extensions`, async () => {
                const args = parseConfig(['--viaCli', ...connectArgs]);
                assert.strictEqual(args.categoryExtensions, undefined);
                assert.strictEqual(args.isolated, false);
            });
        }
        it('allows explicit categoryExtensions with browserUrl in viaCli', async () => {
            const args = parseConfig([
                '--viaCli',
                '--category-extensions',
                '--browserUrl',
                'http://localhost:9222',
            ]);
            assert.strictEqual(args.categoryExtensions, true);
        });
    });
    describe('dataFormat', () => {
        it('keeps experimentalToonFormat and experimentalDataFormat separate', () => {
            const args = parseConfig(['--experimentalToonFormat']);
            assert.strictEqual(args.experimentalToonFormat, true);
            assert.strictEqual(args.experimentalDataFormat, undefined);
        });
    });
});
describe('cli command strings', () => {
    const required = { description: '', required: true, positional: true };
    const dummyArgsVariadic = {
        arg1: { name: 'arg1', type: 'string', ...required },
        arrArg: { name: 'arrArg', type: 'array', ...required },
    };
    const dummyArgsPlain = {
        arg1: { name: 'arg1', type: 'string', ...required },
        arg2: { name: 'arg2', type: 'string', ...required },
    };
    const dummyArgsOptional = {
        arg1: { name: 'arg1', type: 'string', ...required },
        optArg: {
            name: 'optArg',
            type: 'boolean',
            description: '',
            required: false,
            positional: false,
        },
    };
    it('renders a required array arg as a variadic positional', () => {
        const { command } = buildCommand('dummy_cmd', dummyArgsVariadic);
        assert.strictEqual(command, 'dummy_cmd <arg1> <arrArg..>');
    });
    it('renders required non-array args as plain positionals', () => {
        const { command } = buildCommand('dummy_cmd', dummyArgsPlain);
        assert.strictEqual(command, 'dummy_cmd <arg1> <arg2>');
    });
    it('keeps evaluate_script function as an optional positional', () => {
        const { command, usage } = buildCommand('evaluate_script', commands['evaluate_script'].args);
        assert.strictEqual(command, 'evaluate_script [function]');
        assert.ok(!usage.includes('[--function]'));
        assert.ok(usage.includes('[--sourcePath]'));
    });
    it('lists optional args in the usage line, not the command', () => {
        const { command, usage } = buildCommand('dummy_cmd', dummyArgsOptional);
        assert.ok(!command.includes('--'));
        assert.ok(usage.startsWith(`$0 ${command} `));
        assert.ok(usage.includes('[--optArg]'));
    });
    it('keeps every generated command parsable by yargs', () => {
        for (const [name, { args }] of Object.entries(commands)) {
            const { command } = buildCommand(name, args);
            // A `[--flag]` token in the command string is parsed as a positional.
            assert.ok(!command.includes('--'), `${name}: optional args must not be in the command string`);
            // yargs only allows a variadic positional as the last one.
            const variadic = command.indexOf('..>');
            assert.ok(variadic === -1 || variadic === command.length - 3, `${name}: a variadic positional must be last`);
            // A required array arg the daemon receives as a string fails validation.
            for (const [argName, arg] of Object.entries(args)) {
                if (arg.required && arg.type === 'array') {
                    assert.ok(command.includes(`<${argName}..>`), `${name}: required array arg ${argName} must be variadic`);
                }
            }
        }
    });
});
describe('cli literal args', () => {
    const getSpec = (name) => name in commands ? getCommandArgSpec(commands[name].args) : undefined;
    function shield(argv) {
        const { argv: shielded, restore } = shieldLiteralArgs(argv, getSpec);
        return {
            shielded,
            restored: shielded.map(restore),
            literalIndexes: shielded.flatMap((t, i) => (t !== argv[i] ? [i] : [])),
        };
    }
    it('passes regular args through unchanged', () => {
        const input = ['fill', '1', '1_1', 'a-b', '-5', '--output-format', 'json'];
        assert.deepStrictEqual(shield(input).shielded, input);
    });
    it('shields a lone dash', () => {
        const { shielded, restored } = shield(['fill', '1', '1_1', '-']);
        assert.ok(!shielded[3].startsWith('-'));
        assert.deepStrictEqual(restored, ['fill', '1', '1_1', '-']);
    });
    it('shields unknown dash tokens in unfilled positional slots', () => {
        for (const value of ['--weird', '-abc', '- item', '--pageId=2']) {
            const { shielded, restored } = shield(['fill', '1', '1_1', value]);
            assert.ok(!shielded[3].startsWith('-'), value);
            assert.deepStrictEqual(restored, ['fill', '1', '1_1', value]);
        }
    });
    it('leaves unknown dash tokens alone once positionals are filled', () => {
        const input = ['fill', '1', '1_1', 'x', '--pageid', '2'];
        assert.deepStrictEqual(shield(input).shielded, input);
    });
    it('skips known options and their values', () => {
        const input = [
            '--sessionId',
            'abc',
            'click',
            '--dblClick',
            'true',
            '--output-format=json',
            '1',
            '1_1',
            '--help',
        ];
        assert.deepStrictEqual(shield(input).shielded, input);
        const { restored, literalIndexes } = shield([
            'evaluate_script',
            '--pageId',
            '1',
            '--args',
            'a',
            'b',
            '--weird',
        ]);
        assert.deepStrictEqual(literalIndexes, [6]);
        assert.strictEqual(restored[6], '--weird');
    });
    it('accepts kebab-case and negated forms of known options', () => {
        const input = ['click', '1', '1_1', '--dbl-click', '--no-dblClick'];
        assert.deepStrictEqual(shield(input).shielded, input);
    });
    it('fills a variadic positional with any dash tokens', () => {
        const { restored, literalIndexes } = shield([
            'upload_file',
            '1',
            '1_1',
            '-',
            '--a',
            '-b',
        ]);
        assert.deepStrictEqual(literalIndexes, [3, 4, 5]);
        assert.deepStrictEqual(restored, [
            'upload_file',
            '1',
            '1_1',
            '-',
            '--a',
            '-b',
        ]);
    });
    it('shields every token after -- and drops the separator', () => {
        const { argv, restore } = shieldLiteralArgs(['fill', '1', '--', '--weird', '- item', '--', '-abc'], getSpec);
        assert.strictEqual(argv.length, 6);
        assert.deepStrictEqual(argv.slice(0, 2), ['fill', '1']);
        for (const token of argv.slice(2)) {
            assert.ok(!token.startsWith('-'), `unexpected token ${token}`);
        }
        assert.deepStrictEqual(argv.slice(2).map(restore), [
            '--weird',
            '- item',
            '--',
            '-abc',
        ]);
    });
    it('does not shield unknown flags of non-tool commands', () => {
        const input = ['start', '--weird', 'status', '-x'];
        assert.deepStrictEqual(shield(input).shielded, input);
    });
    it('restores values nested in arrays and leaves other values alone', () => {
        const { argv, restore } = shieldLiteralArgs(['cmd', '--', '-a', '-b'], getSpec);
        assert.deepStrictEqual(restore([argv[1], argv[2], 'x']), ['-a', '-b', 'x']);
        assert.strictEqual(restore(42), 42);
        assert.strictEqual(restore(undefined), undefined);
    });
});
describe('flag usage telemetry', () => {
    it('reports the stable channel for a default launch', async () => {
        const usage = computeFlagUsage(parseConfig([]), mcpOptions);
        assert.strictEqual(usage.isolated_present, undefined);
        assert.strictEqual(usage.channel_present, undefined);
        assert.strictEqual(usage.channel, 'CHANNEL_STABLE');
    });
    for (const connectArgs of [
        ['--browserUrl', 'http://localhost:9222'],
        ['--wsEndpoint', 'ws://localhost:9222'],
        ['--executablePath', '/tmp/chrome'],
    ]) {
        it(`does not report channel with ${connectArgs[0]}`, async () => {
            const usage = computeFlagUsage(parseConfig(connectArgs), mcpOptions);
            assert.strictEqual(usage.isolated_present, undefined);
            assert.strictEqual(usage.channel_present, false);
            assert.strictEqual(usage.channel, undefined);
        });
    }
    it('does not report experimentalDataFormat for legacy experimentalToonFormat', async () => {
        const usage = computeFlagUsage(parseConfig(['--experimentalToonFormat']), mcpOptions);
        assert.strictEqual(usage.experimental_toon_format, true);
        assert.strictEqual(usage.experimental_data_format_present, false);
        assert.strictEqual(usage.experimental_data_format, undefined);
    });
});
//# sourceMappingURL=cli.test.js.map