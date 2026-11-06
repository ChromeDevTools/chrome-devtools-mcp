import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import * as StackTrace from './stack_trace.js';
import { FrameKind, type FunctionKeys, type RawFrame } from './Trie.js';
/** Named `TranslatedUIFrame` to avoid confusion with `SDK.SourceMapScopesInfo.TranslatedFrame`. */
export type TranslatedUIFrame = Pick<StackTrace.StackTrace.Frame, 'url' | 'uiSourceCode' | 'name' | 'line' | 'column' | 'missingDebugInfo'>;
/**
 * The translation of a single {@link RawFrame}. `frames` is [top, ...inlinedCallers] in top-to-bottom order. It MUST
 * NOT be empty for VISIBLE and OUTLINED.
 */
export type TranslatedRawFrame = {
    readonly kind: FrameKind.HIDDEN;
    readonly frames: readonly [];
} | {
    readonly kind: FrameKind.VISIBLE;
    readonly frames: TranslatedUIFrame[];
    /** Makes the frame eligible to end an outlined chain. */
    readonly functionKeys?: FunctionKeys;
    /**
     * True iff `frames` show generated code because no authored code is known for the raw frame: builtins, scripts
     * without source map, scripts whose source map is still loading, language plugins reporting `missingDebugInfo`.
     * A frame at an unmapped position of a script with scopes information is not unmapped: its generated ranges still
     * identify the authored function.
     *
     * Unmapped frames are treated as "not authored" and may be merged away inside outlined chains.
     */
    readonly unmapped?: boolean;
} | {
    readonly kind: FrameKind.OUTLINED;
    readonly frames: TranslatedUIFrame[];
    readonly functionKeys: FunctionKeys;
};
/**
 * A stack trace translation function.
 *
 * Any implementation must return an array with the same length as `frames`.
 */
export type TranslateRawFrames = (frames: readonly RawFrame[], target: SDK.Target.Target) => Promise<TranslatedRawFrame[]>;
/**
 * The {@link StackTraceModel} is a thin wrapper around a fragment trie.
 *
 * We want to store stack trace fragments per target so a SDKModel is the natural choice.
 */
export declare class StackTraceModel extends SDK.SDKModel.SDKModel<unknown> {
    #private;
    createFromProtocolRuntime(stackTrace: Protocol.Runtime.StackTrace, rawFramesToUIFrames: TranslateRawFrames): Promise<StackTrace.StackTrace.StackTrace>;
    createFromErrorStackLikeString(stack: string, rawFramesToUIFrames: TranslateRawFrames, exceptionDetails?: Protocol.Runtime.ExceptionDetails): Promise<StackTrace.StackTrace.ParsedErrorStackTrace | null>;
    createFromDebuggerPaused(pausedDetails: SDK.DebuggerModel.DebuggerPausedDetails, rawFramesToUIFrames: TranslateRawFrames): Promise<StackTrace.StackTrace.DebuggableStackTrace>;
    /**
     * Re-translates all trie nodes whose raw frame or eval origin chain is in `script`, and notifies all stack traces
     * that contain such a node.
     *
     * Calls that arrive before the pending update acquired the mutex are coalesced into a single update (using the
     * `translateRawFrames` of the first call), so that e.g. re-adding thousands of scripts walks the trie only once.
     */
    scriptInfoChanged(script: SDK.Script.Script, translateRawFrames: TranslateRawFrames): Promise<void>;
}
