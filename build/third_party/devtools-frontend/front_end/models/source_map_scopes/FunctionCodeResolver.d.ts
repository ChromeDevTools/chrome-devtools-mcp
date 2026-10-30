import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Bindings from '../bindings/bindings.js';
import * as Workspace from '../workspace/workspace.js';
/** Represents the source code for a given function, including additional context of surrounding lines. */
export interface FunctionCode {
    functionBounds: Workspace.UISourceCode.UIFunctionBounds;
    /** The text of `uiSourceCode`. */
    text: TextUtils.Text.Text;
    /** The function text. */
    code: string;
    /** The range of `code` within `text`. */
    range: TextUtils.TextRange.TextRange;
    /** The function text, plus some additional context before and after. The actual function is wrapped in <FUNCTION_START>...<FUNCTION_END> */
    codeWithContext: string;
    /** The range of `codeWithContext` within `text`. */
    rangeWithContext: TextUtils.TextRange.TextRange;
}
export interface CreateFunctionCodeOptions {
    /** Number of characters to include before and after the function. Stacks with `contextLineLength`. */
    contextLength?: number;
    /** Number of lines to include before and after the function. Stacks with `contextLength`. */
    contextLineLength?: number;
    /** If true, appends profile data from the trace at the end of every line of the function in `codeWithContext`. This should match what is seen in the formatted view in the Sources panel. */
    appendProfileData?: boolean;
}
/**
 * Resolves the function code and its surrounding context for a given location.
 *
 * The input location (line, column) may be either an authored (source-mapped)
 * location or a raw location. The function will attempt to resolve it to a
 * raw location regardless. This is necessary because callers (such as AI
 * assistance) may work with either format.
 *
 * We filter projects by `target` to prevent cross-origin leaks.
 */
export declare function getFunctionCodeFromLocation(target: SDK.Target.Target, url: Platform.DevToolsPath.UrlString, line: number, column: number, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, options?: CreateFunctionCodeOptions): Promise<FunctionCode | null>;
/**
 * Returns a {@link FunctionCode} for the given raw location.
 */
export declare function getFunctionCodeFromRawLocation(rawLocation: SDK.DebuggerModel.Location, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, options?: CreateFunctionCodeOptions): Promise<FunctionCode | null>;
