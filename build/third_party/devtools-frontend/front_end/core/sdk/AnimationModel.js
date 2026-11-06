// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import { DeferredDOMNode } from './DOMModel.js';
import { horizontalScrollRangeInPage, removeScrollListenerInPage, scrollLeftInPage, scrollListenerInPage, scrollTopInPage, setScrollLeftInPage, setScrollTopInPage, verticalScrollRangeInPage, } from './PageFunctions.js';
import { RemoteObject } from './RemoteObject.js';
import { Events as ResourceTreeModelEvents, ResourceTreeModel } from './ResourceTreeModel.js';
import { Events as RuntimeModelEvents, RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
const DEVTOOLS_ANIMATIONS_WORLD_NAME = 'devtools_animations';
const REPORT_SCROLL_POSITION_BINDING_NAME = '__devtools_report_scroll_position__';
const getScrollListenerNameInPage = (id) => `__devtools_scroll_listener_${id}__`;
async function resolveToObjectInWorld(domNode, worldName) {
    const resourceTreeModel = domNode.domModel().target().model(ResourceTreeModel);
    const pageAgent = domNode.domModel().target().pageAgent();
    for (const frame of resourceTreeModel.frames()) {
        // This returns previously created world if it exists for the frame.
        const { executionContextId } = await pageAgent.invoke_createIsolatedWorld({ frameId: frame.id, worldName });
        const object = await domNode.resolveToObject(undefined, executionContextId);
        if (object) {
            return object;
        }
    }
    return null;
}
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
export class AnimationDOMNode {
    #domNode;
    #scrollListenersById = new Map();
    #scrollBindingListener;
    static lastAddedListenerId = 0;
    constructor(domNode) {
        this.#domNode = domNode;
    }
    async #addReportScrollPositionBinding() {
        // The binding is already added so we don't need to add it again.
        if (this.#scrollBindingListener) {
            return;
        }
        this.#scrollBindingListener = ev => {
            const { name, payload } = ev.data;
            if (name !== REPORT_SCROLL_POSITION_BINDING_NAME) {
                return;
            }
            const { scrollTop, scrollLeft, id } = JSON.parse(payload);
            const scrollListener = this.#scrollListenersById.get(id);
            if (!scrollListener) {
                return;
            }
            scrollListener({ scrollTop, scrollLeft });
        };
        const runtimeModel = this.#domNode.domModel().target().model(RuntimeModel);
        await runtimeModel.addBinding({
            name: REPORT_SCROLL_POSITION_BINDING_NAME,
            executionContextName: DEVTOOLS_ANIMATIONS_WORLD_NAME,
        });
        runtimeModel.addEventListener(RuntimeModelEvents.BindingCalled, this.#scrollBindingListener);
    }
    async #removeReportScrollPositionBinding() {
        // There isn't any binding added yet.
        if (!this.#scrollBindingListener) {
            return;
        }
        const runtimeModel = this.#domNode.domModel().target().model(RuntimeModel);
        await runtimeModel.removeBinding({
            name: REPORT_SCROLL_POSITION_BINDING_NAME,
        });
        runtimeModel.removeEventListener(RuntimeModelEvents.BindingCalled, this.#scrollBindingListener);
        this.#scrollBindingListener = undefined;
    }
    async addScrollEventListener(onScroll) {
        AnimationDOMNode.lastAddedListenerId++;
        const id = AnimationDOMNode.lastAddedListenerId;
        this.#scrollListenersById.set(id, onScroll);
        // Add the binding for reporting scroll events from the page if it doesn't exist.
        if (!this.#scrollBindingListener) {
            await this.#addReportScrollPositionBinding();
        }
        const object = await resolveToObjectInWorld(this.#domNode, DEVTOOLS_ANIMATIONS_WORLD_NAME);
        if (!object) {
            return null;
        }
        await object.callFunction(scrollListenerInPage, [
            id,
            REPORT_SCROLL_POSITION_BINDING_NAME,
            getScrollListenerNameInPage(id),
        ].map(arg => RemoteObject.toCallArgument(arg)));
        object.release();
        return id;
    }
    async removeScrollEventListener(id) {
        const object = await resolveToObjectInWorld(this.#domNode, DEVTOOLS_ANIMATIONS_WORLD_NAME);
        if (!object) {
            return;
        }
        await object.callFunction(removeScrollListenerInPage, [getScrollListenerNameInPage(id)].map(arg => RemoteObject.toCallArgument(arg)));
        object.release();
        this.#scrollListenersById.delete(id);
        // There aren't any scroll listeners remained on the page
        // so we remove the binding.
        if (this.#scrollListenersById.size === 0) {
            await this.#removeReportScrollPositionBinding();
        }
    }
    async scrollTop() {
        return await this.#domNode.callFunction(scrollTopInPage).then(res => res?.value ?? null);
    }
    async scrollLeft() {
        return await this.#domNode.callFunction(scrollLeftInPage).then(res => res?.value ?? null);
    }
    async setScrollTop(offset) {
        await this.#domNode.callFunction(setScrollTopInPage, [offset]);
    }
    async setScrollLeft(offset) {
        await this.#domNode.callFunction(setScrollLeftInPage, [offset]);
    }
    async verticalScrollRange() {
        return await this.#domNode.callFunction(verticalScrollRangeInPage).then(res => res?.value ?? null);
    }
    async horizontalScrollRange() {
        return await this.#domNode.callFunction(horizontalScrollRangeInPage).then(res => res?.value ?? null);
    }
}
function shouldGroupAnimations(firstAnimation, anim) {
    const firstAnimationTimeline = firstAnimation.viewOrScrollTimeline();
    const animationTimeline = anim.viewOrScrollTimeline();
    if (firstAnimationTimeline) {
        // This is a SDA group so check whether the animation's
        // scroll container and scroll axis is the same with the first animation.
        return Boolean(animationTimeline && firstAnimationTimeline.sourceNodeId === animationTimeline.sourceNodeId &&
            firstAnimationTimeline.axis === animationTimeline.axis);
    }
    // This is a non-SDA group so check whether the coming animation
    // is a time based one too and if so, compare their start times.
    return !animationTimeline && firstAnimation.startTime() === anim.startTime();
}
export class AnimationModel extends SDKModel {
    runtimeModel;
    agent;
    #animationsById = new Map();
    animationGroups = new Map();
    #pendingAnimations = new Set();
    playbackRate = 1;
    #flushPendingAnimations;
    constructor(target) {
        super(target);
        this.runtimeModel = target.model(RuntimeModel);
        this.agent = target.animationAgent();
        target.registerAnimationDispatcher(new AnimationDispatcher(this));
        if (!target.suspended()) {
            void this.agent.invoke_enable();
        }
        const resourceTreeModel = target.model(ResourceTreeModel);
        resourceTreeModel.addEventListener(ResourceTreeModelEvents.PrimaryPageChanged, this.reset, this);
        this.#flushPendingAnimations = Common.Debouncer.debounce(() => {
            while (this.#pendingAnimations.size) {
                this.matchExistingGroups(this.createGroupFromPendingAnimations());
            }
        }, 100);
    }
    reset() {
        this.#animationsById.clear();
        this.animationGroups.clear();
        this.#pendingAnimations.clear();
        this.dispatchEventToListeners(Events.ModelReset);
    }
    async devicePixelRatio() {
        const evaluateResult = await this.target().runtimeAgent().invoke_evaluate({ expression: 'window.devicePixelRatio' });
        if (evaluateResult?.result.type === 'number') {
            return evaluateResult?.result.value ?? 1;
        }
        return 1;
    }
    async getAnimationGroupForAnimation(name, nodeId) {
        for (const animationGroup of this.animationGroups.values()) {
            for (const animation of animationGroup.animations()) {
                if (animation.name() === name) {
                    const animationNode = await animation.source().node();
                    if (animationNode?.id === nodeId) {
                        return animationGroup;
                    }
                }
            }
        }
        return null;
    }
    animationCanceled(id) {
        this.#pendingAnimations.delete(id);
    }
    async animationUpdated(payload) {
        let foundAnimationGroup;
        let foundAnimation;
        for (const animationGroup of this.animationGroups.values()) {
            foundAnimation = animationGroup.animations().find(animation => animation.id() === payload.id);
            if (foundAnimation) {
                foundAnimationGroup = animationGroup;
                break;
            }
        }
        if (!foundAnimation || !foundAnimationGroup) {
            return;
        }
        await foundAnimation.setPayload(payload);
        this.dispatchEventToListeners(Events.AnimationGroupUpdated, foundAnimationGroup);
    }
    async animationStarted(payload) {
        // We are not interested in animations without effect or target.
        if (!payload.source?.backendNodeId) {
            return;
        }
        const animation = await AnimationImpl.parsePayload(this, payload);
        // Ignore Web Animations custom effects & groups.
        const keyframesRule = animation.source().keyframesRule();
        if (animation.type() === 'WebAnimation' && keyframesRule?.keyframes().length === 0) {
            this.#pendingAnimations.delete(animation.id());
        }
        else {
            this.#animationsById.set(animation.id(), animation);
            this.#pendingAnimations.add(animation.id());
        }
        this.#flushPendingAnimations();
    }
    matchExistingGroups(incomingGroup) {
        let matchedGroup = null;
        for (const group of this.animationGroups.values()) {
            if (group.matches(incomingGroup)) {
                matchedGroup = group;
                group.rebaseTo(incomingGroup);
                break;
            }
            if (group.shouldInclude(incomingGroup)) {
                matchedGroup = group;
                group.appendAnimations(incomingGroup.animations());
                break;
            }
        }
        if (!matchedGroup) {
            this.animationGroups.set(incomingGroup.id(), incomingGroup);
            this.dispatchEventToListeners(Events.AnimationGroupStarted, incomingGroup);
        }
        else {
            this.dispatchEventToListeners(Events.AnimationGroupUpdated, matchedGroup);
        }
        return Boolean(matchedGroup);
    }
    createGroupFromPendingAnimations() {
        console.assert(this.#pendingAnimations.size > 0);
        const firstAnimationId = this.#pendingAnimations.values().next().value;
        this.#pendingAnimations.delete(firstAnimationId);
        const firstAnimation = this.#animationsById.get(firstAnimationId);
        if (!firstAnimation) {
            throw new Error('Unable to locate first animation');
        }
        const groupedAnimations = [firstAnimation];
        const remainingAnimations = new Set();
        for (const id of this.#pendingAnimations) {
            const anim = this.#animationsById.get(id);
            if (shouldGroupAnimations(firstAnimation, anim)) {
                groupedAnimations.push(anim);
            }
            else {
                remainingAnimations.add(id);
            }
        }
        this.#pendingAnimations = remainingAnimations;
        // Show the first starting animation at the top of the animations of the animation group.
        groupedAnimations.sort((anim1, anim2) => anim1.startTime() - anim2.startTime());
        return new AnimationGroup(this, firstAnimationId, groupedAnimations);
    }
    setPlaybackRate(playbackRate) {
        this.playbackRate = playbackRate;
        void this.agent.invoke_setPlaybackRate({ playbackRate });
    }
    releaseAnimations(animations) {
        void this.agent.invoke_releaseAnimations({ animations });
    }
    async suspendModel() {
        await this.agent.invoke_disable().then(() => this.reset());
    }
    async resumeModel() {
        await this.agent.invoke_enable();
    }
}
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["AnimationGroupStarted"] = "AnimationGroupStarted";
    Events["AnimationGroupUpdated"] = "AnimationGroupUpdated";
    Events["ModelReset"] = "ModelReset";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
export class AnimationImpl {
    #animationModel;
    #payload; // Assertion is safe because only way to create `AnimationImpl` is to use `parsePayload` which calls `setPayload` and sets the value.
    #source; // Assertion is safe because only way to create `AnimationImpl` is to use `parsePayload` which calls `setPayload` and sets the value.
    #playState;
    constructor(animationModel) {
        this.#animationModel = animationModel;
    }
    static async parsePayload(animationModel, payload) {
        const animation = new AnimationImpl(animationModel);
        await animation.setPayload(payload);
        return animation;
    }
    async setPayload(payload) {
        // TODO(b/40929569): Remove normalizing by devicePixelRatio after the attached bug is resolved.
        if (payload.viewOrScrollTimeline) {
            const devicePixelRatio = await this.#animationModel.devicePixelRatio();
            if (payload.viewOrScrollTimeline.startOffset) {
                payload.viewOrScrollTimeline.startOffset /= devicePixelRatio;
            }
            if (payload.viewOrScrollTimeline.endOffset) {
                payload.viewOrScrollTimeline.endOffset /= devicePixelRatio;
            }
        }
        this.#payload = payload;
        if (this.#source && payload.source) {
            this.#source.setPayload(payload.source);
        }
        else if (!this.#source && payload.source) {
            this.#source = new AnimationEffect(this.#animationModel, payload.source);
        }
    }
    // `startTime` and `duration` is represented as the
    // percentage of the view timeline range that starts at `startOffset`px
    // from the scroll container and ends at `endOffset`px of the scroll container.
    // This takes a percentage of the timeline range and returns the absolute
    // pixels values as a scroll offset of the scroll container.
    percentageToPixels(percentage, viewOrScrollTimeline) {
        const { startOffset, endOffset } = viewOrScrollTimeline;
        if (startOffset === undefined || endOffset === undefined) {
            // We don't expect this situation to occur since after an animation is started
            // we expect the scroll offsets to be resolved and provided correctly. If `startOffset`
            // or `endOffset` is not provided in a viewOrScrollTimeline; we can assume that there is a bug here
            // so it's fine to throw an error.
            throw new Error('startOffset or endOffset does not exist in viewOrScrollTimeline');
        }
        return (endOffset - startOffset) * (percentage / 100);
    }
    viewOrScrollTimeline() {
        return this.#payload.viewOrScrollTimeline;
    }
    id() {
        return this.#payload.id;
    }
    name() {
        return this.#payload.name;
    }
    paused() {
        return this.#payload.pausedState;
    }
    playState() {
        return this.#playState || this.#payload.playState;
    }
    playbackRate() {
        return this.#payload.playbackRate;
    }
    // For scroll driven animations, it returns the pixel offset in the scroll container
    // For time animations, it returns milliseconds.
    startTime() {
        const viewOrScrollTimeline = this.viewOrScrollTimeline();
        if (viewOrScrollTimeline) {
            return this.percentageToPixels(this.playbackRate() > 0 ? this.#payload.startTime : 100 - this.#payload.startTime, viewOrScrollTimeline) +
                (this.viewOrScrollTimeline()?.startOffset ?? 0);
        }
        return this.#payload.startTime;
    }
    // For scroll driven animations, it returns the duration in pixels (i.e. after how many pixels of scroll the animation is going to end)
    // For time animations, it returns milliseconds.
    iterationDuration() {
        const viewOrScrollTimeline = this.viewOrScrollTimeline();
        if (viewOrScrollTimeline) {
            return this.percentageToPixels(this.source().duration(), viewOrScrollTimeline);
        }
        return this.source().duration();
    }
    // For scroll driven animations, it returns the duration in pixels (i.e. after how many pixels of scroll the animation is going to end)
    // For time animations, it returns milliseconds.
    endTime() {
        if (!this.source().iterations) {
            return Infinity;
        }
        if (this.viewOrScrollTimeline()) {
            return this.startTime() + this.iterationDuration() * this.source().iterations();
        }
        return this.startTime() + this.source().delay() + this.source().duration() * this.source().iterations() +
            this.source().endDelay();
    }
    // For scroll driven animations, it returns the duration in pixels (i.e. after how many pixels of scroll the animation is going to end)
    // For time animations, it returns milliseconds.
    finiteDuration() {
        const iterations = Math.min(this.source().iterations(), 3);
        if (this.viewOrScrollTimeline()) {
            return this.iterationDuration() * iterations;
        }
        return this.source().delay() + this.source().duration() * iterations;
    }
    // For scroll driven animations, it returns the duration in pixels (i.e. after how many pixels of scroll the animation is going to end)
    // For time animations, it returns milliseconds.
    currentTime() {
        const viewOrScrollTimeline = this.viewOrScrollTimeline();
        if (viewOrScrollTimeline) {
            return this.percentageToPixels(this.#payload.currentTime, viewOrScrollTimeline);
        }
        return this.#payload.currentTime;
    }
    source() {
        return this.#source;
    }
    type() {
        return this.#payload.type;
    }
    overlaps(animation) {
        // Infinite animations
        if (!this.source().iterations() || !animation.source().iterations()) {
            return true;
        }
        const firstAnimation = this.startTime() < animation.startTime() ? this : animation;
        const secondAnimation = firstAnimation === this ? animation : this;
        return firstAnimation.endTime() >= secondAnimation.startTime();
    }
    // Utility method for returning `delay` for time based animations
    // and `startTime` in pixels for scroll driven animations. It is used to
    // find the exact starting time of the first keyframe for both cases.
    delayOrStartTime() {
        if (this.viewOrScrollTimeline()) {
            return this.startTime();
        }
        return this.source().delay();
    }
    setTiming(duration, delay) {
        void this.#source.node().then(node => {
            if (!node) {
                throw new Error('Unable to find node');
            }
            this.updateNodeStyle(duration, delay, node);
        });
        this.#source.durationInternal = duration;
        this.#source.delayInternal = delay;
        void this.#animationModel.agent.invoke_setTiming({ animationId: this.id(), duration, delay });
    }
    updateNodeStyle(duration, delay, node) {
        let animationPrefix;
        if (this.type() === "CSSTransition" /* Protocol.Animation.AnimationType.CSSTransition */) {
            animationPrefix = 'transition-';
        }
        else if (this.type() === "CSSAnimation" /* Protocol.Animation.AnimationType.CSSAnimation */) {
            animationPrefix = 'animation-';
        }
        else {
            return;
        }
        if (!node.id) {
            throw new Error('Node has no id');
        }
        const cssModel = node.domModel().cssModel();
        cssModel.setEffectivePropertyValueForNode(node.id, animationPrefix + 'duration', duration + 'ms');
        cssModel.setEffectivePropertyValueForNode(node.id, animationPrefix + 'delay', delay + 'ms');
    }
    async remoteObjectPromise() {
        const payload = await this.#animationModel.agent.invoke_resolveAnimation({ animationId: this.id() });
        if (!payload) {
            return null;
        }
        return this.#animationModel.runtimeModel.createRemoteObject(payload.remoteObject);
    }
    cssId() {
        return this.#payload.cssId || '';
    }
}
export class AnimationEffect {
    #animationModel;
    #payload; // Assertion is safe because `setPayload` call in `constructor` sets the value.
    delayInternal; // Assertion is safe because `setPayload` call in `constructor` sets the value.
    durationInternal; // Assertion is safe because `setPayload` call in `constructor` sets the value.
    #keyframesRule;
    #deferredNode;
    constructor(animationModel, payload) {
        this.#animationModel = animationModel;
        this.setPayload(payload);
    }
    setPayload(payload) {
        this.#payload = payload;
        if (!this.#keyframesRule && payload.keyframesRule) {
            this.#keyframesRule = new KeyframesRule(payload.keyframesRule);
        }
        else if (this.#keyframesRule && payload.keyframesRule) {
            this.#keyframesRule.setPayload(payload.keyframesRule);
        }
        this.delayInternal = payload.delay;
        this.durationInternal = payload.duration;
    }
    delay() {
        return this.delayInternal;
    }
    endDelay() {
        return this.#payload.endDelay;
    }
    iterations() {
        // Animations with zero duration, zero delays and infinite iterations can't be shown.
        if (!this.delay() && !this.endDelay() && !this.duration()) {
            return 0;
        }
        return this.#payload.iterations || Infinity;
    }
    duration() {
        return this.durationInternal;
    }
    direction() {
        return this.#payload.direction;
    }
    fill() {
        return this.#payload.fill;
    }
    node() {
        if (!this.#deferredNode) {
            this.#deferredNode = new DeferredDOMNode(this.#animationModel.target(), this.backendNodeId());
        }
        return this.#deferredNode.resolvePromise();
    }
    deferredNode() {
        return new DeferredDOMNode(this.#animationModel.target(), this.backendNodeId());
    }
    backendNodeId() {
        return this.#payload.backendNodeId;
    }
    keyframesRule() {
        return this.#keyframesRule || null;
    }
    easing() {
        return this.#payload.easing;
    }
}
export class KeyframesRule {
    #payload; // Assertion is safe because `setPayload` call in `constructor` sets the value.;
    #keyframes; // Assertion is safe because `setPayload` call in `constructor` sets the value.;
    constructor(payload) {
        this.setPayload(payload);
    }
    setPayload(payload) {
        this.#payload = payload;
        if (!this.#keyframes) {
            this.#keyframes = this.#payload.keyframes.map(keyframeStyle => new KeyframeStyle(keyframeStyle));
        }
        else {
            this.#payload.keyframes.forEach((keyframeStyle, index) => {
                this.#keyframes[index]?.setPayload(keyframeStyle);
            });
        }
    }
    name() {
        return this.#payload.name;
    }
    keyframes() {
        return this.#keyframes;
    }
}
export class KeyframeStyle {
    #payload; // Assertion is safe because `setPayload` call in `constructor` sets the value.
    #offset; // Assertion is safe because `setPayload` call in `constructor` sets the value.
    constructor(payload) {
        this.setPayload(payload);
    }
    setPayload(payload) {
        this.#payload = payload;
        this.#offset = payload.offset;
    }
    offset() {
        return this.#offset;
    }
    setOffset(offset) {
        this.#offset = offset * 100 + '%';
    }
    offsetAsNumber() {
        return parseFloat(this.#offset) / 100;
    }
    easing() {
        return this.#payload.easing;
    }
}
export class AnimationGroup {
    #animationModel;
    #id;
    #scrollNode;
    #animations;
    #paused = false;
    constructor(animationModel, id, animations) {
        this.#animationModel = animationModel;
        this.#id = id;
        this.#animations = animations;
    }
    isScrollDriven() {
        return Boolean(this.#animations[0]?.viewOrScrollTimeline());
    }
    id() {
        return this.#id;
    }
    animations() {
        return this.#animations;
    }
    release() {
        this.#animationModel.animationGroups.delete(this.id());
        this.#animationModel.releaseAnimations(this.animationIds());
    }
    animationIds() {
        function extractId(animation) {
            return animation.id();
        }
        return this.#animations.map(extractId);
    }
    startTime() {
        return this.#animations[0].startTime();
    }
    // For scroll driven animations, it returns the duration in pixels (i.e. after how many pixels of scroll the animation is going to end)
    // For time animations, it returns milliseconds.
    groupDuration() {
        let duration = 0;
        for (const anim of this.#animations) {
            duration = Math.max(duration, anim.delayOrStartTime() + anim.iterationDuration());
        }
        return duration;
    }
    // For scroll driven animations, it returns the duration in pixels (i.e. after how many pixels of scroll the animation is going to end)
    // For time animations, it returns milliseconds.
    finiteDuration() {
        let maxDuration = 0;
        for (let i = 0; i < this.#animations.length; ++i) {
            maxDuration = Math.max(maxDuration, this.#animations[i].finiteDuration());
        }
        return maxDuration;
    }
    scrollOrientation() {
        const timeline = this.#animations[0]?.viewOrScrollTimeline();
        if (!timeline) {
            return null;
        }
        return timeline.axis;
    }
    async scrollNode() {
        if (this.#scrollNode) {
            return this.#scrollNode;
        }
        if (!this.isScrollDriven()) {
            return null;
        }
        const sourceNodeId = this.#animations[0]?.viewOrScrollTimeline()?.sourceNodeId;
        if (!sourceNodeId) {
            return null;
        }
        const deferredScrollNode = new DeferredDOMNode(this.#animationModel.target(), sourceNodeId);
        const scrollNode = await deferredScrollNode.resolvePromise();
        if (!scrollNode) {
            return null;
        }
        this.#scrollNode = new AnimationDOMNode(scrollNode);
        return this.#scrollNode;
    }
    seekTo(currentTime) {
        const animations = [];
        const currentTimes = [];
        for (const animation of this.#animations) {
            // Seek from the end of the animation if it is reversed.
            animations.push(animation.id());
            currentTimes.push(animation.playbackRate() >= 0 ? currentTime :
                animation.endTime() - animation.startTime() - currentTime);
        }
        void this.#animationModel.agent.invoke_seekAnimations({ animations, currentTimes });
    }
    paused() {
        return this.#paused;
    }
    togglePause(paused) {
        if (paused === this.#paused) {
            return;
        }
        this.#paused = paused;
        void this.#animationModel.agent.invoke_setPaused({ animations: this.animationIds(), paused });
    }
    currentTimePromise() {
        let longestAnim = null;
        for (const anim of this.#animations) {
            if (!longestAnim || anim.endTime() > longestAnim.endTime()) {
                longestAnim = anim;
            }
        }
        if (!longestAnim) {
            throw new Error('No longest animation found');
        }
        return this.#animationModel.agent.invoke_getCurrentTime({ id: longestAnim.id() })
            .then(({ currentTime }) => currentTime || 0);
    }
    matches(group) {
        function extractId(anim) {
            const timelineId = (anim.viewOrScrollTimeline()?.sourceNodeId ?? '') + (anim.viewOrScrollTimeline()?.axis ?? '');
            const regularId = anim.type() === "WebAnimation" /* Protocol.Animation.AnimationType.WebAnimation */ ? anim.type() + anim.id() : anim.cssId();
            return regularId + timelineId;
        }
        if (this.#animations.length !== group.#animations.length) {
            return false;
        }
        const left = this.#animations.map(extractId).sort();
        const right = group.#animations.map(extractId).sort();
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) {
                return false;
            }
        }
        return true;
    }
    shouldInclude(group) {
        // We want to include the animations coming from the incoming group
        // inside this group if they were to be grouped if the events came at the same time.
        const [firstIncomingAnimation] = group.#animations;
        const [firstAnimation] = this.#animations;
        return shouldGroupAnimations(firstAnimation, firstIncomingAnimation);
    }
    appendAnimations(animations) {
        this.#animations.push(...animations);
    }
    rebaseTo(group) {
        this.#animationModel.releaseAnimations(this.animationIds());
        this.#animations = group.#animations;
        this.#scrollNode = undefined;
    }
}
export class AnimationDispatcher {
    #animationModel;
    constructor(animationModel) {
        this.#animationModel = animationModel;
    }
    animationCreated(_event) {
        // Previously this event was used to batch the animations into groups
        // and we were waiting for animationStarted events to be sent for
        // all the created animations and until then we weren't creating any
        // groups. This was allowing us to not miss any animations that were
        // going to be in the same group. However, now we're not using this event
        // to do batching and instead:
        // * We debounce the flush calls so that if the animationStarted events
        // for the same animation group come in different times; we create one
        // group for them.
        // * Even though an animation group is created and rendered for some animations
        // that have the same startTime (or same timeline & scroll axis for SDAs), now
        // whenever an `animationStarted` event comes we check whether there is a group
        // we can add the related animation. If so, we add it and emit `animationGroupUpdated`
        // event. So that, all the animations that were supposed to be in the same group
        // will be in the same group.
    }
    animationCanceled({ id }) {
        this.#animationModel.animationCanceled(id);
    }
    animationStarted({ animation }) {
        void this.#animationModel.animationStarted(animation);
    }
    animationUpdated({ animation }) {
        void this.#animationModel.animationUpdated(animation);
    }
}
SDKModel.register(AnimationModel, { capabilities: 2 /* Capability.DOM */, autostart: true });
//# sourceMappingURL=AnimationModel.js.map