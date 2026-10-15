// Copyright 2011 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
var _a;
import * as Common from '../../core/common/common.js';
import { assertNotNullOrUndefined } from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../bindings/bindings.js';
import * as Formatter from '../formatter/formatter.js';
import * as SourceMapScopes from '../source_map_scopes/source_map_scopes.js';
import * as Workspace from '../workspace/workspace.js';
const INITIAL_RESTORE_BREAKPOINT_COUNT = 100;
export class BreakpointManager extends Common.ObjectWrapper.ObjectWrapper {
    storage;
    #workspace;
    targetManager;
    debuggerWorkspaceBinding;
    // For each source code, we remember the list or breakpoints that refer to that UI source code as
    // their home UI source code. This is necessary to correctly remove the UI source code from
    // breakpoints upon receiving the UISourceCodeRemoved event.
    #breakpointsForHomeUISourceCode = new Map();
    // Mapping of UI source codes to all the current breakpoint UI locations. For bound breakpoints,
    // this is all the locations where the breakpoints was bound. For the unbound breakpoints,
    // this is the default locations in the home UI source codes.
    #breakpointsForUISourceCode = new Map();
    #breakpointByStorageId = new Map();
    #updateBindingsCallbacks = [];
    constructor(targetManager, workspace, debuggerWorkspaceBinding, settings, restoreInitialBreakpointCount) {
        super();
        this.#workspace = workspace;
        this.targetManager = targetManager;
        this.debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.storage = new Storage(settings);
        this.storage.mute();
        this.#setInitialBreakpoints(restoreInitialBreakpointCount ?? INITIAL_RESTORE_BREAKPOINT_COUNT);
        this.storage.unmute();
        this.#workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this.uiSourceCodeAdded, this);
        this.#workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeRemoved, this.uiSourceCodeRemoved, this);
        this.#workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, this.projectRemoved, this);
        this.targetManager.observeModels(SDK.DebuggerModel.DebuggerModel, this);
    }
    #setInitialBreakpoints(restoreInitialBreakpointCount) {
        let breakpointsToSkip = this.storage.breakpoints.size - restoreInitialBreakpointCount;
        for (const storageState of this.storage.breakpoints.values()) {
            if (breakpointsToSkip > 0) {
                breakpointsToSkip--;
                continue;
            }
            const storageId = Storage.computeId(storageState);
            const breakpoint = new Breakpoint(this, null, storageState, "RESTORED" /* BreakpointOrigin.OTHER */);
            this.#breakpointByStorageId.set(storageId, breakpoint);
        }
    }
    static instance(opts = {
        forceNew: null,
        targetManager: null,
        workspace: null,
        debuggerWorkspaceBinding: null,
        settings: null,
    }) {
        const { forceNew, targetManager, workspace, debuggerWorkspaceBinding, settings, restoreInitialBreakpointCount } = opts;
        if (!Root.DevToolsContext.globalInstance().has(_a) || forceNew) {
            if (!targetManager || !workspace || !debuggerWorkspaceBinding || !settings) {
                throw new Error(`Unable to create settings: targetManager, workspace, debuggerWorkspaceBinding, and settings must be provided: ${new Error().stack}`);
            }
            Root.DevToolsContext.globalInstance().set(_a, new _a(targetManager, workspace, debuggerWorkspaceBinding, settings, restoreInitialBreakpointCount));
        }
        return Root.DevToolsContext.globalInstance().get(_a);
    }
    modelAdded(debuggerModel) {
        if (Root.Runtime.experiments.isEnabled(Root.ExperimentNames.ExperimentName.INSTRUMENTATION_BREAKPOINTS)) {
            debuggerModel.setSynchronizeBreakpointsCallback(this.restoreBreakpointsForScript.bind(this));
        }
    }
    modelRemoved(debuggerModel) {
        debuggerModel.setSynchronizeBreakpointsCallback(null);
    }
    addUpdateBindingsCallback(callback) {
        this.#updateBindingsCallbacks.push(callback);
    }
    async copyBreakpoints(fromSourceCode, toSourceCode) {
        const toSourceCodeIsRemoved = toSourceCode.project().uiSourceCodeForURL(toSourceCode.url()) !== toSourceCode ||
            this.#workspace.project(toSourceCode.project().id()) !== toSourceCode.project();
        const breakpointItems = this.storage.breakpointItems(fromSourceCode.url(), fromSourceCode.contentType().name());
        for (const item of breakpointItems) {
            if (toSourceCodeIsRemoved) {
                // If the target source code has been detached from the workspace, then no breakpoint should refer
                // to that source code. Let us only update the storage, so that the breakpoints appear once
                // the user binds the file system again.
                this.storage.updateBreakpoint({ ...item, url: toSourceCode.url(), resourceTypeName: toSourceCode.contentType().name() });
            }
            else {
                await this.setBreakpoint(toSourceCode, item.lineNumber, item.columnNumber, item.condition, item.enabled, item.isLogpoint, "RESTORED" /* BreakpointOrigin.OTHER */);
            }
        }
    }
    // This method explicitly awaits the source map (if necessary) and the uiSourceCodes
    // required to set all breakpoints that are related to this script.
    async restoreBreakpointsForScript(script) {
        if (!Root.Runtime.experiments.isEnabled(Root.ExperimentNames.ExperimentName.INSTRUMENTATION_BREAKPOINTS)) {
            return;
        }
        if (!script.sourceURL) {
            return;
        }
        const uiSourceCode = await this.getUISourceCodeWithUpdatedBreakpointInfo(script);
        if (this.#hasBreakpointsForUrl(script.sourceURL)) {
            await this.#restoreBreakpointsForUrl(uiSourceCode);
        }
        const debuggerModel = script.debuggerModel;
        // Handle source maps and the original sources.
        const sourceMap = await debuggerModel.sourceMapManager().sourceMapForClientPromise(script);
        if (sourceMap) {
            for (const sourceURL of sourceMap.sourceURLs()) {
                if (this.#hasBreakpointsForUrl(sourceURL)) {
                    const uiSourceCode = await this.debuggerWorkspaceBinding.uiSourceCodeForSourceMapSourceURLPromise(debuggerModel, sourceURL, script.isContentScript());
                    await this.#restoreBreakpointsForUrl(uiSourceCode);
                }
            }
        }
        // Handle language plugins
        const { pluginManager } = this.debuggerWorkspaceBinding;
        const sourceUrls = await pluginManager.getSourcesForScript(script);
        if (Array.isArray(sourceUrls)) {
            for (const sourceURL of sourceUrls) {
                if (this.#hasBreakpointsForUrl(sourceURL)) {
                    const uiSourceCode = await this.debuggerWorkspaceBinding.uiSourceCodeForDebuggerLanguagePluginSourceURLPromise(debuggerModel, sourceURL);
                    assertNotNullOrUndefined(uiSourceCode);
                    await this.#restoreBreakpointsForUrl(uiSourceCode);
                }
            }
        }
    }
    async getUISourceCodeWithUpdatedBreakpointInfo(script) {
        const uiSourceCode = this.debuggerWorkspaceBinding.uiSourceCodeForScript(script);
        assertNotNullOrUndefined(uiSourceCode);
        await this.#updateBindings(uiSourceCode);
        return uiSourceCode;
    }
    async #updateBindings(uiSourceCode) {
        if (this.#updateBindingsCallbacks.length > 0) {
            // It's possible to set breakpoints on files on the file system, and to have them
            // hit whenever we navigate to a page that serves that file.
            // To make sure that we have all breakpoint information moved from the file system
            // to the served file, we need to update the bindings and await it. This will
            // move the breakpoints from the FileSystem UISourceCode to the Network UiSourceCode.
            const promises = [];
            for (const callback of this.#updateBindingsCallbacks) {
                promises.push(callback(uiSourceCode));
            }
            await Promise.all(promises);
        }
    }
    async #restoreBreakpointsForUrl(uiSourceCode) {
        this.restoreBreakpoints(uiSourceCode);
        const breakpoints = this.#breakpointByStorageId.values();
        const affectedBreakpoints = Array.from(breakpoints).filter(x => x.uiSourceCodes.has(uiSourceCode));
        // Make sure to properly await their updates
        await Promise.all(affectedBreakpoints.map(bp => bp.updateBreakpoint()));
    }
    #hasBreakpointsForUrl(url) {
        // We intentionally don't specify a resource type here, but just check
        // generally whether there's any breakpoint matching the given `url`.
        const breakpointItems = this.storage.breakpointItems(url);
        return breakpointItems.length > 0;
    }
    static getScriptForInlineUiSourceCode(uiSourceCode) {
        const script = Bindings.DefaultScriptMapping.DefaultScriptMapping.scriptForUISourceCode(uiSourceCode);
        if (script && script.isInlineScript() && !script.hasSourceURL) {
            return script;
        }
        return null;
    }
    // For inline scripts, this function translates the line-column coordinates into the coordinates
    // of the embedding document. For other scripts, it just returns unchanged line-column.
    static breakpointLocationFromUiLocation(uiLocation) {
        const uiSourceCode = uiLocation.uiSourceCode;
        const script = _a.getScriptForInlineUiSourceCode(uiSourceCode);
        const { lineNumber, columnNumber } = script ? script.relativeLocationToRawLocation(uiLocation) : uiLocation;
        return { lineNumber, columnNumber };
    }
    // For inline scripts, this function translates the line-column coordinates of the embedding
    // document into the coordinates of the script. Other UI source code coordinated are not
    // affected.
    static uiLocationFromBreakpointLocation(uiSourceCode, lineNumber, columnNumber) {
        const script = _a.getScriptForInlineUiSourceCode(uiSourceCode);
        if (script) {
            ({ lineNumber, columnNumber } = script.rawLocationToRelativeLocation({ lineNumber, columnNumber }));
        }
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    // Returns true for if the given (raw) position is within the script or if the script
    // is null. This is used to filter breakpoints if a script is known.
    static isValidPositionInScript(lineNumber, columnNumber, script) {
        if (!script) {
            return true;
        }
        if (lineNumber < script.lineOffset || lineNumber > script.endLine) {
            return false;
        }
        if (lineNumber === script.lineOffset && columnNumber && columnNumber < script.columnOffset) {
            return false;
        }
        if (lineNumber === script.endLine && (!columnNumber || columnNumber >= script.endColumn)) {
            return false;
        }
        return true;
    }
    restoreBreakpoints(uiSourceCode) {
        const script = _a.getScriptForInlineUiSourceCode(uiSourceCode);
        const url = script?.sourceURL ?? uiSourceCode.url();
        if (!url) {
            return;
        }
        const contentType = uiSourceCode.contentType();
        this.storage.mute();
        const breakpoints = this.storage.breakpointItems(url, contentType.name());
        for (const breakpoint of breakpoints) {
            const { lineNumber, columnNumber } = breakpoint;
            if (!_a.isValidPositionInScript(lineNumber, columnNumber, script)) {
                continue;
            }
            this.#setBreakpoint(uiSourceCode, lineNumber, columnNumber, breakpoint.condition, breakpoint.enabled, breakpoint.isLogpoint, "RESTORED" /* BreakpointOrigin.OTHER */);
        }
        this.storage.unmute();
    }
    uiSourceCodeAdded(event) {
        const uiSourceCode = event.data;
        this.restoreBreakpoints(uiSourceCode);
    }
    uiSourceCodeRemoved(event) {
        const uiSourceCode = event.data;
        this.removeUISourceCode(uiSourceCode);
    }
    projectRemoved(event) {
        const project = event.data;
        for (const uiSourceCode of project.uiSourceCodes()) {
            this.removeUISourceCode(uiSourceCode);
        }
    }
    removeUISourceCode(uiSourceCode) {
        const breakpoints = this.#getAllBreakpointsForUISourceCode(uiSourceCode);
        breakpoints.forEach(bp => bp.removeUISourceCode(uiSourceCode));
    }
    async setBreakpoint(uiSourceCode, lineNumber, columnNumber, condition, enabled, isLogpoint, origin) {
        // As part of de-duplication, we always only show one uiSourceCode, but we may
        // have several uiSourceCodes that correspond to the same
        // file (but are attached to different targets), so set a breakpoint on all of them.
        const compatibleUiSourceCodes = this.#workspace.findCompatibleUISourceCodes(uiSourceCode);
        let primaryBreakpoint;
        for (const compatibleUiSourceCode of compatibleUiSourceCodes) {
            const uiLocation = new Workspace.UISourceCode.UILocation(compatibleUiSourceCode, lineNumber, columnNumber);
            const normalizedLocation = await this.debuggerWorkspaceBinding.normalizeUILocation(uiLocation);
            const breakpointLocation = _a.breakpointLocationFromUiLocation(normalizedLocation);
            const breakpoint = this.#setBreakpoint(normalizedLocation.uiSourceCode, breakpointLocation.lineNumber, breakpointLocation.columnNumber, condition, enabled, isLogpoint, origin);
            if (uiSourceCode === compatibleUiSourceCode) {
                if (normalizedLocation.id() !== uiLocation.id()) {
                    // Only call this on the uiSourceCode that was initially selected for breakpoint setting.
                    void Common.Revealer.reveal(normalizedLocation);
                }
                primaryBreakpoint = breakpoint;
            }
        }
        console.assert(primaryBreakpoint !== undefined, 'The passed uiSourceCode is expected to be a valid uiSourceCode');
        return primaryBreakpoint;
    }
    #setBreakpoint(uiSourceCode, lineNumber, columnNumber, condition, enabled, isLogpoint, origin) {
        const url = _a.getScriptForInlineUiSourceCode(uiSourceCode)?.sourceURL ?? uiSourceCode.url();
        const resourceTypeName = uiSourceCode.contentType().name();
        const storageState = { url, resourceTypeName, lineNumber, columnNumber, condition, enabled, isLogpoint };
        const storageId = Storage.computeId(storageState);
        let breakpoint = this.#breakpointByStorageId.get(storageId);
        if (breakpoint) {
            breakpoint.updateState(storageState);
            breakpoint.addUISourceCode(uiSourceCode);
            void breakpoint.updateBreakpoint();
            return breakpoint;
        }
        breakpoint = new Breakpoint(this, uiSourceCode, storageState, origin);
        this.#breakpointByStorageId.set(storageId, breakpoint);
        return breakpoint;
    }
    findBreakpoint(uiLocation) {
        const breakpoints = this.#breakpointsForUISourceCode.get(uiLocation.uiSourceCode);
        return breakpoints ? (breakpoints.get(uiLocation.id())) || null : null;
    }
    addHomeUISourceCode(uiSourceCode, breakpoint) {
        let breakpoints = this.#breakpointsForHomeUISourceCode.get(uiSourceCode);
        if (!breakpoints) {
            breakpoints = new Set();
            this.#breakpointsForHomeUISourceCode.set(uiSourceCode, breakpoints);
        }
        breakpoints.add(breakpoint);
    }
    removeHomeUISourceCode(uiSourceCode, breakpoint) {
        const breakpoints = this.#breakpointsForHomeUISourceCode.get(uiSourceCode);
        if (!breakpoints) {
            return;
        }
        breakpoints.delete(breakpoint);
        if (breakpoints.size === 0) {
            this.#breakpointsForHomeUISourceCode.delete(uiSourceCode);
        }
    }
    async possibleBreakpoints(uiSourceCode, textRange) {
        const rawLocationRanges = await this.debuggerWorkspaceBinding.uiLocationRangeToRawLocationRanges(uiSourceCode, textRange);
        const breakLocationLists = await Promise.all(rawLocationRanges.map(({ start, end }) => start.debuggerModel.getPossibleBreakpoints(start, end, /* restrictToFunction */ false)));
        const breakLocations = breakLocationLists.flat();
        const uiLocations = new Map();
        await Promise.all(breakLocations.map(async (breakLocation) => {
            const uiLocation = await this.debuggerWorkspaceBinding.rawLocationToUILocation(breakLocation);
            if (uiLocation === null) {
                return;
            }
            // The "canonical" UI locations don't need to be in our `uiSourceCode`.
            if (uiLocation.uiSourceCode !== uiSourceCode) {
                return;
            }
            // Since we ask for all overlapping ranges above, we might also get breakable locations
            // outside of the `textRange`.
            if (!textRange.containsLocation(uiLocation.lineNumber, uiLocation.columnNumber ?? 0)) {
                return;
            }
            uiLocations.set(uiLocation.id(), uiLocation);
        }));
        return [...uiLocations.values()];
    }
    breakpointLocationsForUISourceCode(uiSourceCode) {
        const breakpoints = this.#breakpointsForUISourceCode.get(uiSourceCode);
        return breakpoints ? Array.from(breakpoints.values()) : [];
    }
    #getAllBreakpointsForUISourceCode(uiSourceCode) {
        const uiBreakpoints = this.breakpointLocationsForUISourceCode(uiSourceCode).map(b => b.breakpoint);
        return uiBreakpoints.concat(Array.from(this.#breakpointsForHomeUISourceCode.get(uiSourceCode) ?? []));
    }
    allBreakpointLocations() {
        const result = [];
        for (const breakpoints of this.#breakpointsForUISourceCode.values()) {
            result.push(...breakpoints.values());
        }
        return result;
    }
    removeBreakpoint(breakpoint, removeFromStorage) {
        const storageId = breakpoint.breakpointStorageId();
        if (removeFromStorage) {
            this.storage.removeBreakpoint(storageId);
        }
        this.#breakpointByStorageId.delete(storageId);
    }
    uiLocationAdded(breakpoint, uiLocation) {
        let breakpoints = this.#breakpointsForUISourceCode.get(uiLocation.uiSourceCode);
        if (!breakpoints) {
            breakpoints = new Map();
            this.#breakpointsForUISourceCode.set(uiLocation.uiSourceCode, breakpoints);
        }
        const breakpointLocation = new BreakpointLocation(breakpoint, uiLocation);
        breakpoints.set(uiLocation.id(), breakpointLocation);
        this.dispatchEventToListeners(Events.BreakpointAdded, breakpointLocation);
    }
    uiLocationRemoved(uiLocation) {
        const breakpoints = this.#breakpointsForUISourceCode.get(uiLocation.uiSourceCode);
        if (!breakpoints) {
            return;
        }
        const breakpointLocation = breakpoints.get(uiLocation.id()) || null;
        if (!breakpointLocation) {
            return;
        }
        breakpoints.delete(uiLocation.id());
        if (breakpoints.size === 0) {
            this.#breakpointsForUISourceCode.delete(uiLocation.uiSourceCode);
        }
        this.dispatchEventToListeners(Events.BreakpointRemoved, breakpointLocation);
    }
    supportsConditionalBreakpoints(uiSourceCode) {
        return this.debuggerWorkspaceBinding.supportsConditionalBreakpoints(uiSourceCode);
    }
}
_a = BreakpointManager;
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["BreakpointAdded"] = "breakpoint-added";
    Events["BreakpointRemoved"] = "breakpoint-removed";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
export class Breakpoint {
    breakpointManager;
    /** Bound locations */
    #uiLocations = new Set();
    /** All known UISourceCodes with this url. This also includes UISourceCodes for the inline scripts embedded in a resource with this URL. */
    uiSourceCodes = new Set();
    #storageState;
    #origin;
    isRemoved = false;
    /**
     * Fallback positions in case a target doesn't have a script where this breakpoint would fit.
     * The `ModelBreakpoint` sends this optimistically to a target in case a matching script is
     * loaded later.
     *
     * Since every `ModelBreakpoint` can read/write this variable, it's slightly arbitrary. In
     * general `lastResolvedState` contains the state of the last `ModelBreakpoint` that attempted
     * to update the breakpoint(s) in the backend.
     *
     * The state gets populated from the storage if/when we set all breakpoints eagerly
     * on debugger startup so that the backend sets the breakpoints as soon as possible
     * (crbug.com/1442232, under a flag).
     */
    #lastResolvedState = null;
    #modelBreakpoints = new Map();
    constructor(breakpointManager, primaryUISourceCode, storageState, origin) {
        this.breakpointManager = breakpointManager;
        this.#origin = origin;
        this.updateState(storageState);
        if (primaryUISourceCode) {
            // User is setting the breakpoint in an existing source.
            console.assert(primaryUISourceCode.contentType().name() === storageState.resourceTypeName);
            this.addUISourceCode(primaryUISourceCode);
        }
        else {
            // We are setting the breakpoint from storage.
            this.#setLastResolvedStateFromStorage(storageState);
        }
        this.breakpointManager.targetManager.observeModels(SDK.DebuggerModel.DebuggerModel, this);
    }
    #setLastResolvedStateFromStorage(storageState) {
        if (storageState.resolvedState) {
            this.#lastResolvedState = storageState.resolvedState.map(s => ({ ...s, scriptHash: '' }));
        }
        else if (storageState.resourceTypeName === Common.ResourceType.resourceTypes.Script.name()) {
            // If we are setting the breakpoint from storage (i.e., primaryUISourceCode is null),
            // and the location is not source mapped, then set the last known state to
            // the state from storage so that the breakpoints are pre-set into the backend eagerly.
            this.#lastResolvedState = [{
                    url: storageState.url,
                    lineNumber: storageState.lineNumber,
                    columnNumber: storageState.columnNumber,
                    scriptHash: '',
                    condition: this.backendCondition(),
                }];
        }
    }
    getLastResolvedState() {
        return this.#lastResolvedState;
    }
    updateLastResolvedState(locations) {
        this.#lastResolvedState = locations;
        let locationsOrUndefined = undefined;
        if (locations) {
            locationsOrUndefined = locations.map(p => ({ url: p.url, lineNumber: p.lineNumber, columnNumber: p.columnNumber, condition: p.condition }));
        }
        if (resolvedStateEqual(this.#storageState.resolvedState, locationsOrUndefined)) {
            return;
        }
        this.#storageState = { ...this.#storageState, resolvedState: locationsOrUndefined };
        this.breakpointManager.storage.updateBreakpoint(this.#storageState);
    }
    get origin() {
        return this.#origin;
    }
    async refreshInDebugger() {
        if (!this.isRemoved) {
            const modelBreakpoints = Array.from(this.#modelBreakpoints.values());
            await Promise.all(modelBreakpoints.map(async (modelBreakpoint) => {
                await modelBreakpoint.resetBreakpoint();
                return await this.#updateModel(modelBreakpoint);
            }));
        }
    }
    modelAdded(debuggerModel) {
        const debuggerWorkspaceBinding = this.breakpointManager.debuggerWorkspaceBinding;
        const modelBreakpoint = new ModelBreakpoint(debuggerModel, this, debuggerWorkspaceBinding);
        this.#modelBreakpoints.set(debuggerModel, modelBreakpoint);
        void this.#updateModel(modelBreakpoint);
        debuggerModel.addEventListener(SDK.DebuggerModel.Events.DebuggerWasEnabled, this.#onDebuggerEnabled, this);
        debuggerModel.addEventListener(SDK.DebuggerModel.Events.DebuggerWasDisabled, this.#onDebuggerDisabled, this);
    }
    modelRemoved(debuggerModel) {
        const modelBreakpoint = this.#modelBreakpoints.get(debuggerModel);
        modelBreakpoint?.cleanUpAfterDebuggerIsGone();
        this.#modelBreakpoints.delete(debuggerModel);
        this.#removeDebuggerModelListeners(debuggerModel);
    }
    #removeDebuggerModelListeners(debuggerModel) {
        debuggerModel.removeEventListener(SDK.DebuggerModel.Events.DebuggerWasEnabled, this.#onDebuggerEnabled, this);
        debuggerModel.removeEventListener(SDK.DebuggerModel.Events.DebuggerWasDisabled, this.#onDebuggerDisabled, this);
    }
    #onDebuggerEnabled(event) {
        const debuggerModel = event.data;
        const model = this.#modelBreakpoints.get(debuggerModel);
        if (model) {
            void this.#updateModel(model);
        }
    }
    #onDebuggerDisabled(event) {
        const debuggerModel = event.data;
        const model = this.#modelBreakpoints.get(debuggerModel);
        model?.cleanUpAfterDebuggerIsGone();
    }
    modelBreakpoint(debuggerModel) {
        return this.#modelBreakpoints.get(debuggerModel);
    }
    addUISourceCode(uiSourceCode) {
        if (!this.uiSourceCodes.has(uiSourceCode)) {
            this.uiSourceCodes.add(uiSourceCode);
            this.breakpointManager.addHomeUISourceCode(uiSourceCode, this);
            if (!this.bound()) {
                this.breakpointManager.uiLocationAdded(this, this.defaultUILocation(uiSourceCode));
            }
        }
    }
    clearUISourceCodes() {
        if (!this.bound()) {
            this.removeAllUnboundLocations();
        }
        for (const uiSourceCode of this.uiSourceCodes) {
            this.removeUISourceCode(uiSourceCode);
        }
    }
    removeUISourceCode(uiSourceCode) {
        if (this.uiSourceCodes.has(uiSourceCode)) {
            this.uiSourceCodes.delete(uiSourceCode);
            this.breakpointManager.removeHomeUISourceCode(uiSourceCode, this);
            if (!this.bound()) {
                this.breakpointManager.uiLocationRemoved(this.defaultUILocation(uiSourceCode));
            }
        }
        // Do we need to do this? Not sure if bound locations will leak...
        if (this.bound()) {
            const removedUILocations = new Map();
            for (const uiLocation of this.#uiLocations) {
                if (uiLocation.uiSourceCode === uiSourceCode) {
                    this.#uiLocations.delete(uiLocation);
                    removedUILocations.set(uiLocation.id(), uiLocation);
                }
            }
            for (const uiLocation of removedUILocations.values()) {
                // Multiple physically distinct UILocations can map to the same logical location
                // (same ID). We only notify the manager if all instances of this logical location are gone.
                const isGoneLogically = !Array.from(this.#uiLocations).some(loc => loc.id() === uiLocation.id());
                if (isGoneLogically) {
                    this.breakpointManager.uiLocationRemoved(uiLocation);
                }
            }
            if (!this.bound() && !this.isRemoved) {
                // Switch to unbound locations
                this.addAllUnboundLocations();
            }
        }
    }
    url() {
        return this.#storageState.url;
    }
    lineNumber() {
        return this.#storageState.lineNumber;
    }
    columnNumber() {
        return this.#storageState.columnNumber;
    }
    uiLocationAdded(uiLocation) {
        if (this.isRemoved) {
            return;
        }
        if (!this.bound()) {
            // This is our first bound location; remove all unbound locations
            this.removeAllUnboundLocations();
        }
        // A single logical breakpoint can resolve to multiple raw locations (e.g. due to
        // inlining or SSR/client template duplication) that map back to the same logical
        // UILocation. We only notify the manager once per logical UILocation to avoid
        // duplicate items/decorations in the UI.
        const isNewLogicalLocation = !Array.from(this.#uiLocations).some(loc => loc.id() === uiLocation.id());
        this.#uiLocations.add(uiLocation);
        if (isNewLogicalLocation) {
            this.breakpointManager.uiLocationAdded(this, uiLocation);
        }
    }
    uiLocationRemoved(uiLocation) {
        if (this.#uiLocations.has(uiLocation)) {
            this.#uiLocations.delete(uiLocation);
            // We only notify the manager if there are no other resolved locations left
            // that map to this same logical UILocation (same ID).
            const isGoneLogically = !Array.from(this.#uiLocations).some(loc => loc.id() === uiLocation.id());
            if (isGoneLogically) {
                this.breakpointManager.uiLocationRemoved(uiLocation);
            }
            if (!this.bound() && !this.isRemoved) {
                this.addAllUnboundLocations();
            }
        }
    }
    enabled() {
        return this.#storageState.enabled;
    }
    bound() {
        return this.#uiLocations.size !== 0;
    }
    getClosestResolvedLocation() {
        if (this.#uiLocations.size === 0) {
            return null;
        }
        let closestLocation = null;
        let minLineDiff = Infinity;
        let minColDiff = Infinity;
        const breakpointLine = this.lineNumber();
        const breakpointColumn = this.columnNumber() ?? 0;
        for (const uiLocation of this.#uiLocations) {
            const lineDiff = Math.abs(uiLocation.lineNumber - breakpointLine);
            const colDiff = Math.abs((uiLocation.columnNumber ?? 0) - breakpointColumn);
            if (lineDiff < minLineDiff) {
                minLineDiff = lineDiff;
                minColDiff = colDiff;
                closestLocation = uiLocation;
            }
            else if (lineDiff === minLineDiff) {
                if (colDiff < minColDiff) {
                    minColDiff = colDiff;
                    closestLocation = uiLocation;
                }
            }
        }
        return closestLocation;
    }
    setEnabled(enabled) {
        this.updateState({ ...this.#storageState, enabled });
    }
    /**
     * The breakpoint condition as entered by the user.
     */
    condition() {
        return this.#storageState.condition;
    }
    backendCondition(location) {
        const condition = this.condition();
        if (condition === '') {
            return '';
        }
        const addSourceUrl = (condition) => {
            let sourceUrl = SDK.DebuggerModel.COND_BREAKPOINT_SOURCE_URL;
            if (this.isLogpoint()) {
                condition = `${LOGPOINT_PREFIX}${condition}${LOGPOINT_SUFFIX}`;
                sourceUrl = SDK.DebuggerModel.LOGPOINT_SOURCE_URL;
            }
            return `${condition}\n\n//# sourceURL=${sourceUrl}`;
        };
        if (location) {
            return SourceMapScopes.NamesResolver
                .allVariablesAtPosition(location, this.breakpointManager.debuggerWorkspaceBinding)
                .then(nameMap => Formatter.FormatterWorkerPool.formatterWorkerPool().javaScriptSubstitute(condition, nameMap))
                .catch(() => condition)
                .then(subsitutedCondition => addSourceUrl(subsitutedCondition), () => addSourceUrl(condition));
        }
        return addSourceUrl(condition);
    }
    setCondition(condition, isLogpoint) {
        this.updateState({ ...this.#storageState, condition, isLogpoint });
    }
    isLogpoint() {
        return this.#storageState.isLogpoint;
    }
    get storageState() {
        return this.#storageState;
    }
    updateState(newState) {
        // Only 'enabled', 'condition' and 'isLogpoint' can change (except during initialization).
        if (this.#storageState &&
            (this.#storageState.url !== newState.url || this.#storageState.lineNumber !== newState.lineNumber ||
                this.#storageState.columnNumber !== newState.columnNumber)) {
            throw new Error('Invalid breakpoint state update');
        }
        if (this.#storageState?.enabled === newState.enabled && this.#storageState?.condition === newState.condition &&
            this.#storageState?.isLogpoint === newState.isLogpoint) {
            return;
        }
        this.#storageState = newState;
        this.breakpointManager.storage.updateBreakpoint(this.#storageState);
        void this.updateBreakpoint();
    }
    async updateBreakpoint() {
        if (!this.bound()) {
            this.removeAllUnboundLocations();
            if (!this.isRemoved) {
                this.addAllUnboundLocations();
            }
        }
        return await this.#updateModels();
    }
    async remove(keepInStorage) {
        if (this.getIsRemoved()) {
            return;
        }
        this.isRemoved = true;
        const removeFromStorage = !keepInStorage;
        for (const debuggerModel of this.#modelBreakpoints.keys()) {
            this.#removeDebuggerModelListeners(debuggerModel);
        }
        await this.#updateModels();
        this.breakpointManager.removeBreakpoint(this, removeFromStorage);
        this.breakpointManager.targetManager.unobserveModels(SDK.DebuggerModel.DebuggerModel, this);
        this.clearUISourceCodes();
    }
    breakpointStorageId() {
        return Storage.computeId(this.#storageState);
    }
    defaultUILocation(uiSourceCode) {
        return BreakpointManager.uiLocationFromBreakpointLocation(uiSourceCode, this.#storageState.lineNumber, this.#storageState.columnNumber);
    }
    removeAllUnboundLocations() {
        for (const uiSourceCode of this.uiSourceCodes) {
            this.breakpointManager.uiLocationRemoved(this.defaultUILocation(uiSourceCode));
        }
    }
    addAllUnboundLocations() {
        for (const uiSourceCode of this.uiSourceCodes) {
            this.breakpointManager.uiLocationAdded(this, this.defaultUILocation(uiSourceCode));
        }
    }
    getUiSourceCodes() {
        return this.uiSourceCodes;
    }
    getIsRemoved() {
        return this.isRemoved;
    }
    async #updateModels() {
        await Promise.all(Array.from(this.#modelBreakpoints.values()).map(model => this.#updateModel(model)));
    }
    async #updateModel(model) {
        const result = await model.scheduleUpdateInDebugger();
        if (result === "ERROR_BACKEND" /* DebuggerUpdateResult.ERROR_BACKEND */) {
            await this.remove(true /* keepInStorage */);
        }
        else if (result === "ERROR_BREAKPOINT_CLASH" /* DebuggerUpdateResult.ERROR_BREAKPOINT_CLASH */) {
            await this.remove(false /* keepInStorage */);
        }
    }
}
/**
 * Represents a single `Breakpoint` for a specific target.
 *
 * The `BreakpointManager` unconditionally creates a `ModelBreakpoint` instance
 * for each target since any target could load a matching script after the fact.
 *
 * Each `ModelBreakpoint` can represent multiple actual breakpoints in V8. E.g.
 * inlining in WASM or multiple bundles containing the same utility function.
 *
 * This means each `Modelbreakpoint` represents 0 to n actual breakpoints in
 * for it's specific target.
 */
export class ModelBreakpoint {
    #debuggerModel;
    #breakpoint;
    #debuggerWorkspaceBinding;
    #liveLocations = new Bindings.LiveLocation.LiveLocationPool();
    #uiLocations = new Map();
    #updateMutex = new Common.Mutex.Mutex();
    #cancelCallback = false;
    #currentState = null;
    #breakpointIds = [];
    constructor(debuggerModel, breakpoint, debuggerWorkspaceBinding) {
        this.#debuggerModel = debuggerModel;
        this.#breakpoint = breakpoint;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
    }
    get currentState() {
        return this.#currentState;
    }
    resetLocations() {
        for (const uiLocation of this.#uiLocations.values()) {
            this.#breakpoint.uiLocationRemoved(uiLocation);
        }
        this.#uiLocations.clear();
        this.#liveLocations.disposeAll();
    }
    async scheduleUpdateInDebugger() {
        if (!this.#debuggerModel.debuggerEnabled()) {
            return "OK" /* DebuggerUpdateResult.OK */;
        }
        const release = await this.#updateMutex.acquire();
        let result = "PENDING" /* DebuggerUpdateResult.PENDING */;
        while (result === "PENDING" /* DebuggerUpdateResult.PENDING */) {
            result = await this.#updateInDebugger();
            // TODO(crbug.com/1229541): This is a mirror to the quickfix
            // in #updateInDebugger. If the model didn't enable yet, instead of
            // spamming the "setBreakpoint" call to the backend, we'll wait for
            // it to finish enabling.
            if (this.#debuggerModel.debuggerEnabled() && !this.#debuggerModel.isReadyToPause()) {
                await this.#debuggerModel.once(SDK.DebuggerModel.Events.DebuggerIsReadyToPause);
                if (!this.#debuggerModel.debuggerEnabled()) {
                    // If the model failed to enable, we won't try to set the breakpoint.
                    result = "OK" /* DebuggerUpdateResult.OK */;
                    break;
                }
            }
        }
        release();
        return result;
    }
    async #updateInDebugger() {
        if (this.#debuggerModel.target().isDisposed()) {
            this.cleanUpAfterDebuggerIsGone();
            return "OK" /* DebuggerUpdateResult.OK */;
        }
        const lineNumber = this.#breakpoint.lineNumber();
        const columnNumber = this.#breakpoint.columnNumber();
        const condition = this.#breakpoint.backendCondition();
        // Calculate the new state.
        let newState = null;
        if (!this.#breakpoint.getIsRemoved() && this.#breakpoint.enabled()) {
            let debuggerLocations = [];
            for (const uiSourceCode of this.#breakpoint.getUiSourceCodes()) {
                const { lineNumber: uiLineNumber, columnNumber: uiColumnNumber } = BreakpointManager.uiLocationFromBreakpointLocation(uiSourceCode, lineNumber, columnNumber);
                const locations = await this.#debuggerWorkspaceBinding.uiLocationToRawLocations(uiSourceCode, uiLineNumber, uiColumnNumber);
                debuggerLocations = locations.filter(location => location.debuggerModel === this.#debuggerModel);
                if (debuggerLocations.length) {
                    break;
                }
            }
            if (debuggerLocations.length && debuggerLocations.every(loc => loc.script())) {
                const positions = await Promise.all(debuggerLocations.map(async (loc) => {
                    const script = loc.script();
                    const condition = await this.#breakpoint.backendCondition(loc);
                    return {
                        url: script.sourceURL,
                        scriptHash: script.hash,
                        lineNumber: loc.lineNumber,
                        columnNumber: loc.columnNumber,
                        condition,
                    };
                }));
                newState = positions.slice(0); // Create a copy
            }
            else if (!Root.Runtime.experiments.isEnabled(Root.ExperimentNames.ExperimentName.INSTRUMENTATION_BREAKPOINTS)) {
                // Use this fallback if we do not have instrumentation breakpoints enabled yet. This currently makes
                // sure that v8 knows about the breakpoint and is able to restore it whenever the script is parsed.
                const lastResolvedState = this.#breakpoint.getLastResolvedState();
                if (lastResolvedState) {
                    // Re-use position information from fallback but use up-to-date condition.
                    newState = lastResolvedState.map(position => ({ ...position, condition }));
                }
                else {
                    // TODO(bmeurer): This fallback doesn't make a whole lot of sense, we should
                    // at least signal a warning to the developer that this #breakpoint wasn't
                    // really resolved.
                    const position = {
                        url: this.#breakpoint.url(),
                        scriptHash: '',
                        lineNumber,
                        columnNumber,
                        condition,
                    };
                    newState = [position];
                }
            }
        }
        const hasBackendState = this.#breakpointIds.length;
        // Case 1: Back-end has some breakpoints and the new state is a proper subset
        // of the back-end state (in particular the new state contains at least a single
        // position, meaning we're not removing the breakpoint completely).
        if (hasBackendState && Breakpoint.State.subset(newState, this.#currentState)) {
            return "OK" /* DebuggerUpdateResult.OK */;
        }
        this.#breakpoint.updateLastResolvedState(newState);
        // Case 2: State has changed, and the back-end has outdated information on old
        // breakpoints.
        if (hasBackendState) {
            // Reset the current state.
            await this.resetBreakpoint();
            // Schedule another run of updates, to finally update to the new state.
            return "PENDING" /* DebuggerUpdateResult.PENDING */;
        }
        // Case 3: State is null (no breakpoints to set), and back-end is up to date
        // (no info on breakpoints).
        if (!newState) {
            return "OK" /* DebuggerUpdateResult.OK */;
        }
        // Case 4: State is not null, so we have breakpoints to set and the back-end
        // has no information on breakpoints yet. Set the breakpoints.
        const { breakpointIds, locations, serverError } = await this.#setBreakpointOnBackend(newState);
        const maybeRescheduleUpdate = serverError && this.#debuggerModel.debuggerEnabled() && !this.#debuggerModel.isReadyToPause();
        if (!breakpointIds.length && maybeRescheduleUpdate) {
            // TODO(crbug.com/1229541): This is a quickfix to prevent #breakpoints from
            // disappearing if the Debugger is actually not enabled
            // yet. This quickfix should be removed as soon as we have a solution
            // to correctly synchronize the front-end with the inspector back-end.
            return "PENDING" /* DebuggerUpdateResult.PENDING */;
        }
        this.#currentState = newState;
        if (this.#cancelCallback) {
            this.#cancelCallback = false;
            return "OK" /* DebuggerUpdateResult.OK */;
        }
        // Something went wrong: we expect to have a non-null state, but have not received any
        // breakpointIds from the back-end.
        if (!breakpointIds.length) {
            return "ERROR_BACKEND" /* DebuggerUpdateResult.ERROR_BACKEND */;
        }
        this.#breakpointIds = breakpointIds;
        this.#breakpointIds.forEach(breakpointId => this.#debuggerModel.addBreakpointListener(breakpointId, this.breakpointResolved, this));
        const resolvedResults = await Promise.all(locations.map(location => this.addResolvedLocation(location)));
        // Breakpoint clash: the resolved location resolves to a different breakpoint, report an error.
        if (resolvedResults.includes("ERROR" /* ResolveLocationResult.ERROR */)) {
            return "ERROR_BREAKPOINT_CLASH" /* DebuggerUpdateResult.ERROR_BREAKPOINT_CLASH */;
        }
        return "OK" /* DebuggerUpdateResult.OK */;
    }
    async #setBreakpointOnBackend(positions) {
        const results = await Promise.all(positions.map(pos => {
            if (pos.url) {
                return this.#debuggerModel.setBreakpointByURL(pos.url, pos.lineNumber, pos.columnNumber, pos.condition);
            }
            return this.#debuggerModel.setBreakpointInAnonymousScript(pos.scriptHash, pos.lineNumber, pos.columnNumber, pos.condition);
        }));
        const breakpointIds = [];
        let locations = [];
        let serverError = false;
        for (const result of results) {
            if (result.breakpointId) {
                breakpointIds.push(result.breakpointId);
                locations = locations.concat(result.locations);
            }
            else {
                serverError = true;
            }
        }
        return { breakpointIds, locations, serverError };
    }
    async resetBreakpoint() {
        if (!this.#breakpointIds.length) {
            return;
        }
        this.resetLocations();
        await Promise.all(this.#breakpointIds.map(id => this.#debuggerModel.removeBreakpoint(id)));
        this.didRemoveFromDebugger();
        this.#currentState = null;
    }
    didRemoveFromDebugger() {
        if (this.#cancelCallback) {
            this.#cancelCallback = false;
            return;
        }
        this.resetLocations();
        this.#breakpointIds.forEach(breakpointId => this.#debuggerModel.removeBreakpointListener(breakpointId, this.breakpointResolved, this));
        this.#breakpointIds = [];
    }
    async breakpointResolved({ data: location }) {
        const result = await this.addResolvedLocation(location);
        if (result === "ERROR" /* ResolveLocationResult.ERROR */) {
            await this.#breakpoint.remove(false /* keepInStorage */);
        }
    }
    async locationUpdated(liveLocation) {
        const oldUILocation = this.#uiLocations.get(liveLocation);
        const uiLocation = await liveLocation.uiLocation();
        if (oldUILocation) {
            this.#breakpoint.uiLocationRemoved(oldUILocation);
        }
        if (uiLocation) {
            this.#uiLocations.set(liveLocation, uiLocation);
            this.#breakpoint.uiLocationAdded(uiLocation);
        }
        else {
            this.#uiLocations.delete(liveLocation);
        }
    }
    async addResolvedLocation(location) {
        const uiLocation = await this.#debuggerWorkspaceBinding.rawLocationToUILocation(location);
        if (!uiLocation) {
            return "OK" /* ResolveLocationResult.OK */;
        }
        const breakpointLocation = this.#breakpoint.breakpointManager.findBreakpoint(uiLocation);
        if (breakpointLocation && breakpointLocation.breakpoint !== this.#breakpoint) {
            // location clash
            return "ERROR" /* ResolveLocationResult.ERROR */;
        }
        await this.#debuggerWorkspaceBinding.createLiveLocation(location, this.locationUpdated.bind(this), this.#liveLocations);
        return "OK" /* ResolveLocationResult.OK */;
    }
    cleanUpAfterDebuggerIsGone() {
        this.#cancelCallback = true;
        this.resetLocations();
        this.#currentState = null;
        if (this.#breakpointIds.length) {
            this.didRemoveFromDebugger();
        }
    }
}
(function (Breakpoint) {
    let State;
    (function (State) {
        function subset(stateA, stateB) {
            if (stateA === stateB) {
                return true;
            }
            if (!stateA || !stateB) {
                return false;
            }
            if (stateA.length === 0) {
                return false;
            }
            for (const positionA of stateA) {
                if (stateB.find(positionB => positionA.url === positionB.url && positionA.scriptHash === positionB.scriptHash &&
                    positionA.lineNumber === positionB.lineNumber &&
                    positionA.columnNumber === positionB.columnNumber &&
                    positionA.condition === positionB.condition) === undefined) {
                    return false;
                }
            }
            return true;
        }
        State.subset = subset;
    })(State = Breakpoint.State || (Breakpoint.State = {}));
})(Breakpoint || (Breakpoint = {}));
class Storage {
    setting;
    breakpoints;
    #muted;
    constructor(settings) {
        this.setting = settings.createLocalSetting('breakpoints', []);
        this.breakpoints = new Map();
        this.#muted = false;
        for (const breakpoint of this.setting.get()) {
            this.breakpoints.set(Storage.computeId(breakpoint), breakpoint);
        }
    }
    mute() {
        this.#muted = true;
    }
    unmute() {
        this.#muted = false;
    }
    breakpointItems(url, resourceTypeName) {
        const breakpoints = [];
        for (const breakpoint of this.breakpoints.values()) {
            if (breakpoint.url !== url) {
                continue;
            }
            if (breakpoint.resourceTypeName !== resourceTypeName && resourceTypeName !== undefined) {
                continue;
            }
            breakpoints.push(breakpoint);
        }
        return breakpoints;
    }
    updateBreakpoint(storageState) {
        if (this.#muted) {
            return;
        }
        const storageId = Storage.computeId(storageState);
        if (!storageId) {
            return;
        }
        // Delete the breakpoint and re-insert it so that it is moved to the last position in the iteration order.
        this.breakpoints.delete(storageId);
        this.breakpoints.set(storageId, storageState);
        this.save();
    }
    removeBreakpoint(storageId) {
        if (this.#muted) {
            return;
        }
        this.breakpoints.delete(storageId);
        this.save();
    }
    save() {
        this.setting.set(Array.from(this.breakpoints.values()));
    }
    static computeId({ url, resourceTypeName, lineNumber, columnNumber }) {
        if (!url) {
            return '';
        }
        let id = `${url}:${resourceTypeName}:${lineNumber}`;
        if (columnNumber !== undefined) {
            id += `:${columnNumber}`;
        }
        return id;
    }
}
function resolvedStateEqual(lhs, rhs) {
    if (lhs === rhs) {
        return true;
    }
    if (!lhs || !rhs || lhs.length !== rhs.length) {
        return false;
    }
    for (let i = 0; i < lhs.length; i++) {
        const lhsLoc = lhs[i];
        const rhsLoc = rhs[i];
        if (lhsLoc.url !== rhsLoc.url || lhsLoc.lineNumber !== rhsLoc.lineNumber ||
            lhsLoc.columnNumber !== rhsLoc.columnNumber || lhsLoc.condition !== rhsLoc.condition) {
            return false;
        }
    }
    return true;
}
export const EMPTY_BREAKPOINT_CONDITION = '';
export const NEVER_PAUSE_HERE_CONDITION = 'false';
export class BreakpointLocation {
    breakpoint;
    uiLocation;
    constructor(breakpoint, uiLocation) {
        this.breakpoint = breakpoint;
        this.uiLocation = uiLocation;
    }
}
const LOGPOINT_PREFIX = '/** DEVTOOLS_LOGPOINT */ console.log(';
const LOGPOINT_SUFFIX = ')';
//# sourceMappingURL=BreakpointManager.js.map