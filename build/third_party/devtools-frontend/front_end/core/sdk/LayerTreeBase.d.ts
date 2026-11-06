import type * as Protocol from '../../generated/protocol.js';
import { type DOMNode } from './DOMModel.js';
import type { SnapshotWithRect } from './PaintProfiler.js';
import type { Target } from './Target.js';
export interface Layer {
    id(): string;
    parentId(): string | null;
    parent(): Layer | null;
    isRoot(): boolean;
    children(): Layer[];
    addChild(child: Layer): void;
    node(): DOMNode | null;
    nodeForSelfOrAncestor(): DOMNode | null;
    offsetX(): number;
    offsetY(): number;
    width(): number;
    height(): number;
    transform(): number[] | null;
    quad(): number[];
    anchorPoint(): number[];
    invisible(): boolean;
    paintCount(): number;
    lastPaintRect(): Protocol.DOM.Rect | null;
    scrollRects(): Protocol.LayerTree.ScrollRect[];
    stickyPositionConstraint(): StickyPositionConstraint | null;
    gpuMemoryUsage(): number;
    requestCompositingReasons(): Promise<string[]>;
    requestCompositingReasonIds(): Promise<string[]>;
    drawsContent(): boolean;
    snapshots(): Array<Promise<SnapshotWithRect | null>>;
}
export declare namespace Layer {
    const enum ScrollRectType {
        NON_FAST_SCROLLABLE = "NonFastScrollable",
        TOUCH_EVENT_HANDLER = "TouchEventHandler",
        WHEEL_EVENT_HANDLER = "WheelEventHandler",
        REPAINTS_ON_SCROLL = "RepaintsOnScroll",
        MAIN_THREAD_SCROLL_REASON = "MainThreadScrollingReason"
    }
}
export declare class StickyPositionConstraint {
    #private;
    constructor(layerTree: LayerTreeBase | null, constraint: Protocol.LayerTree.StickyPositionConstraint);
    stickyBoxRect(): Protocol.DOM.Rect;
    containingBlockRect(): Protocol.DOM.Rect;
    nearestLayerShiftingStickyBox(): Layer | null;
    nearestLayerShiftingContainingBlock(): Layer | null;
}
export declare class LayerTreeBase {
    #private;
    layersById: Map<string | number, Layer>;
    constructor(target: Target | null);
    target(): Target | null;
    root(): Layer | null;
    setRoot(root: Layer | null): void;
    contentRoot(): Layer | null;
    setContentRoot(contentRoot: Layer | null): void;
    forEachLayer<T>(callback: (arg0: Layer) => T, root?: Layer | null): T | boolean;
    layerById(id: string): Layer | null;
    resolveBackendNodeIds(requestedNodeIds: Set<Protocol.DOM.BackendNodeId>): Promise<void>;
    backendNodeIdToNode(): Map<Protocol.DOM.BackendNodeId, DOMNode | null>;
    setViewportSize(viewportSize: {
        width: number;
        height: number;
    }): void;
    viewportSize(): {
        width: number;
        height: number;
    } | undefined;
}
