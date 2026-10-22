import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { type DebuggerSourceMapping, DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
export declare class ResourceScriptMapping implements DebuggerSourceMapping {
    #private;
    readonly debuggerModel: SDK.DebuggerModel.DebuggerModel;
    readonly debuggerWorkspaceBinding: DebuggerWorkspaceBinding;
    constructor(debuggerModel: SDK.DebuggerModel.DebuggerModel, workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: DebuggerWorkspaceBinding);
    private project;
    uiSourceCodeForScript(script: SDK.Script.Script): Workspace.UISourceCode.UISourceCode | null;
    rawLocationToUILocation(rawLocation: SDK.DebuggerModel.Location): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number): SDK.DebuggerModel.Location[];
    uiLocationRangeToRawLocationRanges(uiSourceCode: Workspace.UISourceCode.UISourceCode, { startLine, startColumn, endLine, endColumn }: TextUtils.TextRange.TextRange): SDK.DebuggerModel.LocationRange[] | null;
    private inspectedURLChanged;
    functionBoundsAtRawLocation(rawLocation: SDK.DebuggerModel.Location): Promise<Workspace.UISourceCode.UIFunctionBounds | null>;
    private addScript;
    scriptFile(uiSourceCode: Workspace.UISourceCode.UISourceCode): ResourceScriptFile | null;
    private removeScripts;
    private executionContextDestroyed;
    private globalObjectCleared;
    resetForTest(): void;
    dispose(): void;
}
export declare class ResourceScriptFile {
    #private;
    readonly uiSourceCode: Workspace.UISourceCode.UISourceCode;
    readonly script: SDK.Script.Script | null;
    constructor(resourceScriptMapping: ResourceScriptMapping, uiSourceCode: Workspace.UISourceCode.UISourceCode, script: SDK.Script.Script);
    addSourceMapURL(sourceMapURL: Platform.DevToolsPath.UrlString, provenance: SDK.SourceMap.SourceMapProvenance): void;
    addDebugInfoURL(debugInfoURL: Platform.DevToolsPath.UrlString): void;
    hasSourceMapURL(): boolean;
    missingSymbolFiles(): Promise<SDK.DebuggerModel.MissingDebugFiles[] | null>;
}
