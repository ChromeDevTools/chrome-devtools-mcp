// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import { assertNotNullOrUndefined } from '../platform/platform.js';
import { Events as ResourceTreeModelEvents, ResourceTreeModel, } from './ResourceTreeModel.js';
import { SDKModel } from './SDKModel.js';
/**
 * Holds preloading related information.
 *
 * - SpeculationRule rule sets
 * - Preloading attempts
 * - Relationship between rule sets and preloading attempts
 **/
export class PreloadingModel extends SDKModel {
    agent;
    loaderIds = [];
    targetJustAttached = true;
    lastPrimaryPageModel = null;
    documents = new Map();
    constructor(target) {
        super(target);
        target.registerPreloadDispatcher(new PreloadDispatcher(this));
        this.agent = target.preloadAgent();
        void this.agent.invoke_enable();
        const targetInfo = target.targetInfo();
        if (targetInfo?.subtype === 'prerender') {
            this.lastPrimaryPageModel = target.targetManager().primaryPageTarget()?.model(PreloadingModel) || null;
        }
        target.targetManager().addModelListener(ResourceTreeModel, ResourceTreeModelEvents.PrimaryPageChanged, this.onPrimaryPageChanged, this);
    }
    dispose() {
        super.dispose();
        this.target().targetManager().removeModelListener(ResourceTreeModel, ResourceTreeModelEvents.PrimaryPageChanged, this.onPrimaryPageChanged, this);
        void this.agent.invoke_disable();
    }
    reset() {
        this.documents.clear();
        this.loaderIds = [];
        this.targetJustAttached = true;
        this.dispatchEventToListeners("ModelUpdated" /* Events.MODEL_UPDATED */);
    }
    maybeInferLoaderId(loaderId) {
        if (this.currentLoaderId() === null) {
            this.loaderIds = [loaderId];
            this.targetJustAttached = false;
        }
    }
    ensureDocumentPreloadingData(loaderId) {
        if (this.documents.get(loaderId) === undefined) {
            this.documents.set(loaderId, new DocumentPreloadingData());
        }
    }
    currentLoaderId() {
        // Target is just attached and didn't received CDP events that we can infer loaderId.
        if (this.targetJustAttached) {
            return null;
        }
        if (this.loaderIds.length === 0) {
            throw new Error('unreachable');
        }
        return this.loaderIds[this.loaderIds.length - 1];
    }
    currentDocument() {
        const loaderId = this.currentLoaderId();
        return loaderId === null ? null : this.documents.get(loaderId) || null;
    }
    // Returns a rule set of the current page.
    //
    // Returns reference. Don't save returned values.
    // Returned value may or may not be updated as the time grows.
    getRuleSetById(id) {
        return this.currentDocument()?.ruleSets.getById(id) || null;
    }
    // Returns rule sets of the current page.
    //
    // Returns array of pairs of id and reference. Don't save returned references.
    // Returned values may or may not be updated as the time grows.
    getAllRuleSets() {
        return this.currentDocument()?.ruleSets.getAll() || [];
    }
    getPreloadCountsByRuleSetId() {
        const countsByRuleSetId = new Map();
        for (const { value } of this.getRepresentativePreloadingAttempts(null)) {
            for (const ruleSetId of [null, ...value.ruleSetIds]) {
                if (countsByRuleSetId.get(ruleSetId) === undefined) {
                    countsByRuleSetId.set(ruleSetId, new Map());
                }
                const countsByStatus = countsByRuleSetId.get(ruleSetId);
                assertNotNullOrUndefined(countsByStatus);
                const i = countsByStatus.get(value.status) || 0;
                countsByStatus.set(value.status, i + 1);
            }
        }
        return countsByRuleSetId;
    }
    // Returns a preloading attempt of the current page.
    //
    // Returns reference. Don't save returned values.
    // Returned value may or may not be updated as the time grows.
    getPreloadingAttemptById(id) {
        const document = this.currentDocument();
        if (document === null) {
            return null;
        }
        return document.preloadingAttempts.getById(id, document.sources) || null;
    }
    // Returs preloading attempts of the current page that triggered by the rule set with `ruleSetId`.
    // `ruleSetId === null` means "do not filter".
    //
    // Returns array of pairs of id and reference. Don't save returned references.
    // Returned values may or may not be updated as the time grows.
    getRepresentativePreloadingAttempts(ruleSetId) {
        const document = this.currentDocument();
        if (document === null) {
            return [];
        }
        return document.preloadingAttempts.getAllRepresentative(ruleSetId, document.sources);
    }
    // Returs preloading attempts of the previousPgae.
    //
    // Returns array of pairs of id and reference. Don't save returned references.
    // Returned values may or may not be updated as the time grows.
    getRepresentativePreloadingAttemptsOfPreviousPage() {
        if (this.loaderIds.length <= 1) {
            return [];
        }
        const document = this.documents.get(this.loaderIds[this.loaderIds.length - 2]);
        if (document === undefined) {
            return [];
        }
        return document.preloadingAttempts.getAllRepresentative(null, document.sources);
    }
    // Precondition: `pipelineId` should exists.
    // Postcondition: The return value is not empty.
    getPipelineById(pipelineId) {
        const document = this.currentDocument();
        if (document === null) {
            return null;
        }
        return document.preloadingAttempts.getPipeline(pipelineId, document.sources);
    }
    // Returns attemtps that are sit in the same preload pipeline.
    getPipeline(attempt) {
        let pipelineNullable = null;
        if (attempt.pipelineId !== null) {
            pipelineNullable = this.getPipelineById(attempt.pipelineId);
        }
        if (pipelineNullable === null) {
            const pipeline = new Map();
            pipeline.set(attempt.action, attempt);
            return new PreloadPipeline(pipeline);
        }
        return new PreloadPipeline(pipelineNullable);
    }
    onPrimaryPageChanged(event) {
        const { frame, type } = event.data;
        // Model of prerendered page's target will hands over. Do nothing for the initiator page.
        if (this.lastPrimaryPageModel === null && type === "Activation" /* PrimaryPageChangeType.ACTIVATION */) {
            return;
        }
        if (this.lastPrimaryPageModel !== null && type !== "Activation" /* PrimaryPageChangeType.ACTIVATION */) {
            return;
        }
        if (this.lastPrimaryPageModel !== null && type === "Activation" /* PrimaryPageChangeType.ACTIVATION */) {
            // Hand over from the model of the last primary page.
            this.loaderIds = this.lastPrimaryPageModel.loaderIds;
            for (const [loaderId, prev] of this.lastPrimaryPageModel.documents.entries()) {
                this.ensureDocumentPreloadingData(loaderId);
                this.documents.get(loaderId)?.mergePrevious(prev);
            }
        }
        this.lastPrimaryPageModel = null;
        // Note that at this timing ResourceTreeFrame.loaderId is ensured to
        // be non empty and Protocol.Network.LoaderId because it is filled
        // by ResourceTreeFrame.navigate.
        const currentLoaderId = frame.loaderId;
        // Holds histories for two pages at most.
        this.loaderIds.push(currentLoaderId);
        this.loaderIds = this.loaderIds.slice(-2);
        this.ensureDocumentPreloadingData(currentLoaderId);
        for (const loaderId of this.documents.keys()) {
            if (!this.loaderIds.includes(loaderId)) {
                this.documents.delete(loaderId);
            }
        }
        this.dispatchEventToListeners("ModelUpdated" /* Events.MODEL_UPDATED */);
    }
    onRuleSetUpdated(event) {
        const ruleSet = event.ruleSet;
        const loaderId = ruleSet.loaderId;
        this.maybeInferLoaderId(loaderId);
        this.ensureDocumentPreloadingData(loaderId);
        this.documents.get(loaderId)?.ruleSets.upsert(ruleSet);
        this.dispatchEventToListeners("ModelUpdated" /* Events.MODEL_UPDATED */);
    }
    onRuleSetRemoved(event) {
        const id = event.id;
        for (const document of this.documents.values()) {
            document.ruleSets.delete(id);
        }
        this.dispatchEventToListeners("ModelUpdated" /* Events.MODEL_UPDATED */);
    }
    onPreloadingAttemptSourcesUpdated(event) {
        const loaderId = event.loaderId;
        this.ensureDocumentPreloadingData(loaderId);
        const document = this.documents.get(loaderId);
        if (document === undefined) {
            return;
        }
        document.sources.update(event.preloadingAttemptSources);
        document.preloadingAttempts.maybeRegisterNotTriggered(document.sources);
        document.preloadingAttempts.cleanUpRemovedAttempts(document.sources);
        this.dispatchEventToListeners("ModelUpdated" /* Events.MODEL_UPDATED */);
    }
    onPrefetchStatusUpdated(event) {
        // We ignore this event to avoid reinserting an attempt after it was removed by
        // onPreloadingAttemptSourcesUpdated.
        if (event.prefetchStatus === "PrefetchEvictedAfterCandidateRemoved" /* Protocol.Preload.PrefetchStatus.PrefetchEvictedAfterCandidateRemoved */) {
            return;
        }
        const loaderId = event.key.loaderId;
        this.ensureDocumentPreloadingData(loaderId);
        const attempt = {
            action: "Prefetch" /* Protocol.Preload.SpeculationAction.Prefetch */,
            key: event.key,
            pipelineId: event.pipelineId,
            status: convertPreloadingStatus(event.status),
            prefetchStatus: event.prefetchStatus || null,
            requestId: event.requestId,
        };
        this.documents.get(loaderId)?.preloadingAttempts.upsert(attempt);
        this.dispatchEventToListeners("ModelUpdated" /* Events.MODEL_UPDATED */);
    }
    onPrerenderStatusUpdated(event) {
        const loaderId = event.key.loaderId;
        this.ensureDocumentPreloadingData(loaderId);
        let attempt;
        switch (event.key.action) {
            case "Prerender" /* Protocol.Preload.SpeculationAction.Prerender */:
                attempt = {
                    action: event.key.action,
                    key: event.key,
                    pipelineId: event.pipelineId,
                    status: convertPreloadingStatus(event.status),
                    prerenderStatus: event.prerenderStatus || null,
                    disallowedMojoInterface: event.disallowedMojoInterface || null,
                    mismatchedHeaders: event.mismatchedHeaders || null,
                };
                break;
            case "PrerenderUntilScript" /* Protocol.Preload.SpeculationAction.PrerenderUntilScript */:
                attempt = {
                    action: event.key.action,
                    key: event.key,
                    pipelineId: event.pipelineId,
                    status: convertPreloadingStatus(event.status),
                    prerenderStatus: event.prerenderStatus || null,
                    disallowedMojoInterface: event.disallowedMojoInterface || null,
                    mismatchedHeaders: event.mismatchedHeaders || null,
                };
                break;
            default:
                throw new Error(`unreachable: event.key.action: ${event.key.action}`);
        }
        this.documents.get(loaderId)?.preloadingAttempts.upsert(attempt);
        this.dispatchEventToListeners("ModelUpdated" /* Events.MODEL_UPDATED */);
    }
    onPreloadEnabledStateUpdated(event) {
        this.dispatchEventToListeners("WarningsUpdated" /* Events.WARNINGS_UPDATED */, event);
    }
}
SDKModel.register(PreloadingModel, { capabilities: 2 /* Capability.DOM */, autostart: false });
export var Events;
(function (Events) {
    Events["MODEL_UPDATED"] = "ModelUpdated";
    Events["WARNINGS_UPDATED"] = "WarningsUpdated";
})(Events || (Events = {}));
class PreloadDispatcher {
    model;
    constructor(model) {
        this.model = model;
    }
    ruleSetUpdated(event) {
        this.model.onRuleSetUpdated(event);
    }
    ruleSetRemoved(event) {
        this.model.onRuleSetRemoved(event);
    }
    preloadingAttemptSourcesUpdated(event) {
        this.model.onPreloadingAttemptSourcesUpdated(event);
    }
    prefetchStatusUpdated(event) {
        this.model.onPrefetchStatusUpdated(event);
    }
    prerenderStatusUpdated(event) {
        this.model.onPrerenderStatusUpdated(event);
    }
    preloadEnabledStateUpdated(event) {
        void this.model.onPreloadEnabledStateUpdated(event);
    }
}
class DocumentPreloadingData {
    ruleSets = new RuleSetRegistry();
    preloadingAttempts = new PreloadingAttemptRegistry();
    sources = new SourceRegistry();
    mergePrevious(prev) {
        // Note that CDP events Preload.ruleSetUpdated/Deleted and
        // Preload.preloadingAttemptSourcesUpdated with a loaderId are emitted to target that bounded to
        // a document with the loaderId. On the other hand, prerendering activation changes targets
        // of Preload.prefetch/prerenderStatusUpdated, i.e. activated page receives those events for
        // triggering outcome "Success".
        if (!this.ruleSets.isEmpty() || !this.sources.isEmpty()) {
            throw new Error('unreachable');
        }
        this.ruleSets = prev.ruleSets;
        this.preloadingAttempts.mergePrevious(prev.preloadingAttempts);
        this.sources = prev.sources;
    }
}
class RuleSetRegistry {
    map = new Map();
    isEmpty() {
        return this.map.size === 0;
    }
    // Returns reference. Don't save returned values.
    // Returned values may or may not be updated as the time grows.
    getById(id) {
        return this.map.get(id) || null;
    }
    // Returns reference. Don't save returned values.
    // Returned values may or may not be updated as the time grows.
    getAll() {
        return Array.from(this.map.entries()).map(([id, value]) => ({ id, value }));
    }
    upsert(ruleSet) {
        this.map.set(ruleSet.id, ruleSet);
    }
    delete(id) {
        this.map.delete(id);
    }
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
export var PreloadingStatus;
(function (PreloadingStatus) {
    PreloadingStatus["NOT_TRIGGERED"] = "NotTriggered";
    PreloadingStatus["PENDING"] = "Pending";
    PreloadingStatus["RUNNING"] = "Running";
    PreloadingStatus["READY"] = "Ready";
    PreloadingStatus["SUCCESS"] = "Success";
    PreloadingStatus["FAILURE"] = "Failure";
    PreloadingStatus["NOT_SUPPORTED"] = "NotSupported";
})(PreloadingStatus || (PreloadingStatus = {}));
function convertPreloadingStatus(status) {
    switch (status) {
        case "Pending" /* Protocol.Preload.PreloadingStatus.Pending */:
            return "Pending" /* PreloadingStatus.PENDING */;
        case "Running" /* Protocol.Preload.PreloadingStatus.Running */:
            return "Running" /* PreloadingStatus.RUNNING */;
        case "Ready" /* Protocol.Preload.PreloadingStatus.Ready */:
            return "Ready" /* PreloadingStatus.READY */;
        case "Success" /* Protocol.Preload.PreloadingStatus.Success */:
            return "Success" /* PreloadingStatus.SUCCESS */;
        case "Failure" /* Protocol.Preload.PreloadingStatus.Failure */:
            return "Failure" /* PreloadingStatus.FAILURE */;
        case "NotSupported" /* Protocol.Preload.PreloadingStatus.NotSupported */:
            return "NotSupported" /* PreloadingStatus.NOT_SUPPORTED */;
    }
    throw new Error('unreachable');
}
function makePreloadingAttemptId(key) {
    let action;
    switch (key.action) {
        case "Prefetch" /* Protocol.Preload.SpeculationAction.Prefetch */:
            action = 'Prefetch';
            break;
        case "Prerender" /* Protocol.Preload.SpeculationAction.Prerender */:
            action = 'Prerender';
            break;
        case "PrerenderUntilScript" /* Protocol.Preload.SpeculationAction.PrerenderUntilScript */:
            action = 'PrerenderUntilScript';
            break;
    }
    let targetHint;
    switch (key.targetHint) {
        case undefined:
            targetHint = 'undefined';
            break;
        case "Blank" /* Protocol.Preload.SpeculationTargetHint.Blank */:
            targetHint = 'Blank';
            break;
        case "Self" /* Protocol.Preload.SpeculationTargetHint.Self */:
            targetHint = 'Self';
            break;
    }
    return `${key.loaderId}:${action}:${key.url}:${targetHint}:${key.formSubmission ? 'formSubmission' : 'undefined'}`;
}
export class PreloadPipeline {
    inner;
    constructor(inner) {
        if (inner.size === 0) {
            throw new Error('unreachable');
        }
        this.inner = inner;
    }
    static newFromAttemptsForTesting(attempts) {
        const inner = new Map();
        for (const attempt of attempts) {
            inner.set(attempt.action, attempt);
        }
        return new PreloadPipeline(inner);
    }
    getOriginallyTriggered() {
        const attempt = this.getPrerender() || this.getPrerenderUntilScript() || this.getPrefetch();
        assertNotNullOrUndefined(attempt);
        return attempt;
    }
    getPrefetch() {
        return this.inner.get("Prefetch" /* Protocol.Preload.SpeculationAction.Prefetch */) || null;
    }
    getPrerender() {
        return this.inner.get("Prerender" /* Protocol.Preload.SpeculationAction.Prerender */) || null;
    }
    getPrerenderUntilScript() {
        return this.inner.get("PrerenderUntilScript" /* Protocol.Preload.SpeculationAction.PrerenderUntilScript */) || null;
    }
    // Returns attempts in the order: prefetch < prerender_until_script < prerender.
    // Currently unused.
    getAttempts() {
        const ret = [];
        const prefetch = this.getPrefetch();
        if (prefetch !== null) {
            ret.push(prefetch);
        }
        const prerender = this.getPrerender();
        if (prerender !== null) {
            ret.push(prerender);
        }
        const prerenderUntilScript = this.getPrerenderUntilScript();
        if (prerenderUntilScript !== null) {
            ret.push(prerenderUntilScript);
        }
        if (ret.length === 0) {
            throw new Error('unreachable');
        }
        return ret;
    }
}
class PreloadingAttemptRegistry {
    map = new Map();
    pipelines = new Common.MapWithDefault.MapWithDefault();
    enrich(attempt, source) {
        let ruleSetIds = [];
        let nodeIds = [];
        if (source !== null) {
            ruleSetIds = source.ruleSetIds;
            nodeIds = source.nodeIds;
        }
        return {
            ...attempt,
            ruleSetIds,
            nodeIds,
        };
    }
    // Returns true iff the attempt is triggered by a SpecRules, not automatically derived.
    //
    // In some cases, browsers automatically triggers preloads. For example, Chrome triggers prefetch
    // ahead of prerender to prevent multiple fetches in case that the prerender failed due to, e.g.
    // use of forbidden mojo APIs. Also, a prerender-until-script attempt triggers prefetch as well,
    // and can upgrade to prerender. Such prefetch, prerender-until-script, and prerender sit in the
    // same preload pipeline.
    //
    // We regard them as not representative and only show the representative ones to represent
    // pipelines.
    isAttemptRepresentative(attempt) {
        function getSortKey(action) {
            switch (action) {
                case "Prefetch" /* Protocol.Preload.SpeculationAction.Prefetch */:
                    return 0;
                case "PrerenderUntilScript" /* Protocol.Preload.SpeculationAction.PrerenderUntilScript */:
                    return 1;
                case "Prerender" /* Protocol.Preload.SpeculationAction.Prerender */:
                    return 2;
            }
        }
        // Attempt with status `NOT_TRIGGERED` is a representative of a pipeline.
        if (attempt.pipelineId === null) {
            return true;
        }
        // Attempt with the strongest action in pipeline is a representative of a pipeline.
        // Order: prefetch < prerender.
        const pipeline = this.pipelines.get(attempt.pipelineId);
        assertNotNullOrUndefined(pipeline);
        if (pipeline.size === 0) {
            throw new Error('unreachable');
        }
        return [...pipeline.keys()].every(action => getSortKey(action) <= getSortKey(attempt.action));
    }
    // Returns reference. Don't save returned values.
    // Returned values may or may not be updated as the time grows.
    getById(id, sources) {
        const attempt = this.map.get(id) || null;
        if (attempt === null) {
            return null;
        }
        return this.enrich(attempt, sources.getById(id));
    }
    // Returns representative preloading attempts that triggered by the rule set with `ruleSetId`.
    // `ruleSetId === null` means "do not filter".
    //
    // Returns reference. Don't save returned values.
    // Returned values may or may not be updated as the time grows.
    getAllRepresentative(ruleSetId, sources) {
        return [...this.map.entries()]
            .map(([id, value]) => ({
            id,
            value: this.enrich(value, sources.getById(id)),
        }))
            .filter(({ value }) => !ruleSetId || value.ruleSetIds.includes(ruleSetId))
            .filter(({ value }) => this.isAttemptRepresentative(value));
    }
    getPipeline(pipelineId, sources) {
        const pipeline = this.pipelines.get(pipelineId);
        if (pipeline === undefined || pipeline.size === 0) {
            return null;
        }
        const map = {};
        for (const [id, attempt] of this.map.entries()) {
            map[id] = attempt;
        }
        return new Map(pipeline.entries().map(([action, id]) => {
            const attempt = this.getById(id, sources);
            assertNotNullOrUndefined(attempt);
            return [action, attempt];
        }));
    }
    upsert(attempt) {
        const id = makePreloadingAttemptId(attempt.key);
        this.map.set(id, attempt);
        if (attempt.pipelineId !== null) {
            this.pipelines.getOrInsertComputed(attempt.pipelineId, () => new Map()).set(attempt.action, id);
        }
    }
    reconstructPipelines() {
        this.pipelines.clear();
        for (const [id, attempt] of this.map.entries()) {
            if (attempt.pipelineId === null) {
                continue;
            }
            const pipeline = this.pipelines.getOrInsertComputed(attempt.pipelineId, () => new Map());
            pipeline.set(attempt.action, id);
        }
    }
    // Speculation rules emits a CDP event Preload.preloadingAttemptSourcesUpdated
    // and an IPC SpeculationHost::UpdateSpeculationCandidates. The latter emits
    // Preload.prefetch/prerenderAttemptUpdated for each preload attempt triggered.
    // In general, "Not triggered to triggered" period is short (resp. long) for
    // eager (resp. non-eager) preloads. For not yet emitted ones, we fill
    // "Not triggered" preload attempts and show them.
    maybeRegisterNotTriggered(sources) {
        for (const [id, { key }] of sources.entries()) {
            if (this.map.get(id) !== undefined) {
                continue;
            }
            let attempt;
            switch (key.action) {
                case "Prefetch" /* Protocol.Preload.SpeculationAction.Prefetch */:
                    attempt = {
                        action: "Prefetch" /* Protocol.Preload.SpeculationAction.Prefetch */,
                        key,
                        pipelineId: null,
                        status: "NotTriggered" /* PreloadingStatus.NOT_TRIGGERED */,
                        prefetchStatus: null,
                        // Fill invalid request id.
                        requestId: '',
                    };
                    break;
                case "Prerender" /* Protocol.Preload.SpeculationAction.Prerender */:
                    attempt = {
                        action: "Prerender" /* Protocol.Preload.SpeculationAction.Prerender */,
                        key,
                        pipelineId: null,
                        status: "NotTriggered" /* PreloadingStatus.NOT_TRIGGERED */,
                        prerenderStatus: null,
                        disallowedMojoInterface: null,
                        mismatchedHeaders: null,
                    };
                    break;
                case "PrerenderUntilScript" /* Protocol.Preload.SpeculationAction.PrerenderUntilScript */:
                    attempt = {
                        action: "PrerenderUntilScript" /* Protocol.Preload.SpeculationAction.PrerenderUntilScript */,
                        key,
                        pipelineId: null,
                        status: "NotTriggered" /* PreloadingStatus.NOT_TRIGGERED */,
                        prerenderStatus: null,
                        disallowedMojoInterface: null,
                        mismatchedHeaders: null,
                    };
                    break;
            }
            this.map.set(id, attempt);
        }
    }
    // Removes keys in `this.map` that are not in `sources`. This is used to
    // remove attempts that no longer have a matching speculation rule.
    cleanUpRemovedAttempts(sources) {
        const keysToRemove = Array.from(this.map.keys())
            .filter(key => !sources.getById(key));
        for (const key of keysToRemove) {
            this.map.delete(key);
        }
        this.reconstructPipelines();
    }
    mergePrevious(prev) {
        for (const [id, attempt] of this.map.entries()) {
            prev.map.set(id, attempt);
        }
        this.map = prev.map;
        this.reconstructPipelines();
    }
}
class SourceRegistry {
    map = new Map();
    entries() {
        return this.map.entries();
    }
    isEmpty() {
        return this.map.size === 0;
    }
    getById(id) {
        return this.map.get(id) || null;
    }
    update(sources) {
        this.map = new Map(sources.map(s => [makePreloadingAttemptId(s.key), s]));
    }
}
//# sourceMappingURL=PreloadingModel.js.map