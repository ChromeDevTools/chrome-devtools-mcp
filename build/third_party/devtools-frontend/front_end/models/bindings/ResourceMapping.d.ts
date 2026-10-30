import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
export interface DebuggerLocationUpdater {
    updateLocations(script: SDK.Script.Script): Promise<void>;
}
export interface CSSLocationUpdater {
    updateLocations(header: SDK.CSSStyleSheetHeader.CSSStyleSheetHeader): Promise<void>;
}
export declare class ResourceMapping implements SDK.TargetManager.SDKModelObserver<SDK.ResourceTreeModel.ResourceTreeModel> {
    #private;
    readonly workspace: Workspace.Workspace.WorkspaceImpl;
    constructor(targetManager: SDK.TargetManager.TargetManager, workspace: Workspace.Workspace.WorkspaceImpl);
    get debuggerLocationUpdater(): DebuggerLocationUpdater | null;
    set debuggerLocationUpdater(debuggerLocationUpdater: DebuggerLocationUpdater);
    get cssLocationUpdater(): CSSLocationUpdater | null;
    set cssLocationUpdater(cssLocationUpdater: CSSLocationUpdater);
    modelAdded(resourceTreeModel: SDK.ResourceTreeModel.ResourceTreeModel): void;
    modelRemoved(resourceTreeModel: SDK.ResourceTreeModel.ResourceTreeModel): void;
    private infoForTarget;
    uiSourceCodeForScript(script: SDK.Script.Script): Workspace.UISourceCode.UISourceCode | null;
    cssLocationToUILocation(cssLocation: SDK.CSSModel.CSSLocation): Workspace.UISourceCode.UILocation | null;
    jsLocationToUILocation(jsLocation: SDK.DebuggerModel.Location): Workspace.UISourceCode.UILocation | null;
    uiLocationToJSLocations(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number): SDK.DebuggerModel.Location[];
    uiLocationRangeToJSLocationRanges(uiSourceCode: Workspace.UISourceCode.UISourceCode, textRange: TextUtils.TextRange.TextRange): SDK.DebuggerModel.LocationRange[] | null;
    getMappedLines(uiSourceCode: Workspace.UISourceCode.UISourceCode): Set<number> | null;
    uiLocationToCSSLocations(uiLocation: Workspace.UISourceCode.UILocation): SDK.CSSModel.CSSLocation[];
    functionBoundsAtRawLocation(rawLocation: SDK.DebuggerModel.Location): Promise<Workspace.UISourceCode.UIFunctionBounds | null>;
    resetForTest(target: SDK.Target.Target): void;
}
