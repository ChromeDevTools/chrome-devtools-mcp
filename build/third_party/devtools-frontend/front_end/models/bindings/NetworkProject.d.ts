import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as Workspace from '../workspace/workspace.js';
export declare class NetworkProjectManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): NetworkProjectManager;
    static removeInstance(): void;
    setTargetForProject(project: Workspace.Workspace.Project, target: SDK.Target.Target): void;
    getTargetForProject(project: Workspace.Workspace.Project): SDK.Target.Target | null;
    getTargetForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Target.Target | null;
    setSourceURLSynthesized(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    isSourceURLSynthesized(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
}
export declare const enum Events {
    FRAME_ATTRIBUTION_ADDED = "FrameAttributionAdded",
    FRAME_ATTRIBUTION_REMOVED = "FrameAttributionRemoved"
}
export interface FrameAttributionEvent {
    uiSourceCode: Workspace.UISourceCode.UISourceCode;
    frame: SDK.ResourceTreeModel.ResourceTreeFrame;
}
export interface EventTypes {
    [Events.FRAME_ATTRIBUTION_ADDED]: FrameAttributionEvent;
    [Events.FRAME_ATTRIBUTION_REMOVED]: FrameAttributionEvent;
}
export declare class NetworkProject {
    /**
     * Records that `uiSourceCode` was synthesized from a `//# sourceURL=` annotation,
     * and therefore doesn't correspond to an actual network resource.
     */
    static setSourceURLSynthesized(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    /**
     * Whether `uiSourceCode` was synthesized from a `//# sourceURL=` annotation.
     *
     * Both the URL and the content of such a source are fully controlled by the page,
     * so it must never be treated like a genuine network resource (for example it must
     * not be persisted as a local override, see b/553931271).
     */
    static isSourceURLSynthesized(uiSourceCode: Workspace.UISourceCode.UISourceCode): boolean;
    static resolveFrame(uiSourceCode: Workspace.UISourceCode.UISourceCode, frameId: Protocol.Page.FrameId): SDK.ResourceTreeModel.ResourceTreeFrame | null;
    static setInitialFrameAttribution(uiSourceCode: Workspace.UISourceCode.UISourceCode, frameId: Protocol.Page.FrameId): void;
    static cloneInitialFrameAttribution(fromUISourceCode: Workspace.UISourceCode.UISourceCode, toUISourceCode: Workspace.UISourceCode.UISourceCode): void;
    static addFrameAttribution(uiSourceCode: Workspace.UISourceCode.UISourceCode, frameId: Protocol.Page.FrameId): void;
    static removeFrameAttribution(uiSourceCode: Workspace.UISourceCode.UISourceCode, frameId: Protocol.Page.FrameId): void;
    static targetForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.Target.Target | null;
    static setTargetForProject(project: Workspace.Workspace.Project, target: SDK.Target.Target): void;
    static getTargetForProject(project: Workspace.Workspace.Project): SDK.Target.Target | null;
    static framesForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): SDK.ResourceTreeModel.ResourceTreeFrame[];
}
