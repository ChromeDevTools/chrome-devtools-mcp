// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import { DebuggerModel } from './DebuggerModel.js';
import { HeapProfilerModel } from './HeapProfilerModel.js';
import { toStringForClipboard } from './PageFunctions.js';
import { RemoteFunction, RemoteObject, RemoteObjectImpl, RemoteObjectProperty, ScopeRemoteObject, } from './RemoteObject.js';
import { SDKModel } from './SDKModel.js';
import { customFormattersSettingDescriptor, textEditorIndentSettingDescriptor } from './SDKSettings.js';
import { Type } from './Target.js';
export class RuntimeModel extends SDKModel {
    agent;
    #executionContextById = new Map();
    #executionContextComparator = ExecutionContext.comparator;
    #customFormattersSetting;
    constructor(target) {
        super(target);
        this.agent = target.runtimeAgent();
        this.target().registerRuntimeDispatcher(new RuntimeDispatcher(this));
        void this.agent.invoke_enable();
        this.#customFormattersSetting =
            this.target().targetManager().context.get(Common.Settings.Settings).resolve(customFormattersSettingDescriptor);
        if (this.#customFormattersSetting.get()) {
            void this.agent.invoke_setCustomObjectFormatterEnabled({ enabled: true });
        }
        this.#customFormattersSetting.addChangeListener(this.customFormattersStateChanged, this);
    }
    dispose() {
        this.#customFormattersSetting.removeChangeListener(this.customFormattersStateChanged, this);
    }
    static isSideEffectFailure(response) {
        const exceptionDetails = 'exceptionDetails' in response && response.exceptionDetails;
        return Boolean(exceptionDetails &&
            exceptionDetails.exception?.description?.startsWith('EvalError: Possible side-effect in debug-evaluate'));
    }
    debuggerModel() {
        return this.target().model(DebuggerModel);
    }
    heapProfilerModel() {
        return this.target().model(HeapProfilerModel);
    }
    executionContexts() {
        return [...this.#executionContextById.values()].sort(this.executionContextComparator());
    }
    setExecutionContextComparator(comparator) {
        this.#executionContextComparator = comparator;
    }
    /**
     * comparator
     */
    executionContextComparator() {
        return this.#executionContextComparator;
    }
    defaultExecutionContext() {
        for (const context of this.executionContexts()) {
            if (context.isDefault) {
                return context;
            }
        }
        return null;
    }
    executionContext(id) {
        return this.#executionContextById.get(id) || null;
    }
    executionContextCreated(context) {
        const data = context.auxData || { isDefault: true };
        const executionContext = new ExecutionContext(this, context.id, context.uniqueId, context.name, context.origin, data['isDefault'], data['frameId']);
        this.#executionContextById.set(executionContext.id, executionContext);
        this.dispatchEventToListeners(Events.ExecutionContextCreated, executionContext);
    }
    executionContextDestroyed(executionContextId) {
        const executionContext = this.#executionContextById.get(executionContextId);
        if (!executionContext) {
            return;
        }
        this.debuggerModel().executionContextDestroyed(executionContext);
        this.#executionContextById.delete(executionContextId);
        this.dispatchEventToListeners(Events.ExecutionContextDestroyed, executionContext);
    }
    fireExecutionContextOrderChanged() {
        this.dispatchEventToListeners(Events.ExecutionContextOrderChanged, this);
    }
    executionContextsCleared() {
        this.debuggerModel().globalObjectCleared();
        const contexts = this.executionContexts();
        this.#executionContextById.clear();
        for (let i = 0; i < contexts.length; ++i) {
            this.dispatchEventToListeners(Events.ExecutionContextDestroyed, contexts[i]);
        }
    }
    createRemoteObject(payload) {
        console.assert(typeof payload === 'object', 'Remote object payload should only be an object');
        return new RemoteObjectImpl(this, payload.objectId, payload.type, payload.subtype, payload.value, payload.unserializableValue, payload.description, payload.preview, payload.customPreview, payload.className);
    }
    createScopeRemoteObject(payload, scopeRef) {
        return new ScopeRemoteObject(this, payload.objectId, scopeRef, payload.type, payload.subtype, payload.value, payload.unserializableValue, payload.description, payload.preview);
    }
    createRemoteObjectFromPrimitiveValue(value) {
        const type = typeof value;
        let unserializableValue = undefined;
        const unserializableDescription = RemoteObject.unserializableDescription(value);
        if (unserializableDescription !== null) {
            unserializableValue = (unserializableDescription);
        }
        if (typeof unserializableValue !== 'undefined') {
            value = undefined;
        }
        return new RemoteObjectImpl(this, undefined, type, undefined, value, unserializableValue);
    }
    createRemotePropertyFromPrimitiveValue(name, value) {
        return new RemoteObjectProperty(name, this.createRemoteObjectFromPrimitiveValue(value));
    }
    discardConsoleEntries() {
        void this.agent.invoke_discardConsoleEntries();
    }
    releaseObjectGroup(objectGroup) {
        void this.agent.invoke_releaseObjectGroup({ objectGroup });
    }
    releaseEvaluationResult(result) {
        if ('object' in result && result.object) {
            result.object.release();
        }
        if ('exceptionDetails' in result && result.exceptionDetails?.exception) {
            const exception = result.exceptionDetails.exception;
            const exceptionObject = this.createRemoteObject({ type: exception.type, objectId: exception.objectId });
            exceptionObject.release();
        }
    }
    runIfWaitingForDebugger() {
        void this.agent.invoke_runIfWaitingForDebugger();
    }
    customFormattersStateChanged({ data: enabled }) {
        void this.agent.invoke_setCustomObjectFormatterEnabled({ enabled });
    }
    async compileScript(expression, sourceURL, persistScript, executionContextId) {
        const response = await this.agent.invoke_compileScript({
            expression,
            sourceURL,
            persistScript,
            executionContextId,
        });
        if (response.getError()) {
            console.error(response.getError());
            return null;
        }
        return { scriptId: response.scriptId, exceptionDetails: response.exceptionDetails };
    }
    async runScript(scriptId, executionContextId, objectGroup, silent, includeCommandLineAPI, returnByValue, generatePreview, awaitPromise) {
        const response = await this.agent.invoke_runScript({
            scriptId,
            executionContextId,
            objectGroup,
            silent,
            includeCommandLineAPI,
            returnByValue,
            generatePreview,
            awaitPromise,
        });
        const error = response.getError();
        if (error) {
            console.error(error);
            return { error };
        }
        return { object: this.createRemoteObject(response.result), exceptionDetails: response.exceptionDetails };
    }
    async queryObjects(prototype) {
        if (!prototype.objectId) {
            return { error: 'Prototype should be an Object.' };
        }
        const response = await this.agent.invoke_queryObjects({ prototypeObjectId: prototype.objectId, objectGroup: 'console' });
        const error = response.getError();
        if (error) {
            console.error(error);
            return { error };
        }
        return { objects: this.createRemoteObject(response.objects) };
    }
    async isolateId() {
        const response = await this.agent.invoke_getIsolateId();
        if (response.getError() || !response.id) {
            return this.target().id();
        }
        return response.id;
    }
    async heapUsage() {
        const result = await this.agent.invoke_getHeapUsage();
        return result.getError() ? null : result;
    }
    inspectRequested(payload, hints, executionContextId) {
        const object = this.createRemoteObject(payload);
        if (hints !== null && typeof hints === 'object') {
            if ('copyToClipboard' in hints && Boolean(hints.copyToClipboard)) {
                this.copyRequested(object);
                return;
            }
            if ('queryObjects' in hints && hints.queryObjects) {
                void this.queryObjectsRequested(object, executionContextId);
                return;
            }
        }
        if (object.isNode()) {
            const omitFocus = hints !== null && typeof hints === 'object' && 'omitFocus' in hints && Boolean(hints.omitFocus);
            void Common.Revealer.reveal(object, omitFocus).then(object.release.bind(object));
            return;
        }
        if (object.type === 'function') {
            void RemoteFunction.objectAsFunction(object).targetFunctionDetails().then(didGetDetails);
            return;
        }
        function didGetDetails(response) {
            object.release();
            if (!response?.location) {
                return;
            }
            void Common.Revealer.reveal(response.location);
        }
        object.release();
    }
    async addBinding(event) {
        return await this.agent.invoke_addBinding(event);
    }
    async removeBinding(request) {
        return await this.agent.invoke_removeBinding(request);
    }
    bindingCalled(event) {
        this.dispatchEventToListeners(Events.BindingCalled, event);
    }
    copyRequested(object) {
        if (!object.objectId) {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(object.unserializableValue() || object.value);
            return;
        }
        const indent = this.target()
            .targetManager()
            .context.get(Common.Settings.Settings)
            .resolve(textEditorIndentSettingDescriptor)
            .get();
        void object
            .callFunctionJSON(toStringForClipboard, [{
                value: {
                    subtype: object.subtype,
                    indent,
                },
            }])
            .then(Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText.bind(Host.InspectorFrontendHost.InspectorFrontendHostInstance));
    }
    async queryObjectsRequested(object, executionContextId) {
        const result = await this.queryObjects(object);
        object.release();
        if ('error' in result) {
            this.target().targetManager().getConsole().error(result.error);
            return;
        }
        this.dispatchEventToListeners(Events.QueryObjectRequested, { objects: result.objects, executionContextId });
    }
    static simpleTextFromException(exceptionDetails) {
        let text = exceptionDetails.text;
        if (exceptionDetails.exception?.description) {
            let description = exceptionDetails.exception.description;
            if (description.indexOf('\n') !== -1) {
                description = description.substring(0, description.indexOf('\n'));
            }
            text += ' ' + description;
        }
        return text;
    }
    exceptionThrown(timestamp, exceptionDetails) {
        const exceptionWithTimestamp = { timestamp, details: exceptionDetails };
        this.dispatchEventToListeners(Events.ExceptionThrown, exceptionWithTimestamp);
    }
    exceptionRevoked(exceptionId) {
        this.dispatchEventToListeners(Events.ExceptionRevoked, exceptionId);
    }
    consoleAPICalled(type, args, executionContextId, timestamp, stackTrace, context) {
        const consoleAPICall = {
            type,
            args,
            executionContextId,
            timestamp,
            stackTrace,
            context,
        };
        this.dispatchEventToListeners(Events.ConsoleAPICalled, consoleAPICall);
    }
    executionContextIdForScriptId(scriptId) {
        const script = this.debuggerModel().scriptForId(scriptId);
        return script ? script.executionContextId : 0;
    }
    executionContextForStackTrace(stackTrace) {
        let currentStackTrace = stackTrace;
        while (currentStackTrace && !currentStackTrace.callFrames.length) {
            currentStackTrace = currentStackTrace.parent || null;
        }
        if (!currentStackTrace?.callFrames.length) {
            return 0;
        }
        return this.executionContextIdForScriptId(currentStackTrace.callFrames[0].scriptId);
    }
    terminateExecution() {
        return this.agent.invoke_terminateExecution();
    }
    async getExceptionDetails(errorObjectId) {
        const response = await this.agent.invoke_getExceptionDetails({ errorObjectId });
        if (response.getError()) {
            // This CDP method errors if called with non-Error object ids. Swallow that.
            return undefined;
        }
        return response.exceptionDetails;
    }
}
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["BindingCalled"] = "BindingCalled";
    Events["ExecutionContextCreated"] = "ExecutionContextCreated";
    Events["ExecutionContextDestroyed"] = "ExecutionContextDestroyed";
    Events["ExecutionContextChanged"] = "ExecutionContextChanged";
    Events["ExecutionContextOrderChanged"] = "ExecutionContextOrderChanged";
    Events["ExceptionThrown"] = "ExceptionThrown";
    Events["ExceptionRevoked"] = "ExceptionRevoked";
    Events["ConsoleAPICalled"] = "ConsoleAPICalled";
    Events["QueryObjectRequested"] = "QueryObjectRequested";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
class RuntimeDispatcher {
    #runtimeModel;
    constructor(runtimeModel) {
        this.#runtimeModel = runtimeModel;
    }
    executionContextCreated({ context }) {
        this.#runtimeModel.executionContextCreated(context);
    }
    executionContextDestroyed({ executionContextId }) {
        this.#runtimeModel.executionContextDestroyed(executionContextId);
    }
    executionContextsCleared() {
        this.#runtimeModel.executionContextsCleared();
    }
    exceptionThrown({ timestamp, exceptionDetails }) {
        this.#runtimeModel.exceptionThrown(timestamp, exceptionDetails);
    }
    exceptionRevoked({ exceptionId }) {
        this.#runtimeModel.exceptionRevoked(exceptionId);
    }
    consoleAPICalled({ type, args, executionContextId, timestamp, stackTrace, context }) {
        this.#runtimeModel.consoleAPICalled(type, args, executionContextId, timestamp, stackTrace, context);
    }
    inspectRequested({ object, hints, executionContextId }) {
        this.#runtimeModel.inspectRequested(object, hints, executionContextId);
    }
    bindingCalled(event) {
        this.#runtimeModel.bindingCalled(event);
    }
}
export class ExecutionContext {
    id;
    uniqueId;
    name;
    #label;
    origin;
    isDefault;
    runtimeModel;
    debuggerModel;
    frameId;
    constructor(runtimeModel, id, uniqueId, name, origin, isDefault, frameId) {
        this.id = id;
        this.uniqueId = uniqueId;
        this.name = name;
        this.#label = null;
        this.origin = origin;
        this.isDefault = isDefault;
        this.runtimeModel = runtimeModel;
        this.debuggerModel = runtimeModel.debuggerModel();
        this.frameId = frameId;
        this.#setLabel('');
    }
    target() {
        return this.runtimeModel.target();
    }
    static comparator(a, b) {
        function targetWeight(target) {
            if (target.parentTarget()?.type() !== Type.FRAME) {
                return 5;
            }
            if (target.type() === Type.FRAME) {
                return 4;
            }
            if (target.type() === Type.ServiceWorker) {
                return 3;
            }
            if (target.type() === Type.Worker || target.type() === Type.SHARED_WORKER) {
                return 2;
            }
            return 1;
        }
        function targetPath(target) {
            let currentTarget = target;
            const parents = [];
            while (currentTarget) {
                parents.push(currentTarget);
                currentTarget = currentTarget.parentTarget();
            }
            return parents.reverse();
        }
        const tagetsA = targetPath(a.target());
        const targetsB = targetPath(b.target());
        let targetA;
        let targetB;
        for (let i = 0;; i++) {
            if (!tagetsA[i] || !targetsB[i] || (tagetsA[i] !== targetsB[i])) {
                targetA = tagetsA[i];
                targetB = targetsB[i];
                break;
            }
        }
        if (!targetA && targetB) {
            return -1;
        }
        if (!targetB && targetA) {
            return 1;
        }
        if (targetA && targetB) {
            const weightDiff = targetWeight(targetA) - targetWeight(targetB);
            if (weightDiff) {
                return -weightDiff;
            }
            return targetA.id().localeCompare(targetB.id());
        }
        // Main world context should always go first.
        if (a.isDefault) {
            return -1;
        }
        if (b.isDefault) {
            return +1;
        }
        return a.name.localeCompare(b.name);
    }
    async evaluateWithSelectedFrameFallback(options, userGesture, awaitPromise) {
        // FIXME: It will be moved to separate ExecutionContext.
        if (this.debuggerModel.selectedCallFrame()) {
            return await this.debuggerModel.evaluateOnSelectedCallFrame(options);
        }
        return await this.evaluate(options, userGesture, awaitPromise);
    }
    globalObject(objectGroup, generatePreview) {
        const evaluationOptions = {
            expression: 'this',
            objectGroup,
            includeCommandLineAPI: false,
            silent: true,
            returnByValue: false,
            generatePreview,
        };
        return this.evaluate(evaluationOptions, false, false);
    }
    async callFunctionOn(options) {
        const response = await this.runtimeModel.agent.invoke_callFunctionOn({
            functionDeclaration: options.functionDeclaration,
            returnByValue: options.returnByValue,
            userGesture: options.userGesture,
            awaitPromise: options.awaitPromise,
            throwOnSideEffect: options.throwOnSideEffect,
            arguments: options.arguments,
            // Old back-ends don't know about uniqueContextId (and also don't generate
            // one), so fall back to contextId in that case (https://crbug.com/1192621).
            ...(this.uniqueId ? { uniqueContextId: this.uniqueId } : { contextId: this.id }),
        });
        const error = response.getError();
        if (error) {
            return { error };
        }
        return { object: this.runtimeModel.createRemoteObject(response.result), exceptionDetails: response.exceptionDetails };
    }
    async evaluate(options, userGesture, awaitPromise) {
        if (!options.expression) {
            // There is no expression, so the completion should happen against global properties.
            options.expression = 'this';
        }
        const response = await this.runtimeModel.agent.invoke_evaluate({
            expression: options.expression,
            objectGroup: options.objectGroup,
            includeCommandLineAPI: options.includeCommandLineAPI,
            silent: options.silent,
            returnByValue: options.returnByValue,
            generatePreview: options.generatePreview,
            userGesture,
            awaitPromise,
            throwOnSideEffect: options.throwOnSideEffect,
            timeout: options.timeout,
            disableBreaks: options.disableBreaks,
            replMode: options.replMode,
            allowUnsafeEvalBlockedByCSP: options.allowUnsafeEvalBlockedByCSP,
            // Old back-ends don't know about uniqueContextId (and also don't generate
            // one), so fall back to contextId in that case (https://crbug.com/1192621).
            ...(this.uniqueId ? { uniqueContextId: this.uniqueId } : { contextId: this.id }),
        });
        const error = response.getError();
        if (error) {
            console.error(error);
            return { error };
        }
        return { object: this.runtimeModel.createRemoteObject(response.result), exceptionDetails: response.exceptionDetails };
    }
    async globalLexicalScopeNames() {
        const response = await this.runtimeModel.agent.invoke_globalLexicalScopeNames({ executionContextId: this.id });
        return response.getError() ? [] : response.names;
    }
    label() {
        return this.#label;
    }
    setLabel(label) {
        this.#setLabel(label);
        this.runtimeModel.dispatchEventToListeners(Events.ExecutionContextChanged, this);
    }
    #setLabel(label) {
        if (label) {
            this.#label = label;
            return;
        }
        if (this.name) {
            this.#label = this.name;
            return;
        }
        const parsedUrl = Common.ParsedURL.ParsedURL.fromString(this.origin);
        this.#label = parsedUrl ? parsedUrl.lastPathComponentWithFragment() : '';
    }
}
SDKModel.register(RuntimeModel, { capabilities: 4 /* Capability.JS */, autostart: true });
//# sourceMappingURL=RuntimeModel.js.map