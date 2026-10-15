// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
var _a;
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../bindings/bindings.js';
import * as SourceMapScopes from '../source_map_scopes/source_map_scopes.js';
import * as Trace from '../trace/trace.js';
export class SourceMappingsUpdated extends Event {
    static eventName = 'sourcemappingsupdated';
    constructor() {
        super(SourceMappingsUpdated.eventName, { composed: true, bubbles: true });
    }
}
/** The code location key is created as a concatenation of its fields. **/
export const resolvedCodeLocationDataNames = new Map();
export class SourceMapsResolver extends EventTarget {
    #debuggerWorkspaceBinding;
    #targetManager;
    executionContextNamesByOrigin = new Map();
    #parsedTrace;
    #entityMapper = null;
    #isResolving = false;
    // We need to gather up a list of all the DebuggerModels that we should
    // listen to for source map attached events. For most pages this will be
    // the debugger model for the primary page target, but if a trace has
    // workers, we would also need to gather up the DebuggerModel instances for
    // those workers too.
    #debuggerModelsToListen = new Set();
    constructor(parsedTrace, entityMapper, debuggerWorkspaceBinding = 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance(), 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    targetManager = SDK.TargetManager.TargetManager.instance()) {
        super();
        this.#parsedTrace = parsedTrace;
        this.#entityMapper = entityMapper ?? null;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.#targetManager = targetManager;
    }
    static clearResolvedNodeNames() {
        resolvedCodeLocationDataNames.clear();
    }
    static keyForCodeLocation(callFrame) {
        return `${callFrame.url}$$$${callFrame.scriptId}$$$${callFrame.functionName}$$$${callFrame.lineNumber}$$$${callFrame.columnNumber}`;
    }
    /**
     * For trace events containing a call frame / source location
     * (f.e. a stack trace), attempts to obtain the resolved source
     * location based on the those that have been resolved so far from
     * listened source maps.
     *
     * Note that a single deployed URL can map to multiple authored URLs
     * (f.e. if an app is bundled). Thus, beyond a URL we can use code
     * location data like line and column numbers to obtain the specific
     * authored code according to the source mappings.
     *
     * TODO(andoli): This can return incorrect scripts if the target page has been reloaded since the trace.
     */
    static resolvedCodeLocationForCallFrame(callFrame) {
        const codeLocationKey = this.keyForCodeLocation(callFrame);
        return resolvedCodeLocationDataNames.get(codeLocationKey) ?? null;
    }
    static resolvedCodeLocationForEntry(entry) {
        let callFrame = null;
        if (Trace.Types.Events.isProfileCall(entry)) {
            callFrame = entry.callFrame;
        }
        else {
            const topCallFrame = Trace.Helpers.Trace.getStackTraceTopCallFrameInEventPayload(entry);
            if (!topCallFrame) {
                return null;
            }
            callFrame = topCallFrame;
        }
        return _a.resolvedCodeLocationForCallFrame(callFrame);
    }
    static resolvedURLForEntry(parsedTrace, entry, workspace) {
        const resolvedCallFrameURL = _a.resolvedCodeLocationForEntry(entry)?.devtoolsLocation?.uiSourceCode.url();
        if (resolvedCallFrameURL) {
            return resolvedCallFrameURL;
        }
        // If no source mapping was found for an entry's URL, then default
        // to the URL value contained in the event itself, if any.
        const url = Trace.Handlers.Helpers.getNonResolvedURL(entry, parsedTrace.data);
        if (url) {
            return workspace.uiSourceCodeForURL(url)?.url() ?? url;
        }
        return null;
    }
    static codeLocationForEntry(parsedTrace, entry, workspace) {
        const uiLocation = _a.resolvedCodeLocationForEntry(entry)?.devtoolsLocation;
        if (uiLocation) {
            return { url: uiLocation.uiSourceCode.url(), line: uiLocation.lineNumber, column: uiLocation.columnNumber };
        }
        // If no source mapping was found for an entry's URL, then default
        // to the frame contained in the event itself, if any.
        const rawCallFrame = Trace.Helpers.Trace.rawCallFrameForEntry(entry);
        if (rawCallFrame) {
            const line = rawCallFrame.lineNumber >= 0 ? rawCallFrame.lineNumber : undefined;
            const column = rawCallFrame.columnNumber >= 0 ? rawCallFrame.columnNumber : undefined;
            return { url: rawCallFrame.url, line, column };
        }
        // Lastly, look for just a url.
        let url = Trace.Handlers.Helpers.getNonResolvedURL(entry, parsedTrace.data);
        if (url) {
            url = workspace.uiSourceCodeForURL(url)?.url() ?? url;
        }
        if (url) {
            return { url };
        }
        return null;
    }
    static storeResolvedCodeDataForCallFrame(callFrame, resolvedCodeLocationData) {
        const keyForCallFrame = this.keyForCodeLocation(callFrame);
        resolvedCodeLocationDataNames.set(keyForCallFrame, resolvedCodeLocationData);
    }
    async install() {
        for (const threadToProfileMap of this.#parsedTrace.data.Samples.profilesInProcess.values()) {
            for (const [tid, profile] of threadToProfileMap) {
                const nodes = profile.parsedProfile.nodes();
                if (!nodes || nodes.length === 0) {
                    continue;
                }
                const target = this.#targetForThread(tid);
                const debuggerModel = target?.model(SDK.DebuggerModel.DebuggerModel);
                if (!debuggerModel) {
                    continue;
                }
                for (const node of nodes) {
                    const script = debuggerModel.scriptForId(String(node.callFrame.scriptId));
                    const shouldListenToSourceMap = !script || script.sourceMapURL;
                    if (!shouldListenToSourceMap) {
                        continue;
                    }
                    this.#debuggerModelsToListen.add(debuggerModel);
                }
            }
        }
        for (const debuggerModel of this.#debuggerModelsToListen) {
            debuggerModel.sourceMapManager().addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.#onAttachedSourceMap, this);
        }
        this.#updateExtensionNames();
        // Although we have added listeners for SourceMapAttached events, we also
        // immediately try to resolve function names. This ensures we use any
        // sourcemaps that were attached before we bound our event listener.
        await this.#resolveMappingsForProfileNodes();
    }
    /**
     * Removes the event listeners and stops tracking newly added sourcemaps.
     * Should be called before destroying an instance of this class to avoid leaks
     * with listeners.
     */
    uninstall() {
        for (const debuggerModel of this.#debuggerModelsToListen) {
            debuggerModel.sourceMapManager().removeEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.#onAttachedSourceMap, this);
        }
        this.#debuggerModelsToListen.clear();
    }
    async #resolveMappingsForProfileNodes() {
        // Used to track if source mappings were updated when a source map
        // is attach. If not, we do not notify the flamechart that mappings
        // were updated, since that would trigger a rerender.
        let updatedMappings = false;
        for (const [, threadsInProcess] of this.#parsedTrace.data.Samples.profilesInProcess) {
            for (const [tid, threadProfile] of threadsInProcess) {
                const nodes = threadProfile.parsedProfile.nodes() ?? [];
                const target = this.#targetForThread(tid);
                if (!target) {
                    continue;
                }
                for (const node of nodes) {
                    const resolvedFunctionName = await SourceMapScopes.NamesResolver.resolveProfileFrameFunctionName(node.callFrame, target, this.#debuggerWorkspaceBinding);
                    updatedMappings ||= Boolean(resolvedFunctionName);
                    node.setOriginalFunctionName(resolvedFunctionName);
                    const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
                    const script = debuggerModel?.scriptForId(node.scriptId) || null;
                    const location = debuggerModel &&
                        new SDK.DebuggerModel.Location(debuggerModel, node.callFrame.scriptId, node.callFrame.lineNumber, node.callFrame.columnNumber);
                    const uiLocation = location && await this.#debuggerWorkspaceBinding.rawLocationToUILocation(location);
                    updatedMappings ||= Boolean(uiLocation);
                    if (uiLocation?.uiSourceCode.url() && this.#entityMapper) {
                        // Update mappings for the related events of the entity.
                        this.#entityMapper.updateSourceMapEntities(node.callFrame, uiLocation.uiSourceCode.url());
                    }
                    _a.storeResolvedCodeDataForCallFrame(node.callFrame, { name: resolvedFunctionName, devtoolsLocation: uiLocation, script });
                }
            }
        }
        if (!updatedMappings) {
            return;
        }
        this.dispatchEvent(new SourceMappingsUpdated());
    }
    #onAttachedSourceMap() {
        // Exit if we are already resolving so that we batch requests; if pages
        // have a lot of sourcemaps we can get a lot of events at once.
        if (this.#isResolving) {
            return;
        }
        this.#isResolving = true;
        // Resolving names triggers a repaint of the flame chart. Instead of attempting to resolve
        // names every time a source map is attached, wait for some time once the first source map is
        // attached. This way we allow for other source maps to be parsed before attempting a name
        // resolving using the available source maps. Otherwise the UI is blocked when the number
        // of source maps is particularly large.
        setTimeout(async () => {
            this.#isResolving = false;
            await this.#resolveMappingsForProfileNodes();
        }, 500);
    }
    // Figure out the target for the node. If it is in a worker thread,
    // that is the target, otherwise we use the primary page target.
    #targetForThread(tid) {
        const maybeWorkerId = this.#parsedTrace.data.Workers.workerIdByThread.get(tid);
        if (maybeWorkerId) {
            return this.#targetManager.targetById(maybeWorkerId);
        }
        return this.#targetManager.primaryPageTarget();
    }
    #updateExtensionNames() {
        for (const runtimeModel of this.#targetManager.models(SDK.RuntimeModel.RuntimeModel)) {
            for (const context of runtimeModel.executionContexts()) {
                this.executionContextNamesByOrigin.set(context.origin, context.name);
            }
        }
        this.#entityMapper?.updateExtensionEntitiesWithName(this.executionContextNamesByOrigin);
    }
}
_a = SourceMapsResolver;
//# sourceMappingURL=SourceMapsResolver.js.map