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
import { McpResponse } from './McpResponse.js';
import { SlimMcpResponse } from './SlimMcpResponse.js';
import { ClearcutLogger } from './telemetry/ClearcutLogger.js';
import { ProtocolError, ProtocolErrorCode, zod, } from './third_party/index.js';
import { labels } from './tools/categories.js';
import { categoryToFlagName } from './config/category-options.js';
import { isAvailableInMode, isBrowserlessTool, isPageScopedTool, isSlimTool, } from './tools/ToolDefinition.js';
import { getErrorMessage } from './utils/errorHandling.js';
import { logger } from './utils/logger.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { isLocalhost } from './utils/url.js';
/**
 * Upper bound on how long a tool call may wait to acquire the browser
 * (connect/launch and McpContext initialization). A connect attempt on a
 * half-open socket can hang without ever failing; this bound turns that into
 * a clear error and abandons the attempt so the next call starts fresh.
 *
 * This does not bound the tool's own work. A slow but valid call (a long
 * `wait_for` timeout, an `evaluate_script` awaiting a slow promise, a
 * Lighthouse audit) must finish on its own terms without the browser being
 * closed underneath it. A transport that dies mid-call is detected by the
 * WebSocket keep-alive configured in BrowserManager#connect(), which rejects
 * the in-flight CDP calls and fires `disconnected`.
 */
export const TOOL_CALL_TIMEOUT_MS = 60_000;
class ToolCallTimeoutError extends Error {
}
function buildDisabledMessage(toolName, flag, categoryLabel) {
    const reason = categoryLabel
        ? `is in category ${categoryLabel} which`
        : `requires ${flag.startsWith('--experimental') ? 'experimental feature' : 'flag'} ${flag} and`;
    return `Tool ${toolName} ${reason} is currently disabled. Enable it by running chrome-devtools start ${flag}=true. For more information check the README.`;
}
function getDisabledReason(tool, serverArgs) {
    if (!isAvailableInMode(tool, serverArgs)) {
        return isSlimTool(tool)
            ? `Tool ${tool.name} is only available with --slim.`
            : `Tool ${tool.name} is not available with --slim.`;
    }
    const category = tool.annotations.category;
    if (category) {
        const flag = categoryToFlagName(category);
        if (!serverArgs[flag]) {
            return buildDisabledMessage(tool.name, `--${flag}`, labels[category]);
        }
    }
    for (const condition of tool.annotations.conditions || []) {
        if (!serverArgs[condition]) {
            return buildDisabledMessage(tool.name, `--${condition}`);
        }
    }
    return undefined;
}
async function validateAndResolvePathOrUrl(filePathOrUrl, context, allowUrl) {
    if (filePathOrUrl.trim().length === 0) {
        return undefined;
    }
    let url;
    try {
        url = new URL(filePathOrUrl);
    }
    catch {
        // Not a URL; fall through and validate it as a regular file path.
    }
    if (url) {
        if (url.protocol === 'file:') {
            return pathToFileURL(await context.validatePath(fileURLToPath(url))).href;
        }
        if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
            // Only pass a remote URL through unchanged for parameters whose sink
            // actually fetches the URL or hands it to the browser (allowUrl). For a
            // filesystem-path parameter, a value that merely looks like an http/ws
            // URL must still be rejected outright: `new URL()` accepts
            // `http://x/../../etc/passwd`, and the downstream filesystem API (e.g.
            // Puppeteer's uploadFile) path.resolve()s that non-absolute string into
            // an absolute host path, which would bypass validatePath (workspace
            // roots and the temp-dir fallback) if it fell through to it unchanged.
            if (allowUrl) {
                return filePathOrUrl;
            }
            throw new Error('This parameter expects a file path, not a URL.');
        }
    }
    return await context.validatePath(filePathOrUrl);
}
function isLocalBrowser(browser) {
    if (browser.process()) {
        return true;
    }
    const wsEndpoint = browser.wsEndpoint();
    if (wsEndpoint && isLocalhost(wsEndpoint)) {
        return true;
    }
    return false;
}
function shouldValidateFile(option, isLocal) {
    if (option === true) {
        return true;
    }
    if (typeof option === 'object' && option !== null) {
        if (isLocal) {
            return Boolean(option.local);
        }
        return Boolean(option.remote);
    }
    return false;
}
/**
 * `isLocal` tells whether files are accessed on the machine the server runs on,
 * which is always the case for browserless tools.
 */
async function validateToolFiles(tool, params, context, isLocal) {
    for (const [key, option] of Object.entries(tool.verifyFilesSchema)) {
        if (shouldValidateFile(option, isLocal)) {
            const allowUrl = option !== true && option.allowUrl === true;
            const val = params[key];
            if (typeof val === 'string') {
                params[key] = await validateAndResolvePathOrUrl(val, context, allowUrl);
            }
            else if (Array.isArray(val)) {
                const updated = [];
                for (const item of val) {
                    if (typeof item === 'string') {
                        const resolved = await validateAndResolvePathOrUrl(item, context, allowUrl);
                        if (resolved !== undefined) {
                            updated.push(resolved);
                        }
                    }
                    else {
                        throw new Error('Unexpected non-string value as a file path or URL');
                    }
                }
                params[key] = updated;
            }
        }
    }
}
function toInputJsonSchema(schema) {
    return zod.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
}
function formatValidationError(toolName, error) {
    const details = error.issues
        .map(issue => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`)
        .join(', ');
    return `Input validation error: Invalid arguments for tool ${toolName}: ${details}`;
}
function errorResult(text) {
    return {
        content: [{ type: 'text', text }],
        isError: true,
    };
}
/**
 * The page id a page tool call targets, or `undefined` when the call targets
 * the selected page. `args` can be the raw or the parsed arguments.
 */
function routedPageId(tool, serverArgs, args) {
    if (!serverArgs.pageIdRouting || isSlimTool(tool)) {
        return undefined;
    }
    const { pageId } = args;
    return typeof pageId === 'number' && Number.isInteger(pageId)
        ? pageId
        : undefined;
}
export class ToolHandler {
    getContext;
    abandonPendingBrowserAttemptOnTimeout;
    #tool;
    #config;
    #registeredInputSchema;
    #disabled = false;
    #disabledReason;
    constructor(tool, config, getContext, abandonPendingBrowserAttemptOnTimeout) {
        this.getContext = getContext;
        this.abandonPendingBrowserAttemptOnTimeout = abandonPendingBrowserAttemptOnTimeout;
        this.#tool = tool;
        this.#config = config;
        this.#registeredInputSchema = zod.object(tool.schema).strict();
        this.#updateStatus(tool);
    }
    get registeredInputSchema() {
        return this.#registeredInputSchema;
    }
    /**
     * Whether the tool is hidden from the client.
     */
    get disabled() {
        return this.#disabled;
    }
    #updateStatus(tool) {
        const serverArgs = this.#config.resolved;
        this.#disabledReason = getDisabledReason(tool, serverArgs);
        this.#disabled =
            Boolean(this.#disabledReason) &&
                (!isAvailableInMode(tool, serverArgs) || !serverArgs.viaCli);
    }
    /**
     * Replaces the tool definition and re-evaluates its status against the
     * current server config. Callers must pause the task runner, so calls that
     * are already waiting run with the new state. Returns true if the tool
     * listing visible to the client changed.
     */
    update(tool) {
        const previousTool = this.#tool;
        const previousDisabled = this.#disabled;
        const previousInputSchema = this.#registeredInputSchema;
        const nextInputSchema = zod.object(tool.schema).strict();
        this.#tool = tool;
        this.#registeredInputSchema = nextInputSchema;
        this.#updateStatus(tool);
        if (previousDisabled !== this.#disabled) {
            return true;
        }
        if (this.#disabled) {
            return false;
        }
        return (previousTool.description !== tool.description ||
            !isDeepStrictEqual(previousTool.annotations, tool.annotations) ||
            !isDeepStrictEqual(toInputJsonSchema(previousInputSchema), toInputJsonSchema(nextInputSchema)));
    }
    /**
     * Races a promise against TOOL_CALL_TIMEOUT_MS, calling onTimeout() if the
     * timer wins. The loser of the race is left running — there is no way to
     * cancel a pending connect/launch — but since nothing is left awaiting it,
     * it cannot block subsequent tool calls.
     */
    async #raceWithTimeout(promise, onTimeout) {
        const timeoutError = new ToolCallTimeoutError(`Tool "${this.#tool.name}" timed out after ${TOOL_CALL_TIMEOUT_MS}ms waiting for the browser connection to be established. The connection attempt will be retried automatically on the next tool call.`);
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(timeoutError), TOOL_CALL_TIMEOUT_MS);
            timer.unref?.();
        });
        try {
            return await Promise.race([promise, timeout]);
        }
        catch (err) {
            if (err === timeoutError) {
                onTimeout();
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
    #dataFormat(serverArgs) {
        // --experimentalDataFormat takes precedence over the legacy
        // --experimentalToonFormat.
        return (serverArgs.experimentalDataFormat ??
            (serverArgs.experimentalToonFormat ? 'toon' : 'default'));
    }
    /**
     * Browserless tools never establish a browser connection, so they also never
     * wait for one under TOOL_CALL_TIMEOUT_MS.
     */
    async #runBrowserlessTool(tool, params, response, context) {
        try {
            await validateToolFiles(tool, params, context, true);
            await tool.handler({ params }, response, context);
        }
        catch (err) {
            response.setError(err);
        }
        return await response.handle(context, this.#dataFormat(this.#config.resolved));
    }
    async #runBrowserTool(tool, params, response, context, onTelemetryData) {
        // ensureBrowser() has no cancellation mechanism, so this timeout only
        // stops us from waiting — the attempt itself keeps running abandoned.
        // abandonPendingBrowserAttemptOnTimeout() tells BrowserManager to
        // discard that attempt if it succeeds later instead of handing it to a
        // subsequent caller — see BrowserManager#abandonPendingAttempt()'s doc
        // comment for the full mechanism.
        const browser = await this.#raceWithTimeout(context.ensureBrowser(), () => this.abandonPendingBrowserAttemptOnTimeout());
        logger?.(`${tool.name} browser: resolved`);
        if (context.consumeReconnectNotice()) {
            response.setReconnectNotice();
        }
        let page;
        try {
            await validateToolFiles(tool, params, context, isLocalBrowser(browser));
            if (isPageScopedTool(tool)) {
                const pageId = routedPageId(tool, this.#config.resolved, params);
                page =
                    pageId !== undefined
                        ? context.getPageById(pageId)
                        : context.getSelectedMcpPage();
                await page?.init({ emulateFocus: true });
                response.setPage(page);
                if (tool.blockedByDialog) {
                    page.throwIfDialogOpen();
                }
                await tool.handler({
                    params,
                    page,
                }, response, context);
            }
            else {
                await tool.handler({
                    params,
                }, response, context);
            }
        }
        catch (err) {
            response.setError(err);
        }
        onTelemetryData(await context.getDevToolsData(page), context.getSelectedMcpPageUrl(page));
        return await response.handle(context, this.#dataFormat(this.#config.resolved));
    }
    /**
     * The queue the call runs on. `'none'` tools run outside the runner.
     * `'page'` tools run on the queue of the page named by `rawArgs.pageId`
     * when page id routing applies; every other call runs on the context
     * queue.
     */
    #queueFor(context, rawArgs) {
        const tool = this.#tool;
        switch (tool.concurrency) {
            case 'none':
                return undefined;
            case 'page': {
                const pageId = routedPageId(tool, this.#config.resolved, rawArgs);
                return pageId !== undefined
                    ? context.pageTaskQueue(pageId)
                    : context.taskQueue;
            }
            default:
                return context.taskQueue;
        }
    }
    handle = async (rawArgs = {}, options) => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const context = await this.getContext();
            let queueGuard;
            try {
                queueGuard = await this.#queueFor(context, rawArgs)?.scheduleTask();
            }
            catch (err) {
                // The queue was disposed while the call waited, e.g. the page closed.
                return errorResult(getErrorMessage(err));
            }
            const guard = __addDisposableResource(env_1, queueGuard, false);
            if (options?.viaMcp && this.#disabled) {
                throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Tool ${this.#tool.name} disabled`);
            }
            if (this.#disabledReason) {
                return errorResult(this.#disabledReason);
            }
            const tool = this.#tool;
            const parseResult = this.#registeredInputSchema.safeParse(rawArgs);
            if (!parseResult.success) {
                return errorResult(formatValidationError(tool.name, parseResult.error));
            }
            const params = parseResult.data;
            const startTime = Date.now();
            let success = false;
            let devToolsData;
            let pageUrl;
            try {
                logger?.(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
                const response = isSlimTool(tool)
                    ? new SlimMcpResponse(this.#config)
                    : new McpResponse(this.#config);
                const { content, structuredContent } = isBrowserlessTool(tool)
                    ? await this.#runBrowserlessTool(tool, params, response, context)
                    : await this.#runBrowserTool(tool, params, response, context, (data, url) => {
                        devToolsData = data;
                        pageUrl = url;
                    });
                const result = {
                    content,
                };
                if (response.error) {
                    result.isError = true;
                }
                success = true;
                if (this.#config.resolved.experimentalStructuredContent) {
                    result.structuredContent = structuredContent;
                }
                return result;
            }
            catch (err) {
                logger?.(`${tool.name} error:`, err, err?.stack);
                let errorText = err && 'message' in err ? err.message : String(err);
                let cause = err && typeof err === 'object' && 'cause' in err
                    ? err.cause
                    : undefined;
                const seenCauses = new Set([err]);
                while (cause &&
                    typeof cause === 'object' &&
                    !seenCauses.has(cause) &&
                    'message' in cause &&
                    typeof cause.message === 'string') {
                    seenCauses.add(cause);
                    errorText += `\nCause: ${cause.message}`;
                    cause = 'cause' in cause ? cause.cause : undefined;
                }
                return errorResult(errorText);
            }
            finally {
                void ClearcutLogger.get()?.logToolInvocation({
                    toolName: tool.name,
                    params,
                    schema: tool.schema,
                    success,
                    latencyMs: Date.now() - startTime,
                    devToolsData,
                    pageUrl,
                });
            }
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    };
}
//# sourceMappingURL=ToolHandler.js.map