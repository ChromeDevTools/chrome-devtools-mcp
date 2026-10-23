import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import type { CSSWorkspaceBinding, SourceMapping } from './CSSWorkspaceBinding.js';
export declare class SASSSourceMapping implements SourceMapping {
    #private;
    constructor(target: SDK.Target.Target, sourceMapManager: SDK.SourceMapManager.SourceMapManager<SDK.CSSStyleSheetHeader.CSSStyleSheetHeader>, workspace: Workspace.Workspace.WorkspaceImpl, cssWorkspaceBinding: CSSWorkspaceBinding);
    private sourceMapAttachedForTest;
    private sourceMapAttached;
    private sourceMapDetached;
    rawLocationToUILocation(rawLocation: SDK.CSSModel.CSSLocation): Workspace.UISourceCode.UILocation | null;
    uiLocationToRawLocations(uiLocation: Workspace.UISourceCode.UILocation): SDK.CSSModel.CSSLocation[];
    static uiSourceOrigin(uiSourceCode: Workspace.UISourceCode.UISourceCode): Platform.DevToolsPath.UrlString[];
    static sourceMapURLsForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): Platform.DevToolsPath.UrlString[];
    dispose(): void;
}
