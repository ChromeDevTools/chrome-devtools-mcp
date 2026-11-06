// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import { UserVisibleError } from '../platform/platform.js';
export class EnhancedTracesParser {
    #trace;
    #scriptRundownEvents = [];
    #scriptToV8Context = new Map();
    #scriptToFrame = new Map();
    #scriptToScriptSource = new Map();
    #largeScriptToScriptSource = new Map();
    #scriptToSourceLength = new Map();
    #targets = [];
    #executionContexts = [];
    #scripts = [];
    #resources = [];
    static enhancedTraceVersion = 1;
    constructor(trace) {
        this.#trace = trace;
        // Initialize with the trace provided.
        try {
            this.parseEnhancedTrace();
        }
        catch (e) {
            throw new UserVisibleError.UserVisibleError(e);
        }
    }
    parseEnhancedTrace() {
        for (const event of this.#trace.traceEvents) {
            if (this.isTracingStartedInBrowser(event)) {
                // constructs all targets by devtools.timeline TracingStartedInBrowser
                const data = event.args?.data;
                for (const frame of data.frames) {
                    if (frame.url === 'about:blank') {
                        continue;
                    }
                    if (!frame.isInPrimaryMainFrame) {
                        continue;
                    }
                    const frameId = frame.frame;
                    if (!this.#targets.find(target => target.targetId === frameId)) {
                        const frameType = frame.isOutermostMainFrame ? 'page' : 'iframe';
                        this.#targets.push({
                            targetId: frameId,
                            type: frameType,
                            pid: frame.processId,
                            url: frame.url,
                        });
                    }
                }
            }
            else if (this.isFunctionCallEvent(event)) {
                // constructs all script to frame mapping with devtools.timeline FunctionCall
                const data = event.args?.data;
                if (data.isolate) {
                    this.#scriptToFrame.set(this.getScriptIsolateId(data.isolate, data.scriptId), data.frame);
                }
            }
            else if (this.isRundownScriptCompiled(event)) {
                // Set up script to v8 context mapping
                const data = event.args?.data;
                this.#scriptToV8Context.set(this.getScriptIsolateId(data.isolate, data.scriptId), data.v8context);
                this.#scriptToFrame.set(this.getScriptIsolateId(data.isolate, data.scriptId), data.frame);
                // All the targets should've been added by the TracingStartedInBrowser event, but just in case we're missing some there
                const frameId = data.frame;
                if (!this.#targets.find(target => target.targetId === frameId)) {
                    this.#targets.push({
                        targetId: frameId,
                        type: data.frameType,
                        isolate: String(data.isolate),
                        pid: event.pid,
                        url: data.url,
                    });
                }
                // Add execution context, need to put back execution context id with info from other traces
                if (!this.#executionContexts.find(executionContext => executionContext.v8Context === data.v8context)) {
                    this.#executionContexts.push({
                        id: -1,
                        origin: data.origin,
                        v8Context: data.v8context,
                        auxData: {
                            frameId: data.frame,
                            isDefault: data.isDefault,
                            type: data.contextType,
                        },
                        isolate: String(data.isolate),
                        name: data.origin,
                        uniqueId: `${data.v8context}-${data.isolate}`,
                    });
                }
            }
            else if (this.isRundownScript(event)) {
                this.#scriptRundownEvents.push(event);
                const data = event.args.data;
                // Add script
                if (!this.#scripts.find(script => script.scriptId === String(data.scriptId) && script.isolate === String(data.isolate))) {
                    this.#scripts.push({
                        scriptId: String(data.scriptId),
                        isolate: String(data.isolate),
                        buildId: '',
                        executionContextId: data.executionContextId,
                        startLine: data.startLine ?? 0,
                        startColumn: data.startColumn ?? 0,
                        endLine: data.endLine ?? 0,
                        endColumn: data.endColumn ?? 0,
                        hash: data.hash ?? '',
                        isModule: data.isModule,
                        url: data.url ?? '',
                        hasSourceURL: data.hasSourceUrl,
                        sourceURL: data.sourceUrl ?? '',
                        sourceMapURL: data.sourceMapUrl,
                        pid: event.pid,
                    });
                }
            }
            else if (this.isRundownScriptSource(event)) {
                // Set up script to source text and length mapping
                const data = event.args.data;
                const scriptIsolateId = this.getScriptIsolateId(data.isolate, data.scriptId);
                if ('splitIndex' in data && 'splitCount' in data) {
                    if (!this.#largeScriptToScriptSource.has(scriptIsolateId)) {
                        this.#largeScriptToScriptSource.set(scriptIsolateId, new Array(data.splitCount).fill(''));
                    }
                    const splittedSource = this.#largeScriptToScriptSource.get(scriptIsolateId);
                    if (splittedSource && data.sourceText) {
                        splittedSource[data.splitIndex] = data.sourceText;
                    }
                }
                else {
                    if (data.sourceText) {
                        this.#scriptToScriptSource.set(scriptIsolateId, data.sourceText);
                    }
                    if (data.length) {
                        this.#scriptToSourceLength.set(scriptIsolateId, data.length);
                    }
                }
            }
        }
    }
    data() {
        // Put back execution context id
        const v8ContextToExecutionContextId = new Map();
        this.#scriptRundownEvents.forEach(scriptRundownEvent => {
            const data = scriptRundownEvent.args.data;
            const v8Context = this.#scriptToV8Context.get(this.getScriptIsolateId(data.isolate, data.scriptId));
            if (v8Context) {
                v8ContextToExecutionContextId.set(v8Context, data.executionContextId);
            }
        });
        this.#executionContexts.forEach(executionContext => {
            if (executionContext.v8Context) {
                const id = v8ContextToExecutionContextId.get(executionContext.v8Context);
                if (id) {
                    executionContext.id = id;
                }
            }
        });
        // Put back script source text and length
        this.#scripts.forEach(script => {
            const scriptIsolateId = this.getScriptIsolateId(script.isolate, script.scriptId);
            if (this.#scriptToScriptSource.has(scriptIsolateId)) {
                script.sourceText = this.#scriptToScriptSource.get(scriptIsolateId);
                script.length = this.#scriptToSourceLength.get(scriptIsolateId);
            }
            else if (this.#largeScriptToScriptSource.has(scriptIsolateId)) {
                const splittedSources = this.#largeScriptToScriptSource.get(scriptIsolateId);
                if (splittedSources) {
                    script.sourceText = splittedSources.join('');
                    script.length = script.sourceText.length;
                }
            }
            // put in the aux data
            const linkedExecutionContext = this.#executionContexts.find(context => context.id === script.executionContextId && context.isolate === script.isolate);
            if (linkedExecutionContext) {
                script.executionContextAuxData = linkedExecutionContext.auxData;
                // If a script successfully mapped to an execution context and aux data, link script to frame
                if (script.executionContextAuxData?.frameId) {
                    this.#scriptToFrame.set(scriptIsolateId, script.executionContextAuxData?.frameId);
                }
            }
        });
        for (const script of this.#scripts) {
            // Resolve the source map from the provided metadata.
            // If no map is found for a given source map url, no source map is passed to the debugger model.
            // Encoded as a data url so that the debugger model makes no network request.
            // NOTE: consider passing directly as object and hacking `parsedScriptSource` in DebuggerModel.ts to handle
            // this fake event. Would avoid a lot of wasteful (de)serialization. Maybe add SDK.Script.hydratedSourceMap.
            this.resolveSourceMap(script);
        }
        this.#resources = this.#trace.metadata.resources ?? [];
        return this.groupContextsAndScriptsUnderTarget(this.#targets, this.#executionContexts, this.#scripts, this.#resources);
    }
    resolveSourceMap(script) {
        if (script.sourceMapURL?.startsWith('data:')) {
            return;
        }
        const sourceMap = this.getSourceMapFromMetadata(script);
        if (!sourceMap) {
            return;
        }
        // Note: this encoding + re-parsing overhead cost ~10ms per 1MB of JSON on my
        // Mac M1 Pro.
        // See https://crrev.com/c/6490409/comments/f294c12a_69781e24
        const payload = encodeURIComponent(JSON.stringify(sourceMap));
        script.sourceMapURL = `data:application/json;charset=utf-8,${payload}`;
    }
    getSourceMapFromMetadata(script) {
        const { hasSourceURL, sourceURL, url, sourceMapURL, isolate, scriptId } = script;
        if (!sourceMapURL || !this.#trace.metadata.sourceMaps) {
            return;
        }
        const frame = this.#scriptToFrame.get(this.getScriptIsolateId(isolate, scriptId));
        if (!frame) {
            return;
        }
        const target = this.#targets.find(t => t.targetId === frame);
        if (!target) {
            return;
        }
        let resolvedSourceUrl = url;
        if (hasSourceURL && sourceURL) {
            const targetUrl = target.url;
            resolvedSourceUrl = Common.ParsedURL.ParsedURL.completeURL(targetUrl, sourceURL) ?? sourceURL;
        }
        // Resolve the source map url. The value given by v8 may be relative, so resolve it here.
        // This process should match the one in `SourceMapManager.attachSourceMap`.
        const resolvedSourceMapUrl = Common.ParsedURL.ParsedURL.completeURL(resolvedSourceUrl, sourceMapURL);
        if (!resolvedSourceMapUrl) {
            return;
        }
        const { sourceMap } = this.#trace.metadata.sourceMaps.find(m => m.sourceMapUrl === resolvedSourceMapUrl) ?? {};
        return sourceMap;
    }
    getScriptIsolateId(isolate, scriptId) {
        return `${scriptId}@${isolate}`;
    }
    getExecutionContextIsolateId(isolate, executionContextId) {
        return `${executionContextId}@${isolate}`;
    }
    isTraceEvent(event) {
        return 'cat' in event && 'pid' in event && 'args' in event &&
            'data' in event.args;
    }
    isRundownScriptCompiled(event) {
        return this.isTraceEvent(event) && event.cat === 'disabled-by-default-devtools.target-rundown';
    }
    isRundownScript(event) {
        return this.isTraceEvent(event) && event.cat === 'disabled-by-default-devtools.v8-source-rundown';
    }
    isRundownScriptSource(event) {
        return this.isTraceEvent(event) && event.cat === 'disabled-by-default-devtools.v8-source-rundown-sources';
    }
    isTracingStartedInBrowser(event) {
        return this.isTraceEvent(event) && event.cat === 'disabled-by-default-devtools.timeline' &&
            event.name === 'TracingStartedInBrowser';
    }
    isFunctionCallEvent(event) {
        return this.isTraceEvent(event) && event.cat === 'devtools.timeline' && event.name === 'FunctionCall';
    }
    groupContextsAndScriptsUnderTarget(targets, executionContexts, scripts, resources) {
        const data = [];
        const targetIds = new Set();
        const targetToExecutionContexts = new Map();
        // We want to keep track of how each execution context is linked to targets so we may use this
        // information to link scripts with no target to a target
        const executionContextIsolateToTarget = new Map();
        const targetToScripts = new Map();
        const orphanScripts = [];
        const targetToResources = new Map();
        // Initialize all the mapping needed
        for (const target of targets) {
            targetIds.add(target.targetId);
            targetToExecutionContexts.set(target.targetId, []);
            targetToScripts.set(target.targetId, []);
            targetToResources.set(target.targetId, []);
        }
        // Put all of the known execution contexts under respective targets
        for (const executionContext of executionContexts) {
            const frameId = executionContext.auxData?.frameId;
            if (frameId && targetIds.has(frameId)) {
                targetToExecutionContexts.get(frameId)?.push(executionContext);
                executionContextIsolateToTarget.set(this.getExecutionContextIsolateId(executionContext.isolate, executionContext.id), frameId);
            }
            else {
                console.error('Execution context can\'t be linked to a target', executionContext);
            }
        }
        // Put all of the scripts under respective targets with collected information
        for (const script of scripts) {
            const scriptExecutionContextIsolateId = this.getExecutionContextIsolateId(script.isolate, script.executionContextId);
            const scriptFrameId = script.executionContextAuxData?.frameId;
            if (script.executionContextAuxData?.frameId && targetIds.has(scriptFrameId)) {
                targetToScripts.get(scriptFrameId)?.push(script);
                executionContextIsolateToTarget.set(scriptExecutionContextIsolateId, scriptFrameId);
            }
            else if (this.#scriptToFrame.has(this.getScriptIsolateId(script.isolate, script.scriptId))) {
                const targetId = this.#scriptToFrame.get(this.getScriptIsolateId(script.isolate, script.scriptId));
                if (targetId) {
                    targetToScripts.get(targetId)?.push(script);
                    executionContextIsolateToTarget.set(scriptExecutionContextIsolateId, targetId);
                }
            }
            else {
                // These scripts are not linked to any target
                orphanScripts.push(script);
            }
        }
        // If a script is not linked to a target, use executionContext@isolate to link to a target
        // Using PID is the last resort
        for (const orphanScript of orphanScripts) {
            const orphanScriptExecutionContextIsolateId = this.getExecutionContextIsolateId(orphanScript.isolate, orphanScript.executionContextId);
            const frameId = executionContextIsolateToTarget.get(orphanScriptExecutionContextIsolateId);
            if (frameId) {
                // Found a link via execution context, use it.
                targetToScripts.get(frameId)?.push(orphanScript);
            }
            else if (orphanScript.pid) {
                const target = targets.find(target => target.pid === orphanScript.pid);
                if (target) {
                    targetToScripts.get(target.targetId)?.push(orphanScript);
                }
            }
            else {
                console.error('Script can\'t be linked to any target', orphanScript);
            }
        }
        for (const resource of resources) {
            const frameId = resource.frame;
            if (targetIds.has(frameId)) {
                targetToResources.get(frameId)?.push(resource);
            }
        }
        // Now all the scripts are linked to a target, we want to make sure all the scripts are pointing to a valid
        // execution context. If not, we will create an artificial execution context for the script
        for (const target of targets) {
            const targetId = target.targetId;
            const executionContexts = targetToExecutionContexts.get(targetId) || [];
            const scripts = targetToScripts.get(targetId) || [];
            const resources = targetToResources.get(targetId) || [];
            for (const script of scripts) {
                if (!executionContexts.find(context => context.id === script.executionContextId)) {
                    const artificialContext = {
                        id: script.executionContextId,
                        origin: '',
                        v8Context: '',
                        name: '',
                        auxData: {
                            frameId: targetId,
                            isDefault: false,
                            type: 'type',
                        },
                        isolate: script.isolate,
                        uniqueId: `${targetId}-${script.isolate}`,
                    };
                    executionContexts.push(artificialContext);
                }
            }
            // Finally, we put all the information into the data structure we want to return as.
            data.push({ target, executionContexts, scripts, resources });
        }
        return data;
    }
}
//# sourceMappingURL=EnhancedTracesParser.js.map