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
import { TimeoutError, zod } from '../third_party/index.js';
import { parseKey } from '../utils/keyboard.js';
import { logger } from '../utils/logger.js';
import { ToolCategory } from './categories.js';
import { definePageTool } from './ToolDefinition.js';
const dblClickSchema = zod
    .boolean()
    .optional()
    .describe('Set to true for double clicks. Default is false.');
const includeSnapshotSchema = zod
    .boolean()
    .optional()
    .describe('Whether to include a snapshot in the response. Default is false.');
const submitKeySchema = zod
    .string()
    .optional()
    .describe('Optional key to press after typing. E.g., "Enter", "Tab", "Escape"');
/**
 * Locator actions abort or time out while the page is blocked by a JavaScript
 * dialog, even though the action itself was dispatched and opened that dialog.
 * The open dialog is already reported in the response, so treat this as an
 * interruption instead of a failure.
 */
function handleActionError(error, uid, page) {
    if (page.getDialog()) {
        logger?.('action interrupted by a dialog', error);
        return;
    }
    logger?.('failed to act using a locator', error);
    const reason = error instanceof TimeoutError
        ? 'The element did not become interactive within the configured timeout.'
        : error instanceof Error
            ? error.message
            : String(error);
    throw new Error(`Failed to interact with the element with uid ${uid}. ${reason}`, {
        cause: error,
    });
}
async function selectNativeSelectOption(handle, signal) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const selectHandle = __addDisposableResource(env_1, await handle.evaluateHandle(node => {
            if (!(node instanceof HTMLOptionElement)) {
                return null;
            }
            const select = node.closest('select');
            if (!select || select.multiple || select.disabled || node.disabled) {
                return null;
            }
            const parentElement = node.parentElement;
            if (parentElement instanceof HTMLOptGroupElement &&
                parentElement.disabled) {
                return null;
            }
            return select;
        }), false);
        const select = __addDisposableResource(env_1, selectHandle.asElement(), false);
        if (!select) {
            return false;
        }
        const valueHandle = __addDisposableResource(env_1, await handle.getProperty('value'), false);
        const value = await valueHandle.jsonValue();
        if (typeof value !== 'string') {
            return false;
        }
        await select.asLocator().fill(value, { signal });
        return true;
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        __disposeResources(env_1);
    }
}
export const click = definePageTool(() => ({
    name: 'click',
    description: `Clicks on the provided element`,
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
    },
    schema: {
        uid: zod
            .string()
            .describe('The uid of an element on the page from the page content snapshot'),
        dblClick: dblClickSchema,
        includeSnapshot: includeSnapshotSchema,
    },
    blockedByDialog: true,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const uid = request.params.uid;
            const handle = __addDisposableResource(env_2, await request.page.getElementByUid(uid), false);
            const aXNode = request.page.getAXNodeByUid(uid);
            const shouldSelectNativeOption = !request.params.dblClick && aXNode?.role === 'option';
            try {
                const result = await request.page.waitForEventsAfterAction(async (signal) => {
                    if (shouldSelectNativeOption &&
                        (await selectNativeSelectOption(handle, signal))) {
                        return;
                    }
                    await handle.asLocator().click({
                        count: request.params.dblClick ? 2 : 1,
                        signal,
                    });
                });
                response.appendResponseLine(request.params.dblClick
                    ? `Successfully double clicked on the element`
                    : `Successfully clicked on the element`);
                response.attachWaitForResult(result);
                if (request.params.includeSnapshot) {
                    response.includeSnapshot();
                }
            }
            catch (error) {
                handleActionError(error, uid, request.page);
                response.appendResponseLine(request.params.dblClick
                    ? `The element was double clicked and it opened a dialog.`
                    : `The element was clicked and it opened a dialog.`);
            }
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    },
}));
export const clickAt = definePageTool(() => ({
    name: 'click_at',
    description: `Clicks at the provided coordinates`,
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
        conditions: ['experimentalVision'],
    },
    schema: {
        x: zod.number().describe('The x coordinate'),
        y: zod.number().describe('The y coordinate'),
        dblClick: dblClickSchema,
        includeSnapshot: includeSnapshotSchema,
    },
    blockedByDialog: true,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const page = request.page;
        const result = await page.waitForEventsAfterAction(async () => {
            await page.pptrPage.mouse.click(request.params.x, request.params.y, {
                count: request.params.dblClick ? 2 : 1,
            });
        });
        response.appendResponseLine(request.params.dblClick
            ? `Successfully double clicked at the coordinates`
            : `Successfully clicked at the coordinates`);
        response.attachWaitForResult(result);
        if (request.params.includeSnapshot) {
            response.includeSnapshot();
        }
    },
}));
export const hover = definePageTool(() => ({
    name: 'hover',
    description: `Hover over the provided element`,
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
    },
    schema: {
        uid: zod
            .string()
            .describe('The uid of an element on the page from the page content snapshot'),
        includeSnapshot: includeSnapshotSchema,
    },
    blockedByDialog: true,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const uid = request.params.uid;
            const handle = __addDisposableResource(env_3, await request.page.getElementByUid(uid), false);
            try {
                const result = await request.page.waitForEventsAfterAction(async (signal) => {
                    await handle.asLocator().hover({ signal });
                });
                response.appendResponseLine(`Successfully hovered over the element`);
                response.attachWaitForResult(result);
                if (request.params.includeSnapshot) {
                    response.includeSnapshot();
                }
            }
            catch (error) {
                handleActionError(error, uid, request.page);
                response.appendResponseLine(`The element was hovered and it opened a dialog.`);
            }
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    },
}));
function raceWithSignal(promise, signal) {
    if (signal.aborted) {
        return Promise.reject(signal.reason);
    }
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(promise).then(value => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}
// The AXNode for an option doesn't contain its `value`. We set text content of the option as value.
// If the form is a combobox, we need to find the correct option by its text value.
// To do that, loop through the children while checking which child's text matches the requested value (requested value is actually the text content).
// When the correct option is found, use the element handle to get the real value.
async function selectOption(handle, aXNode, value, signal) {
    let optionFound = false;
    for (const child of aXNode.children) {
        if (child.role === 'option' && child.name === value && child.value) {
            const env_4 = { stack: [], error: void 0, hasError: false };
            try {
                optionFound = true;
                const childHandle = __addDisposableResource(env_4, await raceWithSignal(child.elementHandle(), signal), false);
                if (childHandle) {
                    const env_5 = { stack: [], error: void 0, hasError: false };
                    try {
                        const childValueHandle = __addDisposableResource(env_5, await raceWithSignal(childHandle.getProperty('value'), signal), false);
                        const childValue = await raceWithSignal(childValueHandle.jsonValue(), signal);
                        if (typeof childValue === 'string') {
                            await handle.asLocator().fill(childValue, { signal });
                        }
                        break;
                    }
                    catch (e_4) {
                        env_5.error = e_4;
                        env_5.hasError = true;
                    }
                    finally {
                        __disposeResources(env_5);
                    }
                }
            }
            catch (e_5) {
                env_4.error = e_5;
                env_4.hasError = true;
            }
            finally {
                __disposeResources(env_4);
            }
        }
    }
    if (!optionFound) {
        throw new Error(`Could not find option with text "${value}"`);
    }
}
function hasOptionChildren(aXNode) {
    return aXNode.children.some(child => child.role === 'option');
}
/**
 * Fills one or more form elements and waits for resulting page events in a
 * single `waitForEventsAfterAction` call.
 * If an element opens a JavaScript dialog, returns the `interruptedUid` of that
 * element so the caller can report it without filling remaining elements.
 */
async function fillFormElements(elements, page) {
    let currentUid;
    try {
        const result = await page.waitForEventsAfterAction(async (signal) => {
            for (const { uid, value } of elements) {
                const env_6 = { stack: [], error: void 0, hasError: false };
                try {
                    const previousUid = currentUid;
                    currentUid = undefined;
                    const handle = __addDisposableResource(env_6, await raceWithSignal(page.getElementByUid(uid), signal).catch(error => {
                        if (signal.aborted && previousUid) {
                            currentUid = previousUid;
                        }
                        throw error;
                    }), false);
                    currentUid = uid;
                    const aXNode = page.getAXNodeByUid(uid);
                    // We assume that combobox needs to be handled as select if it has
                    // role='combobox' and option children.
                    if (aXNode && aXNode.role === 'combobox' && hasOptionChildren(aXNode)) {
                        await raceWithSignal(selectOption(handle, aXNode, value, signal), signal);
                    }
                    else {
                        const isToggle = await raceWithSignal(handle.evaluate(el => {
                            if (el instanceof HTMLInputElement) {
                                return el.type === 'checkbox' || el.type === 'radio';
                            }
                            const role = el.getAttribute('role');
                            return (role === 'checkbox' || role === 'radio' || role === 'switch');
                        }), signal);
                        if (isToggle) {
                            if (['true', 'false'].includes(value)) {
                                await handle.asLocator().fill(value === 'true', { signal });
                            }
                            else {
                                throw new Error(`Checkboxes, radio boxes and toggles require "true" or "false" value, but ${value} was used`);
                            }
                        }
                        else {
                            // Increase timeout for longer input values.
                            const timeoutPerChar = 10; // ms
                            const fillTimeout = page.pptrPage.getDefaultTimeout() + value.length * timeoutPerChar;
                            await handle
                                .asLocator()
                                .setTimeout(fillTimeout)
                                .fill(value, { signal });
                        }
                    }
                    signal.throwIfAborted();
                }
                catch (e_6) {
                    env_6.error = e_6;
                    env_6.hasError = true;
                }
                finally {
                    __disposeResources(env_6);
                }
            }
        });
        return { result };
    }
    catch (error) {
        if (!currentUid) {
            throw error;
        }
        handleActionError(error, currentUid, page);
        return { interruptedUid: currentUid };
    }
}
export const fill = definePageTool(() => ({
    name: 'fill',
    description: `Type text into an input, text area or select an option from a <select> element.`,
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
    },
    schema: {
        uid: zod
            .string()
            .describe('The uid of an element on the page from the page content snapshot'),
        value: zod
            .string()
            .describe('The value to fill in. "true" or "false" for checkboxes and toggles, "true" for radio buttons.'),
        includeSnapshot: includeSnapshotSchema,
    },
    blockedByDialog: true,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const { result } = await fillFormElements([{ uid: request.params.uid, value: request.params.value }], request.page);
        if (!result) {
            response.appendResponseLine(`The element was filled out and it opened a dialog.`);
            return;
        }
        response.appendResponseLine(`Successfully filled out the element`);
        response.attachWaitForResult(result);
        if (request.params.includeSnapshot) {
            response.includeSnapshot();
        }
    },
}));
export const typeText = definePageTool(() => ({
    name: 'type_text',
    description: `Type text using keyboard into a previously focused input`,
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
    },
    schema: {
        text: zod.string().describe('The text to type'),
        submitKey: submitKeySchema,
    },
    blockedByDialog: true,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const page = request.page;
        const result = await page.waitForEventsAfterAction(async () => {
            await page.pptrPage.keyboard.type(request.params.text);
            if (request.params.submitKey) {
                await page.pptrPage.keyboard.press(request.params.submitKey);
            }
        });
        response.appendResponseLine(`Typed text "${request.params.text}${request.params.submitKey ? ` + ${request.params.submitKey}` : ''}"`);
        response.attachWaitForResult(result);
    },
}));
export const drag = definePageTool(() => ({
    name: 'drag',
    description: `Drag an element onto another element`,
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
    },
    schema: {
        from_uid: zod.string().describe('The uid of the element to drag'),
        to_uid: zod.string().describe('The uid of the element to drop into'),
        includeSnapshot: includeSnapshotSchema,
    },
    blockedByDialog: true,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const fromHandle = __addDisposableResource(env_7, await request.page.getElementByUid(request.params.from_uid), false);
            const toHandle = __addDisposableResource(env_7, await request.page.getElementByUid(request.params.to_uid), false);
            const result = await request.page.waitForEventsAfterAction(async () => {
                await fromHandle.drag(toHandle);
                await new Promise(resolve => setTimeout(resolve, 50));
                await toHandle.drop(fromHandle);
            });
            response.appendResponseLine(`Successfully dragged an element`);
            response.attachWaitForResult(result);
            if (request.params.includeSnapshot) {
                response.includeSnapshot();
            }
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    },
}));
export const fillForm = definePageTool(() => ({
    name: 'fill_form',
    description: `Fill out multiple form elements (inputs, selects, checkboxes, radios) at once. ALWAYS prefer this tool over multiple individual 'fill' or 'click' calls when interacting with forms. It is significantly faster, more reliable, and reduces turn count. Example: Fill username, password, and check "Remember Me" in one call.`,
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
    },
    schema: {
        elements: zod
            .array(
        /* eslint-disable @local/enforce-zod-schema */
        zod
            .object({
            uid: zod.string().describe('The uid of the element to fill out'),
            value: zod
                .string()
                .describe('Value for the element. "true" or "false" for checkboxes and toggles, "true" for radio buttons.'),
        })
            .describe('An element to fill out'))
            .describe('Elements from snapshot to fill out.'),
        includeSnapshot: includeSnapshotSchema,
    },
    blockedByDialog: true,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const { result, interruptedUid } = await fillFormElements(request.params.elements, request.page);
        if (!result) {
            // The page is blocked by a dialog, so the remaining elements cannot be
            // filled out until it is handled.
            const hasRemainingElements = interruptedUid !== request.params.elements.at(-1)?.uid;
            response.appendResponseLine(`Filling out the element with uid ${interruptedUid} opened a dialog.${hasRemainingElements
                ? ' The remaining elements were not filled out.'
                : ''}`);
            return;
        }
        response.appendResponseLine(`Successfully filled out the form`);
        response.attachWaitForResult(result);
        if (request.params.includeSnapshot) {
            response.includeSnapshot();
        }
    },
}));
export const uploadFile = definePageTool(() => ({
    name: 'upload_file',
    description: 'Upload a file through a provided element.',
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
    },
    schema: {
        uid: zod
            .string()
            .describe('The uid of the file input element or an element that will open file chooser on the page from the page content snapshot'),
        filePaths: zod
            .array(zod.string())
            .min(1)
            .describe('One or more files paths to upload. File paths have to be local to the browser instance (not the MCP).'),
        includeSnapshot: includeSnapshotSchema,
    },
    blockedByDialog: true,
    // We do not validate file paths for remote browser instances
    // because they are on the remote host and not accessed by the MCP server.
    verifyFilesSchema: {
        filePaths: {
            local: true,
            remote: false,
        },
    },
    handler: async (request, response) => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const { uid, filePaths } = request.params;
            const handle = __addDisposableResource(env_8, (await request.page.getElementByUid(uid)), false);
            try {
                await handle.uploadFile(...filePaths);
            }
            catch (err) {
                if (err instanceof Error &&
                    err.message.includes('Multiple file uploads')) {
                    throw err;
                }
                // Some sites use a proxy element to trigger file upload instead of
                // a type=file element. In this case, we want to default to
                // Page.waitForFileChooser() and upload the file this way.
                let fileChooser;
                try {
                    [fileChooser] = await Promise.all([
                        request.page.pptrPage.waitForFileChooser({ timeout: 3000 }),
                        handle.asLocator().click(),
                    ]);
                }
                catch {
                    throw new Error(`Failed to upload file. The element could not accept the file directly, and clicking it did not trigger a file chooser.`);
                }
                await fileChooser.accept(filePaths);
            }
            if (request.params.includeSnapshot) {
                response.includeSnapshot();
            }
            response.appendResponseLine(`File uploaded from ${filePaths.join(', ')}.`);
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    },
}));
export const pressKey = definePageTool(() => ({
    name: 'press_key',
    description: `Press a key or key combination. Use this when other input methods like fill() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).`,
    annotations: {
        category: ToolCategory.INPUT,
        readOnlyHint: false,
    },
    schema: {
        key: zod
            .string()
            .describe('A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta'),
        includeSnapshot: includeSnapshotSchema,
    },
    blockedByDialog: true,
    verifyFilesSchema: {},
    handler: async (request, response) => {
        const page = request.page;
        const tokens = parseKey(request.params.key);
        const [key, ...modifiers] = tokens;
        const result = await page.waitForEventsAfterAction(async () => {
            const heldModifiers = [];
            try {
                for (const modifier of modifiers) {
                    await page.pptrPage.keyboard.down(modifier);
                    heldModifiers.push(modifier);
                }
                await page.pptrPage.keyboard.press(key);
            }
            finally {
                // Release every modifier that was successfully pressed, even if a
                // later key event throws. Otherwise a failed press leaves modifiers
                // logically held down in the browser (see #2309).
                for (const modifier of heldModifiers.toReversed()) {
                    await page.pptrPage.keyboard.up(modifier);
                }
            }
        });
        response.appendResponseLine(`Successfully pressed key: ${request.params.key}`);
        response.attachWaitForResult(result);
        if (request.params.includeSnapshot) {
            response.includeSnapshot();
        }
    },
}));
//# sourceMappingURL=input.js.map