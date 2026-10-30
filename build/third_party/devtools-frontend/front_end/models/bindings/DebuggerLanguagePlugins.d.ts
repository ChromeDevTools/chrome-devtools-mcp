import type { Chrome } from '../../../extension-api/ExtensionAPI.js';
import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Protocol from '../../generated/protocol.js';
import * as StackTraceImpl from '../stack_trace/stack_trace_impl.js';
import * as Workspace from '../workspace/workspace.js';
import type { DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
declare class SourceScopeRemoteObject extends SDK.RemoteObject.RemoteObjectImpl {
    #private;
    variables: Chrome.DevTools.Variable[];
    stopId: StopId;
    constructor(callFrame: SDK.DebuggerModel.CallFrame, stopId: StopId, plugin: DebuggerLanguagePlugin);
    doGetProperties(_ownProperties: boolean, accessorPropertiesOnly: boolean, _generatePreview: boolean): Promise<SDK.RemoteObject.GetPropertiesResult>;
}
export declare class SourceScope implements SDK.DebuggerModel.ScopeChainEntry {
    #private;
    constructor(callFrame: SDK.DebuggerModel.CallFrame, stopId: StopId, type: string, typeName: string, icon: string | undefined, plugin: DebuggerLanguagePlugin);
    getVariableValue(name: string): Promise<SDK.RemoteObject.RemoteObject | null>;
    callFrame(): SDK.DebuggerModel.CallFrame;
    type(): string;
    typeName(): string;
    name(): string | undefined;
    range(): null;
    object(): SourceScopeRemoteObject;
    description(): string;
    icon(): string | undefined;
    extraProperties(): SDK.RemoteObject.RemoteObjectProperty[];
}
export declare class ExtensionRemoteObject extends SDK.RemoteObject.RemoteObject {
    private readonly extensionObject;
    private readonly plugin;
    readonly callFrame: SDK.DebuggerModel.CallFrame;
    constructor(callFrame: SDK.DebuggerModel.CallFrame, extensionObject: Chrome.DevTools.RemoteObject, plugin: DebuggerLanguagePlugin);
    get linearMemoryAddress(): number | undefined;
    get linearMemorySize(): number | undefined;
    get objectId(): Protocol.Runtime.RemoteObjectId | undefined;
    get type(): string;
    get subtype(): string | undefined;
    get value(): unknown;
    unserializableValue(): string | undefined;
    get description(): string | undefined;
    set description(_description: string | undefined);
    get hasChildren(): boolean;
    get preview(): Protocol.Runtime.ObjectPreview | undefined;
    get className(): string | null;
    arrayLength(): number;
    arrayBufferByteLength(): number;
    getOwnProperties(_generatePreview: boolean, _nonIndexedPropertiesOnly?: boolean): Promise<SDK.RemoteObject.GetPropertiesResult>;
    getAllProperties(_accessorPropertiesOnly: boolean, _generatePreview: boolean, _nonIndexedPropertiesOnly?: boolean): Promise<SDK.RemoteObject.GetPropertiesResult>;
    release(): void;
    debuggerModel(): SDK.DebuggerModel.DebuggerModel;
    runtimeModel(): SDK.RuntimeModel.RuntimeModel;
    isLinearMemoryInspectable(): boolean;
}
export type StopId = bigint;
export declare class DebuggerLanguagePluginManager implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    private readonly callFrameByStopId;
    private readonly stopIdByCallFrame;
    private nextStopId;
    constructor(targetManager: SDK.TargetManager.TargetManager, workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: DebuggerWorkspaceBinding, console: Common.Console.Console);
    private evaluateOnCallFrame;
    stopIdForCallFrame(callFrame: SDK.DebuggerModel.CallFrame): StopId;
    callFrameForStopId(stopId: StopId): SDK.DebuggerModel.CallFrame | undefined;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    private globalObjectCleared;
    addPlugin(plugin: DebuggerLanguagePlugin): void;
    removePlugin(plugin: DebuggerLanguagePlugin): void;
    hasPluginForScript(script: SDK.Script.Script): boolean;
    /**
     * Returns the responsible language #plugin and the raw module ID for a script.
     *
     * This ensures that the `addRawModule` call finishes first such that the
     * caller can immediately issue calls to the returned #plugin without the
     * risk of racing with the `addRawModule` call. The returned #plugin will be
     * set to undefined to indicate that there's no #plugin for the script.
     */
    private rawModuleIdAndPluginForScript;
    uiSourceCodeForURL(debuggerModel: SDK.DebuggerModel.DebuggerModel, url: Platform.DevToolsPath.UrlString, script?: SDK.Script.Script): Workspace.UISourceCode.UISourceCode | null;
    rawLocationToUILocation(rawLocation: SDK.DebuggerModel.Location): Promise<Workspace.UISourceCode.UILocation | null>;
    uiLocationToRawLocationRanges(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber?: number | undefined): Promise<Array<{
        start: SDK.DebuggerModel.Location;
        end: SDK.DebuggerModel.Location;
    }> | null>;
    uiLocationToRawLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber?: number): Promise<SDK.DebuggerModel.Location[] | null>;
    uiLocationRangeToRawLocationRanges(uiSourceCode: Workspace.UISourceCode.UISourceCode, textRange: TextUtils.TextRange.TextRange): Promise<SDK.DebuggerModel.LocationRange[] | null>;
    /**
     * Translates a raw frame via the language plugin responsible for its script.
     *
     * @returns null if no plugin is responsible for the frame. Otherwise the frame is translated, either
     * successfully, or identity mapped with the "missing debug info details" attached.
     */
    translateRawFrame(frame: StackTraceImpl.Trie.RawFrame, target: SDK.Target.Target): Promise<StackTraceImpl.StackTraceModel.TranslatedRawFrame | null>;
    scriptsForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Script.Script[];
    setDebugInfoURL(script: SDK.Script.Script, externalURL: Platform.DevToolsPath.UrlString): void;
    private parsedScriptSource;
    private debuggerResumed;
    getSourcesForScript(script: SDK.Script.Script): Promise<Platform.DevToolsPath.UrlString[] | {
        missingSymbolFiles: SDK.DebuggerModel.MissingDebugFiles[];
    } | undefined>;
    resolveScopeChain(callFrame: SDK.DebuggerModel.CallFrame): Promise<SourceScope[] | null>;
    getFunctionInfo(script: SDK.Script.Script, location: Pick<SDK.DebuggerModel.Location, 'columnNumber'>): Promise<{
        frames: Chrome.DevTools.FunctionInfo[];
        missingSymbolFiles: SDK.DebuggerModel.MissingDebugFiles[];
    } | {
        frames: Chrome.DevTools.FunctionInfo[];
    } | {
        missingSymbolFiles: SDK.DebuggerModel.MissingDebugFiles[];
    } | null>;
    getInlinedFunctionRanges(rawLocation: SDK.DebuggerModel.Location): Promise<Array<{
        start: SDK.DebuggerModel.Location;
        end: SDK.DebuggerModel.Location;
    }>>;
    getInlinedCalleesRanges(rawLocation: SDK.DebuggerModel.Location): Promise<Array<{
        start: SDK.DebuggerModel.Location;
        end: SDK.DebuggerModel.Location;
    }>>;
    getMappedLines(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<Set<number> | null>;
}
export interface DebuggerLanguagePlugin extends Chrome.DevTools.LanguageExtensionPlugin {
    name: string;
    handleScript(script: SDK.Script.Script): boolean;
    createPageResourceLoadInitiator(): SDK.PageResourceLoader.PageResourceLoadInitiator;
}
export {};
