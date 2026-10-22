import * as Platform from '../../core/platform/platform.js';
import * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { type DebuggerModel, Location } from './DebuggerModel.js';
import type { FrameAssociated } from './FrameAssociated.js';
import type { PageResourceLoadInitiator } from './PageResourceLoader.js';
import type { ExecutionContext } from './RuntimeModel.js';
import { SecurityOrigin } from './SecurityOrigin.js';
import type { DebugId, SourceMap } from './SourceMap.js';
import type { Target } from './Target.js';
export declare class Script implements TextUtils.ContentProvider.ContentProvider, FrameAssociated {
    #private;
    debuggerModel: DebuggerModel;
    scriptId: Protocol.Runtime.ScriptId;
    /**
     * The URL of the script. When `hasSourceURL` is true, this value comes from a `//# sourceURL=` directive. Otherwise,
     * it's the original `src` URL from which the script was loaded.
     */
    sourceURL: Platform.DevToolsPath.UrlString;
    lineOffset: number;
    columnOffset: number;
    endLine: number;
    endColumn: number;
    executionContextId: number;
    hash: string;
    sourceMapURL?: string;
    debugSymbols: Protocol.Debugger.DebugSymbols | null;
    hasSourceURL: boolean;
    contentLength: number;
    originStackTrace: Protocol.Runtime.StackTrace | null;
    readonly isModule: boolean | null;
    readonly buildId: string | null;
    constructor(debuggerModel: DebuggerModel, scriptId: Protocol.Runtime.ScriptId, sourceURL: Platform.DevToolsPath.UrlString, startLine: number, startColumn: number, endLine: number, endColumn: number, executionContextId: number, hash: string, isContentScript: boolean, sourceMapURL: string | undefined, hasSourceURL: boolean, length: number, isModule: boolean | null, originStackTrace: Protocol.Runtime.StackTrace | null, codeOffset: number | null, scriptLanguage: string | null, debugSymbols: Protocol.Debugger.DebugSymbols | null, embedderName: Platform.DevToolsPath.UrlString | null, buildId: string | null);
    embedderName(): Platform.DevToolsPath.UrlString | null;
    /**
     * Returns the security origin of the script derived exclusively from its
     * embedder/network URL (`#embedderName`), or a unique opaque origin if the
     * script has no valid network provenance (e.g. `eval()` or buffer-based Wasm).
     *
     * Security note: Do NOT fall back to `this.sourceURL` or
     * `this.target().inspectedSecurityOrigin()`:
     * - `sourceURL` is overwritten by `//# sourceURL=` comments, allowing a script
     *   to spoof an arbitrary origin.
     * - Third-party scripts (`<script src="https://attacker.example/...">`) run in
     *   the same target/frame as the main page; falling back to the target's
     *   origin would allow them to launder their origin by dynamically evaluating
     *   code via `eval()` or `WebAssembly.instantiate(buffer)`.
     */
    securityOrigin(): SecurityOrigin;
    target(): Target;
    private static trimSourceURLComment;
    isContentScript(): boolean;
    codeOffset(): number | null;
    isJavaScript(): boolean;
    isWasm(): boolean;
    scriptLanguage(): string | null;
    executionContext(): ExecutionContext | null;
    contentURL(): Platform.DevToolsPath.UrlString;
    contentType(): Common.ResourceType.ResourceType;
    private loadTextContent;
    private loadWasmContent;
    requestContentData(): Promise<TextUtils.ContentData.ContentDataOrError>;
    getWasmBytecode(): Promise<ArrayBuffer>;
    originalContentProvider(): TextUtils.ContentProvider.ContentProvider;
    searchInContent(query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
    rawLocation(lineNumber: number, columnNumber: number): Location | null;
    isInlineScript(): boolean;
    isAnonymousScript(): boolean;
    setBlackboxedRanges(positions: Protocol.Debugger.ScriptPosition[]): Promise<boolean>;
    containsLocation(lineNumber: number, columnNumber: number): boolean;
    get frameId(): Protocol.Page.FrameId;
    /**
     * @returns true, iff this script originates from a breakpoint/logpoint condition
     */
    get isBreakpointCondition(): boolean;
    /**
     * @returns the currently attached source map for this Script or `undefined` if there is none or it
     * hasn't loaded yet.
     */
    sourceMap(): SourceMap | undefined;
    createPageResourceLoadInitiator(): PageResourceLoadInitiator;
    debugId(): DebugId | null;
    /**
     * Translates the `rawLocation` from line and column number in terms of what V8 understands
     * to a script relative location. Specifically this means that for inline `<script>`'s
     * without a `//# sourceURL=` annotation, the line and column offset of the script
     * content is subtracted to make the location within the script independent of the
     * location of the `<script>` tag within the surrounding document.
     *
     * @param rawLocation the raw location in terms of what V8 understands.
     * @returns the script relative line and column number for the {@link rawLocation}.
     */
    rawLocationToRelativeLocation(rawLocation: {
        lineNumber: number;
        columnNumber: number;
    }): {
        lineNumber: number;
        columnNumber: number;
    };
    rawLocationToRelativeLocation(rawLocation: {
        lineNumber: number;
        columnNumber: number | undefined;
    }): {
        lineNumber: number;
        columnNumber: number | undefined;
    };
    /**
     * Translates the `relativeLocation` from script relative line and column number to
     * the raw location in terms of what V8 understands. Specifically this means that for
     * inline `<script>`'s without a `//# sourceURL=` annotation, the line and column offset
     * of the script content is added to make the location relative to the start of the
     * surrounding document.
     *
     * @param relativeLocation the script relative location.
     * @returns the raw location in terms of what V8 understands for the {@link relativeLocation}.
     */
    relativeLocationToRawLocation(relativeLocation: {
        lineNumber: number;
        columnNumber: number;
    }): {
        lineNumber: number;
        columnNumber: number;
    };
    relativeLocationToRawLocation(relativeLocation: {
        lineNumber: number;
        columnNumber: number | undefined;
    }): {
        lineNumber: number;
        columnNumber: number | undefined;
    };
}
export declare const sourceURLRegex: RegExp;
export declare function disassembleWasm(content: string): Promise<TextUtils.WasmDisassembly.WasmDisassembly>;
