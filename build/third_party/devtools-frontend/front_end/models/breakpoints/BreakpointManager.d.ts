import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Bindings from '../bindings/bindings.js';
import * as Workspace from '../workspace/workspace.js';
export declare class BreakpointManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    readonly storage: Storage;
    readonly targetManager: SDK.TargetManager.TargetManager;
    readonly debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding;
    constructor(targetManager: SDK.TargetManager.TargetManager, workspace: Workspace.Workspace.WorkspaceImpl, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, settings: Common.Settings.Settings, restoreInitialBreakpointCount?: number);
    static instance(opts?: {
        forceNew: boolean | null;
        targetManager: SDK.TargetManager.TargetManager | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
        debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding | null;
        settings: Common.Settings.Settings | null;
        restoreInitialBreakpointCount?: number;
    }): BreakpointManager;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    addUpdateBindingsCallback(callback: ((uiSourceCode: Workspace.UISourceCode.UISourceCode) => Promise<void>)): void;
    copyBreakpoints(fromSourceCode: Workspace.UISourceCode.UISourceCode, toSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
    restoreBreakpointsForScript(script: SDK.Script.Script): Promise<void>;
    getUISourceCodeWithUpdatedBreakpointInfo(script: SDK.Script.Script): Promise<Workspace.UISourceCode.UISourceCode>;
    static getScriptForInlineUiSourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Script.Script | null;
    static breakpointLocationFromUiLocation(uiLocation: Workspace.UISourceCode.UILocation): {
        lineNumber: number;
        columnNumber: number | undefined;
    };
    static uiLocationFromBreakpointLocation(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number | undefined): Workspace.UISourceCode.UILocation;
    static isValidPositionInScript(lineNumber: number, columnNumber: number | undefined, script: SDK.Script.Script | null): boolean;
    private restoreBreakpoints;
    private uiSourceCodeAdded;
    private uiSourceCodeRemoved;
    private projectRemoved;
    private removeUISourceCode;
    setBreakpoint(uiSourceCode: Workspace.UISourceCode.UISourceCode, lineNumber: number, columnNumber: number | undefined, condition: UserCondition, enabled: boolean, isLogpoint: boolean, origin: BreakpointOrigin): Promise<Breakpoint | undefined>;
    findBreakpoint(uiLocation: Workspace.UISourceCode.UILocation): BreakpointLocation | null;
    addHomeUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode, breakpoint: Breakpoint): void;
    removeHomeUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode, breakpoint: Breakpoint): void;
    possibleBreakpoints(uiSourceCode: Workspace.UISourceCode.UISourceCode, textRange: TextUtils.TextRange.TextRange): Promise<Workspace.UISourceCode.UILocation[]>;
    breakpointLocationsForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): BreakpointLocation[];
    allBreakpointLocations(): BreakpointLocation[];
    removeBreakpoint(breakpoint: Breakpoint, removeFromStorage: boolean): void;
    uiLocationAdded(breakpoint: Breakpoint, uiLocation: Workspace.UISourceCode.UILocation): void;
    uiLocationRemoved(uiLocation: Workspace.UISourceCode.UILocation): void;
    supportsConditionalBreakpoints(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
}
export declare enum Events {
    BreakpointAdded = "breakpoint-added",
    BreakpointRemoved = "breakpoint-removed"
}
export interface EventTypes {
    [Events.BreakpointAdded]: BreakpointLocation;
    [Events.BreakpointRemoved]: BreakpointLocation;
}
export declare const enum DebuggerUpdateResult {
    OK = "OK",
    ERROR_BREAKPOINT_CLASH = "ERROR_BREAKPOINT_CLASH",
    ERROR_BACKEND = "ERROR_BACKEND",
    PENDING = "PENDING"
}
export type ScheduleUpdateResult = DebuggerUpdateResult.OK | DebuggerUpdateResult.ERROR_BACKEND | DebuggerUpdateResult.ERROR_BREAKPOINT_CLASH;
export declare class Breakpoint implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    readonly breakpointManager: BreakpointManager;
    /** All known UISourceCodes with this url. This also includes UISourceCodes for the inline scripts embedded in a resource with this URL. */
    readonly uiSourceCodes: Set<Workspace.UISourceCode.UISourceCode>;
    isRemoved: boolean;
    constructor(breakpointManager: BreakpointManager, primaryUISourceCode: Workspace.UISourceCode.UISourceCode | null, storageState: BreakpointStorageState, origin: BreakpointOrigin);
    getLastResolvedState(): Breakpoint.State | null;
    updateLastResolvedState(locations: Position[] | null): void;
    get origin(): BreakpointOrigin;
    refreshInDebugger(): Promise<void>;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelBreakpoint(debuggerModel: SDK.DebuggerModel.DebuggerModel): ModelBreakpoint | undefined;
    addUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    clearUISourceCodes(): void;
    removeUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    url(): Platform.DevToolsPath.UrlString;
    lineNumber(): number;
    columnNumber(): number | undefined;
    uiLocationAdded(uiLocation: Workspace.UISourceCode.UILocation): void;
    uiLocationRemoved(uiLocation: Workspace.UISourceCode.UILocation): void;
    enabled(): boolean;
    bound(): boolean;
    getClosestResolvedLocation(): Workspace.UISourceCode.UILocation | null;
    setEnabled(enabled: boolean): void;
    /**
     * The breakpoint condition as entered by the user.
     */
    condition(): UserCondition;
    /**
     * The breakpoint condition as it is sent to V8.
     */
    backendCondition(): SDK.DebuggerModel.BackendCondition;
    backendCondition(location: SDK.DebuggerModel.Location): Promise<SDK.DebuggerModel.BackendCondition>;
    setCondition(condition: UserCondition, isLogpoint: boolean): void;
    isLogpoint(): boolean;
    get storageState(): BreakpointStorageState;
    updateState(newState: BreakpointStorageState): void;
    updateBreakpoint(): Promise<void>;
    remove(keepInStorage: boolean): Promise<void>;
    breakpointStorageId(): string;
    private defaultUILocation;
    private removeAllUnboundLocations;
    private addAllUnboundLocations;
    getUiSourceCodes(): Set<Workspace.UISourceCode.UISourceCode>;
    getIsRemoved(): boolean;
}
/**
 * Represents a single `Breakpoint` for a specific target.
 *
 * The `BreakpointManager` unconditionally creates a `ModelBreakpoint` instance
 * for each target since any target could load a matching script after the fact.
 *
 * Each `ModelBreakpoint` can represent multiple actual breakpoints in V8. E.g.
 * inlining in WASM or multiple bundles containing the same utility function.
 *
 * This means each `Modelbreakpoint` represents 0 to n actual breakpoints in
 * for it's specific target.
 */
export declare class ModelBreakpoint {
    #private;
    constructor(debuggerModel: SDK.DebuggerModel.DebuggerModel, breakpoint: Breakpoint, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding);
    get currentState(): Breakpoint.State | null;
    resetLocations(): void;
    scheduleUpdateInDebugger(): Promise<ScheduleUpdateResult>;
    resetBreakpoint(): Promise<void>;
    private didRemoveFromDebugger;
    private breakpointResolved;
    private locationUpdated;
    private addResolvedLocation;
    cleanUpAfterDebuggerIsGone(): void;
}
/**
 * A concrete breakpoint position in a specific target. Each `ModelBreakpoint`
 * consists of multiple of these.
 *
 * Note that a `Position` only denotes where we *want* to set a breakpoint, not
 * where it was actually set by V8 after the fact.
 */
interface Position {
    url: Platform.DevToolsPath.UrlString;
    scriptHash: string;
    lineNumber: number;
    columnNumber?: number;
    condition: SDK.DebuggerModel.BackendCondition;
}
export declare const enum BreakpointOrigin {
    USER_ACTION = "USER_ACTION",
    OTHER = "RESTORED"
}
export declare namespace Breakpoint {
    type State = Position[];
    namespace State {
        function subset(stateA?: State | null, stateB?: State | null): boolean;
    }
}
declare class Storage {
    #private;
    readonly setting: Common.Settings.Setting<BreakpointStorageState[]>;
    readonly breakpoints: Map<string, BreakpointStorageState>;
    constructor(settings: Common.Settings.Settings);
    mute(): void;
    unmute(): void;
    breakpointItems(url: Platform.DevToolsPath.UrlString, resourceTypeName?: string): BreakpointStorageState[];
    updateBreakpoint(storageState: BreakpointStorageState): void;
    removeBreakpoint(storageId: string): void;
    private save;
    static computeId({ url, resourceTypeName, lineNumber, columnNumber }: BreakpointStorageState): string;
}
/**
 * A breakpoint condition as entered by the user. We use the type to
 * distinguish from {@link SDK.DebuggerModel.BackendCondition}.
 */
export type UserCondition = Platform.Brand.Brand<string, 'UserCondition'>;
export declare const EMPTY_BREAKPOINT_CONDITION: UserCondition;
export declare const NEVER_PAUSE_HERE_CONDITION: UserCondition;
export interface ScriptBreakpointLocation {
    readonly url: Platform.DevToolsPath.UrlString;
    readonly lineNumber: number;
    readonly columnNumber?: number;
    readonly condition: SDK.DebuggerModel.BackendCondition;
}
/**
 * All the data for a single `Breakpoint` thats stored in the settings.
 * Whenever any of these change, we need to update the settings.
 */
export interface BreakpointStorageState {
    readonly url: Platform.DevToolsPath.UrlString;
    readonly resourceTypeName: string;
    readonly lineNumber: number;
    readonly columnNumber?: number;
    readonly condition: UserCondition;
    readonly enabled: boolean;
    readonly isLogpoint: boolean;
    readonly resolvedState?: ScriptBreakpointLocation[];
}
export declare class BreakpointLocation {
    readonly breakpoint: Breakpoint;
    readonly uiLocation: Workspace.UISourceCode.UILocation;
    constructor(breakpoint: Breakpoint, uiLocation: Workspace.UISourceCode.UILocation);
}
export {};
