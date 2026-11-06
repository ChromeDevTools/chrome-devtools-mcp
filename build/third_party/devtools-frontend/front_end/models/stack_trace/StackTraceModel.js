// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
var _a;
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import { augmentRawFramesWithScriptIds, parseRawFramesFromErrorStack } from './DetailedErrorStackParser.js';
// eslint-disable-next-line @devtools/es-modules-import
import * as StackTrace from './stack_trace.js';
import { AsyncFragmentImpl, DebuggableFragmentImpl, FragmentImpl, FrameImpl, ParsedErrorStackFragmentImpl, StackTraceImpl, } from './StackTraceImpl.js';
import { EvalOrigin, Trie } from './Trie.js';
/**
 * The {@link StackTraceModel} is a thin wrapper around a fragment trie.
 *
 * We want to store stack trace fragments per target so a SDKModel is the natural choice.
 */
export class StackTraceModel extends SDK.SDKModel.SDKModel {
    #trie = new Trie();
    #mutex = new Common.Mutex.Mutex();
    /** Scripts whose info changed since {@link #pendingScriptsUpdate} was scheduled. */
    #pendingScripts = new Set();
    #pendingScriptsUpdate = null;
    /** @returns the {@link StackTraceModel} for the target. Throws if the target or its model cannot be found. */
    static #modelForTarget(target) {
        const model = target?.model(_a);
        if (!model) {
            throw new Error('Unable to find StackTraceModel');
        }
        return model;
    }
    async createFromProtocolRuntime(stackTrace, rawFramesToUIFrames) {
        const debuggerModel = this.target().model(SDK.DebuggerModel.DebuggerModel);
        const syncFrames = stackTrace.callFrames.map((frame) => {
            const isWasm = debuggerModel?.isWasm(frame.scriptId) ?? false;
            return { ...frame, isWasm };
        });
        const [syncFragment, asyncFragments] = await Promise.all([
            this.#createFragment(syncFrames, rawFramesToUIFrames),
            this.#createAsyncFragments(stackTrace, rawFramesToUIFrames),
        ]);
        return new StackTraceImpl(syncFragment, asyncFragments);
    }
    async createFromErrorStackLikeString(stack, rawFramesToUIFrames, exceptionDetails) {
        const debuggerModel = this.target().model(SDK.DebuggerModel.DebuggerModel);
        const baseURL = this.target().inspectedURL();
        const resolveURL = (url) => {
            let urlWithScheme = parseOrScriptMatch(debuggerModel, url);
            if (!urlWithScheme && Common.ParsedURL.ParsedURL.isRelativeURL(url)) {
                urlWithScheme = parseOrScriptMatch(debuggerModel, Common.ParsedURL.ParsedURL.completeURL(baseURL, url));
            }
            return urlWithScheme;
        };
        const rawFrames = parseRawFramesFromErrorStack(stack, resolveURL);
        if (!rawFrames) {
            return null;
        }
        if (exceptionDetails?.stackTrace) {
            augmentRawFramesWithScriptIds(rawFrames, exceptionDetails.stackTrace);
        }
        const [syncFragment, asyncFragments] = await Promise.all([
            this.#createFragment(rawFrames, rawFramesToUIFrames),
            exceptionDetails?.stackTrace ? this.#createAsyncFragments(exceptionDetails.stackTrace, rawFramesToUIFrames) :
                Promise.resolve([]),
        ]);
        return new StackTraceImpl(new ParsedErrorStackFragmentImpl(syncFragment), asyncFragments);
    }
    async createFromDebuggerPaused(pausedDetails, rawFramesToUIFrames) {
        const [syncFragment, asyncFragments] = await Promise.all([
            this.#createDebuggableFragment(pausedDetails, rawFramesToUIFrames),
            this.#createAsyncFragments(pausedDetails, rawFramesToUIFrames),
        ]);
        return new StackTraceImpl(syncFragment, asyncFragments);
    }
    /**
     * Re-translates all trie nodes whose raw frame or eval origin chain is in `script`, and notifies all stack traces
     * that contain such a node.
     *
     * Calls that arrive before the pending update acquired the mutex are coalesced into a single update (using the
     * `translateRawFrames` of the first call), so that e.g. re-adding thousands of scripts walks the trie only once.
     */
    scriptInfoChanged(script, translateRawFrames) {
        this.#pendingScripts.add(script);
        this.#pendingScriptsUpdate ??= this.#updatePendingScripts(translateRawFrames);
        return this.#pendingScriptsUpdate;
    }
    async #updatePendingScripts(translateRawFrames) {
        const release = await this.#mutex.acquire();
        const scriptIds = new Set();
        const sourceURLs = new Set();
        for (const script of this.#pendingScripts) {
            scriptIds.add(script.scriptId);
            sourceURLs.add(script.sourceURL);
        }
        this.#pendingScripts.clear();
        this.#pendingScriptsUpdate = null;
        // scriptId has precedence, but if the frame does not have one, check the URL.
        const matches = (raw) => raw.scriptId ? scriptIds.has(raw.scriptId) : raw.url !== undefined && sourceURLs.has(raw.url);
        const evalMatches = (raw) => Boolean(raw) && (matches(raw) || evalMatches(raw?.parsedFrameInfo?.evalOrigin));
        try {
            // Walk the whole trie: the same script can appear multiple times in a call stack.
            const affected = [];
            this.#trie.walk(null, node => {
                if (matches(node.rawFrame) || evalMatches(node.parsedFrameInfo?.evalOrigin)) {
                    affected.push(node);
                }
                return true;
            });
            await this.#translateNodes(affected.filter(n => matches(n.rawFrame)), affected.filter(n => evalMatches(n.parsedFrameInfo?.evalOrigin)), translateRawFrames);
            // Every fragment in the sub-tree of an affected node contains the affected node in its call stack.
            const visited = new Set();
            let stackTracesToUpdate = new Set();
            for (const root of affected) {
                this.#trie.walk(root, node => {
                    if (visited.has(node)) {
                        return false;
                    }
                    visited.add(node);
                    if (node.fragment) {
                        stackTracesToUpdate = stackTracesToUpdate.union(node.fragment.stackTraces);
                    }
                    return true;
                });
            }
            for (const stackTrace of stackTracesToUpdate) {
                stackTrace.dispatchEventToListeners("UPDATED" /* StackTrace.StackTrace.Events.UPDATED */);
            }
        }
        finally {
            release();
        }
    }
    async #createDebuggableFragment(pausedDetails, rawFramesToUIFrames) {
        const fragment = await this.#createFragment(pausedDetails.callFrames.map(frame => ({
            scriptId: frame.script.scriptId,
            url: frame.script.sourceURL,
            functionName: frame.functionName,
            lineNumber: frame.location().lineNumber,
            columnNumber: frame.location().columnNumber,
            isWasm: frame.script.isWasm(),
        })), rawFramesToUIFrames);
        return new DebuggableFragmentImpl(fragment, pausedDetails.callFrames);
    }
    async #createAsyncFragments(stackTraceOrPausedEvent, rawFramesToUIFrames) {
        const asyncFragments = [];
        const debuggerModel = this.target().model(SDK.DebuggerModel.DebuggerModel);
        if (debuggerModel) {
            for await (const { stackTrace: asyncStackTrace, target } of debuggerModel.iterateAsyncParents(stackTraceOrPausedEvent)) {
                if (asyncStackTrace.callFrames.length === 0) {
                    // Skip empty async fragments, they don't add value.
                    continue;
                }
                const model = _a.#modelForTarget(target ?? this.target().targetManager().primaryPageTarget());
                const targetDebuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
                const asyncFrames = asyncStackTrace.callFrames.map((frame) => {
                    const isWasm = targetDebuggerModel?.isWasm(frame.scriptId) ?? false;
                    return { ...frame, isWasm };
                });
                const asyncFragmentPromise = model.#createFragment(asyncFrames, rawFramesToUIFrames)
                    .then(fragment => new AsyncFragmentImpl(asyncStackTrace.description ?? '', fragment));
                asyncFragments.push(asyncFragmentPromise);
            }
        }
        return await Promise.all(asyncFragments);
    }
    async #createFragment(frames, rawFramesToUIFrames) {
        if (frames.length === 0) {
            return FragmentImpl.EMPTY_FRAGMENT;
        }
        const release = await this.#mutex.acquire();
        try {
            const node = this.#trie.insert(frames);
            const fragment = FragmentImpl.getOrCreate(node);
            const callStack = [...node.getCallStack()];
            // Translations are context-free, so shared prefixes of other fragments don't need re-translation. A node that was
            // first seen in a CDP trace may later get an `evalOrigin` from an `Error.stack` trace.
            await this.#translateNodes(callStack.filter(n => !n.isTranslated), callStack.filter(n => n.parsedFrameInfo?.evalOrigin && !n.evalOrigin), rawFramesToUIFrames);
            return fragment;
        }
        finally {
            release();
        }
    }
    /** Translates `nodes` and the eval origins of `evalNodes`. Writes nothing if any translation throws. */
    async #translateNodes(nodes, evalNodes, rawFramesToUIFrames) {
        if (nodes.length === 0 && evalNodes.length === 0) {
            return;
        }
        const [translations, evalOrigins] = await Promise.all([
            nodes.length ? rawFramesToUIFrames(nodes.map(n => n.rawFrame), this.target()) : Promise.resolve([]),
            Promise.all(evalNodes.map(n => translateEvalOrigin(n.parsedFrameInfo?.evalOrigin, rawFramesToUIFrames, this.target()))),
        ]);
        if (translations.length !== nodes.length) {
            throw new Error('Broken rawFramesToUIFrames implementation');
        }
        // No `await` below: readers never see a partially updated trie.
        nodes.forEach((node, i) => applyTranslation(node, translations[i]));
        evalNodes.forEach((node, i) => {
            node.evalOrigin = evalOrigins[i];
        });
    }
}
_a = StackTraceModel;
function toFrameImpls(rawFrame, frames) {
    return frames.map((f, index) => new FrameImpl(f.url, f.uiSourceCode, f.name, f.line, f.column, f.missingDebugInfo, rawFrame.functionName, rawFrame.isWasm, index < frames.length - 1));
}
/** Stores a context-free translation on `node`. A VISIBLE or OUTLINED translation without frames becomes HIDDEN. */
function applyTranslation(node, translation) {
    node.isTranslated = true;
    if (translation.kind === "HIDDEN" /* FrameKind.HIDDEN */ || translation.frames.length === 0) {
        console.assert(translation.kind === "HIDDEN" /* FrameKind.HIDDEN */, 'Non-HIDDEN translation without frames');
        node.kind = "HIDDEN" /* FrameKind.HIDDEN */;
        node.frames = [];
        node.functionKeys = undefined;
        node.isUnmapped = false;
        return;
    }
    node.kind = translation.kind;
    node.frames = toFrameImpls(node.rawFrame, translation.frames);
    node.functionKeys = translation.functionKeys;
    node.isUnmapped = translation.kind === "VISIBLE" /* FrameKind.VISIBLE */ && Boolean(translation.unmapped);
}
async function translateEvalOrigin(rawFrame, rawFramesToUIFrames, target) {
    const [translation] = await rawFramesToUIFrames([rawFrame], target);
    // A HIDDEN eval origin still shows where the eval happened, in generated coordinates.
    const frames = translation.frames.length ?
        toFrameImpls(rawFrame, translation.frames) :
        [new FrameImpl(rawFrame.url, undefined, rawFrame.functionName, rawFrame.lineNumber, rawFrame.columnNumber, undefined, rawFrame.functionName, rawFrame.isWasm, false)];
    let parentEvalOrigin;
    if (rawFrame.parsedFrameInfo?.evalOrigin) {
        parentEvalOrigin = await translateEvalOrigin(rawFrame.parsedFrameInfo.evalOrigin, rawFramesToUIFrames, target);
    }
    return new EvalOrigin(frames, parentEvalOrigin);
}
function parseOrScriptMatch(debuggerModel, url) {
    if (!url) {
        return null;
    }
    if (Common.ParsedURL.ParsedURL.isValidUrlString(url)) {
        return url;
    }
    if (debuggerModel.scriptsForSourceURL(url).length) {
        return url;
    }
    // nodejs stack traces contain (absolute) file paths, but v8 reports them as file: urls.
    try {
        const fileUrl = new URL(url, 'file://');
        if (debuggerModel.scriptsForSourceURL(fileUrl.href).length) {
            return fileUrl.href;
        }
    }
    catch {
    }
    return null;
}
SDK.SDKModel.SDKModel.register(StackTraceModel, { capabilities: 0 /* SDK.Target.Capability.NONE */, autostart: false });
//# sourceMappingURL=StackTraceModel.js.map