import * as SDK from '../../core/sdk/sdk.js';
export declare function isScopedFrame(frame: SDK.DebuggerModel.CallFrame): boolean;
/**
 * @returns the stack depth that doesn't count outlined frames on top of the stack. Entering or leaving an outlined
 *          part of a function doesn't change it, while calling a function increases it.
 */
export declare function logicalDepth(callFrames: readonly SDK.DebuggerModel.CallFrame[]): number;
/** @returns true iff {@link frame} has encoded scopes, and its position is not mapped to any source. */
export declare function isUnmapped(frame: SDK.DebuggerModel.CallFrame): boolean;
/** @returns true iff both frames have encoded scopes and are mapped to the same original location. */
export declare function isSameOriginalLocation(a: SDK.DebuggerModel.CallFrame, b: SDK.DebuggerModel.CallFrame): boolean;
/** @returns the body of the innermost inlined function that {@link frame} is paused in (empty if none). */
export declare function inlinedFunctionRanges(frame: SDK.DebuggerModel.CallFrame): SDK.DebuggerModel.LocationRange[];
/** @returns the bodies of the functions inlined into the logical function that {@link frame} is paused in. */
export declare function inlinedCalleeRanges(frame: SDK.DebuggerModel.CallFrame): SDK.DebuggerModel.LocationRange[];
/**
 * @returns the bodies of the outlined parts of the logical function that {@link frame} is paused in. A step over
 *          enters them (`enterRanges`), as stepping over a call into them would skip authored code of that function.
 */
export declare function outlinedFunctionRanges(frame: SDK.DebuggerModel.CallFrame): SDK.DebuggerModel.LocationRange[];
/**
 * Decides whether the pause {@link details} completes the user's step {@link context}.
 *
 * @returns null to present the pause, or the step to issue instead.
 */
export declare function nextAutoStep(details: SDK.DebuggerModel.DebuggerPausedDetails, context: SDK.DebuggerModel.StepContext | null, computeAutoStep: SDK.DebuggerModel.ComputeAutoStepCallback): Promise<SDK.DebuggerModel.AutoStep | null>;
