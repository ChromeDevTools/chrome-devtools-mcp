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
import { pathToFileURL } from 'node:url';
import { zod } from '../third_party/index.js';
import { ToolCategory } from './categories.js';
import { defineTool, pageIdSchema } from './ToolDefinition.js';
export const evaluateScript = defineTool((cliArgs) => {
    return {
        name: 'evaluate_script',
        description: `Evaluate JavaScript inside the target page${cliArgs.categoryExtensions ? ' or service worker' : ''}. The source can be provided inline or loaded from a local file. Returns the response as JSON, so returned values have to be JSON-serializable.`,
        annotations: {
            category: ToolCategory.DEBUGGING,
            readOnlyHint: false,
            conditions: ['javascriptEvaluation'],
        },
        schema: {
            ...(cliArgs.pageIdRouting
                ? cliArgs.categoryExtensions
                    ? {
                        pageId: zod
                            .number()
                            .optional()
                            .describe('Targets a specific page by ID. Required when not evaluating in a service worker.'),
                    }
                    : pageIdSchema
                : {}),
            function: zod
                .string()
                .optional()
                .describe(`JavaScript source to execute in the target page. Provide either this or sourcePath, but not both. The source is interpreted according to format.
Example without arguments: \`() => document.title\` or \`async () => await fetch("example.com")\`.
Example with arguments: \`(el) => el.innerText\`
`),
            sourcePath: zod
                .string()
                .optional()
                .describe("The absolute or relative path to a JavaScript file on the MCP server's local filesystem. Provide either this or function, but not both."),
            format: zod
                .enum(['function', 'script'])
                .optional()
                .describe('How to interpret the source. "function" treats it as a function declaration and supports args. "script" evaluates it as classic JavaScript and does not support args. Defaults to "function". ECMAScript modules are not supported.'),
            args: zod
                .array(zod
                .string()
                .describe('The uid of an element on the page from the page content snapshot'))
                .optional()
                .describe(`An optional list of arguments (element uids from the page content snapshot) to pass to the function.`),
            filePath: zod
                .string()
                .optional()
                .describe('The absolute or relative path to a file to save the script output to. If omitted, the output is returned inline.'),
            dialogAction: zod
                .string()
                .optional()
                .describe('Handle dialogs while execution. "accept", "dismiss", or string for response of window.prompt. Defaults to accept.'),
            waitForStableDom: zod
                .boolean()
                .optional()
                .describe('Whether to wait for the DOM to settle. Pass false if the script only reads data. Defaults to true.'),
            ...(cliArgs.categoryExtensions
                ? {
                    serviceWorkerId: zod
                        .string()
                        .optional()
                        .describe(`The optional service worker id to evaluate the script in. If provided, 'pageId' should be omitted. Note: 'args' (element UIDs) cannot be used when evaluating in a service worker.`),
                }
                : {}),
        },
        blockedByDialog: true,
        verifyFilesSchema: {
            filePath: true,
            sourcePath: true,
        },
        handler: async (request, response, context) => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const { serviceWorkerId, args: uidArgs, function: fnString, sourcePath, format = 'function', pageId, dialogAction, filePath, waitForStableDom, } = request.params;
                const source = await resolveScriptSource(fnString, sourcePath, context);
                if (format === 'script' && uidArgs && uidArgs.length > 0) {
                    throw new Error('args cannot be used when format is "script".');
                }
                if (cliArgs.categoryExtensions && serviceWorkerId) {
                    if (uidArgs && uidArgs.length > 0) {
                        throw new Error('args (element uids) cannot be used when evaluating in a service worker.');
                    }
                    if (pageId) {
                        throw new Error('specify either a pageId or a serviceWorkerId.');
                    }
                    const worker = await getWebWorker(context, serviceWorkerId);
                    const result = await context
                        .getSelectedMcpPage()
                        .waitForEventsAfterAction(async () => {
                        await performEvaluation(worker, source, format, [], response, {
                            filePath,
                            context,
                        });
                    }, 
                    // Service workers cannot interact with the DOM, so never wait for it.
                    { handleDialog: dialogAction ?? 'accept', waitForStableDom: false });
                    if (result.dialogHandled) {
                        context.getSelectedMcpPage().clearDialog();
                    }
                    response.attachWaitForResult(result);
                    return;
                }
                if (cliArgs.categoryExtensions && cliArgs.pageIdRouting && !pageId) {
                    throw new Error('specify either a pageId or a serviceWorkerId.');
                }
                const mcpPage = cliArgs.pageIdRouting && request.params.pageId
                    ? context.getPageById(request.params.pageId)
                    : context.getSelectedMcpPage();
                await mcpPage.init();
                const page = mcpPage.pptrPage;
                const args = [];
                const stack = __addDisposableResource(env_1, new DisposableStack(), false);
                const frames = new Set();
                for (const uid of uidArgs ?? []) {
                    const handle = await mcpPage.getElementByUid(uid);
                    frames.add(handle.frame);
                    stack.use(handle);
                    args.push(handle);
                }
                const evaluatable = await getPageOrFrame(page, frames);
                const result = await mcpPage.waitForEventsAfterAction(async () => {
                    await performEvaluation(evaluatable, source, format, args, response, {
                        filePath,
                        context,
                    });
                }, { handleDialog: dialogAction ?? 'accept', waitForStableDom });
                response.attachWaitForResult(result);
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        },
    };
});
const resolveScriptSource = async (inlineSource, sourcePath, context) => {
    if (inlineSource !== undefined) {
        if (sourcePath !== undefined) {
            throw new Error('Specify exactly one of function or sourcePath.');
        }
        return inlineSource;
    }
    if (sourcePath === undefined) {
        throw new Error('Specify exactly one of function or sourcePath.');
    }
    const resourceUrl = sourcePath.startsWith('file:')
        ? sourcePath
        : pathToFileURL(sourcePath).href;
    try {
        return await context.loadResource(resourceUrl);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read script source from ${sourcePath}: ${errorMessage}`, { cause: error });
    }
};
const performEvaluation = async (evaluatable, source, format, args, response, options) => {
    let result;
    if (format === 'function') {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const functionSource = source.trimEnd().replace(/;$/, '');
            const fn = __addDisposableResource(env_2, await evaluatable.evaluateHandle(`(\n${functionSource}\n)`), false);
            result = await evaluatable.evaluate(async (fn, ...args) => {
                return JSON.stringify(await fn(...args));
            }, fn, ...args);
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    }
    else {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const value = __addDisposableResource(env_3, await evaluatable.evaluateHandle(source), false);
            result = await evaluatable.evaluate(value => JSON.stringify(value), value);
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    }
    if (options.filePath) {
        const data = new TextEncoder().encode(result ?? 'undefined');
        const { filename } = await options.context.saveFile(data, options.filePath, '.json');
        response.appendResponseLine(`Script ran on page. Output saved to ${filename}.`);
    }
    else {
        response.appendResponseLine('Script ran on page and returned:');
        response.appendResponseLine('```json');
        response.appendResponseLine(`${result}`);
        response.appendResponseLine('```');
    }
};
const getPageOrFrame = async (page, frames) => {
    let pageOrFrame;
    // We can't evaluate the element handle across frames
    if (frames.size > 1) {
        throw new Error("Elements from different frames can't be evaluated together.");
    }
    else {
        pageOrFrame = [...frames.values()][0] ?? page;
    }
    return pageOrFrame;
};
const getWebWorker = async (context, serviceWorkerId) => {
    const serviceWorker = context.getWorkerById(serviceWorkerId);
    if (!serviceWorker || serviceWorker.type !== 'service_worker') {
        throw new Error('Service worker not found.');
    }
    const worker = await serviceWorker.worker();
    if (!worker) {
        throw new Error('Service worker target not found.');
    }
    return worker;
};
//# sourceMappingURL=script.js.map