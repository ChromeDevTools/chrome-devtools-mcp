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
import { DevToolsCommentBridge } from './devtools/DevToolsCommentBridge.js';
import { createTargetUniverse, } from './devtools/DevtoolsUtils.js';
import { ConsoleCollector, NetworkCollector, } from './collectors/PageCollector.js';
import { TextSnapshot } from './TextSnapshot.js';
import { PredefinedNetworkConditions, DevTools, lighthouseNavigation, lighthouseSnapshot, } from './third_party/index.js';
import { logger } from './utils/logger.js';
import { getNetworkMultiplierFromString, WaitForHelper, } from './utils/WaitForHelper.js';
export function replaceHtmlElementsWithUids(schema) {
    if (typeof schema === 'boolean') {
        return;
    }
    let isHtmlElement = false;
    for (const [key, value] of Object.entries(schema)) {
        if (key === 'x-mcp-type' && value === 'HTMLElement') {
            isHtmlElement = true;
            break;
        }
    }
    if (isHtmlElement) {
        schema.properties = { uid: { type: 'string' } };
        schema.required = ['uid'];
    }
    if (schema.properties) {
        for (const key of Object.keys(schema.properties)) {
            replaceHtmlElementsWithUids(schema.properties[key]);
        }
    }
    if (schema.items) {
        if (Array.isArray(schema.items)) {
            for (const item of schema.items) {
                replaceHtmlElementsWithUids(item);
            }
        }
        else {
            replaceHtmlElementsWithUids(schema.items);
        }
    }
    if (schema.anyOf) {
        for (const s of schema.anyOf) {
            replaceHtmlElementsWithUids(s);
        }
    }
    if (schema.allOf) {
        for (const s of schema.allOf) {
            replaceHtmlElementsWithUids(s);
        }
    }
    if (schema.oneOf) {
        for (const s of schema.oneOf) {
            replaceHtmlElementsWithUids(s);
        }
    }
}
function isDebuggingWebMcpTool(tool) {
    return Boolean(tool.annotations &&
        'debugging' in tool.annotations &&
        tool.annotations.debugging === true);
}
const DEFAULT_TIMEOUT = 5_000;
const NAVIGATION_TIMEOUT = 10_000;
/**
 * Chrome reports a URL-derived placeholder as the target title until the
 * document provides one. The placeholder omits the `http://` / `https://`
 * scheme and the trailing slash of a bare hostname.
 */
function isPlaceholderTitle(title, url) {
    if (title === url) {
        return true;
    }
    const withoutScheme = url.replace(/^https?:\/\//, '');
    return title === withoutScheme || title === withoutScheme.replace(/\/$/, '');
}
function isBackendNodeId(id) {
    return typeof id === 'number';
}
/**
 * Per-page state wrapper. Consolidates dialog, snapshot, emulation,
 * and metadata that were previously scattered across Maps in McpContext.
 *
 * Internal class consumed only by McpContext. Fields are public for direct
 * read/write access. The dialog field is private because it requires an
 * event listener lifecycle managed by the init/dispose pair.
 */
export class McpPage {
    target;
    id;
    #pptrPage;
    #initPromise;
    #focusEmulationRequested = false;
    #disposed = false;
    #closed = false;
    // Snapshot
    textSnapshot = null;
    uniqueBackendNodeIdToMcpId = new Map();
    extraHandles = [];
    // Emulation
    emulationSettings = {};
    // Metadata
    isolatedContextName;
    #devtoolsUniverse;
    // Dialog
    #dialog;
    #dialogHandler;
    // Screencast
    #screenRecorder = null;
    // Performance trace
    #isRunningPerformanceTrace = false;
    #networkCollector;
    #consoleCollector;
    #locatorClass;
    #navigationTimeout;
    #config;
    #commentBridge;
    constructor(target, id, options) {
        this.#config = options.config;
        this.#locatorClass = options.locatorClass;
        this.#navigationTimeout = options.navigationTimeout ?? NAVIGATION_TIMEOUT;
        this.target = target;
        this.id = id;
        this.isolatedContextName = options.isolatedContextName;
        this.#dialogHandler = (dialog) => {
            this.#dialog = dialog;
        };
    }
    get #hasNetworkBlockOrAllowlist() {
        return Boolean(this.#config.resolved.allowedUrlPattern ||
            this.#config.resolved.blockedUrlPattern);
    }
    get pptrPage() {
        if (!this.#pptrPage) {
            throw new Error(`McpPage (id=${this.id}) is not initialized. Call init() first.`);
        }
        return this.#pptrPage;
    }
    get networkCollector() {
        if (!this.#networkCollector) {
            throw new Error(`McpPage (id=${this.id}) is not initialized. Call init() first.`);
        }
        return this.#networkCollector;
    }
    set networkCollector(collector) {
        this.#networkCollector = collector;
    }
    get consoleCollector() {
        if (!this.#consoleCollector) {
            throw new Error(`McpPage (id=${this.id}) is not initialized. Call init() first.`);
        }
        return this.#consoleCollector;
    }
    url() {
        return this.#pptrPage?.url() ?? this.target.url();
    }
    get targetId() {
        // @ts-expect-error internal types
        const info = this.target._getTargetInfo();
        return info.targetId;
    }
    /**
     * Returns the page title or an empty string if the target only has Chrome's
     * URL-based placeholder title.
     *
     * Puppeteer's cached target info is only refreshed by
     * `Target.targetInfoChanged`, which Chrome emits on navigation commit (before
     * the document title is known) but not on title changes. Callers should pass
     * fresh target info (e.g., from `Target.getTargets`) when available.
     */
    getTitle(freshTargetInfo) {
        // @ts-expect-error internal types
        const cachedInfo = this.target._getTargetInfo();
        const info = freshTargetInfo ?? cachedInfo;
        return isPlaceholderTitle(info.title, info.url) ? '' : info.title;
    }
    isClosed() {
        if (this.#closed) {
            return true;
        }
        if (this.#pptrPage) {
            return this.#pptrPage.isClosed();
        }
        return this.#disposed;
    }
    async close() {
        this.#closed = true;
        const page = this.#pptrPage ??
            (await this.target.page()) ??
            (await this.target.asPage());
        this.dispose();
        await page?.close({ runBeforeUnload: false });
    }
    async init(options) {
        if (this.#disposed) {
            throw new Error(`McpPage (id=${this.id}) has already been disposed.`);
        }
        if (!this.#initPromise) {
            this.#initPromise = this.#doInit().catch(err => {
                this.#initPromise = undefined;
                throw err;
            });
        }
        await this.#initPromise;
        // Discovery skips focus emulation, but a later page tool still needs it.
        if (options?.emulateFocus !== false &&
            !this.#disposed &&
            !this.#focusEmulationRequested) {
            // Prevent duplicate requests while pending and after success.
            this.#focusEmulationRequested = true;
            this.#initFocusEmulationNoThrow();
        }
    }
    async #doInit() {
        if (!this.#pptrPage) {
            const page = (await this.target.page()) ?? (await this.target.asPage());
            if (!page) {
                throw new Error(`Failed to initialize Puppeteer Page for target ${this.target.url()}`);
            }
            if (this.#disposed) {
                return;
            }
            this.#pptrPage = page;
            page.on('dialog', this.#dialogHandler);
            this.#networkCollector = new NetworkCollector(page, {
                maxNavigationSaved: this.#config.resolved.maxNavigationSaved,
            });
            this.#consoleCollector = new ConsoleCollector(page, collect => {
                return {
                    console: event => {
                        collect(event);
                    },
                    uncaughtError: event => {
                        collect(event);
                    },
                    devtoolsAggregatedIssue: event => {
                        collect(event);
                    },
                };
            }, { maxNavigationSaved: this.#config.resolved.maxNavigationSaved });
        }
        this.updateTimeouts();
        await this.#initDevToolsUniverseNoThrow();
        if (this.#disposed) {
            this.dispose();
        }
    }
    #initFocusEmulationNoThrow() {
        // Background pages need emulated focus for multi-agent workflows.
        void this.pptrPage.emulateFocusedPage(true).catch(error => {
            // Allow the next page operation to retry a transient failure.
            this.#focusEmulationRequested = false;
            logger?.('Error turning on focused page emulation', error);
        });
    }
    async #initDevToolsUniverseNoThrow() {
        if (this.#devtoolsUniverse) {
            return undefined;
        }
        try {
            const session = await this.pptrPage.createCDPSession();
            this.#devtoolsUniverse = await createTargetUniverse(session, {
                sourceMaps: this.#config.resolved.sourceMaps,
            });
        }
        catch (e) {
            logger?.('Failed to initialize DevTools universe', e);
        }
    }
    syncSourceMaps() {
        if (!this.#devtoolsUniverse) {
            return;
        }
        const sourceMaps = this.#config.resolved.sourceMaps;
        this.#devtoolsUniverse.universe.settings
            .resolve(DevTools.SDKSettings.jsSourceMapsEnabledSettingDescriptor)
            .set(sourceMaps);
        this.#devtoolsUniverse.universe.settings
            .resolve(DevTools.SDKSettings.cssSourceMapsEnabledSettingDescriptor)
            .set(sourceMaps);
    }
    get devtoolsUniverse() {
        return this.#devtoolsUniverse;
    }
    getDialog() {
        if (this.#dialog?.handled) {
            this.#dialog = undefined;
        }
        return this.#dialog;
    }
    clearDialog() {
        this.#dialog = undefined;
    }
    getScreenRecorder() {
        return this.#screenRecorder;
    }
    setScreenRecorder(data) {
        this.#screenRecorder = data;
    }
    isRunningPerformanceTrace() {
        return this.#isRunningPerformanceTrace;
    }
    setIsRunningPerformanceTrace(x) {
        this.#isRunningPerformanceTrace = x;
    }
    throwIfDialogOpen() {
        const dialog = this.getDialog();
        if (dialog) {
            throw new Error(`A dialog is open (${dialog.type()}: ${dialog.message()}).`);
        }
    }
    #getDebuggingWebMcpToolGroups() {
        const webmcpTools = this.pptrPage.webmcp
            .tools()
            .filter(isDebuggingWebMcpTool);
        if (webmcpTools.length === 0) {
            return [];
        }
        return [
            {
                name: 'WebMCP Tools',
                description: 'Tools exposed via WebMCP',
                tools: webmcpTools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: structuredClone(tool.inputSchema ?? {}),
                })),
            },
        ];
    }
    async discoverThirdPartyDeveloperTools() {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            // Check if there is a `devtoolstooldiscovery` event listener
            const windowHandle = __addDisposableResource(env_1, await this.pptrPage.evaluateHandle(() => window), false);
            // @ts-expect-error internal API
            const client = this.pptrPage._client();
            const { listeners = [] } = await client.send('DOMDebugger.getEventListeners', {
                objectId: windowHandle.remoteObject().objectId,
            });
            if (listeners.find(l => l.type === 'devtoolstooldiscovery') === undefined) {
                return this.#getDebuggingWebMcpToolGroups();
            }
            const eventToolGroups = await this.pptrPage.evaluate(() => {
                if (window.__dtmcp) {
                    window.__dtmcp.toolGroups = [];
                }
                return new Promise(resolve => {
                    const event = new CustomEvent('devtoolstooldiscovery');
                    const groups = [];
                    // @ts-expect-error Adding custom property
                    event.respondWith = toolGroup => {
                        if (!window.__dtmcp) {
                            window.__dtmcp = {};
                        }
                        if (!window.__dtmcp.toolGroups) {
                            window.__dtmcp.toolGroups = [];
                        }
                        if (typeof toolGroup.name !== 'string' ||
                            (toolGroup.description &&
                                typeof toolGroup.description !== 'string') ||
                            !Array.isArray(toolGroup.tools)) {
                            console.error('Invalid toolGroup:', toolGroup);
                            return;
                        }
                        for (const tool of toolGroup.tools) {
                            if (typeof tool.name !== 'string' ||
                                typeof tool.description !== 'string' ||
                                typeof tool.inputSchema !== 'object' ||
                                typeof tool.execute !== 'function') {
                                console.error('Invalid tool:', tool);
                                return;
                            }
                        }
                        window.__dtmcp.toolGroups.push(toolGroup);
                        // When receiving a toolGroup for the first time, expose a simple execution helper
                        if (!window.__dtmcp.executeTool) {
                            window.__dtmcp.executeTool = async (toolName, args) => {
                                if (!window.__dtmcp?.toolGroups ||
                                    window.__dtmcp.toolGroups.length === 0) {
                                    throw new Error('No tools found on the page');
                                }
                                for (const group of window.__dtmcp.toolGroups) {
                                    const tool = group.tools?.find(t => t.name === toolName);
                                    if (tool) {
                                        return await tool.execute(args);
                                    }
                                }
                                throw new Error(`Tool ${toolName} not found`);
                            };
                        }
                        groups.push(toolGroup);
                    };
                    window.dispatchEvent(event);
                    // If at least one toolGroup was added synchronously, resolve with the array.
                    // Otherwise, use setTimeout to allow for any microtask/asynchronous respondWith calls, or resolve with an empty array.
                    if (groups.length > 0) {
                        resolve(groups);
                    }
                    else {
                        setTimeout(() => {
                            if (groups.length > 0) {
                                resolve(groups);
                            }
                            else {
                                resolve([]);
                            }
                        }, 0);
                    }
                });
            });
            for (const group of eventToolGroups) {
                for (const tool of group.tools ?? []) {
                    replaceHtmlElementsWithUids(tool.inputSchema);
                }
            }
            return [...this.#getDebuggingWebMcpToolGroups(), ...eventToolGroups];
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    getWebMcpTools() {
        return this.pptrPage.webmcp
            .tools()
            .filter(tool => !isDebuggingWebMcpTool(tool));
    }
    resolveCdpRequestId(cdpRequestId) {
        if (!cdpRequestId) {
            logger?.('no network request');
            return;
        }
        const request = this.networkCollector.find(request => {
            // @ts-expect-error id is internal.
            return request.id === cdpRequestId;
        });
        if (!request) {
            logger?.('no network request for ' + cdpRequestId);
            return;
        }
        return this.networkCollector.getIdForResource(request);
    }
    resolveReqidToCdpRequestId(reqid) {
        const request = this.networkCollector.getById(reqid);
        if (!request) {
            return undefined;
        }
        // @ts-expect-error id is internal.
        return request.id;
    }
    getNetworkRequests(includePreservedRequests) {
        return this.networkCollector.getData(includePreservedRequests);
    }
    get commentBridge() {
        return this.#commentBridge;
    }
    disposeCommentBridge() {
        this.#commentBridge?.dispose();
        this.#commentBridge = undefined;
    }
    /**
     * Returns the comment bridge attached to the DevTools page, or undefined if
     * the DevTools page does not support DevTools comments.
     */
    async ensureDevToolsCommentBridge(devtoolsPage) {
        if (!this.#commentBridge) {
            this.#commentBridge = new DevToolsCommentBridge();
        }
        const attached = await this.#commentBridge.attach(devtoolsPage);
        return attached ? this.#commentBridge : undefined;
    }
    async getDevToolsPage() {
        try {
            if (await this.pptrPage.hasDevTools()) {
                return await this.pptrPage.openDevTools();
            }
            return undefined;
        }
        catch {
            // Prior to Chrome 144.0.7559.59, the command fails,
            // Some Electron apps still use older version
            // Fall back to not exposing DevTools at all.
            return undefined;
        }
    }
    async openDevTools() {
        const devtoolsPage = await this.pptrPage.openDevTools();
        if (this.#config.resolved.devtoolsComments) {
            await this.ensureDevToolsCommentBridge(devtoolsPage);
        }
        return devtoolsPage;
    }
    getConsoleData(includePreservedMessages) {
        return this.consoleCollector.getData(includePreservedMessages);
    }
    getConsoleMessageById(id) {
        return this.consoleCollector.getById(id);
    }
    getNetworkRequestById(reqid) {
        return this.networkCollector.getById(reqid);
    }
    get networkConditions() {
        return this.emulationSettings.networkConditions ?? null;
    }
    get cpuThrottlingRate() {
        return this.emulationSettings.cpuThrottlingRate ?? 1;
    }
    get geolocation() {
        return this.emulationSettings.geolocation ?? null;
    }
    get viewport() {
        return this.emulationSettings.viewport ?? null;
    }
    get userAgent() {
        return this.emulationSettings.userAgent ?? null;
    }
    get colorScheme() {
        return this.emulationSettings.colorScheme ?? null;
    }
    get forcedColors() {
        return this.emulationSettings.forcedColors ?? null;
    }
    get prefersContrast() {
        return this.emulationSettings.prefersContrast ?? null;
    }
    get prefersReducedMotion() {
        return this.emulationSettings.prefersReducedMotion ?? null;
    }
    // Public for testability: tests spy on this method to verify throttle multipliers.
    createWaitForHelper(cpuMultiplier, networkMultiplier) {
        return new WaitForHelper(this.pptrPage, cpuMultiplier, networkMultiplier);
    }
    waitForEventsAfterAction(action, options) {
        const helper = this.createWaitForHelper(this.cpuThrottlingRate, getNetworkMultiplierFromString(this.networkConditions));
        return helper.waitForEventsAfterAction(action, options);
    }
    dispose() {
        this.#disposed = true;
        this.#isRunningPerformanceTrace = false;
        this.disposeCommentBridge();
        if (this.#screenRecorder) {
            const { recorder } = this.#screenRecorder;
            this.#screenRecorder = null;
            void recorder.stop().catch(e => {
                logger?.('Failed to stop screencast recording on dispose', e);
            });
        }
        this.#pptrPage?.off('dialog', this.#dialogHandler);
        this.#networkCollector?.dispose();
        this.#consoleCollector?.dispose();
        const devtoolsUniverse = this.#devtoolsUniverse;
        this.#devtoolsUniverse = undefined;
        devtoolsUniverse?.universe.dispose();
        void devtoolsUniverse?.session.detach().catch(e => {
            logger?.('Failed to detach DevTools session', e);
        });
    }
    async executeThirdPartyDeveloperTool(toolName, params, response) {
        const webmcpTool = this.pptrPage.webmcp
            .tools()
            .find(t => t.name === toolName && isDebuggingWebMcpTool(t));
        if (webmcpTool) {
            const { status, output, errorText, exception } = await webmcpTool.execute(params);
            if (status !== 'Completed') {
                const error = exception?.description ?? exception?.value ?? errorText;
                throw new Error(error ? String(error) : `Tool execution failed: ${status}`);
            }
            if (output !== undefined) {
                response.appendResponseLine(JSON.stringify(output, null, 2));
            }
            else {
                response.appendResponseLine('Tool returned no result.');
            }
            return;
        }
        // Creates array of ElementHandles from the UIDs in the params.
        // We do not replace the uids with the ElementsHandles yet, because
        // the `evaluate` function only turns them into DOM elements if they
        // are passed as non-nested arguments.
        const handles = [];
        for (const value of Object.values(params)) {
            if (value instanceof Object &&
                'uid' in value &&
                typeof value.uid === 'string' &&
                Object.keys(value).length === 1) {
                handles.push(await this.getElementByUid(value.uid));
            }
        }
        const result = await this.pptrPage.evaluate(async (name, args, ...elements) => {
            // Replace the UIDs with DOM elements.
            for (const [key, value] of Object.entries(args)) {
                if (value instanceof Object &&
                    'uid' in value &&
                    typeof value.uid === 'string' &&
                    Object.keys(value).length === 1) {
                    args[key] = elements.shift();
                }
            }
            if (!window.__dtmcp?.executeTool) {
                throw new Error('No tools found on the page');
            }
            const toolResult = await window.__dtmcp.executeTool(name, args);
            const stashedElements = [];
            const stashDOMElement = (el) => {
                stashedElements.push(el);
                return {
                    stashedId: `stashed-${stashedElements.length - 1}`,
                };
            };
            const ancestors = new Set();
            // Recursively walks the tool result:
            // - Replaces DOM elements with an ID and stashes the DOM element on the window object
            // - Replaces non-plain objects with a string representation of the object
            // - Replaces circular references with the string '<Circular reference>'
            // - Replaces functions with the string '<Function object>'
            // - Replaces symbols and bigints with their string representation
            const processToolResult = (data) => {
                // 1. Handle DOM Elements
                if (data instanceof Element) {
                    return stashDOMElement(data);
                }
                // 2. Handle Arrays
                if (Array.isArray(data)) {
                    if (ancestors.has(data)) {
                        return '<Circular reference>';
                    }
                    ancestors.add(data);
                    try {
                        return data.map((item) => processToolResult(item));
                    }
                    finally {
                        ancestors.delete(data);
                    }
                }
                // 3. Handle Objects
                if (data !== null && typeof data === 'object') {
                    const proto = Object.getPrototypeOf(data);
                    // If not a plain object, return a string representation of the object
                    if (proto !== null && proto !== Object.prototype) {
                        return `<${data.constructor?.name || 'Object'} instance>`;
                    }
                    if (ancestors.has(data)) {
                        return '<Circular reference>';
                    }
                    ancestors.add(data);
                    try {
                        const processedObj = {};
                        for (const [key, value] of Object.entries(data)) {
                            processedObj[key] = processToolResult(value);
                        }
                        return processedObj;
                    }
                    finally {
                        ancestors.delete(data);
                    }
                }
                // 4. Handle Functions
                if (typeof data === 'function') {
                    return '<Function object>';
                }
                // 5. Handle Symbols and BigInts (not JSON/CDP-by-value serializable)
                if (typeof data === 'symbol') {
                    return data.toString();
                }
                if (typeof data === 'bigint') {
                    return `${data.toString()}n`;
                }
                // 6. Return primitives (strings, numbers, booleans, undefined, null) as-is
                return data;
            };
            const processed = processToolResult(toolResult);
            const serialized = processed !== undefined ? JSON.stringify(processed) : undefined;
            if (stashedElements.length > 0) {
                window.__dtmcp.stashedElements = stashedElements;
            }
            return {
                result: serialized,
                stashed: stashedElements.length,
            };
        }, toolName, params, ...handles);
        const elementHandles = [];
        if (result.stashed > 0) {
            try {
                for (let i = 0; i < result.stashed; i++) {
                    const elementHandle = await this.pptrPage.evaluateHandle(index => {
                        const el = window.__dtmcp?.stashedElements?.[index];
                        if (!el) {
                            throw new Error(`Stashed element at index ${index} not found`);
                        }
                        return el;
                    }, i);
                    elementHandles.push(elementHandle);
                }
            }
            finally {
                try {
                    await this.pptrPage.evaluate(() => {
                        if (window.__dtmcp) {
                            window.__dtmcp.stashedElements = undefined;
                        }
                    });
                }
                catch (error) {
                    logger?.('Failed to clean up stashed elements', error);
                }
            }
        }
        if (elementHandles.length) {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const stack = __addDisposableResource(env_2, new DisposableStack(), false);
                for (const handle of this.extraHandles) {
                    stack.use(handle);
                }
                this.textSnapshot = await TextSnapshot.create(this, {
                    extraHandles: elementHandles,
                });
                response.includeSnapshot();
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        }
        const cdpElementIds = await Promise.all(elementHandles.map(async (elementHandle, index) => {
            const backendNodeId = await elementHandle.backendNodeId();
            if (!backendNodeId) {
                logger?.(`No backendNodeId for stashed DOM element with index ${index}`);
                return `stashed-${index}`;
            }
            const cdpElementId = this.textSnapshot?.resolveCdpElementId(backendNodeId);
            if (!cdpElementId) {
                logger?.(`Could not get cdpElementId for backend node ${backendNodeId}`);
                return `stashed-${index}`;
            }
            return cdpElementId;
        }));
        const recursivelyReplaceStashedElements = (node) => {
            if (Array.isArray(node)) {
                return node.map(x => recursivelyReplaceStashedElements(x));
            }
            if (node !== null && typeof node === 'object') {
                if ('stashedId' in node &&
                    typeof node.stashedId === 'string' &&
                    node.stashedId.startsWith('stashed-') &&
                    Object.keys(node).length === 1) {
                    const index = parseInt(node.stashedId.split('-')[1], 10);
                    return { uid: cdpElementIds[index] };
                }
                const resultObj = {};
                for (const [key, value] of Object.entries(node)) {
                    resultObj[key] = recursivelyReplaceStashedElements(value);
                }
                return resultObj;
            }
            return node;
        };
        if (result.result !== undefined) {
            const parsedResult = JSON.parse(result.result);
            const resultWithUids = recursivelyReplaceStashedElements(parsedResult);
            response.appendResponseLine(JSON.stringify(resultWithUids, null, 2));
        }
        else {
            response.appendResponseLine('Tool returned no result.');
        }
    }
    async getElementByUid(uid) {
        if (!this.textSnapshot) {
            throw new Error(`No snapshot found for page ${this.id ?? '?'}. Use take_snapshot to capture one.`);
        }
        const node = this.textSnapshot.idToNode.get(uid);
        if (!node) {
            throw new Error(`Element uid "${uid}" not found on page ${this.id}.`);
        }
        return await this.#resolveElementHandle(node, uid);
    }
    async #resolveElementHandle(node, uid) {
        const message = `Element with uid ${uid} no longer exists on the page.`;
        try {
            const handle = await node.elementHandle();
            if (!handle) {
                throw new Error(message);
            }
            return handle;
        }
        catch (error) {
            throw new Error(message, {
                cause: error,
            });
        }
    }
    getAXNodeByUid(uid) {
        return this.textSnapshot?.idToNode.get(uid);
    }
    async resolveBackendNodeId(backendNodeId) {
        let id = this.textSnapshot?.resolveCdpElementId(backendNodeId);
        if (id) {
            return id;
        }
        this.textSnapshot = await TextSnapshot.create(this, {
            verbose: this.textSnapshot?.verbose ?? false,
        });
        id = this.textSnapshot.resolveCdpElementId(backendNodeId);
        if (!id && !this.textSnapshot.verbose) {
            this.textSnapshot = await TextSnapshot.create(this, {
                verbose: true,
            });
            id = this.textSnapshot.resolveCdpElementId(backendNodeId);
        }
        return id;
    }
    async resolveUidToBackendNodeId(uid) {
        const target = this.target;
        const targetId = Boolean(target) &&
            '_targetId' in target &&
            typeof target._targetId === 'string'
            ? target._targetId
            : undefined;
        const node = this.getAXNodeByUid(uid);
        if (node?.backendNodeId !== undefined) {
            return { backendNodeId: node.backendNodeId, targetId };
        }
        try {
            const handle = await this.getElementByUid(uid);
            const backendNodeId = await handle.backendNodeId();
            return backendNodeId ? { backendNodeId, targetId } : undefined;
        }
        catch {
            return undefined;
        }
    }
    async getMatchedStylesForUid(uid) {
        if (!this.textSnapshot) {
            throw new Error(`No snapshot found for page ${this.id ?? '?'}. Use take_snapshot to capture one.`);
        }
        const node = this.textSnapshot.idToNode.get(uid);
        if (!node) {
            throw new Error(`Element uid "${uid}" not found on page ${this.id}.`);
        }
        const backendNodeId = node.backendNodeId;
        if (!isBackendNodeId(backendNodeId)) {
            throw new Error(`Failed to resolve backend node ID for element with uid "${uid}".`);
        }
        if (!this.#devtoolsUniverse) {
            throw new Error(`DevTools universe is not available for page ${this.id ?? '?'}.`);
        }
        const targetManager = this.#devtoolsUniverse.universe.context.get(DevTools.TargetManager);
        let domNode;
        let cssModel = null;
        for (const dom of targetManager.models(DevTools.DOMModel.DOMModel)) {
            const nodeMap = await dom.pushNodesByBackendIdsToFrontend(new Set([backendNodeId]));
            const frontendNode = nodeMap?.get(backendNodeId);
            if (frontendNode) {
                domNode = frontendNode;
                cssModel = dom.target().model(DevTools.CSSModel.CSSModel);
                break;
            }
        }
        if (!domNode || !cssModel) {
            throw new Error(`Element with uid "${uid}" was detached or no longer exists on the page. Please take a new snapshot with take_snapshot.`);
        }
        const targetElement = domNode.enclosingElementOrSelf();
        if (!targetElement) {
            throw new Error(`Element with uid "${uid}" is not an element node and has no parent element.`);
        }
        const matchedStyles = await cssModel.getMatchedStyles(targetElement.id);
        if (!matchedStyles) {
            throw new Error(`Could not retrieve matched styles for element with uid "${uid}".`);
        }
        return matchedStyles;
    }
    async getDevToolsData() {
        try {
            logger?.('Getting DevTools UI data');
            const devtoolsPage = await this.getDevToolsPage();
            if (!devtoolsPage) {
                logger?.('No DevTools page detected');
                return {};
            }
            if (this.#config.resolved.devtoolsComments) {
                await this.ensureDevToolsCommentBridge(devtoolsPage);
            }
            const { cdpRequestId, cdpBackendNodeId } = await devtoolsPage.evaluate(async () => {
                // @ts-expect-error no types
                const UI = await import('/bundled/ui/legacy/legacy.js');
                // @ts-expect-error no types
                const SDK = await import('/bundled/core/sdk/sdk.js');
                const request = UI.Context.Context.instance().flavor(SDK.NetworkRequest.NetworkRequest);
                const node = UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode);
                return {
                    cdpRequestId: request?.requestId(),
                    cdpBackendNodeId: node?.backendNodeId(),
                };
            });
            return { cdpBackendNodeId, cdpRequestId };
        }
        catch (err) {
            logger?.('error getting devtools data', err);
        }
        return {};
    }
    async restoreEmulation() {
        const currentSetting = this.emulationSettings;
        const { viewport } = currentSetting;
        if (viewport) {
            // Lighthouse's CDP session replaces the device metrics override and
            // clears it on detach, and Chrome ignores an override identical to the
            // last one this session sent. A different width first makes the real
            // call take effect without a reload (`isMobile` and `hasTouch` stay the
            // same). This also runs after snapshot audits and fires a resize event,
            // so do not remove it as redundant.
            await this.pptrPage.setViewport({
                ...viewport,
                width: Math.max(1, viewport.width - 1),
            });
        }
        await this.emulate(currentSetting);
    }
    async #emulateMediaFeatures(settings) {
        // `page.emulateMediaFeatures` replaces all previously emulated media
        // features, so every supported feature is sent on each call. An empty
        // value disables the override for that feature.
        await this.pptrPage.emulateMediaFeatures([
            { name: 'prefers-color-scheme', value: settings.colorScheme ?? '' },
            { name: 'forced-colors', value: settings.forcedColors ?? '' },
            { name: 'prefers-contrast', value: settings.prefersContrast ?? '' },
            {
                name: 'prefers-reduced-motion',
                value: settings.prefersReducedMotion ?? '',
            },
        ]);
    }
    async emulate(options) {
        const page = this.pptrPage;
        const newSettings = { ...this.emulationSettings };
        // Skip network emulation if blocklist/allowlist is configured, as it conflicts with blocking rules in Puppeteer.
        if (this.#hasNetworkBlockOrAllowlist) {
            if (options.networkConditions !== undefined) {
                throw new Error('Network throttling is not supported when network blocking (allowlist/blocklist) is configured.');
            }
        }
        else if (!options.networkConditions) {
            await page.emulateNetworkConditions(null);
            delete newSettings.networkConditions;
        }
        else if (options.networkConditions === 'Offline') {
            await page.emulateNetworkConditions({
                offline: true,
                download: 0,
                upload: 0,
                latency: 0,
            });
            newSettings.networkConditions = 'Offline';
        }
        else if (options.networkConditions in PredefinedNetworkConditions) {
            const networkCondition = PredefinedNetworkConditions[options.networkConditions];
            await page.emulateNetworkConditions(networkCondition);
            newSettings.networkConditions = options.networkConditions;
        }
        const secondarySession = this.devtoolsUniverse?.session;
        if (!options.cpuThrottlingRate) {
            await page.emulateCPUThrottling(1);
            if (secondarySession) {
                await secondarySession.send('Emulation.setCPUThrottlingRate', {
                    rate: 1,
                });
            }
            delete newSettings.cpuThrottlingRate;
        }
        else {
            await page.emulateCPUThrottling(options.cpuThrottlingRate);
            if (secondarySession) {
                await secondarySession.send('Emulation.setCPUThrottlingRate', {
                    rate: options.cpuThrottlingRate,
                });
            }
            newSettings.cpuThrottlingRate = options.cpuThrottlingRate;
        }
        if (!options.geolocation) {
            await page.setGeolocation(null);
            delete newSettings.geolocation;
        }
        else {
            await page.setGeolocation(options.geolocation);
            newSettings.geolocation = options.geolocation;
        }
        if (!options.userAgent) {
            await page.setUserAgent({ userAgent: undefined });
            delete newSettings.userAgent;
        }
        else {
            await page.setUserAgent({ userAgent: options.userAgent });
            newSettings.userAgent = options.userAgent;
        }
        if (!options.colorScheme || options.colorScheme === 'auto') {
            delete newSettings.colorScheme;
        }
        else {
            newSettings.colorScheme = options.colorScheme;
        }
        if (!options.forcedColors || options.forcedColors === 'auto') {
            delete newSettings.forcedColors;
        }
        else {
            newSettings.forcedColors = options.forcedColors;
        }
        if (!options.prefersContrast || options.prefersContrast === 'auto') {
            delete newSettings.prefersContrast;
        }
        else {
            newSettings.prefersContrast = options.prefersContrast;
        }
        if (!options.prefersReducedMotion ||
            options.prefersReducedMotion === 'auto') {
            delete newSettings.prefersReducedMotion;
        }
        else {
            newSettings.prefersReducedMotion = options.prefersReducedMotion;
        }
        await this.#emulateMediaFeatures(newSettings);
        if (!options.viewport) {
            delete newSettings.viewport;
        }
        else {
            const defaults = {
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false,
                isLandscape: false,
            };
            newSettings.viewport = { ...defaults, ...options.viewport };
        }
        if (options.extraHttpHeaders !== undefined) {
            await page.setExtraHTTPHeaders(options.extraHttpHeaders);
            newSettings.extraHttpHeaders = options.extraHttpHeaders;
            if (Object.keys(options.extraHttpHeaders).length === 0) {
                delete newSettings.extraHttpHeaders;
            }
        }
        const previousViewport = this.emulationSettings.viewport;
        this.emulationSettings = Object.keys(newSettings).length ? newSettings : {};
        this.updateTimeouts();
        // This should happen after updating the page timeouts.
        // Setting the viewport can trigger a reload which we don't want to timeout.
        try {
            await page.setViewport(newSettings.viewport ?? null);
        }
        catch (error) {
            if (previousViewport) {
                newSettings.viewport = previousViewport;
            }
            else {
                delete newSettings.viewport;
            }
            this.emulationSettings = Object.keys(newSettings).length
                ? newSettings
                : {};
            throw error;
        }
    }
    clearNetworkConditions() {
        if (!this.emulationSettings.networkConditions) {
            return;
        }
        delete this.emulationSettings.networkConditions;
        this.updateTimeouts();
    }
    updateTimeouts() {
        if (!this.#pptrPage) {
            return;
        }
        // For waiters 5sec timeout should be sufficient.
        // Increased in case we throttle the CPU
        const cpuMultiplier = this.cpuThrottlingRate;
        this.pptrPage.setDefaultTimeout(DEFAULT_TIMEOUT * cpuMultiplier);
        // 10sec should be enough for the load event to be emitted during
        // navigations.
        // Increased in case we throttle the network requests or the CPU
        const networkMultiplier = getNetworkMultiplierFromString(this.networkConditions);
        this.pptrPage.setDefaultNavigationTimeout(this.#navigationTimeout * networkMultiplier * cpuMultiplier);
    }
    waitForTextOnPage(text, options = {}) {
        const { timeout, visible } = options;
        const page = this.pptrPage;
        const initialFrames = page.frames();
        const observedFrames = new Set(initialFrames);
        const controller = new AbortController();
        const locatorForFrames = (frames) => this.#locatorClass.race(frames.flatMap(frame => text.flatMap(value => {
            const locators = [
                frame.locator(`aria/${value}`),
                frame.locator(`text/${value}`),
            ];
            return visible
                ? locators.map(locator => locator.setVisibility('visible'))
                : locators;
        })));
        let initialLocator = locatorForFrames(initialFrames);
        if (timeout) {
            initialLocator = initialLocator.setTimeout(timeout);
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
                if (settled) {
                    return false;
                }
                settled = true;
                page.off('frameattached', onFrameAttached);
                controller.abort();
                return true;
            };
            const finish = (element) => {
                if (cleanup()) {
                    resolve(element);
                }
            };
            const fail = (error) => {
                if (cleanup()) {
                    reject(error);
                }
            };
            const onFrameAttached = (frame) => {
                if (observedFrames.has(frame)) {
                    return;
                }
                observedFrames.add(frame);
                // The initial locator race does not include frames added later.
                // Watch each new frame until the initial race resolves or times out.
                // A timeout of 0 disables the frame timer; controller.abort() stops it.
                void locatorForFrames([frame])
                    .setTimeout(0)
                    .wait({ signal: controller.signal })
                    .then(finish, error => {
                    if (controller.signal.aborted) {
                        return;
                    }
                    logger?.('Failed to wait for text in an attached frame', error);
                });
            };
            page.on('frameattached', onFrameAttached);
            void initialLocator.wait({ signal: controller.signal }).then(finish, fail);
        });
    }
    lighthouseNavigation(flags) {
        return lighthouseNavigation(this.pptrPage, this.pptrPage.url(), {
            flags,
        });
    }
    lighthouseSnapshot(flags) {
        return lighthouseSnapshot(this.pptrPage, {
            flags,
        });
    }
    /**
     * We need to ignore favicon request as they make our test flaky
     */
    async setUpNetworkCollectorForTesting() {
        this.networkCollector.dispose();
        this.networkCollector = new NetworkCollector(this.pptrPage, { maxNavigationSaved: this.#config.resolved.maxNavigationSaved }, collect => {
            return {
                request: req => {
                    if (req.url().includes('favicon.ico')) {
                        return;
                    }
                    collect(req);
                },
            };
        });
    }
}
//# sourceMappingURL=McpPage.js.map