import type * as Common from '../../core/common/common.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as Workspace from '../workspace/workspace.js';
export type StackTrace = BaseStackTrace<Fragment>;
export type DebuggableStackTrace = BaseStackTrace<DebuggableFragment>;
export type ParsedErrorStackTrace = BaseStackTrace<ParsedErrorStackFragment>;
export interface BaseStackTrace<SyncFragmentT extends Fragment> extends Common.EventTarget.EventTarget<EventTypes> {
    readonly syncFragment: SyncFragmentT;
    readonly asyncFragments: readonly AsyncFragment[];
}
export interface Fragment {
    readonly frames: readonly Frame[];
}
export interface AsyncFragment extends Fragment {
    readonly description: string;
}
export interface DebuggableFragment {
    readonly frames: readonly DebuggableFrame[];
}
export interface ParsedErrorStackFragment {
    readonly frames: readonly ParsedErrorStackFrame[];
}
export interface Frame {
    readonly url?: string;
    readonly uiSourceCode?: Workspace.UISourceCode.UISourceCode;
    readonly name?: string;
    readonly line: number;
    readonly column: number;
    readonly missingDebugInfo?: MissingDebugInfo;
    /**
     * The untranslated function name. For inlined frames this will be the name
     * of the containing function.
     */
    readonly rawName?: string;
    /**
     * Whether the corresponding raw frame is JS or WASM.
     */
    readonly isWasm?: boolean;
    /**
     * Whether this frame is an inlined frame. Used by SymbolizedErrorWidget
     * to render the translated name (i.e. `name`) for inlined frames, and
     * the physical name (i.e. `rawName`) for normal frames to preserve existing
     * behavior.
     */
    readonly isInline?: boolean;
    /**
     * Creates a UILocation for this frame's `line` and `column`.
     *
     * Uses `uiSourceCode` if it's set. Otherwise, looks up a UISourceCode for
     * `url` in the given `workspace`.
     *
     * @returns null if neither `uiSourceCode` nor a UISourceCode for `url` is available.
     */
    toUiLocation(workspace: Workspace.Workspace.WorkspaceImpl): Workspace.UISourceCode.UILocation | null;
}
export interface ParsedErrorStackFrame extends Frame {
    readonly isAsync?: boolean;
    readonly isConstructor?: boolean;
    readonly isEval?: boolean;
    readonly evalOrigin?: ParsedErrorStackFrame;
    readonly wasmModuleName?: string;
    readonly wasmFunctionIndex?: number;
    readonly typeName?: string;
    readonly methodName?: string;
    readonly promiseIndex?: number;
}
export interface DebuggableFrame extends Frame {
    readonly sdkFrame: SDK.DebuggerModel.CallFrame;
}
export declare const enum MissingDebugInfoType {
    /** No debug information at all for the call frame */
    NO_INFO = "NO_INFO",
    /** Some debug information available, but it references files with debug information we were not able to retrieve */
    PARTIAL_INFO = "PARTIAL_INFO"
}
export type MissingDebugInfo = {
    type: MissingDebugInfoType.NO_INFO;
} | {
    type: MissingDebugInfoType.PARTIAL_INFO;
    missingDebugFiles: SDK.DebuggerModel.MissingDebugFiles[];
};
export declare const enum Events {
    UPDATED = "UPDATED"
}
export interface EventTypes {
    [Events.UPDATED]: void;
}
/**
 * A small wrapper around a DebuggableFrame usable as a UI.Context flavor.
 * This is necessary as DebuggableFrame are just interfaces and the impl classes are hidden.
 *
 * Moreover, re-translation creates a new DebuggableFrame instance even though the
 * translation result stays the same, in which case we don't need a new instance for the flavor.
 */
export declare class DebuggableFrameFlavor {
    #private;
    readonly frame: DebuggableFrame;
    /** Use the static {@link for}. Only public to satisfy the `setFlavor` Ctor type  */
    constructor(frame: DebuggableFrame);
    get sdkFrame(): SDK.DebuggerModel.CallFrame;
    /** @returns the same instance of DebuggableFrameFlavor for repeated calls with the same (i.e. deep equal) DebuggableFrame */
    static for(frame: DebuggableFrame): DebuggableFrameFlavor;
}
/**
 * Returns whether the given stack trace originated from a direct console
 * invocation. A console-originated stack trace has exactly one frame with
 * no url and no function name.
 *
 * TODO(crbug.com/40726969): Accept a translated `StackTrace` instead of a raw `Protocol.Runtime.StackTrace`.
 */
export declare function isConsoleOriginated(stackTrace: Protocol.Runtime.StackTrace): boolean;
