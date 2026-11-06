import * as Protocol from '../../generated/protocol.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export interface WithId<I, V> {
    id: I;
    value: V;
}
/**
 * Holds preloading related information.
 *
 * - SpeculationRule rule sets
 * - Preloading attempts
 * - Relationship between rule sets and preloading attempts
 **/
export declare class PreloadingModel extends SDKModel<EventTypes> {
    private agent;
    private loaderIds;
    private targetJustAttached;
    private lastPrimaryPageModel;
    private documents;
    constructor(target: Target);
    dispose(): void;
    reset(): void;
    private maybeInferLoaderId;
    private ensureDocumentPreloadingData;
    private currentLoaderId;
    private currentDocument;
    getRuleSetById(id: Protocol.Preload.RuleSetId): Protocol.Preload.RuleSet | null;
    getAllRuleSets(): Array<WithId<Protocol.Preload.RuleSetId, Protocol.Preload.RuleSet>>;
    getPreloadCountsByRuleSetId(): Map<Protocol.Preload.RuleSetId | null, Map<PreloadingStatus, number>>;
    getPreloadingAttemptById(id: PreloadingAttemptId): PreloadingAttempt | null;
    getRepresentativePreloadingAttempts(ruleSetId: Protocol.Preload.RuleSetId | null): Array<WithId<PreloadingAttemptId, PreloadingAttempt>>;
    getRepresentativePreloadingAttemptsOfPreviousPage(): Array<WithId<PreloadingAttemptId, PreloadingAttempt>>;
    private getPipelineById;
    getPipeline(attempt: PreloadingAttempt): PreloadPipeline;
    private onPrimaryPageChanged;
    onRuleSetUpdated(event: Protocol.Preload.RuleSetUpdatedEvent): void;
    onRuleSetRemoved(event: Protocol.Preload.RuleSetRemovedEvent): void;
    onPreloadingAttemptSourcesUpdated(event: Protocol.Preload.PreloadingAttemptSourcesUpdatedEvent): void;
    onPrefetchStatusUpdated(event: Protocol.Preload.PrefetchStatusUpdatedEvent): void;
    onPrerenderStatusUpdated(event: Protocol.Preload.PrerenderStatusUpdatedEvent): void;
    onPreloadEnabledStateUpdated(event: Protocol.Preload.PreloadEnabledStateUpdatedEvent): void;
}
export declare const enum Events {
    MODEL_UPDATED = "ModelUpdated",
    WARNINGS_UPDATED = "WarningsUpdated"
}
export interface EventTypes {
    [Events.MODEL_UPDATED]: void;
    [Events.WARNINGS_UPDATED]: Protocol.Preload.PreloadEnabledStateUpdatedEvent;
}
/**
 * Protocol.Preload.PreloadingStatus|'NotTriggered'
 *
 * A renderer sends SpeculationCandidate to the browser process and the
 * browser process checks eligibilities, and starts PreloadingAttempt.
 *
 * In the frontend, "NotTriggered" is used to denote that a
 * PreloadingAttempt is waiting for at trigger event (eg:
 * mousedown/mouseover). All PreloadingAttempts will start off as
 * "NotTriggered", but "eager" preloading attempts (attempts not
 * actually waiting for any trigger) will be processed by the browser
 * immediately, and will not stay in this state for long.
 *
 * TODO(https://crbug.com/1384419): Add NotEligible.
 **/
export declare const enum PreloadingStatus {
    NOT_TRIGGERED = "NotTriggered",
    PENDING = "Pending",
    RUNNING = "Running",
    READY = "Ready",
    SUCCESS = "Success",
    FAILURE = "Failure",
    NOT_SUPPORTED = "NotSupported"
}
export type PreloadingAttemptId = string;
export type PreloadingAttempt = PrefetchAttempt | PrerenderAttempt | PrerenderUntilScriptAttempt;
export interface PrefetchAttempt {
    action: Protocol.Preload.SpeculationAction.Prefetch;
    key: Protocol.Preload.PreloadingAttemptKey;
    pipelineId: Protocol.Preload.PreloadPipelineId | null;
    status: PreloadingStatus;
    prefetchStatus: Protocol.Preload.PrefetchStatus | null;
    requestId: Protocol.Network.RequestId;
    ruleSetIds: Protocol.Preload.RuleSetId[];
    nodeIds: Protocol.DOM.BackendNodeId[];
}
export interface PrerenderAttempt {
    action: Protocol.Preload.SpeculationAction.Prerender;
    key: Protocol.Preload.PreloadingAttemptKey;
    pipelineId: Protocol.Preload.PreloadPipelineId | null;
    status: PreloadingStatus;
    prerenderStatus: Protocol.Preload.PrerenderFinalStatus | null;
    disallowedMojoInterface: string | null;
    mismatchedHeaders: Protocol.Preload.PrerenderMismatchedHeaders[] | null;
    ruleSetIds: Protocol.Preload.RuleSetId[];
    nodeIds: Protocol.DOM.BackendNodeId[];
}
export interface PrerenderUntilScriptAttempt {
    action: Protocol.Preload.SpeculationAction.PrerenderUntilScript;
    key: Protocol.Preload.PreloadingAttemptKey;
    pipelineId: Protocol.Preload.PreloadPipelineId | null;
    status: PreloadingStatus;
    prerenderStatus: Protocol.Preload.PrerenderFinalStatus | null;
    disallowedMojoInterface: string | null;
    mismatchedHeaders: Protocol.Preload.PrerenderMismatchedHeaders[] | null;
    ruleSetIds: Protocol.Preload.RuleSetId[];
    nodeIds: Protocol.DOM.BackendNodeId[];
}
export type PreloadingAttemptInternal = PrefetchAttemptInternal | PrerenderAttemptInternal | PrerenderUntilScriptAttemptInternal;
export interface PrefetchAttemptInternal {
    action: Protocol.Preload.SpeculationAction.Prefetch;
    key: Protocol.Preload.PreloadingAttemptKey;
    pipelineId: Protocol.Preload.PreloadPipelineId | null;
    status: PreloadingStatus;
    prefetchStatus: Protocol.Preload.PrefetchStatus | null;
    requestId: Protocol.Network.RequestId;
}
export interface PrerenderAttemptInternal {
    action: Protocol.Preload.SpeculationAction.Prerender;
    key: Protocol.Preload.PreloadingAttemptKey;
    pipelineId: Protocol.Preload.PreloadPipelineId | null;
    status: PreloadingStatus;
    prerenderStatus: Protocol.Preload.PrerenderFinalStatus | null;
    disallowedMojoInterface: string | null;
    mismatchedHeaders: Protocol.Preload.PrerenderMismatchedHeaders[] | null;
}
export interface PrerenderUntilScriptAttemptInternal {
    action: Protocol.Preload.SpeculationAction.PrerenderUntilScript;
    key: Protocol.Preload.PreloadingAttemptKey;
    pipelineId: Protocol.Preload.PreloadPipelineId | null;
    status: PreloadingStatus;
    prerenderStatus: Protocol.Preload.PrerenderFinalStatus | null;
    disallowedMojoInterface: string | null;
    mismatchedHeaders: Protocol.Preload.PrerenderMismatchedHeaders[] | null;
}
export declare class PreloadPipeline {
    private inner;
    constructor(inner: Map<Protocol.Preload.SpeculationAction, PreloadingAttempt>);
    static newFromAttemptsForTesting(attempts: PreloadingAttempt[]): PreloadPipeline;
    getOriginallyTriggered(): PreloadingAttempt;
    getPrefetch(): PreloadingAttempt | null;
    getPrerender(): PreloadingAttempt | null;
    getPrerenderUntilScript(): PreloadingAttempt | null;
    getAttempts(): PreloadingAttempt[];
}
