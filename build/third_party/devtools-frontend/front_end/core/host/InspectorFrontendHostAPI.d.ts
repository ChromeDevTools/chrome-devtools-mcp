import type * as Platform from '../../core/platform/platform.js';
import type * as Common from '../common/common.js';
import type * as Root from '../root/root.js';
declare global {
    var InspectorFrontendHost: InspectorFrontendHostAPI;
}
/**
 * This values should match the one getting called from Chromium
 */
export declare enum Events {
    AppendedToURL = "appendedToURL",
    CanceledSaveURL = "canceledSaveURL",
    ColorThemeChanged = "colorThemeChanged",
    ContextMenuCleared = "contextMenuCleared",
    ContextMenuItemSelected = "contextMenuItemSelected",
    DeviceCountUpdated = "deviceCountUpdated",
    DevicesDiscoveryConfigChanged = "devicesDiscoveryConfigChanged",
    DevicesPortForwardingStatusChanged = "devicesPortForwardingStatusChanged",
    DevicesUpdated = "devicesUpdated",
    DispatchMessage = "dispatchMessage",
    DispatchMessageChunk = "dispatchMessageChunk",
    EnterInspectElementMode = "enterInspectElementMode",
    EyeDropperPickedColor = "eyeDropperPickedColor",
    FileSystemsLoaded = "fileSystemsLoaded",
    FileSystemRemoved = "fileSystemRemoved",
    FileSystemAdded = "fileSystemAdded",
    FileSystemFilesChangedAddedRemoved = "fileSystemFilesChangedAddedRemoved",
    IndexingTotalWorkCalculated = "indexingTotalWorkCalculated",
    IndexingWorked = "indexingWorked",
    IndexingDone = "indexingDone",
    KeyEventUnhandled = "keyEventUnhandled",
    ReloadInspectedPage = "reloadInspectedPage",
    RevealSourceLine = "revealSourceLine",
    SavedURL = "savedURL",
    SearchCompleted = "searchCompleted",
    SetInspectedTabId = "setInspectedTabId",
    SetUseSoftMenu = "setUseSoftMenu",
    ShowPanel = "showPanel"
}
export declare const EventDescriptors: ReadonlyArray<readonly [Events, readonly string[], boolean?]>;
export interface DispatchMessageChunkEvent {
    messageChunk: string;
    messageSize: number;
}
export interface EyeDropperPickedColorEvent {
    r: number;
    g: number;
    b: number;
    a: number;
}
export interface DevToolsFileSystem {
    type: '' | 'automatic' | 'snippets' | 'overrides';
    fileSystemName: string;
    rootURL: string;
    fileSystemPath: Platform.DevToolsPath.RawPathString;
}
export interface FileSystemAddedEvent {
    errorMessage?: string;
    fileSystem: DevToolsFileSystem | null;
}
export interface FilesChangedEvent {
    changed: Platform.DevToolsPath.RawPathString[];
    added: Platform.DevToolsPath.RawPathString[];
    removed: Platform.DevToolsPath.RawPathString[];
}
export interface IndexingEvent {
    requestId: number;
    fileSystemPath: string;
}
export interface IndexingTotalWorkCalculatedEvent extends IndexingEvent {
    totalWork: number;
}
export interface IndexingWorkedEvent extends IndexingEvent {
    worked: number;
}
export interface KeyEventUnhandledEvent {
    type: string;
    key: string;
    keyCode: number;
    modifiers: number;
}
export interface RevealSourceLineEvent {
    url: Platform.DevToolsPath.UrlString;
    lineNumber: number;
    columnNumber: number;
}
export interface SavedURLEvent {
    url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString;
    fileSystemPath: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString;
}
export interface SearchCompletedEvent {
    requestId: number;
    files: Platform.DevToolsPath.RawPathString[];
}
export interface DoAidaConversationResult {
    statusCode?: number;
    headers?: Record<string, string>;
    netError?: number;
    netErrorName?: string;
    error?: string;
    detail?: string;
}
export interface AidaClientResult {
    response?: string;
    error?: string;
    detail?: string;
}
export interface AidaCodeCompleteResult {
    response?: string;
    error?: string;
    detail?: string;
}
export interface VisualElementImpression {
    id: number;
    type: number;
    parent?: number;
    context?: number;
    width?: number;
    height?: number;
}
export interface ImpressionEvent {
    impressions: VisualElementImpression[];
}
export interface ResizeEvent {
    veid: number;
    width?: number;
    height?: number;
}
export interface ClickEvent {
    veid: number;
    mouseButton?: number;
    context?: number;
    doubleClick: boolean;
}
export interface HoverEvent {
    veid: number;
    time?: number;
    context?: number;
}
export interface DragEvent {
    veid: number;
    context?: number;
}
export interface ChangeEvent {
    veid: number;
    context?: number;
}
export interface KeyDownEvent {
    veid?: number;
    context?: number;
}
export interface SettingAccessEvent {
    name: number;
    numeric_value?: number;
    string_value?: number;
}
export interface FunctionCallEvent {
    name: number;
    context?: number;
}
/**
 * While `EventDescriptors` are used to dynamically dispatch host binding events,
 * the `EventTypes` "type map" is used for type-checking said events by TypeScript.
 * `EventTypes` is not used at runtime.
 * Please note that the "dispatch" side can't be type-checked as the dispatch is
 * done dynamically.
 **/
export interface DevicesDiscoveryConfig {
    discoverUsbDevices: boolean;
    portForwardingEnabled: boolean;
    portForwardingConfig: Record<string, string>;
    networkDiscoveryEnabled: boolean;
    networkDiscoveryConfig: string[];
}
export interface EventTypes {
    [Events.AppendedToURL]: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString;
    [Events.CanceledSaveURL]: Platform.DevToolsPath.UrlString;
    [Events.ColorThemeChanged]: void;
    [Events.ContextMenuCleared]: void;
    [Events.ContextMenuItemSelected]: number;
    [Events.DeviceCountUpdated]: number;
    [Events.DevicesDiscoveryConfigChanged]: DevicesDiscoveryConfig;
    [Events.DevicesPortForwardingStatusChanged]: void;
    [Events.DevicesUpdated]: void;
    [Events.DispatchMessage]: string;
    [Events.DispatchMessageChunk]: DispatchMessageChunkEvent;
    [Events.EnterInspectElementMode]: void;
    [Events.EyeDropperPickedColor]: EyeDropperPickedColorEvent;
    [Events.FileSystemsLoaded]: DevToolsFileSystem[];
    [Events.FileSystemRemoved]: Platform.DevToolsPath.RawPathString;
    [Events.FileSystemAdded]: FileSystemAddedEvent;
    [Events.FileSystemFilesChangedAddedRemoved]: FilesChangedEvent;
    [Events.IndexingTotalWorkCalculated]: IndexingTotalWorkCalculatedEvent;
    [Events.IndexingWorked]: IndexingWorkedEvent;
    [Events.IndexingDone]: IndexingEvent;
    [Events.KeyEventUnhandled]: KeyEventUnhandledEvent;
    [Events.ReloadInspectedPage]: boolean;
    [Events.RevealSourceLine]: RevealSourceLineEvent;
    [Events.SavedURL]: SavedURLEvent;
    [Events.SearchCompleted]: SearchCompletedEvent;
    [Events.SetInspectedTabId]: string;
    [Events.SetUseSoftMenu]: boolean;
    [Events.ShowPanel]: string;
}
export type DispatchHttpRequestRequest = {
    service: string;
    path: string;
    method: 'GET';
    queryParams?: Record<string, string | string[]>;
    streamId?: number;
    body?: never;
} | {
    service: string;
    path: string;
    method: 'POST';
    queryParams?: Record<string, string | string[]>;
    streamId?: number;
    body?: string;
};
interface DispatchHttpRequestSuccessResult {
    response: string;
    statusCode: number;
}
interface DispatchHttpRequestErrorResult {
    error: string;
    detail?: string;
    netError?: number;
    netErrorName?: string;
    statusCode?: number;
}
export type DispatchHttpRequestResult = DispatchHttpRequestSuccessResult | DispatchHttpRequestErrorResult;
export interface InspectorFrontendHostAPI {
    events: Common.EventTarget.EventTarget<EventTypes>;
    connectAutomaticFileSystem(fileSystemPath: Platform.DevToolsPath.RawPathString, fileSystemUUID: string, addIfMissing: boolean, callback: (result: {
        success: boolean;
    }) => void): void;
    disconnectAutomaticFileSystem(fileSystemPath: Platform.DevToolsPath.RawPathString): void;
    addFileSystem(type?: string): void;
    loadCompleted(): void;
    indexPath(requestId: number, fileSystemPath: Platform.DevToolsPath.RawPathString, excludedFolders: string): void;
    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     */
    setInspectedPageBounds(bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    }): void;
    showCertificateViewer(certChain: string[]): void;
    setWhitelistedShortcuts(shortcuts: string): void;
    setEyeDropperActive(active: boolean): void;
    inspectElementCompleted(): void;
    openInNewTab(url: Platform.DevToolsPath.UrlString): void;
    openSearchResultsInNewTab(query: string): void;
    showItemInFolder(fileSystemPath: Platform.DevToolsPath.RawPathString): void;
    removeFileSystem(fileSystemPath: Platform.DevToolsPath.RawPathString): void;
    requestFileSystems(): void;
    save(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString, content: string, forceSaveAs: boolean, isBase64: boolean): void;
    append(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString, content: string): void;
    close(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString): void;
    searchInPath(requestId: number, fileSystemPath: Platform.DevToolsPath.RawPathString, query: string): void;
    stopIndexing(requestId: number): void;
    bringToFront(): void;
    closeWindow(): void;
    /**
     * If you need to alert to the user after copying use {@link UIUtils.copyTextToClipboard}.
     */
    copyText(text?: string | null): void;
    inspectedURLChanged(url: Platform.DevToolsPath.UrlString): void;
    isolatedFileSystem(fileSystemId: string, registeredName: string): FileSystem | null;
    loadNetworkResource(url: string, headers: string, streamId: number, callback: (arg0: LoadNetworkResourceResult) => void): void;
    registerPreference(name: string, options: {
        synced?: boolean;
    }): void;
    getPreferences(callback: (arg0: Record<string, string>) => void): void;
    getPreference(name: string, callback: (arg0: string) => void): void;
    setPreference(name: string, value: string): void;
    removePreference(name: string): void;
    clearPreferences(): void;
    getSyncInformation(callback: (arg0: SyncInformation) => void): void;
    getHostConfig(callback: (arg0: Root.Runtime.HostConfig) => void): void;
    upgradeDraggedFileSystemPermissions(fileSystem: FileSystem): void;
    platform(): string;
    recordCountHistogram(histogramName: string, sample: number, min: number, exclusiveMax: number, bucketSize: number): void;
    recordEnumeratedHistogram(actionName: EnumeratedHistogram, actionCode: number, bucketSize: number): void;
    recordPerformanceHistogram(histogramName: string, duration: number): void;
    recordPerformanceHistogramMedium(histogramName: string, duration: number): void;
    recordUserMetricsAction(umaName: string): void;
    recordNewBadgeUsage(featureName: string): void;
    sendMessageToBackend(message: string): void;
    setDevicesDiscoveryConfig(config: DevicesDiscoveryConfig): void;
    setDevicesUpdatesEnabled(enabled: boolean): void;
    openRemotePage(browserId: string, url: string): void;
    openNodeFrontend(): void;
    setInjectedScriptForOrigin(origin: string, script: string): void;
    setIsDocked(isDocked: boolean, callback: () => void): void;
    showSurvey(trigger: string, callback: (arg0: ShowSurveyResult) => void): void;
    canShowSurvey(trigger: string, callback: (arg0: CanShowSurveyResult) => void): void;
    zoomFactor(): number;
    zoomIn(): void;
    zoomOut(): void;
    resetZoom(): void;
    showContextMenuAtPoint(x: number, y: number, items: ContextMenuDescriptor[], document: object): void;
    reattach(callback: () => void): void;
    readyForTest(): void;
    connectionReady(): void;
    setOpenNewWindowForPopups(value: boolean): void;
    isHostedMode(): boolean;
    setAddExtensionCallback(callback: (arg0: ExtensionDescriptor) => void): void;
    initialTargetId(): Promise<string | null>;
    doAidaConversation: (request: string, streamId: number, cb: (result: DoAidaConversationResult) => void) => void;
    registerAidaClientEvent: (request: string, cb: (result: AidaClientResult) => void) => void;
    aidaCodeComplete: (request: string, cb: (result: AidaCodeCompleteResult) => void) => void;
    dispatchHttpRequest: (request: DispatchHttpRequestRequest, cb: (result: DispatchHttpRequestResult) => void) => void;
    recordImpression(event: ImpressionEvent): void;
    recordResize(event: ResizeEvent): void;
    recordClick(event: ClickEvent): void;
    recordHover(event: HoverEvent): void;
    recordDrag(event: DragEvent): void;
    recordChange(event: ChangeEvent): void;
    recordKeyDown(event: KeyDownEvent): void;
    recordSettingAccess(event: SettingAccessEvent): void;
    recordFunctionCall(event: FunctionCallEvent): void;
    setChromeFlag(flagName: string, value: boolean): void;
    requestRestart(): void;
}
export interface AcceleratorDescriptor {
    keyCode: number;
    modifiers: number;
}
export interface ContextMenuDescriptor {
    type: 'checkbox' | 'item' | 'separator' | 'subMenu';
    id?: number;
    label?: string;
    accelerator?: AcceleratorDescriptor;
    isExperimentalFeature?: boolean;
    enabled?: boolean;
    checked?: boolean;
    isDevToolsPerformanceMenuItem?: boolean;
    subItems?: ContextMenuDescriptor[];
    shortcut?: string;
    jslogContext?: string;
    /** Setting the featureName requests showing a new badge tied to that feature . */
    featureName?: string;
}
export interface LoadNetworkResourceResult {
    statusCode: number;
    headers?: Record<string, string>;
    netError?: number;
    netErrorName?: string;
    urlValid?: boolean;
    messageOverride?: string;
}
export interface ExtensionDescriptor {
    startPage: string;
    name: string;
    exposeExperimentalAPIs: boolean;
    hostsPolicy?: ExtensionHostsPolicy;
    allowFileAccess?: boolean;
}
export interface ExtensionHostsPolicy {
    runtimeAllowedHosts: string[];
    runtimeBlockedHosts: string[];
}
export interface ShowSurveyResult {
    surveyShown: boolean;
}
export interface CanShowSurveyResult {
    canShowSurvey: boolean;
}
export interface SyncInformation {
    /** Whether Chrome Sync is enabled and active */
    isSyncActive: boolean;
    /** Whether syncing of Chrome Settings is enabled via Chrome Sync is enabled */
    arePreferencesSynced?: boolean;
    /** The email of the account used for syncing */
    accountEmail?: string;
    /** The image of the account used for syncing. Its a base64 encoded PNG */
    accountImage?: string;
    /** The full name of the account used for syncing */
    accountFullName?: string;
    /** The given name of the account used for syncing */
    accountGivenName?: string;
    /** Whether Chrome Sync is paused, equivalent to the user being logged out automatically */
    isSyncPaused?: boolean;
}
/**
 * Enum for recordEnumeratedHistogram
 * Warning: There is another definition of this enum in the DevTools code
 * base, keep them in sync:
 * front_end/devtools_compatibility.js
 */
export declare const enum EnumeratedHistogram {
    ActionTaken = "DevTools.ActionTaken",
    PanelShown = "DevTools.PanelShown",
    KeyboardShortcutFired = "DevTools.KeyboardShortcutFired",
    IssueCreated = "DevTools.IssueCreated",
    IssuesPanelIssueExpanded = "DevTools.IssuesPanelIssueExpanded",
    IssuesPanelOpenedFrom = "DevTools.IssuesPanelOpenedFrom",
    IssuesPanelResourceOpened = "DevTools.IssuesPanelResourceOpened",
    KeybindSetSettingChanged = "DevTools.KeybindSetSettingChanged",
    ExperimentEnabledAtLaunch = "DevTools.ExperimentEnabledAtLaunch",
    ExperimentDisabledAtLaunch = "DevTools.ExperimentDisabledAtLaunch",
    ExperimentEnabled = "DevTools.ExperimentEnabled",
    ExperimentDisabled = "DevTools.ExperimentDisabled",
    DeveloperResourceLoaded = "DevTools.DeveloperResourceLoaded",
    DeveloperResourceScheme = "DevTools.DeveloperResourceScheme",
    Language = "DevTools.Language",
    SyncSetting = "DevTools.SyncSetting",
    RecordingReplayFinished = "DevTools.RecordingReplayFinished",
    RecordingReplayStarted = "DevTools.RecordingReplayStarted",
    RecordingToggled = "DevTools.RecordingToggled",
    SourcesPanelFileDebugged = "DevTools.SourcesPanelFileDebugged",
    SourcesPanelFileOpened = "DevTools.SourcesPanelFileOpened",
    NetworkPanelResponsePreviewOpened = "DevTools.NetworkPanelResponsePreviewOpened",
    TimelineNavigationSettingState = "DevTools.TimelineNavigationSettingState",
    LighthouseModeRun = "DevTools.LighthouseModeRun",
    LighthouseCategoryUsed = "DevTools.LighthouseCategoryUsed",
    SwatchActivated = "DevTools.SwatchActivated",
    BuiltInAiAvailability = "DevTools.BuiltInAiAvailability",
    ResendRequest = "DevTools.ResendRequest",
    EditResendRequest = "DevTools.EditResendRequest"
}
export {};
