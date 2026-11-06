import * as Common from '../../core/common/common.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type * as Workspace from '../workspace/workspace.js';
import type * as StackTrace from './stack_trace.js';
import { type FrameNode, type ParsedFrameInfo } from './Trie.js';
export type AnyStackTraceImpl = StackTraceImpl<FragmentImpl | DebuggableFragmentImpl | ParsedErrorStackFragmentImpl>;
export declare class StackTraceImpl<SyncFragmentT extends FragmentImpl | DebuggableFragmentImpl | ParsedErrorStackFragmentImpl = FragmentImpl> extends Common.ObjectWrapper.ObjectWrapper<StackTrace.StackTrace.EventTypes> implements StackTrace.StackTrace.BaseStackTrace<SyncFragmentT> {
    readonly syncFragment: SyncFragmentT;
    readonly asyncFragments: readonly AsyncFragmentImpl[];
    constructor(syncFragment: SyncFragmentT, asyncFragments: AsyncFragmentImpl[]);
}
export declare class FragmentImpl implements StackTrace.StackTrace.Fragment {
    static readonly EMPTY_FRAGMENT: FragmentImpl;
    readonly node?: FrameNode;
    readonly stackTraces: Set<AnyStackTraceImpl>;
    /**
     * Fragments are deduplicated based on the node.
     *
     * In turn, each fragment can be part of multiple stack traces.
     */
    static getOrCreate(node: FrameNode): FragmentImpl;
    private constructor();
    get frames(): FrameImpl[];
}
export declare class AsyncFragmentImpl implements StackTrace.StackTrace.AsyncFragment {
    readonly description: string;
    readonly fragment: FragmentImpl;
    constructor(description: string, fragment: FragmentImpl);
    get frames(): StackTrace.StackTrace.Frame[];
}
export declare class FrameImpl implements StackTrace.StackTrace.Frame {
    readonly url?: string;
    readonly uiSourceCode?: Workspace.UISourceCode.UISourceCode;
    readonly name?: string;
    readonly line: number;
    readonly column: number;
    readonly missingDebugInfo?: StackTrace.StackTrace.MissingDebugInfo;
    readonly rawName?: string;
    readonly isWasm?: boolean;
    readonly isInline?: boolean;
    constructor(url: string | undefined, uiSourceCode: Workspace.UISourceCode.UISourceCode | undefined, name: string | undefined, line: number, column: number, missingDebugInfo?: StackTrace.StackTrace.MissingDebugInfo, rawName?: string, isWasm?: boolean, isInline?: boolean);
    toUiLocation(workspace: Workspace.Workspace.WorkspaceImpl): Workspace.UISourceCode.UILocation | null;
}
/** A frame of a fragment after outlined frames were merged with their callers. */
export interface LogicalFrame {
    /** Node frame for non-merged groups (same identity as `node.frames[inlineIndex]`), a fresh copy for merged groups. */
    readonly frame: FrameImpl;
    /** The node this frame was translated from. */
    readonly node: FrameNode;
    /** Index of `node` in the call stack (0 = top). Equals the index into `DebuggerPausedDetails.callFrames`. */
    readonly nodeIndex: number;
    /** Index of `frame` in `node.frames`. Equals `CallFrame.inlineFrameIndex`. */
    readonly inlineIndex: number;
    /** Set only on the last frame of a group: the node that physically invoked this logical frame. */
    readonly invocationNode?: FrameNode;
}
/**
 * Drops HIDDEN nodes and merges each OUTLINED node with its callers into one group of logical frames.
 *
 * The chain continues with callers whose `functionKeys.top` equals the previous member's `functionKeys.bottom`,
 * skipping HIDDEN and not-authored nodes. It ends with the first VISIBLE member (the terminator), or before a
 * non-matching caller.
 */
export declare function consolidate(callStack: readonly FrameNode[]): LogicalFrame[];
export declare class ParsedErrorStackFragmentImpl implements StackTrace.StackTrace.ParsedErrorStackFragment {
    readonly fragment: FragmentImpl;
    constructor(fragment: FragmentImpl);
    get frames(): ParsedErrorStackFrameImpl[];
}
/**
 * Location properties (e.g. `isAsync`) describe where execution is, and come from the node a frame was translated
 * from. Invocation properties (e.g. `isConstructor`) describe how the physical function was called, and only exist
 * on the last frame of a group of inlined or merged frames.
 */
export declare class ParsedErrorStackFrameImpl implements StackTrace.StackTrace.ParsedErrorStackFrame {
    #private;
    constructor(frame: FrameImpl, locationInfo?: ParsedFrameInfo, invocationInfo?: ParsedFrameInfo, evalOrigin?: ParsedErrorStackFrameImpl);
    get url(): string | undefined;
    get uiSourceCode(): Workspace.UISourceCode.UISourceCode | undefined;
    get name(): string | undefined;
    get line(): number;
    get column(): number;
    get missingDebugInfo(): StackTrace.StackTrace.MissingDebugInfo | undefined;
    get rawName(): string | undefined;
    get isAsync(): boolean | undefined;
    get isConstructor(): boolean | undefined;
    get isEval(): boolean | undefined;
    get evalOrigin(): ParsedErrorStackFrameImpl | undefined;
    get isWasm(): boolean | undefined;
    get isInline(): boolean | undefined;
    get wasmModuleName(): string | undefined;
    get wasmFunctionIndex(): number | undefined;
    get typeName(): string | undefined;
    get methodName(): string | undefined;
    get promiseIndex(): number | undefined;
    toUiLocation(workspace: Workspace.Workspace.WorkspaceImpl): Workspace.UISourceCode.UILocation | null;
}
/**
 * A DebuggableFragmentImpl wraps an existing FragmentImpl. This is important: We can pause at the
 * same location multiple times and the paused information changes each and everytime while the underlying
 * FragmentImpl will stay the same.
 */
export declare class DebuggableFragmentImpl implements StackTrace.StackTrace.DebuggableFragment {
    #private;
    readonly fragment: FragmentImpl;
    private readonly callFrames;
    constructor(fragment: FragmentImpl, callFrames: SDK.DebuggerModel.CallFrame[]);
    get frames(): DebuggableFrameImpl[];
}
/**
 * A DebuggableFrameImpl wraps an existing FrameImpl. This is important: We can pause at the
 * same location multiple times and the paused information changes each and everytime while the underlying
 * FrameImpl will stay the same.
 */
export declare class DebuggableFrameImpl implements StackTrace.StackTrace.DebuggableFrame {
    #private;
    constructor(frame: FrameImpl, sdkFrame: SDK.DebuggerModel.CallFrame);
    get url(): string | undefined;
    get uiSourceCode(): Workspace.UISourceCode.UISourceCode | undefined;
    get name(): string | undefined;
    get line(): number;
    get column(): number;
    get missingDebugInfo(): StackTrace.StackTrace.MissingDebugInfo | undefined;
    get rawName(): string | undefined;
    get isWasm(): boolean | undefined;
    get isInline(): boolean | undefined;
    get sdkFrame(): SDK.DebuggerModel.CallFrame;
    toUiLocation(workspace: Workspace.Workspace.WorkspaceImpl): Workspace.UISourceCode.UILocation | null;
}
