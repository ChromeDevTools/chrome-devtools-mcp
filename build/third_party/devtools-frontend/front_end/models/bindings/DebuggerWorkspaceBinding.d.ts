import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Protocol from '../../generated/protocol.js';
import type * as StackTrace from '../stack_trace/stack_trace.js';
import * as Workspace from '../workspace/workspace.js';
import { DebuggerLanguagePluginManager } from './DebuggerLanguagePlugins.js';
import { type LiveLocation, type LiveLocationPool, LiveLocationWithPool } from './LiveLocation.js';
import type { DebuggerLocationUpdater, ResourceMapping } from './ResourceMapping.js';
import { type ResourceScriptFile } from './ResourceScriptMapping.js';
import { type SymbolizedError } from './SymbolizedError.js';
export declare const wasmAutoSteppingSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
export declare class DebuggerWorkspaceBinding implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel>, DebuggerLocationUpdater {
    #private;
    readonly resourceMapping: ResourceMapping;
    readonly pluginManager: DebuggerLanguagePluginManager;
    readonly ignoreListManager: Workspace.IgnoreListManager.IgnoreListManager;
    readonly workspace: Workspace.Workspace.WorkspaceImpl;
    constructor(resourceMapping: ResourceMapping, targetManager: SDK.TargetManager.TargetManager, ignoreListManager: Workspace.IgnoreListManager.IgnoreListManager, workspace: Workspace.Workspace.WorkspaceImpl);
    setFunctionRanges(uiSourceCode: Workspace.UISourceCode.UISourceCode, ranges: SDK.SourceMapFunctionRanges.NamedFunctionRange[]): void;
    static instance(opts?: {
        forceNew: boolean | null;
        resourceMapping: ResourceMapping | null;
        targetManager: SDK.TargetManager.TargetManager | null;
        ignoreListManager: Workspace.IgnoreListManager.IgnoreListManager | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
    }): DebuggerWorkspaceBinding;
    static removeInstance(): void;
    private computeAutoStepRanges;
    private computeAutoStep;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    /**
     * The promise returned by this function is resolved once all *currently*
     * pending LiveLocations are processed.
     */
    pendingLiveLocationChangesPromise(): Promise<void>;
    private recordLiveLocationChange;
    updateLocations(script: SDK.Script.Script): Promise<void>;
    createStackTraceFromProtocolRuntime(stackTrace: Protocol.Runtime.StackTrace, target: SDK.Target.Target): Promise<StackTrace.StackTrace.StackTrace>;
    createStackTraceFromDebuggerPaused(pausedDetails: SDK.DebuggerModel.DebuggerPausedDetails, target: SDK.Target.Target): Promise<StackTrace.StackTrace.DebuggableStackTrace>;
    createStackTraceFromErrorStackLikeString(target: SDK.Target.Target, stack: string, exceptionDetails?: Protocol.Runtime.ExceptionDetails): Promise<StackTrace.StackTrace.ParsedErrorStackTrace | null>;
    createSymbolizedError(remoteObject: SDK.RemoteObject.RemoteObject, exceptionDetails?: Protocol.Runtime.ExceptionDetails): Promise<SymbolizedError | null>;
    createLiveLocation(rawLocation: SDK.DebuggerModel.Location, updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool): Promise<Location | null>;
    createStackTraceTopFrameLiveLocation(rawLocations: SDK.DebuggerModel.Location[], updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool): Promise<LiveLocation>;
    rawLocationToUILocation(rawLocation: SDK.DebuggerModel.Location): Promise<Workspace.UISourceCode.UILocation | null>;
    uiSourceCodeForSourceMapSourceURL(debuggerModel: SDK.DebuggerModel.DebuggerModel, url: Platform.DevToolsPath.UrlString, isContentScript: boolean): Workspace.UISourceCode.UISourceCode | null;
    uiSourceCodeForSourceMapSourceURLPromise(debuggerModel: SDK.DebuggerModel.DebuggerModel, url: Platform.DevToolsPath.UrlString, isContentScript: boolean): Promise<Workspace.UISourceCode.UISourceCode>;
    uiSourceCodeForDebuggerLanguagePluginSourceURLPromise(debuggerModel: SDK.DebuggerModel.DebuggerModel, url: Platform.DevToolsPath.UrlString): Promise<Workspace.UISourceCode.UISourceCode | null>;
    uiSourceCodeForScript(script: SDK.Script.Script): Workspace.UISourceCode.UISourceCode | null;
    waitForUISourceCodeAdded(url: Platform.DevToolsPath.UrlString, target: SDK.Target.Target): Promise<Workspace.UISourceCode.UISourceCode>;
    uiLocationToRawLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber?: number): Promise<SDK.DebuggerModel.Location[]>;
    /**
     * Computes all the raw location ranges that intersect with the {@link textRange} in the given
     * {@link uiSourceCode}. The reverse mappings of the returned ranges must not be fully contained
     * with the {@link textRange} and it's the responsibility of the caller to appropriately filter or
     * clamp if desired.
     *
     * It's important to note that for a contiguous range in the {@link uiSourceCode} there can be a
     * variety of non-contiguous raw location ranges that intersect with the {@link textRange}. A
     * simple example is that of an HTML document with multiple inline `<script>`s in the same line,
     * so just asking for the raw locations in this single line will return a set of location ranges
     * in different scripts.
     *
     * This method returns an empty array if this {@link uiSourceCode} is not provided by any of the
     * mappings for this instance.
     *
     * @param uiSourceCode the {@link UISourceCode} to which the {@link textRange} belongs.
     * @param textRange the text range in terms of the UI.
     * @returns the list of raw location ranges that intersect with the text range or `[]` if
     *          the {@link uiSourceCode} does not belong to this instance.
     */
    uiLocationRangeToRawLocationRanges(uiSourceCode: Workspace.UISourceCode.UISourceCode, textRange: TextUtils.TextRange.TextRange): Promise<SDK.DebuggerModel.LocationRange[]>;
    functionBoundsAtRawLocation(rawLocation: SDK.DebuggerModel.Location): Promise<Workspace.UISourceCode.UIFunctionBounds | null>;
    normalizeUILocation(uiLocation: Workspace.UISourceCode.UILocation): Promise<Workspace.UISourceCode.UILocation>;
    /**
     * Computes the set of lines in the {@link uiSourceCode} that map to scripts by either looking at
     * the debug info (if any) or checking for inline scripts within documents. If this set cannot be
     * computed or all the lines in the {@link uiSourceCode} correspond to lines in a script, `null`
     * is returned here.
     *
     * @param uiSourceCode the source entity.
     * @returns a set of known mapped lines for {@link uiSourceCode} or `null` if it's impossible to
     *          determine the set or the {@link uiSourceCode} does not map to or include any scripts.
     */
    getMappedLines(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<Set<number> | null>;
    scriptFile(uiSourceCode: Workspace.UISourceCode.UISourceCode, debuggerModel: SDK.DebuggerModel.DebuggerModel): ResourceScriptFile | null;
    scriptsForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Script.Script[];
    sourceMapURLsForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): Platform.DevToolsPath.UrlString[];
    supportsConditionalBreakpoints(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    resetForTest(target: SDK.Target.Target): void;
    removeLiveLocation(location: Location): void;
    /** @returns null to present the pause, or the step to issue instead. */
    private shouldPause;
}
export declare class Location extends LiveLocationWithPool {
    #private;
    readonly scriptId: string;
    readonly rawLocation: SDK.DebuggerModel.Location;
    constructor(scriptId: string, rawLocation: SDK.DebuggerModel.Location, binding: DebuggerWorkspaceBinding, updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool);
    uiLocation(): Promise<Workspace.UISourceCode.UILocation | null>;
    dispose(): void;
}
export interface DebuggerSourceMapping {
    rawLocationToUILocation(rawLocation: SDK.DebuggerModel.Location): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber?: number): SDK.DebuggerModel.Location[];
    uiLocationRangeToRawLocationRanges(uiSourceCode: Workspace.UISourceCode.UISourceCode, textRange: TextUtils.TextRange.TextRange): SDK.DebuggerModel.LocationRange[] | null;
}
