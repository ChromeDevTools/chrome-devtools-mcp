import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as Workspace from '../workspace/workspace.js';
import type { CSSWorkspaceBinding } from './CSSWorkspaceBinding.js';
import type { DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
import { LiveLocationPool } from './LiveLocation.js';
export interface MessageSource {
    url?: Platform.DevToolsPath.UrlString;
    line: number;
    column: number;
    scriptId?: Protocol.Runtime.ScriptId;
    stackTrace?: Protocol.Runtime.StackTrace;
}
export declare class PresentationSourceFrameMessageManager implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel>, SDK.TargetManager.SDKModelObserver<SDK.CSSModel.CSSModel> {
    #private;
    constructor(targetManager: SDK.TargetManager.TargetManager, workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: DebuggerWorkspaceBinding, cssWorkspaceBinding: CSSWorkspaceBinding);
    enable(): void;
    modelAdded(model: SDK.DebuggerModel.DebuggerModel | SDK.CSSModel.CSSModel): void;
    modelRemoved(model: SDK.DebuggerModel.DebuggerModel | SDK.CSSModel.CSSModel): void;
    addMessage(message: Workspace.UISourceCode.Message, source: MessageSource, target: SDK.Target.Target): void;
    clear(): void;
}
export declare class PresentationConsoleMessageManager {
    #private;
    constructor(targetManager: SDK.TargetManager.TargetManager, workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: DebuggerWorkspaceBinding, cssWorkspaceBinding: CSSWorkspaceBinding);
    enable(): void;
    private consoleMessageAdded;
}
export declare class PresentationSourceFrameMessageHelper {
    #private;
    constructor(workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: DebuggerWorkspaceBinding, cssWorkspaceBinding: CSSWorkspaceBinding);
    setDebuggerModel(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    setCSSModel(cssModel: SDK.CSSModel.CSSModel): void;
    addMessage(message: Workspace.UISourceCode.Message, source: MessageSource): Promise<void>;
    parsedScriptSourceForTest(): void;
    uiSourceCodeAddedForTest(): void;
    styleSheetAddedForTest(): void;
    clear(): void;
}
export declare class PresentationSourceFrameMessage {
    #private;
    constructor(message: Workspace.UISourceCode.Message, locationPool: LiveLocationPool, debuggerWorkspaceBinding: DebuggerWorkspaceBinding, cssWorkspaceBinding: CSSWorkspaceBinding);
    updateLocationSource(source: SDK.DebuggerModel.Location | Workspace.UISourceCode.UILocation | SDK.CSSModel.CSSLocation): Promise<void>;
    dispose(): void;
}
