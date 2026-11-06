import type * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as Workspace from '../../models/workspace/workspace.js';
import { type IssueKind } from './Issue.js';
import type { IssuesManager } from './IssuesManager.js';
export declare class SourceFrameIssuesManager {
    #private;
    private readonly issuesManager;
    constructor(issuesManager: IssuesManager, targetManager: SDK.TargetManager.TargetManager, workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, cssWorkspaceBinding: Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding);
}
export declare class IssueMessage extends Workspace.UISourceCode.Message {
    #private;
    constructor(title: string, kind: IssueKind, clickHandler: () => void);
    getIssueKind(): IssueKind;
}
