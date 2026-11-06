import type * as Protocol from '../../generated/protocol.js';
import type { FragmentImpl, FrameImpl } from './StackTraceImpl.js';
export interface ParsedFrameInfo {
    readonly isAsync?: boolean;
    readonly isConstructor?: boolean;
    readonly isEval?: boolean;
    readonly evalOrigin?: RawFrame;
    readonly wasmModuleName?: string;
    readonly wasmFunctionIndex?: number;
    readonly typeName?: string;
    readonly methodName?: string;
    readonly promiseIndex?: number;
}
/**
 * Intentionally very close to a {@link Protocol.Runtime.CallFrame} but with optional `scriptId`.
 */
export interface RawFrame {
    readonly scriptId?: Protocol.Runtime.ScriptId;
    readonly url?: string;
    readonly functionName?: string;
    readonly lineNumber: number;
    readonly columnNumber: number;
    readonly parsedFrameInfo?: ParsedFrameInfo;
    readonly isWasm?: boolean;
}
/**
 * @returns whether the frame is a V8 builtin frame e.g. Array.map. Builtin frames
 * have neither source position nor script or URL. They only have a name.
 */
export declare function isBuiltinFrame(rawFrame: RawFrame): boolean;
/** How a single raw frame participates in stack traces. Context-free: it only depends on the raw frame itself. */
export declare const enum FrameKind {
    /** Shown as is. */
    VISIBLE = "VISIBLE",
    /** Code of an authored function that the compiler moved into a separate function. Merged with its caller(s). */
    OUTLINED = "OUTLINED",
    /** Compiler helper without authored counterpart. Never shown. */
    HIDDEN = "HIDDEN"
}
/**
 * Opaque identities of authored functions, compared only for equality.
 * `top` identifies the function of `frames[0]`, `bottom` the function of `frames.at(-1)`.
 */
export interface FunctionKeys {
    readonly top: string;
    readonly bottom: string;
}
export declare class EvalOrigin {
    readonly frames: FrameImpl[];
    readonly evalOrigin?: EvalOrigin;
    constructor(frames: FrameImpl[], evalOrigin?: EvalOrigin);
}
interface FrameNodeBase<ChildT, ParentT> {
    readonly parent: ParentT;
    readonly children: ChildT[];
}
type RootFrameNode = FrameNodeBase<WeakRef<FrameNode>, null>;
type AnyFrameNode = FrameNode | RootFrameNode;
export declare class FrameNode implements FrameNodeBase<FrameNode, AnyFrameNode> {
    readonly parent: AnyFrameNode;
    readonly children: FrameNode[];
    readonly rawFrame: RawFrame;
    /** Context-free translation: [top, ...inlinedCallers]. Empty iff `kind === HIDDEN` (or not translated yet). */
    frames: FrameImpl[];
    kind: FrameKind;
    /** Set iff `kind` is OUTLINED, or VISIBLE and translated with scopes information. */
    functionKeys?: FunctionKeys;
    /** True iff the translation shows generated code because no authored code is known for the frame (incl. builtins). */
    isUnmapped: boolean;
    /** False until a translation was stored. Stays false if translation threw, so it will be retried. */
    isTranslated: boolean;
    fragment?: FragmentImpl;
    parsedFrameInfo?: ParsedFrameInfo;
    evalOrigin?: EvalOrigin;
    constructor(rawFrame: RawFrame, parent: AnyFrameNode);
    /**
     * Produces the ancestor chain. Including `this` but excluding the `RootFrameNode`.
     */
    getCallStack(): Generator<FrameNode>;
}
/**
 * Stores stack trace fragments in a trie, but does not own them/keep them alive.
 */
export declare class Trie {
    #private;
    /**
     * Most sources produce stack traces in "top-to-bottom" order, so that is what this method expects.
     *
     * @returns The {@link FrameNode} corresponding to the top-most stack frame.
     */
    insert(frames: RawFrame[]): FrameNode;
    /**
     * Traverses the trie in pre-order.
     *
     * @param node Start at `node` or `null` to start with the children of the root.
     * @param visit Called on each node in the trie. Return `true` if the visitor should descend into child nodes of the provided node.
     */
    walk(node: FrameNode | null, visit: (node: FrameNode) => boolean): void;
}
/**
 * @returns a number < 0, 0 or > 0, if the `a` is smaller then, equal or greater then `b`.
 */
export declare function compareRawFrames(a: RawFrame, b: RawFrame): number;
export {};
