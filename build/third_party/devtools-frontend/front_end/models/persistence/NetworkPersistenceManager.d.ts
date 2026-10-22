import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as Breakpoints from '../breakpoints/breakpoints.js';
import * as Workspace from '../workspace/workspace.js';
import { IsolatedFileSystemManager } from './IsolatedFileSystemManager.js';
import { PersistenceImpl } from './PersistenceImpl.js';
export declare const persistenceNetworkOverridesEnabledSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
export declare class NetworkPersistenceManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.Observer {
    #private;
    constructor(workspace: Workspace.Workspace.WorkspaceImpl, persistence: PersistenceImpl, breakpointManager: Breakpoints.BreakpointManager.BreakpointManager, targetManager: SDK.TargetManager.TargetManager, settings: Common.Settings.Settings, isolatedFileSystemManager: IsolatedFileSystemManager, multitargetNetworkManager: SDK.NetworkManager.MultitargetNetworkManager);
    targetAdded(): void;
    targetRemoved(): void;
    static instance(opts?: {
        forceNew: boolean | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
    }): NetworkPersistenceManager;
    static removeInstance(): void;
    active(): boolean;
    project(): Workspace.Workspace.Project | null;
    originalContentForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<string | null> | null;
    private enabledChanged;
    private uiSourceCodeRenamedListener;
    private uiSourceCodeRemovedListener;
    private uiSourceCodeAdded;
    private updateActiveProject;
    encodedPathFromUrl(url: Platform.DevToolsPath.UrlString, ignoreInactive?: boolean): Platform.DevToolsPath.EncodedPathString;
    rawPathFromUrl(url: Platform.DevToolsPath.UrlString, ignoreInactive?: boolean): Platform.DevToolsPath.RawPathString;
    static encodeEncodedPathToLocalPathParts(encodedPath: Platform.DevToolsPath.EncodedPathString): string[];
    fileUrlFromNetworkUrl(url: Platform.DevToolsPath.UrlString, ignoreInactive?: boolean): Platform.DevToolsPath.UrlString;
    getHeadersUISourceCodeFromUrl(url: Platform.DevToolsPath.UrlString): Workspace.UISourceCode.UISourceCode | null;
    getOrCreateHeadersUISourceCodeFromUrl(url: Platform.DevToolsPath.UrlString): Promise<Workspace.UISourceCode.UISourceCode | null>;
    private decodeLocalPathToUrlPath;
    private onUISourceCodeWorkingCopyCommitted;
    isActiveHeaderOverrides(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    isUISourceCodeOverridable(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    setupAndStartLocalOverrides(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<boolean>;
    saveUISourceCodeForOverrides(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
    private fileCreatedForTest;
    private patternForFileSystemUISourceCode;
    private isForbiddenFileUrl;
    static isForbiddenNetworkUrl(urlString: Platform.DevToolsPath.UrlString): boolean;
    private onUISourceCodeAdded;
    private canHandleNetworkUISourceCode;
    private networkUISourceCodeAdded;
    private filesystemUISourceCodeAdded;
    generateHeaderPatterns(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<{
        headerPatterns: Set<string>;
        path: Platform.DevToolsPath.EncodedPathString;
        overridesWithRegex: HeaderOverrideWithRegex[];
    }>;
    updateInterceptionPatternsForTests(): Promise<void>;
    updateInterceptionPatterns(): void;
    private onUISourceCodeRemoved;
    private networkUISourceCodeRemoved;
    hasMatchingNetworkUISourceCodeForHeaderOverridesFile(headersFile: Workspace.UISourceCode.UISourceCode): boolean;
    private filesystemUISourceCodeRemoved;
    setProject(project: Workspace.Workspace.Project | null): Promise<void>;
    private onProjectAdded;
    private onProjectRemoved;
    mergeHeaders(baseHeaders: Protocol.Fetch.HeaderEntry[], overrideHeaders: Protocol.Fetch.HeaderEntry[]): Protocol.Fetch.HeaderEntry[];
    handleHeaderInterception(interceptedRequest: SDK.NetworkManager.InterceptedRequest): Protocol.Fetch.HeaderEntry[];
    private interceptionHandler;
}
export declare const HEADERS_FILENAME = ".headers";
export declare const enum Events {
    PROJECT_CHANGED = "ProjectChanged",
    REQUEST_FOR_HEADER_OVERRIDES_FILE_CHANGED = "RequestsForHeaderOverridesFileChanged",
    LOCAL_OVERRIDES_PROJECT_UPDATED = "LocalOverridesProjectUpdated",
    LOCAL_OVERRIDES_REQUESTED = "LocalOverridesRequested"
}
export interface EventTypes {
    [Events.PROJECT_CHANGED]: Workspace.Workspace.Project | null;
    [Events.REQUEST_FOR_HEADER_OVERRIDES_FILE_CHANGED]: Workspace.UISourceCode.UISourceCode;
    [Events.LOCAL_OVERRIDES_PROJECT_UPDATED]: boolean;
    [Events.LOCAL_OVERRIDES_REQUESTED]: () => void;
}
export interface HeaderOverride {
    applyTo: string;
    headers: Protocol.Fetch.HeaderEntry[];
}
interface HeaderOverrideWithRegex {
    applyToRegex: RegExp;
    headers: Protocol.Fetch.HeaderEntry[];
}
export declare function isHeaderOverride(arg: any): arg is HeaderOverride;
export declare function escapeRegex(pattern: string): string;
export declare function extractDirectoryIndex(pattern: string): {
    head: string;
    tail?: string;
};
export {};
