import * as Common from '../../core/common/common.js';
import * as Diff from '../../third_party/diff/diff.js';
import * as FormatterModule from '../formatter/formatter.js';
import * as Persistence from '../persistence/persistence.js';
import * as Workspace from '../workspace/workspace.js';
interface DiffResponse {
    diff: Diff.Diff.DiffArray;
    formattedCurrentMapping?: FormatterModule.ScriptFormatter.FormatterSourceMapping;
}
export declare class WorkspaceDiffImpl extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    /** used in web tests */
    private readonly loadingUISourceCodes;
    constructor(workspace: Workspace.Workspace.WorkspaceImpl, persistence: Persistence.Persistence.PersistenceImpl, networkPersistenceManager: Persistence.NetworkPersistenceManager.NetworkPersistenceManager, settings: Common.Settings.Settings);
    requestDiff(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<DiffResponse | null>;
    subscribeToDiffChange(uiSourceCode: Workspace.UISourceCode.UISourceCode, callback: () => void, thisObj?: Object): void;
    unsubscribeFromDiffChange(uiSourceCode: Workspace.UISourceCode.UISourceCode, callback: () => void, thisObj?: Object): void;
    modifiedUISourceCodes(): Workspace.UISourceCode.UISourceCode[];
    private uiSourceCodeProcessedForTest;
    requestOriginalContentForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<string | null>;
    revertToOriginal(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
}
export declare const enum Events {
    MODIFIED_STATUS_CHANGED = "ModifiedStatusChanged"
}
export interface ModifiedStatusChangedEvent {
    uiSourceCode: Workspace.UISourceCode.UISourceCode;
    isModified: boolean;
}
export interface EventTypes {
    [Events.MODIFIED_STATUS_CHANGED]: ModifiedStatusChangedEvent;
}
export declare class UISourceCodeDiff extends Common.ObjectWrapper.ObjectWrapper<UISourceCodeDiffEventTypes> {
    #private;
    dispose: boolean;
    constructor(uiSourceCode: Workspace.UISourceCode.UISourceCode, networkPersistenceManager: Persistence.NetworkPersistenceManager.NetworkPersistenceManager, settings: Common.Settings.Settings);
    requestDiff(): Promise<DiffResponse | null>;
    originalContent(): Promise<string | null>;
}
export declare const enum UISourceCodeDiffEvents {
    DIFF_CHANGED = "DiffChanged"
}
export interface UISourceCodeDiffEventTypes {
    [UISourceCodeDiffEvents.DIFF_CHANGED]: void;
}
export declare function workspaceDiff({ forceNew }?: {
    forceNew?: boolean;
}): WorkspaceDiffImpl;
export {};
