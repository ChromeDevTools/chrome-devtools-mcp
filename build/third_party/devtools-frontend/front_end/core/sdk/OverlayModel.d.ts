import type * as Platform from '../../core/platform/platform.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import { DeferredDOMNode, DOMModel, type DOMNode } from './DOMModel.js';
import type { RemoteObject } from './RemoteObject.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
import type { TargetManager } from './TargetManager.js';
export interface HighlightColor {
    r: number;
    g: number;
    b: number;
    a: number;
}
export interface HighlightRect {
    x: number;
    y: number;
    width: number;
    height: number;
    color: HighlightColor;
    outlineColor: HighlightColor;
}
export interface Hinge {
    width: number;
    height: number;
    x: number;
    y: number;
    contentColor: HighlightColor;
    outlineColor: HighlightColor;
}
export interface BaseDisplayCutout {
    width: number;
    height: number;
    x: number;
    y: number;
    shape: Protocol.Overlay.DisplayCutoutShape;
    contentColor?: HighlightColor;
}
export type DisplayCutout = BaseDisplayCutout & ({
    shape: Protocol.Overlay.DisplayCutoutShape.Rectangle;
} | {
    shape: Protocol.Overlay.DisplayCutoutShape.Pill;
    borderRadius: number;
} | {
    shape: Protocol.Overlay.DisplayCutoutShape.Notch;
    upperRadius: number;
    lowerRadius: number;
} | {
    shape: Protocol.Overlay.DisplayCutoutShape.Circle;
    cx: number;
    cy: number;
    radius: number;
});
export declare const enum EmulatedOSType {
    WINDOWS = "Windows",
    MAC = "Mac",
    LINUX = "Linux"
}
export declare class OverlayModel extends SDKModel<EventTypes> implements ProtocolProxyApi.OverlayDispatcher {
    #private;
    overlayAgent: ProtocolProxyApi.OverlayApi;
    constructor(target: Target);
    static highlightObjectAsDOMNode(object: RemoteObject): void;
    static hideDOMNodeHighlight(targetManager: TargetManager): void;
    static muteHighlight(targetManager: TargetManager): Promise<void[]>;
    static unmuteHighlight(targetManager: TargetManager): Promise<void[]>;
    static highlightRect(rect: HighlightRect, targetManager: TargetManager): void;
    static clearHighlight(targetManager: TargetManager): void;
    getDOMModel(): DOMModel;
    highlightRect({ x, y, width, height, color, outlineColor }: HighlightRect): Promise<Protocol.ProtocolResponseWithError>;
    clearHighlight(): Promise<Protocol.ProtocolResponseWithError>;
    private wireAgentToSettings;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    setShowViewportSizeOnResize(show: boolean): void;
    private updatePausedInDebuggerMessage;
    setHighlighter(highlighter: Highlighter | null): void;
    setInspectMode(mode: Protocol.Overlay.InspectMode, showDetailedTooltip?: boolean | undefined): Promise<void>;
    inspectModeEnabled(): boolean;
    highlightInOverlay(data: HighlightData, mode?: string, showInfo?: boolean): void;
    highlightInOverlayForTwoSeconds(data: HighlightData): void;
    highlightGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    hideGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightScrollSnapInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedScrollSnapInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    hideScrollSnapInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightFlexContainerInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedFlexContainerInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    hideFlexContainerInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightContainerQueryInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    isHighlightedContainerQueryInPersistentOverlay(nodeId: Protocol.DOM.NodeId): boolean;
    hideContainerQueryInPersistentOverlay(nodeId: Protocol.DOM.NodeId): void;
    highlightSourceOrderInOverlay(node: DOMNode): void;
    colorOfGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId): string | null;
    setColorOfGridInPersistentOverlay(nodeId: Protocol.DOM.NodeId, colorStr: string): void;
    colorOfFlexInPersistentOverlay(nodeId: Protocol.DOM.NodeId): string | null;
    setColorOfFlexInPersistentOverlay(nodeId: Protocol.DOM.NodeId, colorStr: string): void;
    hideSourceOrderInOverlay(): void;
    setSourceOrderActive(isActive: boolean): void;
    private delayedHideHighlight;
    highlightFrame(frameId: Protocol.Page.FrameId): void;
    showHingeForDualScreen(hinge: Hinge | null): void;
    showDisplayCutout(cutout: DisplayCutout | null): void;
    setWindowControlsPlatform(selectedPlatform: EmulatedOSType): void;
    setWindowControlsThemeColor(themeColor: string): void;
    getWindowControlsConfig(): Protocol.Overlay.WindowControlsOverlayConfig;
    toggleWindowControlsToolbar(show: boolean): Promise<void>;
    private buildHighlightConfig;
    nodeHighlightRequested({ nodeId }: Protocol.Overlay.NodeHighlightRequestedEvent): void;
    static setInspectNodeHandler(handler: (arg0: DOMNode) => Promise<void>): void;
    inspectNodeRequested({ backendNodeId }: Protocol.Overlay.InspectNodeRequestedEvent): void;
    screenshotRequested({ viewport }: Protocol.Overlay.ScreenshotRequestedEvent): void;
    inspectModeCanceled(): void;
    static inspectNodeHandler: ((node: DOMNode) => Promise<void>) | null;
    getOverlayAgent(): ProtocolProxyApi.OverlayApi;
    hasStyleSheetText(url: Platform.DevToolsPath.UrlString): Promise<boolean>;
    inspectPanelShowRequested(_event: Protocol.Overlay.InspectPanelShowRequestedEvent): void;
    inspectedElementWindowRestored(_event: Protocol.Overlay.InspectedElementWindowRestoredEvent): void;
}
export declare class WindowControls {
    #private;
    constructor(cssModel: CSSModel);
    get selectedPlatform(): string;
    set selectedPlatform(osType: EmulatedOSType);
    get themeColor(): string;
    set themeColor(color: string);
    get config(): Protocol.Overlay.WindowControlsOverlayConfig;
    initializeStyleSheetText(url: Platform.DevToolsPath.UrlString): Promise<boolean>;
    toggleEmulatedOverlay(showOverlay: boolean): Promise<void>;
    transformStyleSheetforTesting(x: number, y: number, width: number, height: number, originalStyleSheet: string | undefined): string | undefined;
}
export declare const enum Events {
    INSPECT_MODE_WILL_BE_TOGGLED = "InspectModeWillBeToggled",
    EXITED_INSPECT_MODE = "InspectModeExited",
    HIGHLIGHT_NODE_REQUESTED = "HighlightNodeRequested",
    SCREENSHOT_REQUESTED = "ScreenshotRequested",
    PERSISTENT_GRID_OVERLAY_STATE_CHANGED = "PersistentGridOverlayStateChanged",
    PERSISTENT_FLEX_CONTAINER_OVERLAY_STATE_CHANGED = "PersistentFlexContainerOverlayStateChanged",
    PERSISTENT_SCROLL_SNAP_OVERLAY_STATE_CHANGED = "PersistentScrollSnapOverlayStateChanged",
    PERSISTENT_CONTAINER_QUERY_OVERLAY_STATE_CHANGED = "PersistentContainerQueryOverlayStateChanged"
}
export interface ChangedNodeId {
    nodeId: number;
    enabled: boolean;
}
export interface EventTypes {
    [Events.INSPECT_MODE_WILL_BE_TOGGLED]: OverlayModel;
    [Events.EXITED_INSPECT_MODE]: void;
    [Events.HIGHLIGHT_NODE_REQUESTED]: DOMNode;
    [Events.SCREENSHOT_REQUESTED]: Protocol.Page.Viewport;
    [Events.PERSISTENT_GRID_OVERLAY_STATE_CHANGED]: ChangedNodeId;
    [Events.PERSISTENT_FLEX_CONTAINER_OVERLAY_STATE_CHANGED]: ChangedNodeId;
    [Events.PERSISTENT_SCROLL_SNAP_OVERLAY_STATE_CHANGED]: ChangedNodeId;
    [Events.PERSISTENT_CONTAINER_QUERY_OVERLAY_STATE_CHANGED]: ChangedNodeId;
}
export interface Highlighter {
    highlightInOverlay(data: HighlightData, config: Protocol.Overlay.HighlightConfig): void;
    setInspectMode(mode: Protocol.Overlay.InspectMode, config: Protocol.Overlay.HighlightConfig): Promise<void>;
    highlightFrame(frameId: Protocol.Page.FrameId): void;
}
export declare class SourceOrderHighlighter {
    #private;
    constructor(model: OverlayModel);
    highlightSourceOrderInOverlay(node: DOMNode, sourceOrderConfig: Protocol.Overlay.SourceOrderConfig): void;
    hideSourceOrderHighlight(): void;
}
export interface HighlightNodeData {
    node: DOMNode;
    selectorList?: string;
}
export interface HighlightDeferredNode {
    deferredNode: DeferredDOMNode;
}
export interface HighlightObjectData {
    object: RemoteObject;
    selectorList?: string;
}
export type HighlightData = HighlightNodeData | HighlightDeferredNode | HighlightObjectData | {
    clear: boolean;
};
