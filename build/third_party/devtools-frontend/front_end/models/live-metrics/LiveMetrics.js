// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as EmulationModel from '../../models/emulation/emulation.js';
import * as CrUXManager from '../crux-manager/crux-manager.js';
import * as Spec from './web-vitals-injected/spec/spec.js';
export const timelineEnableSoftNavigationsSettingDescriptor = {
    name: 'timeline-enable-soft-navigations',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
    defaultValue: true,
};
const UIStrings = {
    /**
     * @description Warning text indicating that the Largest Contentful Paint (LCP) performance metric was affected by the user changing the simulated device.
     */
    lcpEmulationWarning: 'Simulating a device after the page loads can affect LCP. Reload the page for accurate LCP.',
    /**
     * @description Warning text indicating that the Largest Contentful Paint (LCP) performance metric was affected by the page loading in the background.
     */
    lcpVisibilityWarning: 'LCP may be inflated because the page started loading in the background',
};
const str_ = i18n.i18n.registerUIStrings('models/live-metrics/LiveMetrics.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const LIVE_METRICS_WORLD_NAME = 'DevTools Performance Metrics';
class InjectedScript {
    static #injectedScript;
    static async get() {
        if (!this.#injectedScript) {
            const url = new URL('./web-vitals-injected/web-vitals-injected.generated.js', import.meta.url);
            this.#injectedScript = await Platform.HostRuntime.HOST_RUNTIME.loadTextFile(url);
        }
        return this.#injectedScript;
    }
}
export class LiveMetrics extends Common.ObjectWrapper.ObjectWrapper {
    #enabled = false;
    #isCollectingMetrics = false;
    #target;
    #scriptIdentifier;
    #lastResetContextId;
    #lcpValue;
    #clsValue;
    #inpValue;
    #interactions = new Map();
    #interactionsByGroupId = new Map();
    #layoutShifts = [];
    #navigationType;
    #lastEmulationChangeTime;
    #mutex = new Common.Mutex.Mutex();
    #targetManager;
    #deviceModeModel;
    #settings;
    constructor(targetManager, settings, deviceModeModel) {
        super();
        this.#targetManager = targetManager;
        this.#settings = settings;
        this.#deviceModeModel = deviceModeModel;
        this.#targetManager.observeTargets(this, { scoped: true });
        this.#targetManager.addModelListener(SDK.ResourceTreeModel.ResourceTreeModel, SDK.ResourceTreeModel.Events.PrimaryPageChanged, this.#onPrimaryPageChanged, this);
        this.#settings.resolve(timelineEnableSoftNavigationsSettingDescriptor)
            .addChangeListener(this.#onSettingChanged, this);
    }
    #onPrimaryPageChanged(event) {
        const primaryTarget = this.#targetManager.primaryPageTarget();
        if (!primaryTarget) {
            return;
        }
        if (primaryTarget !== this.#target || event.data.type === "Activation" /* SDK.ResourceTreeModel.PrimaryPageChangeType.ACTIVATION */) {
            // Primary target changed or prerender activated. Switch to it and reset metrics.
            this.#clearMetrics();
            this.#sendStatusUpdate();
            void this.#switchToTarget(primaryTarget);
        }
    }
    async #switchToTarget(newTarget) {
        if (this.#target) {
            await this.#stopCollectingMetrics();
        }
        this.#target = newTarget;
        await this.#startCollectingMetrics();
    }
    static instance(opts = { forceNew: false }) {
        const { forceNew } = opts;
        if (!Root.DevToolsContext.globalInstance().has(LiveMetrics) || forceNew) {
            Root.DevToolsContext.globalInstance().set(LiveMetrics, 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            new LiveMetrics(SDK.TargetManager.TargetManager.instance(), Common.Settings.Settings.instance(), EmulationModel.DeviceModeModel.DeviceModeModel.tryInstance()));
        }
        return Root.DevToolsContext.globalInstance().get(LiveMetrics);
    }
    get navigationType() {
        return this.#navigationType;
    }
    get lcpValue() {
        return this.#lcpValue;
    }
    get clsValue() {
        return this.#clsValue;
    }
    get inpValue() {
        return this.#inpValue;
    }
    get interactions() {
        return this.#interactions;
    }
    get layoutShifts() {
        return this.#layoutShifts;
    }
    /**
     * Will create a log message describing the interaction's LoAF scripts.
     * Returns true if the message is successfully logged.
     */
    async logInteractionScripts(interaction) {
        if (!this.#target) {
            return false;
        }
        const executionContextId = this.#lastResetContextId;
        if (!executionContextId) {
            return false;
        }
        // Validate duration at runtime to prevent code injection via interpolation.
        const duration = Number(interaction.duration);
        if (!Number.isFinite(duration)) {
            return false;
        }
        // JSON.stringify escapes quotes. We concatenate safeInteractionType (which is
        // wrapped in double quotes) instead of interpolating it directly inside the
        // single-quoted template below. This avoids syntax errors if the value contains
        // single quotes (e.g. "pointer'"), which would otherwise terminate the
        // single-quoted template string.
        const safeInteractionType = JSON.stringify(interaction.interactionType ?? 'unknown');
        const scriptsTable = [];
        for (const loaf of interaction.longAnimationFrameTimings) {
            for (const script of loaf.scripts) {
                const scriptEndTime = script.startTime + script.duration;
                if (scriptEndTime < interaction.startTime) {
                    continue;
                }
                const blockingDuration = Math.round(scriptEndTime - Math.max(interaction.startTime, script.startTime));
                // TODO: Use translated strings for the table
                scriptsTable.push({
                    'Blocking duration': blockingDuration,
                    'Invoker type': script.invokerType || null,
                    Invoker: script.invoker || null,
                    Function: script.sourceFunctionName || null,
                    Source: script.sourceURL || null,
                    'Char position': script.sourceCharPosition || null,
                });
            }
        }
        try {
            const scriptsLimit = Spec.LOAF_LIMIT * Spec.SCRIPTS_PER_LOAF_LIMIT;
            const scriptLimitText = scriptsTable.length === scriptsLimit ? ` (limited to ${scriptsLimit})` : '';
            const loafLimitText = interaction.longAnimationFrameTimings.length === Spec.LOAF_LIMIT ?
                ` (limited to last ${Spec.LOAF_LIMIT})` :
                '';
            await this.#target.runtimeAgent().invoke_evaluate({
                expression: `
          console.group('[DevTools] Long animation frames for ${duration}ms ' + ${safeInteractionType} + ' interaction');
          console.log('Scripts${scriptLimitText}:');
          console.table(${JSON.stringify(scriptsTable)});
          console.log('Intersecting long animation frame events${loafLimitText}:', ${JSON.stringify(interaction.longAnimationFrameTimings)});
          console.groupEnd();
        `,
                contextId: executionContextId,
            });
        }
        catch {
            return false;
        }
        return true;
    }
    #onEmulationChanged() {
        this.#lastEmulationChangeTime = Date.now();
    }
    /**
     * DOM nodes can't be sent over a runtime binding, so we have to retrieve
     * them separately.
     */
    async #resolveNodeRef(index, executionContextId) {
        // Validate index at runtime because the payload comes from an untrusted binding
        // and could contain malicious strings if type casted.
        if (!Number.isInteger(index)) {
            return null;
        }
        if (!this.#target) {
            return null;
        }
        const runtimeModel = this.#target.model(SDK.RuntimeModel.RuntimeModel);
        if (!runtimeModel) {
            return null;
        }
        const domModel = this.#target.model(SDK.DOMModel.DOMModel);
        if (!domModel) {
            return null;
        }
        const { result } = await this.#target.runtimeAgent().invoke_evaluate({
            expression: `window.getNodeForIndex(${index})`,
            contextId: executionContextId,
        });
        if (!result) {
            return null;
        }
        let remoteObject;
        try {
            remoteObject = runtimeModel.createRemoteObject(result);
            const node = await domModel.pushObjectAsNodeToFrontend(remoteObject);
            if (!node) {
                return null;
            }
            return node;
        }
        catch {
            return null;
        }
        finally {
            remoteObject?.release();
        }
    }
    #sendStatusUpdate() {
        this.dispatchEventToListeners("status" /* Events.STATUS */, {
            lcp: this.#lcpValue,
            cls: this.#clsValue,
            inp: this.#inpValue,
            interactions: this.#interactions,
            layoutShifts: this.#layoutShifts,
            navigationType: this.#navigationType,
        });
    }
    setStatusForTesting(status) {
        this.#lcpValue = status.lcp;
        this.#clsValue = status.cls;
        this.#inpValue = status.inp;
        this.#interactions = status.interactions;
        this.#layoutShifts = status.layoutShifts;
        this.#navigationType = status.navigationType;
        this.#sendStatusUpdate();
    }
    /**
     * If there is a document update then any node handles we have already resolved will be invalid.
     * This function should re-resolve any relevant DOM nodes after a document update.
     */
    async #onDocumentUpdate(event) {
        const domModel = event.data;
        const toRefresh = [
            this.#lcpValue?.nodeRef,
            ...this.#interactions.values().map(i => i.nodeRef),
            ...this.#layoutShifts.flatMap(shift => shift.affectedNodeRefs),
        ].filter(nodeRef => !!nodeRef);
        const idsToRefresh = new Set(toRefresh.map(nodeRef => nodeRef.backendNodeId()));
        const nodes = await domModel.pushNodesByBackendIdsToFrontend(idsToRefresh);
        if (!nodes) {
            return;
        }
        for (let i = 0; i < toRefresh.length; i++) {
            const refreshedNode = nodes.get(toRefresh[i].backendNodeId());
            // It is possible for the refreshed node to be undefined even though it was defined previously.
            // We should keep the affected nodes consistent from the user perspective, so we will just keep the stale node instead of removing it.
            if (!refreshedNode) {
                continue;
            }
            toRefresh[i] = refreshedNode;
        }
        this.#sendStatusUpdate();
    }
    async #handleWebVitalsEvent(webVitalsEvent, executionContextId) {
        switch (webVitalsEvent.name) {
            case 'LCP': {
                const warnings = [];
                const lcpEvent = {
                    value: webVitalsEvent.value,
                    subparts: webVitalsEvent.subparts,
                    warnings,
                };
                if (webVitalsEvent.nodeIndex !== undefined) {
                    const nodeRef = await this.#resolveNodeRef(webVitalsEvent.nodeIndex, executionContextId);
                    if (nodeRef) {
                        lcpEvent.nodeRef = nodeRef;
                    }
                }
                if (this.#lastEmulationChangeTime && Date.now() - this.#lastEmulationChangeTime < 500) {
                    warnings.push(i18nString(UIStrings.lcpEmulationWarning));
                }
                if (webVitalsEvent.startedHidden) {
                    warnings.push(i18nString(UIStrings.lcpVisibilityWarning));
                }
                this.#lcpValue = lcpEvent;
                break;
            }
            case 'CLS': {
                const event = {
                    value: webVitalsEvent.value,
                    clusterShiftIds: webVitalsEvent.clusterShiftIds,
                };
                this.#clsValue = event;
                break;
            }
            case 'INP': {
                const inpEvent = {
                    value: webVitalsEvent.value,
                    subparts: webVitalsEvent.subparts,
                    // Use our own "interactionId" rather than the Chrome/web-vitals
                    // provided one, so we can group events with same start time
                    // (e.g. `pointerup` and `click` are one interaction log entry)
                    interactionId: webVitalsEvent.entryGroupId !== undefined && webVitalsEvent.startTime !== undefined ?
                        `interaction-${webVitalsEvent.entryGroupId}-${webVitalsEvent.startTime}` :
                        undefined,
                };
                this.#inpValue = inpEvent;
                break;
            }
            case 'InteractionEntry': {
                if (webVitalsEvent.entryGroupId === undefined || webVitalsEvent.startTime === undefined) {
                    break;
                }
                const groupInteractions = Platform.MapUtilities.getWithDefault(this.#interactionsByGroupId, webVitalsEvent.entryGroupId, () => []);
                // `nextPaintTime` uses the event duration which is rounded to the nearest 8ms. The best we can do
                // is check if the `nextPaintTime`s are within 8ms. Exclude undefined/null/0 nextPaintTimes.
                // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/duration#event
                let interaction = groupInteractions.find(interaction => interaction.nextPaintTime && webVitalsEvent.nextPaintTime &&
                    Math.abs(interaction.nextPaintTime - webVitalsEvent.nextPaintTime) < 8);
                if (!interaction) {
                    interaction = {
                        // Use our own "interactionId" rather than the Chrome/web-vitals
                        // provided one, so we can group events with same start time
                        // (e.g. `pointerup` and `click` are one interaction log entry)
                        interactionId: `interaction-${webVitalsEvent.entryGroupId}-${webVitalsEvent.startTime}`,
                        interactionType: webVitalsEvent.interactionType,
                        duration: webVitalsEvent.duration,
                        eventNames: [],
                        subparts: webVitalsEvent.subparts,
                        startTime: webVitalsEvent.startTime,
                        nextPaintTime: webVitalsEvent.nextPaintTime,
                        longAnimationFrameTimings: webVitalsEvent.longAnimationFrameEntries,
                    };
                    groupInteractions.push(interaction);
                    this.#interactions.set(interaction.interactionId, interaction);
                }
                // We can get multiple instances of the first input interaction since web-vitals.js installs
                // an extra listener for events of type `first-input`. This is a simple way to de-dupe those
                // events without adding complexity to the injected code.
                if (webVitalsEvent.eventName && !interaction.eventNames.includes(webVitalsEvent.eventName)) {
                    interaction.eventNames.push(webVitalsEvent.eventName);
                }
                if (webVitalsEvent.nodeIndex !== undefined) {
                    const node = await this.#resolveNodeRef(webVitalsEvent.nodeIndex, executionContextId);
                    if (node) {
                        interaction.nodeRef = node;
                    }
                }
                break;
            }
            case 'LayoutShift': {
                const nodePromises = webVitalsEvent.affectedNodeIndices.map(nodeIndex => {
                    return this.#resolveNodeRef(nodeIndex, executionContextId);
                });
                const affectedNodes = (await Promise.all(nodePromises)).filter(nodeRef => !!nodeRef);
                const layoutShift = {
                    score: webVitalsEvent.score,
                    uniqueLayoutShiftId: webVitalsEvent.uniqueLayoutShiftId,
                    affectedNodeRefs: affectedNodes,
                };
                this.#layoutShifts.push(layoutShift);
                break;
            }
            case 'reset': {
                this.#clearMetrics();
                this.#navigationType = webVitalsEvent.navigationType;
                if (webVitalsEvent.url) {
                    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
                    CrUXManager.CrUXManager.instance().setMainDocumentURL(webVitalsEvent.url);
                    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
                    void CrUXManager.CrUXManager.instance().refresh();
                }
                break;
            }
        }
        this.#sendStatusUpdate();
    }
    #clearMetrics() {
        this.#lcpValue = undefined;
        this.#clsValue = undefined;
        this.#inpValue = undefined;
        this.#interactions.clear();
        this.#interactionsByGroupId.clear();
        this.#layoutShifts = [];
        this.#navigationType = undefined;
    }
    #isPrimaryFrameExecutionContext(executionContextId) {
        if (!this.#target) {
            return false;
        }
        const runtimeModel = this.#target.model(SDK.RuntimeModel.RuntimeModel);
        const executionContext = runtimeModel?.executionContext(executionContextId);
        if (!executionContext?.frameId) {
            return false;
        }
        const resourceTreeModel = this.#target.model(SDK.ResourceTreeModel.ResourceTreeModel);
        const primaryFrameId = resourceTreeModel?.mainFrame?.id;
        // Ensure the context belongs to our isolated world and is not the default
        // page context, to prevent the page from spoofing events.
        return Boolean(primaryFrameId && executionContext.frameId === primaryFrameId &&
            executionContext.name === LIVE_METRICS_WORLD_NAME && !executionContext.isDefault);
    }
    async #onBindingCalled(event) {
        const { data } = event;
        if (data.name !== Spec.EVENT_BINDING_NAME) {
            return;
        }
        // Async tasks can be performed while handling an event (e.g. resolving DOM node)
        // Use a mutex here to ensure the events are handled in the order they are received.
        await this.#mutex.run(async () => {
            const webVitalsEvent = JSON.parse(data.payload);
            if (webVitalsEvent.name === 'reset') {
                if (!this.#isPrimaryFrameExecutionContext(data.executionContextId)) {
                    return;
                }
                this.#lastResetContextId = data.executionContextId;
            }
            if (this.#lastResetContextId !== data.executionContextId) {
                return;
            }
            await this.#handleWebVitalsEvent(webVitalsEvent, data.executionContextId);
        });
    }
    async #killAllLiveMetricContexts() {
        const target = this.#target;
        if (!target) {
            return;
        }
        const runtimeModel = target.model(SDK.RuntimeModel.RuntimeModel);
        if (!runtimeModel) {
            return;
        }
        const killPromises = runtimeModel.executionContexts()
            .filter(e => e.name === LIVE_METRICS_WORLD_NAME && !e.isDefault)
            .map(e => target.runtimeAgent().invoke_evaluate({
            // On the off chance something else creates execution contexts with the exact same name
            // this expression should just be a noop.
            expression: `window?.${Spec.INTERNAL_KILL_SWITCH}?.()`,
            contextId: e.id,
        }));
        await Promise.all(killPromises);
    }
    clearInteractions() {
        this.#interactions.clear();
        this.#interactionsByGroupId.clear();
        this.#sendStatusUpdate();
    }
    clearLayoutShifts() {
        this.#layoutShifts = [];
        this.#sendStatusUpdate();
    }
    async targetAdded(target) {
        // Scoped observers can also receive events for OOPIFs and workers.
        if (target !== this.#targetManager.primaryPageTarget()) {
            return;
        }
        this.#target = target;
        await this.#startCollectingMetrics();
    }
    async targetRemoved(target) {
        // Scoped observers can also receive events for OOPIFs and workers.
        if (target !== this.#target) {
            return;
        }
        await this.#stopCollectingMetrics();
        this.#target = undefined;
    }
    async #injectScript() {
        // Extra check in case the target was removed while we were initializing.
        // It's possible to be halfway-through enabling when the target is removed
        // eg try loading 'devtools://devtools/bundled/devtools_app.html?ws=127.0.0.1:99/blah'
        if (!this.#target) {
            return;
        }
        // If DevTools is closed and reopened, the live metrics context from the previous
        // session will persist. We should ensure any old live metrics contexts are killed
        // before starting a new one.
        await this.#killAllLiveMetricContexts();
        // Remove any old instances of the script
        if (this.#scriptIdentifier) {
            await this.#target.pageAgent().invoke_removeScriptToEvaluateOnNewDocument({
                identifier: this.#scriptIdentifier,
            });
        }
        const softNavsSettingValue = this.#settings.resolve(timelineEnableSoftNavigationsSettingDescriptor).get();
        const source = `window.devToolsReportSoftNavs = ${softNavsSettingValue};\n` + await InjectedScript.get();
        // Inject the script
        const { identifier } = await this.#target.pageAgent().invoke_addScriptToEvaluateOnNewDocument({
            source,
            worldName: LIVE_METRICS_WORLD_NAME,
            runImmediately: true,
        });
        this.#scriptIdentifier = identifier;
    }
    async #onSettingChanged() {
        if (!this.#target || !this.#enabled) {
            return;
        }
        await this.#injectScript();
    }
    async enable() {
        if (this.#enabled) {
            return;
        }
        this.#enabled = true;
        if (this.#target) {
            await this.#startCollectingMetrics();
        }
    }
    async disable() {
        if (!this.#enabled) {
            return;
        }
        this.#enabled = false;
        await this.#stopCollectingMetrics();
    }
    async #startCollectingMetrics() {
        if (Host.InspectorFrontendHost.isUnderTest()) {
            // Enabling this impacts a lot of layout tests; we will work on fixing
            // them but for now it is easier to not run this page in layout tests.
            // b/360064852
            return;
        }
        if (!this.#target || !this.#enabled || this.#isCollectingMetrics) {
            return;
        }
        // Only frame targets will actually give us CWV
        if (this.#target.type() !== SDK.Target.Type.FRAME) {
            return;
        }
        const domModel = this.#target.model(SDK.DOMModel.DOMModel);
        if (!domModel) {
            return;
        }
        domModel.addEventListener(SDK.DOMModel.Events.DocumentUpdated, this.#onDocumentUpdate, this);
        const runtimeModel = this.#target.model(SDK.RuntimeModel.RuntimeModel);
        if (!runtimeModel) {
            return;
        }
        runtimeModel.addEventListener(SDK.RuntimeModel.Events.BindingCalled, this.#onBindingCalled, this);
        await runtimeModel.addBinding({
            name: Spec.EVENT_BINDING_NAME,
            executionContextName: LIVE_METRICS_WORLD_NAME,
        });
        await this.#injectScript();
        this.#deviceModeModel?.addEventListener("Updated" /* EmulationModel.DeviceModeModel.Events.UPDATED */, this.#onEmulationChanged, this);
        this.#isCollectingMetrics = true;
    }
    async #stopCollectingMetrics() {
        if (!this.#target || !this.#isCollectingMetrics) {
            return;
        }
        // Reset to ensure clean state when re-enabling on a new target.
        // See crbug.com/478832430.
        this.#lastResetContextId = undefined;
        await this.#killAllLiveMetricContexts();
        const runtimeModel = this.#target.model(SDK.RuntimeModel.RuntimeModel);
        if (runtimeModel) {
            await runtimeModel.removeBinding({
                name: Spec.EVENT_BINDING_NAME,
            });
            runtimeModel.removeEventListener(SDK.RuntimeModel.Events.BindingCalled, this.#onBindingCalled, this);
        }
        const domModel = this.#target.model(SDK.DOMModel.DOMModel);
        if (domModel) {
            domModel.removeEventListener(SDK.DOMModel.Events.DocumentUpdated, this.#onDocumentUpdate, this);
        }
        if (this.#scriptIdentifier) {
            await this.#target.pageAgent().invoke_removeScriptToEvaluateOnNewDocument({
                identifier: this.#scriptIdentifier,
            });
        }
        this.#scriptIdentifier = undefined;
        this.#deviceModeModel?.removeEventListener("Updated" /* EmulationModel.DeviceModeModel.Events.UPDATED */, this.#onEmulationChanged, this);
        this.#isCollectingMetrics = false;
    }
}
export var Events;
(function (Events) {
    Events["STATUS"] = "status";
})(Events || (Events = {}));
//# sourceMappingURL=LiveMetrics.js.map