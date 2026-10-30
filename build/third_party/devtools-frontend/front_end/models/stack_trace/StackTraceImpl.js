// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
export class StackTraceImpl extends Common.ObjectWrapper.ObjectWrapper {
    syncFragment;
    asyncFragments;
    constructor(syncFragment, asyncFragments) {
        super();
        this.syncFragment = syncFragment;
        this.asyncFragments = asyncFragments;
        const fragment = (syncFragment instanceof DebuggableFragmentImpl || syncFragment instanceof ParsedErrorStackFragmentImpl) ?
            syncFragment.fragment :
            syncFragment;
        fragment.stackTraces.add(this);
        this.asyncFragments.forEach(asyncFragment => asyncFragment.fragment.stackTraces.add(this));
    }
}
export class FragmentImpl {
    static EMPTY_FRAGMENT = new FragmentImpl();
    node;
    stackTraces = new Set();
    /**
     * Fragments are deduplicated based on the node.
     *
     * In turn, each fragment can be part of multiple stack traces.
     */
    static getOrCreate(node) {
        if (!node.fragment) {
            node.fragment = new FragmentImpl(node);
        }
        return node.fragment;
    }
    constructor(node) {
        this.node = node;
    }
    get frames() {
        return this.node ? consolidate([...this.node.getCallStack()]).map(({ frame }) => frame) : [];
    }
}
export class AsyncFragmentImpl {
    description;
    fragment;
    constructor(description, fragment) {
        this.description = description;
        this.fragment = fragment;
    }
    get frames() {
        return this.fragment.frames;
    }
}
export class FrameImpl {
    url;
    uiSourceCode;
    name;
    line;
    column;
    missingDebugInfo;
    rawName;
    isWasm;
    isInline;
    constructor(url, uiSourceCode, name, line, column, missingDebugInfo, rawName, isWasm, isInline) {
        this.url = url;
        this.uiSourceCode = uiSourceCode;
        this.name = name;
        this.line = line;
        this.column = column;
        this.missingDebugInfo = missingDebugInfo;
        this.rawName = rawName;
        this.isWasm = isWasm;
        this.isInline = isInline;
    }
    toUiLocation(workspace) {
        const uiSourceCode = this.uiSourceCode ??
            (this.url ? workspace.uiSourceCodeForURL(this.url) : null);
        return uiSourceCode?.uiLocation(this.line, this.column) ?? null;
    }
}
/**
 * Drops HIDDEN nodes and merges each OUTLINED node with its callers into one group of logical frames.
 *
 * The chain continues with callers whose `functionKeys.top` equals the previous member's `functionKeys.bottom`,
 * skipping HIDDEN and not-authored nodes. It ends with the first VISIBLE member (the terminator), or before a
 * non-matching caller.
 */
export function consolidate(callStack) {
    const result = [];
    for (let i = 0; i < callStack.length; ++i) {
        const node = callStack[i];
        if (node.kind === "HIDDEN" /* FrameKind.HIDDEN */) {
            continue;
        }
        if (node.kind === "VISIBLE" /* FrameKind.VISIBLE */ || !node.functionKeys) {
            node.frames.forEach((frame, inlineIndex) => result.push({
                frame,
                node,
                nodeIndex: i,
                inlineIndex,
                invocationNode: inlineIndex === node.frames.length - 1 ? node : undefined,
            }));
            continue;
        }
        // `node` is OUTLINED: start a chain.
        const group = node.frames.map((frame, inlineIndex) => ({ frame, node, nodeIndex: i, inlineIndex }));
        let bottom = node.functionKeys.bottom;
        let terminator;
        let lastConsumed = i;
        for (let j = i + 1; j < callStack.length && !terminator; ++j) {
            const caller = callStack[j];
            if (caller.kind === "HIDDEN" /* FrameKind.HIDDEN */ || isNotAuthored(caller)) {
                continue;
            }
            if (!caller.functionKeys || caller.functionKeys.top !== bottom) {
                break;
            }
            // Skip `caller.frames[0]`: it's the same logical frame as the previous member's bottom frame.
            for (let k = 1; k < caller.frames.length; ++k) {
                group.push({ frame: caller.frames[k], node: caller, nodeIndex: j, inlineIndex: k });
            }
            bottom = caller.functionKeys.bottom;
            terminator = caller.kind === "VISIBLE" /* FrameKind.VISIBLE */ ? caller : undefined;
            lastConsumed = j;
        }
        // HIDDEN and not-authored nodes after the last chain member are processed by the outer loop.
        i = lastConsumed;
        const rawName = terminator?.rawFrame.functionName;
        group.forEach(({ frame: f, ...rest }, idx) => result.push({
            ...rest,
            frame: new FrameImpl(f.url, f.uiSourceCode, f.name, f.line, f.column, f.missingDebugInfo, rawName, f.isWasm, idx < group.length - 1),
            invocationNode: idx === group.length - 1 ? terminator : undefined,
        }));
    }
    return result;
}
/**
 * Frames that the authored function can't have called directly (e.g. `Array.prototype.forEach` calling an outlined
 * callback, or an unmapped runtime helper). A chain looks past them.
 *
 * Builtins are unmapped like any other frame without authored code, see `TranslatedRawFrame.unmapped`.
 */
function isNotAuthored(node) {
    return node.kind === "VISIBLE" /* FrameKind.VISIBLE */ && !node.functionKeys && node.isUnmapped;
}
/**
 * Converts the internal recursive `EvalOrigin` trie representation into the public-facing
 * linear `ParsedErrorStackFrameImpl` representation.
 *
 * NOTE: The V8 Error#stack format only allows serializing a single location descriptor
 * per nested eval origin level (e.g. `eval at functionName (location)`). Therefore, the
 * public-facing API only surfaces the top-most logical frame (`evalOrigin.frames[0]`) at each
 * eval level. Any other inlined caller frames at that specific level are technically dropped
 * in the public API, but they are fully preserved in the internal trie representation for
 * debugging, navigation, and ignore list correlation.
 */
function createParsedErrorStackFrameImplFromEvalOrigin(evalOrigin, parsedFrameInfo) {
    if (!evalOrigin || evalOrigin.frames.length === 0) {
        return undefined;
    }
    const frame = evalOrigin.frames[0];
    const info = parsedFrameInfo?.evalOrigin?.parsedFrameInfo;
    const nestedOrigin = createParsedErrorStackFrameImplFromEvalOrigin(evalOrigin.evalOrigin, info);
    // An eval origin is a single location that is also its own invocation.
    return new ParsedErrorStackFrameImpl(frame, info, info, nestedOrigin);
}
export class ParsedErrorStackFragmentImpl {
    fragment;
    constructor(fragment) {
        this.fragment = fragment;
    }
    get frames() {
        if (!this.fragment.node) {
            return [];
        }
        const evalOrigins = new Map();
        return consolidate([...this.fragment.node.getCallStack()]).map(({ frame, node, invocationNode }) => {
            if (!evalOrigins.has(node)) {
                evalOrigins.set(node, createParsedErrorStackFrameImplFromEvalOrigin(node.evalOrigin, node.parsedFrameInfo));
            }
            return new ParsedErrorStackFrameImpl(frame, node.parsedFrameInfo, invocationNode?.parsedFrameInfo, evalOrigins.get(node));
        });
    }
}
/**
 * Location properties (e.g. `isAsync`) describe where execution is, and come from the node a frame was translated
 * from. Invocation properties (e.g. `isConstructor`) describe how the physical function was called, and only exist
 * on the last frame of a group of inlined or merged frames.
 */
export class ParsedErrorStackFrameImpl {
    #frame;
    #locationInfo;
    #invocationInfo;
    #evalOrigin;
    constructor(frame, locationInfo, invocationInfo, evalOrigin) {
        this.#frame = frame;
        this.#locationInfo = locationInfo;
        this.#invocationInfo = invocationInfo;
        this.#evalOrigin = evalOrigin;
    }
    get url() {
        return this.#frame.url;
    }
    get uiSourceCode() {
        return this.#frame.uiSourceCode;
    }
    get name() {
        return this.#frame.name;
    }
    get line() {
        return this.#frame.line;
    }
    get column() {
        return this.#frame.column;
    }
    get missingDebugInfo() {
        return this.#frame.missingDebugInfo;
    }
    get rawName() {
        return this.#frame.rawName;
    }
    get isAsync() {
        return this.#locationInfo?.isAsync;
    }
    get isConstructor() {
        return this.#invocationInfo?.isConstructor;
    }
    get isEval() {
        return this.#locationInfo?.isEval;
    }
    get evalOrigin() {
        return this.#evalOrigin;
    }
    get isWasm() {
        return this.#frame.isWasm;
    }
    get isInline() {
        return this.#frame.isInline;
    }
    get wasmModuleName() {
        return this.#locationInfo?.wasmModuleName;
    }
    get wasmFunctionIndex() {
        return this.#locationInfo?.wasmFunctionIndex;
    }
    get typeName() {
        return this.#invocationInfo?.typeName;
    }
    get methodName() {
        return this.#invocationInfo?.methodName;
    }
    get promiseIndex() {
        return this.#locationInfo?.promiseIndex;
    }
    toUiLocation(workspace) {
        return this.#frame.toUiLocation(workspace);
    }
}
/**
 * A DebuggableFragmentImpl wraps an existing FragmentImpl. This is important: We can pause at the
 * same location multiple times and the paused information changes each and everytime while the underlying
 * FragmentImpl will stay the same.
 */
export class DebuggableFragmentImpl {
    fragment;
    callFrames;
    /**
     * Virtual call frames for inlined frames, so that reading `frames` repeatedly (e.g. after `UPDATED`) yields
     * identical `sdkFrame`s. A new DebuggableFragmentImpl is created per pause, so this lives as long as `callFrames`.
     */
    #virtualCallFrames = new Map();
    constructor(fragment, callFrames) {
        this.fragment = fragment;
        this.callFrames = callFrames;
    }
    get frames() {
        if (!this.fragment.node) {
            return [];
        }
        return consolidate([...this.fragment.node.getCallStack()]).map(({ frame, nodeIndex, inlineIndex }) => {
            return new DebuggableFrameImpl(frame, this.#sdkFrameFor(nodeIndex, inlineIndex, frame.name ?? ''));
        });
    }
    #sdkFrameFor(nodeIndex, inlineIndex, name) {
        const physical = this.callFrames[nodeIndex];
        if (inlineIndex === 0) {
            return physical;
        }
        // The name is part of the key, as a re-translation can change the name at the same indices.
        const key = `${nodeIndex}:${inlineIndex}:${name}`;
        let frame = this.#virtualCallFrames.get(key);
        if (!frame) {
            frame = physical.createVirtualCallFrame(inlineIndex, name);
            this.#virtualCallFrames.set(key, frame);
        }
        return frame;
    }
}
/**
 * A DebuggableFrameImpl wraps an existing FrameImpl. This is important: We can pause at the
 * same location multiple times and the paused information changes each and everytime while the underlying
 * FrameImpl will stay the same.
 */
export class DebuggableFrameImpl {
    #frame;
    #sdkFrame;
    constructor(frame, sdkFrame) {
        this.#frame = frame;
        this.#sdkFrame = sdkFrame;
    }
    get url() {
        return this.#frame.url;
    }
    get uiSourceCode() {
        return this.#frame.uiSourceCode;
    }
    get name() {
        return this.#frame.name;
    }
    get line() {
        return this.#frame.line;
    }
    get column() {
        return this.#frame.column;
    }
    get missingDebugInfo() {
        return this.#frame.missingDebugInfo;
    }
    get rawName() {
        return this.#frame.rawName;
    }
    get isWasm() {
        return this.#frame.isWasm;
    }
    get isInline() {
        return this.#frame.isInline;
    }
    get sdkFrame() {
        return this.#sdkFrame;
    }
    toUiLocation(workspace) {
        return this.#frame.toUiLocation(workspace);
    }
}
//# sourceMappingURL=StackTraceImpl.js.map