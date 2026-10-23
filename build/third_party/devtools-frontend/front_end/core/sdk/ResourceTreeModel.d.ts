import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import * as Platform from '../platform/platform.js';
import { type DeferredDOMNode, DOMModel, type DOMNode } from './DOMModel.js';
import type { NetworkRequest } from './NetworkRequest.js';
import { Resource } from './Resource.js';
import { SDKModel } from './SDKModel.js';
import { SecurityOrigin } from './SecurityOrigin.js';
import { type Target } from './Target.js';
import type { TargetManager } from './TargetManager.js';
export declare class ResourceTreeModel extends SDKModel<EventTypes> {
    #private;
    readonly agent: ProtocolProxyApi.PageApi;
    readonly storageAgent: ProtocolProxyApi.StorageApi;
    readonly framesInternal: Map<string, ResourceTreeFrame>;
    isInterstitialShowing: boolean;
    mainFrame: ResourceTreeFrame | null;
    constructor(target: Target);
    static frameForRequest(request: NetworkRequest): ResourceTreeFrame | null;
    static frames(targetManager: TargetManager): ResourceTreeFrame[];
    /**
     * Finds the first active frame that matches the specified security origin under
     * the given primary page target.
     *
     * Returns `null` if the target has no outermost target or if no matching frame
     * exists.
     *
     * @param primaryPageTarget The primary page target that contains the candidate frames.
     * @param origin The security origin to match.
     * @returns The first matching frame, or `null` if no frame matches.
     */
    static frameForOrigin(primaryPageTarget: Target, origin: SecurityOrigin): ResourceTreeFrame | null;
    static resourceForURL(targetManager: TargetManager, url: Platform.DevToolsPath.UrlString): Resource | null;
    static reloadAllPages(targetManager: TargetManager, bypassCache?: boolean, scriptToEvaluateOnLoad?: string): void;
    storageKeyForFrame(frameId: Protocol.Page.FrameId): Promise<string | null>;
    domModel(): DOMModel;
    private processCachedResources;
    cachedResourcesLoaded(): boolean;
    private addFrame;
    frameAttached(frameId: Protocol.Page.FrameId, parentFrameId: Protocol.Page.FrameId | null, stackTrace?: Protocol.Runtime.StackTrace): ResourceTreeFrame | null;
    frameNavigated(framePayload: Protocol.Page.Frame, type: Protocol.Page.NavigationType | undefined): void;
    primaryPageChanged(frame: ResourceTreeFrame, type: PrimaryPageChangeType): void;
    documentOpened(framePayload: Protocol.Page.Frame): void;
    navigatedWithinDocument(frameId: Protocol.Page.FrameId, url: string): void;
    frameStoppedLoading(frameId: Protocol.Page.FrameId): void;
    frameDetached(frameId: Protocol.Page.FrameId, isSwap: boolean): void;
    private onRequestFinished;
    private onRequestUpdateDropped;
    frameForId(frameId: Protocol.Page.FrameId): ResourceTreeFrame | null;
    forAllResources(callback: (arg0: Resource) => boolean): boolean;
    frames(): ResourceTreeFrame[];
    private addFramesRecursively;
    private createResourceFromFramePayload;
    suspendReload(): void;
    resumeReload(): void;
    reloadPage(ignoreCache?: boolean, scriptToEvaluateOnLoad?: string): void;
    navigate(url: Platform.DevToolsPath.UrlString): Promise<Protocol.Page.NavigateResponse>;
    navigationHistory(): Promise<{
        currentIndex: number;
        entries: Protocol.Page.NavigationEntry[];
    } | null>;
    navigateToHistoryEntry(entry: Protocol.Page.NavigationEntry): void;
    setLifecycleEventsEnabled(enabled: boolean): Promise<Protocol.ProtocolResponseWithError>;
    fetchAppManifest(): Promise<{
        url: Platform.DevToolsPath.UrlString;
        data: string | null;
        errors: Protocol.Page.AppManifestError[];
    }>;
    getInstallabilityErrors(): Promise<Protocol.Page.InstallabilityError[]>;
    getAppId(): Promise<Protocol.Page.GetAppIdResponse>;
    private executionContextComparator;
    private getSecurityOriginData;
    private getStorageKeyData;
    private updateSecurityOrigins;
    private updateStorageKeys;
    getMainStorageKey(): Promise<string | null>;
    getMainSecurityOrigin(): string | null;
    onBackForwardCacheNotUsed(event: Protocol.Page.BackForwardCacheNotUsedEvent): void;
    processPendingEvents(frame: ResourceTreeFrame): void;
}
export declare enum Events {
    FrameAdded = "FrameAdded",
    FrameNavigated = "FrameNavigated",
    FrameNavigatedWithinDocument = "FrameNavigatedWithinDocument",
    FrameDetached = "FrameDetached",
    FrameResized = "FrameResized",
    FrameWillNavigate = "FrameWillNavigate",
    DocumentOpened = "DocumentOpened",
    PrimaryPageChanged = "PrimaryPageChanged",
    ResourceAdded = "ResourceAdded",
    WillLoadCachedResources = "WillLoadCachedResources",
    CachedResourcesLoaded = "CachedResourcesLoaded",
    DOMContentLoaded = "DOMContentLoaded",
    LifecycleEvent = "LifecycleEvent",
    Load = "Load",
    PageReloadRequested = "PageReloadRequested",
    WillReloadPage = "WillReloadPage",
    InterstitialShown = "InterstitialShown",
    InterstitialHidden = "InterstitialHidden",
    BackForwardCacheDetailsUpdated = "BackForwardCacheDetailsUpdated",
    JavaScriptDialogOpening = "JavaScriptDialogOpening"
}
export interface EventTypes {
    [Events.FrameAdded]: ResourceTreeFrame;
    [Events.FrameNavigated]: ResourceTreeFrame;
    [Events.FrameNavigatedWithinDocument]: ResourceTreeFrame;
    [Events.FrameDetached]: {
        frame: ResourceTreeFrame;
        isSwap: boolean;
    };
    [Events.FrameResized]: void;
    [Events.FrameWillNavigate]: ResourceTreeFrame;
    [Events.DocumentOpened]: ResourceTreeFrame;
    [Events.PrimaryPageChanged]: {
        frame: ResourceTreeFrame;
        type: PrimaryPageChangeType;
    };
    [Events.ResourceAdded]: Resource;
    [Events.WillLoadCachedResources]: void;
    [Events.CachedResourcesLoaded]: ResourceTreeModel;
    [Events.DOMContentLoaded]: number;
    [Events.LifecycleEvent]: {
        frameId: Protocol.Page.FrameId;
        name: string;
    };
    [Events.Load]: {
        resourceTreeModel: ResourceTreeModel;
        loadTime: number;
    };
    [Events.PageReloadRequested]: ResourceTreeModel;
    [Events.WillReloadPage]: void;
    [Events.InterstitialShown]: void;
    [Events.InterstitialHidden]: void;
    [Events.BackForwardCacheDetailsUpdated]: ResourceTreeFrame;
    [Events.JavaScriptDialogOpening]: Protocol.Page.JavascriptDialogOpeningEvent;
}
export declare class ResourceTreeFrame {
    #private;
    crossTargetParentFrameId: string | null;
    resourcesMap: Map<Platform.DevToolsPath.UrlString, Resource>;
    backForwardCacheDetails: {
        explanations: Protocol.Page.BackForwardCacheNotRestoredExplanation[];
        restoredFromCache?: boolean;
        explanationsTree?: Protocol.Page.BackForwardCacheNotRestoredExplanationTree;
    };
    constructor(model: ResourceTreeModel, parentFrame: ResourceTreeFrame | null, frameId: Protocol.Page.FrameId, payload: Protocol.Page.Frame | null, creationStackTrace: Protocol.Runtime.StackTrace | null);
    isSecureContext(): boolean;
    getSecureContextType(): Protocol.Page.SecureContextType | null;
    isCrossOriginIsolated(): boolean;
    getCrossOriginIsolatedContextType(): Protocol.Page.CrossOriginIsolatedContextType | null;
    getGatedAPIFeatures(): Protocol.Page.GatedAPIFeatures[] | null;
    getCreationStackTraceData(): {
        creationStackTrace: Protocol.Runtime.StackTrace | null;
        creationStackTraceTarget: Target;
    };
    navigate(framePayload: Protocol.Page.Frame): void;
    navigatedWithinDocument(url: Platform.DevToolsPath.UrlString): void;
    resourceTreeModel(): ResourceTreeModel;
    get id(): Protocol.Page.FrameId;
    get name(): string;
    get url(): Platform.DevToolsPath.UrlString;
    domainAndRegistry(): string;
    getAdScriptAncestry(frameId: Protocol.Page.FrameId): Promise<Protocol.Network.AdAncestry | null>;
    /**
     * Returns the security origin of this frame.
     *
     * If the frame does not have a valid origin (such as `about:blank`), this
     * method returns a unique opaque origin.
     *
     * @returns The security origin of the frame.
     */
    securityOrigin(): SecurityOrigin;
    get securityOriginDetails(): Protocol.Page.SecurityOriginDetails | null;
    getStorageKey(forceFetch: boolean): Promise<string | null>;
    unreachableUrl(): Platform.DevToolsPath.UrlString;
    get loaderId(): Protocol.Network.LoaderId;
    adFrameType(): Protocol.Page.AdFrameType;
    adFrameStatus(): Protocol.Page.AdFrameStatus | undefined;
    get childFrames(): ResourceTreeFrame[];
    /**
     * Returns the parent frame if both #frames are part of the same process/target.
     */
    sameTargetParentFrame(): ResourceTreeFrame | null;
    /**
     * Returns the parent frame if both #frames are part of different processes/targets (child is an OOPIF).
     */
    crossTargetParentFrame(): ResourceTreeFrame | null;
    /**
     * Returns the parent frame. There is only 1 parent and it's either in the
     * same target or it's cross-target.
     */
    parentFrame(): ResourceTreeFrame | null;
    /**
     * Returns true if this is the main frame of its target. A main frame is the root of the frame tree i.e. a frame without
     * a parent, but the whole frame tree could be embedded in another frame tree (e.g. OOPIFs, fenced frames, portals).
     * https://chromium.googlesource.com/chromium/src/+/HEAD/docs/frame_trees.md
     */
    isMainFrame(): boolean;
    /**
     * Returns true if this is a main frame which is not embedded in another frame tree. With MPArch features such as
     * back/forward cache or prerender there can be multiple outermost frames.
     * https://chromium.googlesource.com/chromium/src/+/HEAD/docs/frame_trees.md
     */
    isOutermostFrame(): boolean;
    /**
     * Returns true if this is the primary frame of the browser tab. There can only be one primary frame for each
     * browser tab. It is the outermost frame being actively displayed in the browser tab.
     * https://chromium.googlesource.com/chromium/src/+/HEAD/docs/frame_trees.md
     */
    isPrimaryFrame(): boolean;
    removeChildFrame(frame: ResourceTreeFrame, isSwap: boolean): void;
    private removeChildFrames;
    remove(isSwap: boolean): void;
    addResource(resource: Resource): void;
    addRequest(request: NetworkRequest): void;
    resources(): Resource[];
    resourceForURL(url: Platform.DevToolsPath.UrlString): Resource | null;
    callForFrameResources(callback: (arg0: Resource) => boolean): boolean;
    displayName(): string;
    getOwnerDeferredDOMNode(): Promise<DeferredDOMNode | null>;
    getOwnerDOMNodeOrDocument(): Promise<DOMNode | null>;
    highlight(): Promise<void>;
    getPermissionsPolicyState(): Promise<Protocol.Page.PermissionsPolicyFeatureState[] | null>;
    getOriginTrials(): Promise<Protocol.Page.OriginTrial[]>;
    getSpellCheckCustomDictionary(): Promise<string[]>;
    setCreationStackTrace(creationStackTraceData: {
        creationStackTrace: Protocol.Runtime.StackTrace | null;
        creationStackTraceTarget: Target;
    }): void;
    setBackForwardCacheDetails(event: Protocol.Page.BackForwardCacheNotUsedEvent): void;
    getResourcesMap(): Map<string, Resource>;
}
export declare class PageDispatcher implements ProtocolProxyApi.PageDispatcher {
    #private;
    constructor(resourceTreeModel: ResourceTreeModel);
    backForwardCacheNotUsed(params: Protocol.Page.BackForwardCacheNotUsedEvent): void;
    domContentEventFired({ timestamp }: Protocol.Page.DomContentEventFiredEvent): void;
    loadEventFired({ timestamp }: Protocol.Page.LoadEventFiredEvent): void;
    lifecycleEvent({ frameId, name }: Protocol.Page.LifecycleEventEvent): void;
    frameAttached({ frameId, parentFrameId, stack }: Protocol.Page.FrameAttachedEvent): void;
    frameNavigated({ frame, type }: Protocol.Page.FrameNavigatedEvent): void;
    documentOpened({ frame }: Protocol.Page.DocumentOpenedEvent): void;
    frameDetached({ frameId, reason }: Protocol.Page.FrameDetachedEvent): void;
    frameSubtreeWillBeDetached(_params: Protocol.Page.FrameSubtreeWillBeDetachedEvent): void;
    frameStartedLoading({}: Protocol.Page.FrameStartedLoadingEvent): void;
    frameStoppedLoading({ frameId }: Protocol.Page.FrameStoppedLoadingEvent): void;
    frameRequestedNavigation({}: Protocol.Page.FrameRequestedNavigationEvent): void;
    frameScheduledNavigation({}: Protocol.Page.FrameScheduledNavigationEvent): void;
    frameClearedScheduledNavigation({}: Protocol.Page.FrameClearedScheduledNavigationEvent): void;
    frameStartedNavigating({}: Protocol.Page.FrameStartedNavigatingEvent): void;
    navigatedWithinDocument({ frameId, url }: Protocol.Page.NavigatedWithinDocumentEvent): void;
    frameResized(): void;
    javascriptDialogOpening(event: Protocol.Page.JavascriptDialogOpeningEvent): void;
    javascriptDialogClosed({}: Protocol.Page.JavascriptDialogClosedEvent): void;
    screencastFrame({}: Protocol.Page.ScreencastFrameEvent): void;
    screencastVisibilityChanged({}: Protocol.Page.ScreencastVisibilityChangedEvent): void;
    interstitialShown(): void;
    interstitialHidden(): void;
    windowOpen({}: Protocol.Page.WindowOpenEvent): void;
    compilationCacheProduced({}: Protocol.Page.CompilationCacheProducedEvent): void;
    fileChooserOpened({}: Protocol.Page.FileChooserOpenedEvent): void;
    downloadWillBegin({}: Protocol.Page.DownloadWillBeginEvent): void;
    downloadProgress(): void;
}
/**
 * Aggregated security origin data for frames belonging to a resource tree model.
 */
export interface SecurityOriginData {
    securityOrigins: SecurityOrigin[];
    mainSecurityOrigin: SecurityOrigin | null;
    unreachableMainSecurityOrigin: SecurityOrigin | null;
}
export interface StorageKeyData {
    storageKeys: Set<string>;
    mainStorageKey: string | null;
}
export declare const enum PrimaryPageChangeType {
    NAVIGATION = "Navigation",
    ACTIVATION = "Activation"
}
