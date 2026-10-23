import type * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import type * as Platform from '../platform/platform.js';
import { MultitargetNetworkManager } from './NetworkManager.js';
import { PrimaryPageChangeType, type ResourceTreeFrame } from './ResourceTreeModel.js';
import type { Target } from './Target.js';
import { TargetManager } from './TargetManager.js';
export interface ExtensionInitiator {
    target: null;
    frameId: null;
    initiatorUrl: Platform.DevToolsPath.UrlString;
    extensionId: string;
}
export type PageResourceLoadInitiator = {
    target: null;
    frameId: Protocol.Page.FrameId;
    initiatorUrl: Platform.DevToolsPath.UrlString | null;
} | {
    target: Target;
    frameId: Protocol.Page.FrameId | null;
    initiatorUrl: Platform.DevToolsPath.UrlString | null;
} | ExtensionInitiator;
export interface PageResource {
    success: boolean | null;
    errorMessage?: string;
    initiator: PageResourceLoadInitiator;
    url: Platform.DevToolsPath.UrlString;
    size: number | null;
    duration: number | null;
}
/** Used for revealing a resource. **/
export declare class ResourceKey {
    readonly key: string;
    constructor(key: string);
}
export type UserAgentProvider = Pick<MultitargetNetworkManager, 'currentUserAgent'>;
/**
 * The PageResourceLoader has two responsibilities: loading resources and tracking statistics scoped to targets
 * for the DeveloperResourcesPanel. Many places only require the former, so we expose that functionality via small
 * sub-interface. This makes it easier to test classes that require resource loading.
 */
export type ResourceLoader = Pick<PageResourceLoader, 'loadResource'>;
/**
 * The page resource loader is a bottleneck for all DevTools-initiated resource loads. For each such load, it keeps a
 * `PageResource` object around that holds meta information. This can be as the basis for reporting to the user which
 * resources were loaded, and whether there was a load error.
 */
export declare class PageResourceLoader extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements ResourceLoader {
    #private;
    constructor(targetManager: TargetManager, settings: Common.Settings.Settings, userAgentProvider: UserAgentProvider, loadOverride: ((arg0: string) => Promise<{
        success: boolean;
        content: string | Uint8Array<ArrayBuffer>;
        errorDescription: Host.ResourceLoader.LoadErrorDescription;
    }>) | null, maxConcurrentLoads?: number);
    static instance({ forceNew, targetManager, settings, userAgentProvider, loadOverride, maxConcurrentLoads }?: {
        forceNew: boolean;
        loadOverride: (null | ((arg0: string) => Promise<{
            success: boolean;
            content: string | Uint8Array<ArrayBuffer>;
            errorDescription: Host.ResourceLoader.LoadErrorDescription;
        }>));
        targetManager?: TargetManager;
        settings?: Common.Settings.Settings;
        userAgentProvider?: UserAgentProvider;
        maxConcurrentLoads?: number;
    }): PageResourceLoader;
    static removeInstance(): void;
    onPrimaryPageChanged(event: Common.EventTarget.EventTargetEvent<{
        frame: ResourceTreeFrame;
        type: PrimaryPageChangeType;
    }>): void;
    getResourcesLoaded(): Map<string, PageResource>;
    getScopedResourcesLoaded(): Map<string, PageResource>;
    /**
     * Loading is the number of currently loading and queued items. Resources is the total number of resources,
     * including loading and queued resources, but not including resources that are still loading but scheduled
     * for cancelation.;
     */
    getNumberOfResources(): {
        loading: number;
        queued: number;
        resources: number;
    };
    getScopedNumberOfResources(): {
        loading: number;
        resources: number;
    };
    private acquireLoadSlot;
    private releaseLoadSlot;
    static makeExtensionKey(url: Platform.DevToolsPath.UrlString, initiator: PageResourceLoadInitiator): string;
    static makeKey(url: Platform.DevToolsPath.UrlString, initiator: PageResourceLoadInitiator): string;
    resourceLoadedThroughExtension(pageResource: PageResource): void;
    loadResource(url: Platform.DevToolsPath.UrlString, initiator: PageResourceLoadInitiator, isBinary: true): Promise<{
        content: Uint8Array<ArrayBuffer>;
    }>;
    loadResource(url: Platform.DevToolsPath.UrlString, initiator: PageResourceLoadInitiator, isBinary?: false): Promise<{
        content: string;
    }>;
    private dispatchLoad;
    private getDeveloperResourceScheme;
    private loadFromTarget;
    private loadFromHostBindings;
    getLoadThroughTargetSetting(): Common.Settings.Setting<boolean>;
}
export declare const enum Events {
    UPDATE = "Update"
}
export interface EventTypes {
    [Events.UPDATE]: void;
}
