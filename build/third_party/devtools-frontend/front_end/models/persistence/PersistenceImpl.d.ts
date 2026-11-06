import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as BreakpointManager from '../breakpoints/breakpoints.js';
import * as Workspace from '../workspace/workspace.js';
export declare class PersistenceImpl extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(workspace: Workspace.Workspace.WorkspaceImpl, breakpointManager: BreakpointManager.BreakpointManager.BreakpointManager);
    static instance(opts?: {
        forceNew: boolean | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
        breakpointManager: BreakpointManager.BreakpointManager.BreakpointManager | null;
    }): PersistenceImpl;
    addNetworkInterceptor(interceptor: (arg0: Workspace.UISourceCode.UISourceCode) => boolean): void;
    refreshAutomapping(): void;
    addBinding(binding: PersistenceBinding): Promise<void>;
    addBindingForTest(binding: PersistenceBinding): Promise<void>;
    removeBinding(binding: PersistenceBinding): Promise<void>;
    removeBindingForTest(binding: PersistenceBinding): Promise<void>;
    private onStatusAdded;
    private onStatusRemoved;
    private onWorkingCopyChanged;
    private syncWorkingCopy;
    private onWorkingCopyCommitted;
    syncContent(uiSourceCode: Workspace.UISourceCode.UISourceCode, newContent: string, encoded: boolean): void;
    static rewrapNodeJSContent(uiSourceCode: Workspace.UISourceCode.UISourceCode, currentContent: string, newContent: string): string;
    private contentSyncedForTest;
    private moveBreakpoints;
    hasUnsavedCommittedChanges(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    binding(uiSourceCode: Workspace.UISourceCode.UISourceCode): PersistenceBinding | null;
    /**
     * Returns whether the UISourceCode has editable content - either its project
     * supports file content changes, or it has a persistence binding to a file system.
     */
    hasEditableContent(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    subscribeForBindingEvent(uiSourceCode: Workspace.UISourceCode.UISourceCode, listener: () => void): void;
    unsubscribeFromBindingEvent(uiSourceCode: Workspace.UISourceCode.UISourceCode, listener: () => void): void;
    private notifyBindingEvent;
    fileSystem(uiSourceCode: Workspace.UISourceCode.UISourceCode): Workspace.UISourceCode.UISourceCode | null;
    network(uiSourceCode: Workspace.UISourceCode.UISourceCode): Workspace.UISourceCode.UISourceCode | null;
    filePathHasBindings(filePath: Platform.DevToolsPath.UrlString): boolean;
}
export declare const NodePrefix = "(function (exports, require, module, __filename, __dirname) { ";
export declare const NodeSuffix = "\n});";
export declare const NodeShebang = "#!/usr/bin/env node";
export declare enum Events {
    BindingCreated = "BindingCreated",
    BindingRemoved = "BindingRemoved"
}
export interface EventTypes {
    [Events.BindingCreated]: PersistenceBinding;
    [Events.BindingRemoved]: PersistenceBinding;
}
export declare class PersistenceBinding {
    readonly network: Workspace.UISourceCode.UISourceCode;
    readonly fileSystem: Workspace.UISourceCode.UISourceCode;
    constructor(network: Workspace.UISourceCode.UISourceCode, fileSystem: Workspace.UISourceCode.UISourceCode);
}
