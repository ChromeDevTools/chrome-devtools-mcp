import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import { DeferredDOMNode, type DOMNode } from './DOMModel.js';
import { RemoteObject } from './RemoteObject.js';
import { RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
/**
 * Provides an extension over `DOMNode` that gives it additional
 * capabilities for animation debugging, mainly:
 * - getting a node's scroll information (scroll offsets and scroll range).
 * - updating a node's scroll offset.
 * - tracking the node's scroll offsets with event listeners.
 *
 * It works by running functions on the target page, see `DOMNode`s `callFunction` method
 * for more details on how a function is called on the target page.
 *
 * For listening to events on the target page and getting notified on the devtools frontend
 * side, we're adding a binding to the page `__devtools_report_scroll_position__` in a world `devtools_animation`
 * we've created. Then, we're setting scroll listeners of the `node` in the same world which calls the binding
 * itself with the scroll offsets.
 */
export declare class AnimationDOMNode {
    #private;
    static lastAddedListenerId: number;
    constructor(domNode: DOMNode);
    addScrollEventListener(onScroll: ({ scrollLeft, scrollTop }: {
        scrollLeft: number;
        scrollTop: number;
    }) => void): Promise<number | null>;
    removeScrollEventListener(id: number): Promise<void>;
    scrollTop(): Promise<number | null>;
    scrollLeft(): Promise<number | null>;
    setScrollTop(offset: number): Promise<void>;
    setScrollLeft(offset: number): Promise<void>;
    verticalScrollRange(): Promise<number | null>;
    horizontalScrollRange(): Promise<number | null>;
}
export declare class AnimationModel extends SDKModel<EventTypes> {
    #private;
    readonly runtimeModel: RuntimeModel;
    readonly agent: ProtocolProxyApi.AnimationApi;
    readonly animationGroups: Map<string, AnimationGroup>;
    playbackRate: number;
    constructor(target: Target);
    private reset;
    devicePixelRatio(): Promise<number>;
    getAnimationGroupForAnimation(name: string, nodeId: Protocol.DOM.NodeId): Promise<AnimationGroup | null>;
    animationCanceled(id: string): void;
    animationUpdated(payload: Protocol.Animation.Animation): Promise<void>;
    animationStarted(payload: Protocol.Animation.Animation): Promise<void>;
    private matchExistingGroups;
    private createGroupFromPendingAnimations;
    setPlaybackRate(playbackRate: number): void;
    releaseAnimations(animations: string[]): void;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
}
export declare enum Events {
    AnimationGroupStarted = "AnimationGroupStarted",
    AnimationGroupUpdated = "AnimationGroupUpdated",
    ModelReset = "ModelReset"
}
export interface EventTypes {
    [Events.AnimationGroupStarted]: AnimationGroup;
    [Events.AnimationGroupUpdated]: AnimationGroup;
    [Events.ModelReset]: void;
}
export declare class AnimationImpl {
    #private;
    private constructor();
    static parsePayload(animationModel: AnimationModel, payload: Protocol.Animation.Animation): Promise<AnimationImpl>;
    setPayload(payload: Protocol.Animation.Animation): Promise<void>;
    private percentageToPixels;
    viewOrScrollTimeline(): Protocol.Animation.ViewOrScrollTimeline | undefined;
    id(): string;
    name(): string;
    paused(): boolean;
    playState(): string;
    playbackRate(): number;
    startTime(): number;
    iterationDuration(): number;
    endTime(): number;
    finiteDuration(): number;
    currentTime(): number;
    source(): AnimationEffect;
    type(): Protocol.Animation.AnimationType;
    overlaps(animation: AnimationImpl): boolean;
    delayOrStartTime(): number;
    setTiming(duration: number, delay: number): void;
    private updateNodeStyle;
    remoteObjectPromise(): Promise<RemoteObject | null>;
    cssId(): string;
}
export declare class AnimationEffect {
    #private;
    delayInternal: number;
    durationInternal: number;
    constructor(animationModel: AnimationModel, payload: Protocol.Animation.AnimationEffect);
    setPayload(payload: Protocol.Animation.AnimationEffect): void;
    delay(): number;
    endDelay(): number;
    iterations(): number;
    duration(): number;
    direction(): string;
    fill(): string;
    node(): Promise<DOMNode | null>;
    deferredNode(): DeferredDOMNode;
    backendNodeId(): Protocol.DOM.BackendNodeId;
    keyframesRule(): KeyframesRule | null;
    easing(): string;
}
export declare class KeyframesRule {
    #private;
    constructor(payload: Protocol.Animation.KeyframesRule);
    setPayload(payload: Protocol.Animation.KeyframesRule): void;
    name(): string | undefined;
    keyframes(): KeyframeStyle[];
}
export declare class KeyframeStyle {
    #private;
    constructor(payload: Protocol.Animation.KeyframeStyle);
    setPayload(payload: Protocol.Animation.KeyframeStyle): void;
    offset(): string;
    setOffset(offset: number): void;
    offsetAsNumber(): number;
    easing(): string;
}
export declare class AnimationGroup {
    #private;
    constructor(animationModel: AnimationModel, id: string, animations: AnimationImpl[]);
    isScrollDriven(): boolean;
    id(): string;
    animations(): AnimationImpl[];
    release(): void;
    private animationIds;
    startTime(): number;
    groupDuration(): number;
    finiteDuration(): number;
    scrollOrientation(): Protocol.DOM.ScrollOrientation | null;
    scrollNode(): Promise<AnimationDOMNode | null>;
    seekTo(currentTime: number): void;
    paused(): boolean;
    togglePause(paused: boolean): void;
    currentTimePromise(): Promise<number>;
    matches(group: AnimationGroup): boolean;
    shouldInclude(group: AnimationGroup): boolean;
    appendAnimations(animations: AnimationImpl[]): void;
    rebaseTo(group: AnimationGroup): void;
}
export declare class AnimationDispatcher implements ProtocolProxyApi.AnimationDispatcher {
    #private;
    constructor(animationModel: AnimationModel);
    animationCreated(_event: Protocol.Animation.AnimationCreatedEvent): void;
    animationCanceled({ id }: Protocol.Animation.AnimationCanceledEvent): void;
    animationStarted({ animation }: Protocol.Animation.AnimationStartedEvent): void;
    animationUpdated({ animation }: Protocol.Animation.AnimationUpdatedEvent): void;
}
export interface Request {
    endTime: number;
}
