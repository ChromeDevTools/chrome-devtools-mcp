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
var _a;
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mutex, puppeteer } from './third_party/index.js';
import { logger, puppeteerLogger } from './utils/logger.js';
import { isAllowedUrl } from './utils/url.js';
/**
 * Identity token for an in-flight connect/launch attempt. Instances carry no
 * data and are never inspected structurally — only ever compared by
 * reference (`!==`) — see BrowserManager#abandonPendingAttempt().
 */
class BrowserAttempt {
}
export class BrowserManager {
    #browser;
    #browserMode;
    #initPromise;
    #mutex = new Mutex();
    #closingCount = 0;
    #serverArgs;
    #options;
    #browserAttempt = new BrowserAttempt();
    constructor(serverArgs, options = {}) {
        this.#serverArgs = serverArgs;
        this.#options = options;
    }
    static makeTargetFilter(enableExtensions = false) {
        return function targetFilter(target) {
            const url = target.url();
            if (!url) {
                return true;
            }
            return isAllowedUrl(url, { categoryExtensions: enableExtensions });
        };
    }
    static detectDisplay() {
        // Only detect display on Linux/UNIX.
        if (os.platform() === 'win32' || os.platform() === 'darwin') {
            return;
        }
        if (!process.env['DISPLAY']) {
            try {
                const result = execSync(`ps -u $(id -u) -o pid= | xargs -I{} cat /proc/{}/environ 2>/dev/null | tr '\\0' '\\n' | grep -m1 '^DISPLAY=' | cut -d= -f2`);
                const display = result.toString('utf8').trim();
                process.env['DISPLAY'] = display;
            }
            catch {
                // no-op
            }
        }
    }
    /**
     * Chrome refuses to start as root unless the sandbox is explicitly disabled and
     * only says so on its stderr. Because we launch with `pipe: true`, Puppeteer
     * never surfaces that stderr and the failure reaches the client as an opaque
     * `Protocol error (Target.setDiscoverTargets): Target closed`. Detect the
     * situation and explain the way out instead. See https://crbug.com/638180.
     *
     * Returns `undefined` when the failure cannot be explained by running as root,
     * including on platforms without uids and when the sandbox was already disabled
     * through `--chrome-arg` (in which case root is not what stopped Chrome).
     */
    static rootSandboxLaunchError(error, args, uid = process.getuid?.()) {
        if (uid !== 0) {
            return undefined;
        }
        if (args.some(arg => arg === '--no-sandbox' || arg.startsWith('--no-sandbox='))) {
            return undefined;
        }
        return new Error(`Chrome failed to start: ${error.message}\n\n` +
            'chrome-devtools-mcp is running as root and Chrome does not start as root ' +
            '(https://crbug.com/638180). Run chrome-devtools-mcp as a non-root user; in a ' +
            'container, create an unprivileged user in the image and switch to it with ' +
            "USER. For the setup that Chrome's sandbox needs, see " +
            'https://pptr.dev/troubleshooting#setting-up-chrome-linux-sandbox.', {
            cause: error,
        });
    }
    async ensureBrowser() {
        if (this.#initPromise) {
            return await this.#initPromise;
        }
        const initPromise = this.#ensureBrowserLocked();
        this.#initPromise = initPromise;
        try {
            return await initPromise;
        }
        finally {
            if (this.#initPromise === initPromise) {
                this.#initPromise = undefined;
            }
        }
    }
    async #ensureBrowserLocked() {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            if (this.#closingCount > 0) {
                throw new Error('Browser was closed while initializing.');
            }
            // Captured before acquiring #mutex, not after: a caller queued here can
            // have its own timeout fire (abandonPendingAttempt()) while it's still
            // waiting for the lock. Capturing only after acquiring it would let such
            // a call silently adopt the freshly-rotated token as its own baseline
            // once the lock frees up, defeating the abandonment check entirely.
            const attempt = this.#browserAttempt;
            const guard = __addDisposableResource(env_1, await this.#mutex.acquire(), false);
            if (this.#closingCount > 0) {
                throw new Error('Browser was closed while initializing.');
            }
            if (this.#browserAttempt !== attempt) {
                // Abandoned while queued for the lock — #browser was never touched by
                // this call, so bail immediately without #closeBrowser(), which could
                // otherwise tear down a different, still-current attempt's browser.
                throw new Error('Connection attempt was abandoned before it completed.');
            }
            if (!this.#browser?.connected) {
                await this.#initBrowser();
            }
            if (this.#closingCount > 0 ||
                this.#browserAttempt !== attempt ||
                !this.#browser) {
                const reason = this.#closingCount > 0
                    ? 'Browser was closed while initializing.'
                    : 'Connection attempt was abandoned before it completed.';
                await this.#closeBrowser();
                throw new Error(reason);
            }
            return this.#browser;
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    /**
     * Signals that whoever was waiting on the in-flight ensureBrowser() call
     * has given up (e.g. a tool-call timeout). There's no way to cancel a
     * pending connect()/launch(), so this doesn't stop it — it rotates the
     * token to a fresh value and clears #initPromise, so a late-resolving
     * attempt gets discarded by #ensureBrowserLocked() instead of silently
     * installed for a caller who already walked away.
     *
     * Also forgets the cached #browser, if any. This only ever fires from a
     * getContext()-level timeout, which covers both ensureBrowser() and the
     * McpContext initialization built on it — if ensureBrowser() already
     * resolved and it's that later step hanging (e.g. a dead CDP transport),
     * the token rotation alone does nothing, since #browser is already
     * cached. Safe to forget unconditionally here: the tool mutex serializes
     * every call, so there's no concurrent caller to disrupt.
     */
    abandonPendingAttempt() {
        this.#browserAttempt = new BrowserAttempt();
        this.#initPromise = undefined;
        this.#forgetCurrentBrowser();
    }
    async #initBrowser() {
        if (this.#serverArgs.browserUrl ||
            this.#serverArgs.wsEndpoint ||
            this.#serverArgs.autoConnect) {
            return await this.#connect();
        }
        return await this.#launch();
    }
    async #launch() {
        const { channel, executablePath, headless, isolated = false, categoryExtensions: enableExtensions, viaCli, viewport, acceptInsecureCerts, experimentalDevtools: devtools = false, blockedUrlPattern: blocklist, allowedUrlPattern: allowlist, ignoreDefaultChromeArg, proxyServer, } = this.#serverArgs;
        const profileDirName = channel && channel !== 'stable'
            ? `chrome-profile-${channel}`
            : 'chrome-profile';
        let userDataDir = this.#serverArgs.userDataDir;
        if (!isolated && !userDataDir) {
            userDataDir = path.join(os.homedir(), '.cache', viaCli ? 'chrome-devtools-mcp-cli' : 'chrome-devtools-mcp', profileDirName);
            await fs.promises.mkdir(userDataDir, {
                recursive: true,
            });
        }
        const args = [...(this.#serverArgs.chromeArg ?? [])];
        if (proxyServer) {
            args.push(`--proxy-server=${proxyServer}`);
        }
        args.push('--hide-crash-restore-bubble');
        const ignoreDefaultArgs = ignoreDefaultChromeArg ?? false;
        if (headless) {
            args.push('--screen-info={3840x2160}');
        }
        let puppeteerChannel;
        if (devtools) {
            args.push('--auto-open-devtools-for-tabs');
        }
        if (!executablePath) {
            puppeteerChannel =
                channel && channel !== 'stable' ? `chrome-${channel}` : 'chrome';
        }
        if (!headless) {
            _a.detectDisplay();
        }
        let browser;
        try {
            browser = await puppeteer.launch({
                channel: puppeteerChannel,
                targetFilter: _a.makeTargetFilter(enableExtensions),
                executablePath,
                defaultViewport: null,
                userDataDir,
                pipe: true,
                headless,
                args,
                ignoreDefaultArgs,
                acceptInsecureCerts,
                handleDevToolsAsPage: true,
                enableExtensions,
                blocklist,
                allowlist,
                logger: puppeteerLogger,
            });
            if (this.#options.logFile) {
                // FIXME: we are probably subscribing too late to catch startup logs. We
                // should expose the process earlier or expose the getRecentLogs() getter.
                browser.process()?.stderr?.pipe(this.#options.logFile);
                browser.process()?.stdout?.pipe(this.#options.logFile);
            }
            if (viewport) {
                const [page] = await browser.pages();
                await page?.resize({
                    contentWidth: viewport.width,
                    contentHeight: viewport.height,
                });
            }
            this.#browserMode = 'launched';
            this.#browser = browser;
            const launched = browser;
            launched.once('disconnected', () => this.#evictIfCurrent(launched));
            return launched;
        }
        catch (error) {
            await browser?.close().catch(() => {
                // Best-effort cleanup if post-launch setup failed.
            });
            if (userDataDir &&
                error instanceof Error &&
                error.message.includes('The browser is already running')) {
                throw new Error(`The browser is already running for ${userDataDir}. Use --isolated to run multiple browser instances.`, {
                    cause: error,
                });
            }
            if (error instanceof Error) {
                const rootError = _a.rootSandboxLaunchError(error, args);
                if (rootError) {
                    throw rootError;
                }
            }
            throw error;
        }
    }
    async #connect() {
        const { browserUrl: browserURL, wsEndpoint, wsHeaders, autoConnect: isAutoConnect, userDataDir, blockedUrlPattern: blocklist, allowedUrlPattern: allowlist, categoryExtensions: enableExtensions, } = this.#serverArgs;
        // Important: only pass channel, if autoConnect is true.
        const channel = isAutoConnect ? this.#serverArgs.channel : undefined;
        const connectOptions = {
            targetFilter: _a.makeTargetFilter(enableExtensions),
            defaultViewport: null,
            handleDevToolsAsPage: true,
            blocklist,
            allowlist,
            logger: puppeteerLogger,
            // Detects a transport that died without a close frame (e.g. an adb
            // port-forward torn down mid-call). Puppeteer pings the socket
            // periodically and terminates it on a missed pong, which rejects the
            // in-flight CDP calls and fires `disconnected` so #evictIfCurrent()
            // drops the stale handle. Without this, such a call would hang until
            // protocolTimeout while holding the tool mutex.
            wsOptions: {
                keepAlive: true,
                headers: wsHeaders,
            },
        };
        let autoConnect = false;
        if (wsEndpoint) {
            connectOptions.browserWSEndpoint = wsEndpoint;
        }
        else if (browserURL) {
            connectOptions.browserURL = browserURL;
        }
        else if (channel || userDataDir) {
            if (userDataDir) {
                autoConnect = true;
                // TODO: re-expose this logic via Puppeteer.
                const portPath = path.join(userDataDir, 'DevToolsActivePort');
                try {
                    const fileContent = await fs.promises.readFile(portPath, 'utf8');
                    const [rawPort, rawPath] = fileContent
                        .split('\n')
                        .map(line => {
                        return line.trim();
                    })
                        .filter(line => {
                        return !!line;
                    });
                    if (!rawPort || !rawPath) {
                        throw new Error(`Invalid DevToolsActivePort '${fileContent}' found`);
                    }
                    const port = parseInt(rawPort, 10);
                    if (isNaN(port) || port <= 0 || port > 65535) {
                        throw new Error(`Invalid port '${rawPort}' found`);
                    }
                    const browserWSEndpoint = `ws://127.0.0.1:${port}${rawPath}`;
                    connectOptions.browserWSEndpoint = browserWSEndpoint;
                }
                catch (error) {
                    throw new Error(`Could not connect to Chrome in ${userDataDir}. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.`, {
                        cause: error,
                    });
                }
            }
            else {
                if (!channel) {
                    throw new Error('Channel must be provided if userDataDir is missing');
                }
                connectOptions.channel =
                    channel === 'stable' ? 'chrome' : `chrome-${channel}`;
            }
        }
        else {
            throw new Error('Either browserURL, wsEndpoint, channel or userDataDir must be provided');
        }
        logger?.('Connecting Puppeteer to ', JSON.stringify(connectOptions));
        try {
            const connected = await puppeteer.connect(connectOptions);
            logger?.('Connected Puppeteer');
            this.#browserMode = 'connected';
            this.#browser = connected;
            connected.once('disconnected', () => this.#evictIfCurrent(connected));
            return connected;
        }
        catch (err) {
            throw new Error(`Could not connect to Chrome. ${autoConnect ? `Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.` : `Check if Chrome is running.`}`, {
                cause: err,
            });
        }
    }
    /**
     * Drops the cached browser handle so the next ensureBrowser() call
     * establishes a fresh connection. Only called from abandonPendingAttempt()
     * when a getContext()-level timeout fires after ensureBrowser() already
     * resolved, which means the handle looks connected but its CDP
     * initialization is hanging.
     *
     * Also tears the browser down in the background: closes it if it was
     * launched (so the Chrome subprocess doesn't leak), or disconnects if it
     * was only connected to (so the transport and its listeners don't leak).
     * Puppeteer's connection disposal rejects any in-flight CDP call, so a hung
     * call settles instead of leaking forever.
     */
    #forgetCurrentBrowser() {
        const browser = this.#browser;
        if (!browser) {
            return;
        }
        const mode = this.#browserMode;
        this.#browser = undefined;
        this.#browserMode = undefined;
        if (mode === 'launched') {
            void this.#closeLaunchedBrowser(browser);
        }
        else {
            void browser.disconnect().catch(err => {
                logger?.('Failed to disconnect forgotten browser', err);
            });
        }
    }
    /**
     * Handles a `disconnected` event fired by a browser we hold: clears the
     * cached handle if it's still the current one, so the next ensureBrowser()
     * call reconnects proactively rather than only discovering the staleness
     * lazily on the next call's `!this.#browser?.connected` check. No teardown
     * here — the browser is already disconnected/closed, that's why this
     * fired. The identity guard makes a `disconnected` that fires late on an
     * already-superseded browser a safe no-op.
     */
    #evictIfCurrent(candidate) {
        if (this.#browser !== candidate) {
            return;
        }
        this.#browser = undefined;
        this.#browserMode = undefined;
    }
    async #closeLaunchedBrowser(browser) {
        let timer;
        try {
            await Promise.race([
                browser.close(),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Timed out closing browser')), 5_000);
                    timer.unref?.();
                }),
            ]);
        }
        catch (err) {
            logger?.('Failed to close browser', err);
            browser.process()?.kill('SIGKILL');
        }
        finally {
            clearTimeout(timer);
        }
    }
    async #closeBrowser() {
        const browser = this.#browser;
        const mode = this.#browserMode;
        this.#browser = undefined;
        this.#browserMode = undefined;
        if (!browser || !browser.connected) {
            return;
        }
        if (mode === 'launched') {
            await this.#closeLaunchedBrowser(browser);
            return;
        }
        await browser.disconnect().catch(err => {
            logger?.('Failed to disconnect from browser', err);
        });
    }
    /**
     * Shutdown hook for the active browser. Closes a launched browser (so the
     * Chrome subprocess is reaped) or disconnects from an attached browser (so
     * the user's Chrome instance stays alive). No-op if no browser is active or
     * the connection has already been dropped.
     */
    async close() {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            this.#initPromise = undefined;
            this.#closingCount++;
            const guard = __addDisposableResource(env_2, await this.#mutex.acquire(), false);
            try {
                await this.#closeBrowser();
            }
            finally {
                this.#closingCount--;
            }
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    }
    [Symbol.dispose]() {
        this.close().catch(err => {
            logger?.('Failed to dispose BrowserManager', err);
        });
    }
    async [Symbol.asyncDispose]() {
        await this.close();
    }
}
_a = BrowserManager;
//# sourceMappingURL=BrowserManager.js.map