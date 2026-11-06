// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @returns whether the frame is a V8 builtin frame e.g. Array.map. Builtin frames
 * have neither source position nor script or URL. They only have a name.
 */
export function isBuiltinFrame(rawFrame) {
    return rawFrame.lineNumber === -1 && rawFrame.columnNumber === -1 && !Boolean(rawFrame.scriptId) &&
        !Boolean(rawFrame.url);
}
/** How a single raw frame participates in stack traces. Context-free: it only depends on the raw frame itself. */
export var FrameKind;
(function (FrameKind) {
    /** Shown as is. */
    FrameKind["VISIBLE"] = "VISIBLE";
    /** Code of an authored function that the compiler moved into a separate function. Merged with its caller(s). */
    FrameKind["OUTLINED"] = "OUTLINED";
    /** Compiler helper without authored counterpart. Never shown. */
    FrameKind["HIDDEN"] = "HIDDEN";
})(FrameKind || (FrameKind = {}));
export class EvalOrigin {
    frames;
    evalOrigin;
    constructor(frames, evalOrigin) {
        this.frames = frames;
        this.evalOrigin = evalOrigin;
    }
}
export class FrameNode {
    parent;
    children = [];
    rawFrame;
    /** Context-free translation: [top, ...inlinedCallers]. Empty iff `kind === HIDDEN` (or not translated yet). */
    frames = [];
    kind = "VISIBLE" /* FrameKind.VISIBLE */;
    /** Set iff `kind` is OUTLINED, or VISIBLE and translated with scopes information. */
    functionKeys;
    /** True iff the translation shows generated code because no authored code is known for the frame (incl. builtins). */
    isUnmapped = false;
    /** False until a translation was stored. Stays false if translation threw, so it will be retried. */
    isTranslated = false;
    fragment;
    parsedFrameInfo;
    evalOrigin;
    constructor(rawFrame, parent) {
        this.rawFrame = rawFrame;
        this.parent = parent;
        this.parsedFrameInfo = rawFrame.parsedFrameInfo;
    }
    /**
     * Produces the ancestor chain. Including `this` but excluding the `RootFrameNode`.
     */
    *getCallStack() {
        // The `RootFrameNode` doesn't have an actual frame attached, that's why we check for `node.parent` instead of `node`.
        for (let node = this; node.parent; node = node.parent) {
            yield node;
        }
    }
}
/**
 * Stores stack trace fragments in a trie, but does not own them/keep them alive.
 */
export class Trie {
    #root = { parent: null, children: [] };
    /**
     * Most sources produce stack traces in "top-to-bottom" order, so that is what this method expects.
     *
     * @returns The {@link FrameNode} corresponding to the top-most stack frame.
     */
    insert(frames) {
        if (frames.length === 0) {
            throw new Error('Trie.insert called with an empty frames array.');
        }
        let currentNode = this.#root;
        for (let i = frames.length - 1; i >= 0; --i) {
            currentNode = this.#insert(currentNode, frames[i]);
        }
        return currentNode;
    }
    /**
     * Inserts `rawFrame` into the children of the provided node if not already there.
     *
     * @returns the child node corresponding to `rawFrame`.
     */
    #insert(node, rawFrame) {
        let i = 0;
        for (; i < node.children.length; ++i) {
            const maybeChild = node.children[i];
            const child = maybeChild instanceof WeakRef ? maybeChild.deref() : maybeChild;
            if (!child) {
                continue;
            }
            const compareResult = compareRawFrames(child.rawFrame, rawFrame);
            if (compareResult === 0) {
                if (rawFrame.parsedFrameInfo && !child.parsedFrameInfo) {
                    child.parsedFrameInfo = rawFrame.parsedFrameInfo;
                }
                return child;
            }
            if (compareResult > 0) {
                break;
            }
        }
        const newNode = new FrameNode(rawFrame, node);
        if (node.parent) {
            node.children.splice(i, 0, newNode);
        }
        else {
            node.children.splice(i, 0, new WeakRef(newNode));
        }
        return newNode;
    }
    /**
     * Traverses the trie in pre-order.
     *
     * @param node Start at `node` or `null` to start with the children of the root.
     * @param visit Called on each node in the trie. Return `true` if the visitor should descend into child nodes of the provided node.
     */
    walk(node, visit) {
        const stack = node ? [node] : [...this.#root.children].map(ref => ref.deref()).filter(node => Boolean(node));
        for (let node = stack.pop(); node; node = stack.pop()) {
            const visitChildren = visit(node);
            if (visitChildren) {
                // Pushing the children in reverse means the "left-most" child is visited first (i.e. pre-order).
                for (let i = node.children.length - 1; i >= 0; --i) {
                    stack.push(node.children[i]);
                }
            }
        }
    }
}
/**
 * @returns a number < 0, 0 or > 0, if the `a` is smaller then, equal or greater then `b`.
 */
export function compareRawFrames(a, b) {
    const scriptIdCompare = (a.scriptId ?? '').localeCompare(b.scriptId ?? '');
    if (scriptIdCompare !== 0) {
        return scriptIdCompare;
    }
    const urlCompare = (a.url ?? '').localeCompare(b.url ?? '');
    if (urlCompare !== 0) {
        return urlCompare;
    }
    const nameCompare = (a.functionName ?? '').localeCompare(b.functionName ?? '');
    if (nameCompare !== 0) {
        return nameCompare;
    }
    if (a.lineNumber !== b.lineNumber) {
        return a.lineNumber - b.lineNumber;
    }
    return a.columnNumber - b.columnNumber;
}
//# sourceMappingURL=Trie.js.map