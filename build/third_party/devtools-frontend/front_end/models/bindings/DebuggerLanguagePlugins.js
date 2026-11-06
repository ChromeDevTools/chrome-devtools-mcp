// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import { assertNotNullOrUndefined } from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as StackTrace from '../stack_trace/stack_trace.js';
// eslint-disable-next-line @devtools/es-modules-import
import * as StackTraceImpl from '../stack_trace/stack_trace_impl.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
const UIStrings = {
    /**
     * @description Error message displayed in the Console panel when language plugins report errors.
     * @example {File not found} PH1
     */
    errorInDebuggerLanguagePlugin: 'Error in debugger language plugin: {PH1}',
    /**
     * @description Status message shown in the Console panel when debugging information is being loaded. PH2 and PH3 are URLs.
     * @example {C/C++ DevTools Support (DWARF)} PH1
     * @example {http://web.dev/file.wasm} PH2
     * @example {http://web.dev/file.wasm.debug.wasm} PH3
     */
    loadingDebugSymbolsForVia: '[{PH1}] Loading debug symbols for {PH2} (via {PH3})…',
    /**
     * @description Status message shown in the Console panel when debugging information is being loaded.
     * @example {C/C++ DevTools Support (DWARF)} PH1
     * @example {http://web.dev/file.wasm} PH2
     */
    loadingDebugSymbolsFor: '[{PH1}] Loading debug symbols for {PH2}…',
    /**
     * @description Warning message displayed in the Console panel when debugging information was loaded, but no source files were found.
     * @example {C/C++ DevTools Support (DWARF)} PH1
     * @example {http://web.dev/file.wasm} PH2
     */
    loadedDebugSymbolsForButDidnt: '[{PH1}] Loaded debug symbols for {PH2}, but didn’t find any source files',
    /**
     * @description Status message shown in the Console panel when debugging information is successfully loaded.
     * @example {C/C++ DevTools Support (DWARF)} PH1
     * @example {http://web.dev/file.wasm} PH2
     * @example {42} PH3
     */
    loadedDebugSymbolsForFound: '[{PH1}] Loaded debug symbols for {PH2}, found {PH3} source file(s)',
    /**
     * @description Error message displayed in the Console panel when debugging information cannot be loaded.
     * @example {C/C++ DevTools Support (DWARF)} PH1
     * @example {http://web.dev/file.wasm} PH2
     * @example {File not found} PH3
     */
    failedToLoadDebugSymbolsFor: '[{PH1}] Failed to load debug symbols for {PH2} ({PH3})',
};
const str_ = i18n.i18n.registerUIStrings('models/bindings/DebuggerLanguagePlugins.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/**
 * Generates the raw module ID for a script, which is used
 * to uniquely identify the debugging data for a script on
 * the responsible language #plugin.
 *
 * @param script the unique raw module ID for the script.
 */
function rawModuleIdForScript(script) {
    return `${script.sourceURL}@${script.hash}`;
}
function getRawLocation(callFrame) {
    const { script } = callFrame;
    return {
        rawModuleId: rawModuleIdForScript(script),
        codeOffset: callFrame.location().columnNumber - (script.codeOffset() || 0),
        inlineFrameIndex: callFrame.inlineFrameIndex,
    };
}
class FormattingError extends Error {
    exception;
    exceptionDetails;
    constructor(exception, exceptionDetails) {
        const { description } = exceptionDetails.exception || {};
        super(description || exceptionDetails.text);
        this.exception = exception;
        this.exceptionDetails = exceptionDetails;
    }
    static makeLocal(callFrame, message) {
        const exception = {
            type: "object" /* Protocol.Runtime.RemoteObjectType.Object */,
            subtype: "error" /* Protocol.Runtime.RemoteObjectSubtype.Error */,
            description: message,
        };
        const exceptionDetails = { text: 'Uncaught', exceptionId: -1, columnNumber: 0, lineNumber: 0, exception };
        const errorObject = callFrame.debuggerModel.runtimeModel().createRemoteObject(exception);
        return new FormattingError(errorObject, exceptionDetails);
    }
}
class NamespaceObject extends SDK.RemoteObject.LocalJSONObject {
    get description() {
        return this.type;
    }
    get type() {
        return 'namespace';
    }
}
async function getRemoteObject(callFrame, object) {
    if (!/^(local|global|operand)$/.test(object.valueClass)) {
        return { type: "undefined" /* Protocol.Runtime.RemoteObjectType.Undefined */ };
    }
    const index = Number(object.index);
    const expression = `${object.valueClass}s[${index}]`;
    const response = await callFrame.debuggerModel.agent.invoke_evaluateOnCallFrame({
        callFrameId: callFrame.id,
        expression,
        silent: true,
        generatePreview: true,
        throwOnSideEffect: true,
    });
    if (response.getError() || response.exceptionDetails) {
        return { type: "undefined" /* Protocol.Runtime.RemoteObjectType.Undefined */ };
    }
    return response.result;
}
async function wrapRemoteObject(callFrame, object, plugin) {
    if (object.type === 'reftype') {
        const obj = await getRemoteObject(callFrame, object);
        return callFrame.debuggerModel.runtimeModel().createRemoteObject(obj);
    }
    return new ExtensionRemoteObject(callFrame, object, plugin);
}
class SourceScopeRemoteObject extends SDK.RemoteObject.RemoteObjectImpl {
    variables;
    #callFrame;
    #plugin;
    stopId;
    constructor(callFrame, stopId, plugin) {
        super(callFrame.debuggerModel.runtimeModel(), undefined, 'object', undefined, null);
        this.variables = [];
        this.#callFrame = callFrame;
        this.#plugin = plugin;
        this.stopId = stopId;
    }
    async doGetProperties(_ownProperties, accessorPropertiesOnly, _generatePreview) {
        if (accessorPropertiesOnly) {
            return { properties: [], internalProperties: [] };
        }
        const properties = [];
        const namespaces = Object.create(null);
        function makeProperty(name, obj) {
            return new SDK.RemoteObject.RemoteObjectProperty(name, obj, 
            /* enumerable=*/ false, /* writable=*/ false, /* isOwn=*/ true, /* wasThrown=*/ false);
        }
        for (const variable of this.variables) {
            let sourceVar;
            try {
                const evalResult = await this.#plugin.evaluate(variable.name, getRawLocation(this.#callFrame), this.stopId);
                sourceVar = evalResult ? await wrapRemoteObject(this.#callFrame, evalResult, this.#plugin) :
                    new SDK.RemoteObject.LocalJSONObject(undefined);
            }
            catch (e) {
                console.warn(e);
                sourceVar = new SDK.RemoteObject.LocalJSONObject(undefined);
            }
            if (variable.nestedName && variable.nestedName.length > 1) {
                let parent = namespaces;
                for (let index = 0; index < variable.nestedName.length - 1; index++) {
                    const nestedName = variable.nestedName[index];
                    let child = parent[nestedName];
                    if (!child) {
                        child = new NamespaceObject(Object.create(null));
                        parent[nestedName] = child;
                    }
                    parent = child.value;
                }
                const name = variable.nestedName[variable.nestedName.length - 1];
                parent[name] = sourceVar;
            }
            else {
                properties.push(makeProperty(variable.name, sourceVar));
            }
        }
        for (const namespace in namespaces) {
            properties.push(makeProperty(namespace, (namespaces[namespace])));
        }
        return { properties, internalProperties: [] };
    }
}
export class SourceScope {
    #callFrame;
    #type;
    #typeName;
    #icon;
    #object;
    constructor(callFrame, stopId, type, typeName, icon, plugin) {
        if (icon && new URL(icon).protocol !== 'data:') {
            throw new Error('The icon must be a data:-URL');
        }
        this.#callFrame = callFrame;
        this.#type = type;
        this.#typeName = typeName;
        this.#icon = icon;
        this.#object = new SourceScopeRemoteObject(callFrame, stopId, plugin);
    }
    async getVariableValue(name) {
        for (let v = 0; v < this.#object.variables.length; ++v) {
            if (this.#object.variables[v].name !== name) {
                continue;
            }
            const properties = await this.#object.getAllProperties(false, false);
            if (!properties.properties) {
                continue;
            }
            const { value } = properties.properties[v];
            if (value) {
                return value;
            }
        }
        return null;
    }
    callFrame() {
        return this.#callFrame;
    }
    type() {
        return this.#type;
    }
    typeName() {
        return this.#typeName;
    }
    name() {
        return undefined;
    }
    range() {
        return null;
    }
    object() {
        return this.#object;
    }
    description() {
        return '';
    }
    icon() {
        return this.#icon;
    }
    extraProperties() {
        return [];
    }
}
export class ExtensionRemoteObject extends SDK.RemoteObject.RemoteObject {
    extensionObject;
    plugin;
    callFrame;
    constructor(callFrame, extensionObject, plugin) {
        super();
        this.extensionObject = extensionObject;
        this.plugin = plugin;
        this.callFrame = callFrame;
    }
    get linearMemoryAddress() {
        return this.extensionObject.linearMemoryAddress;
    }
    get linearMemorySize() {
        return this.extensionObject.linearMemorySize;
    }
    get objectId() {
        return this.extensionObject.objectId;
    }
    get type() {
        if (this.extensionObject.type === 'array' || this.extensionObject.type === 'null') {
            return 'object';
        }
        return this.extensionObject.type;
    }
    get subtype() {
        if (this.extensionObject.type === 'array' || this.extensionObject.type === 'null') {
            return this.extensionObject.type;
        }
        return undefined;
    }
    get value() {
        return this.extensionObject.value;
    }
    unserializableValue() {
        return undefined;
    }
    get description() {
        return this.extensionObject.description;
    }
    set description(_description) {
    }
    get hasChildren() {
        return this.extensionObject.hasChildren;
    }
    get preview() {
        return undefined;
    }
    get className() {
        return this.extensionObject.className ?? null;
    }
    arrayLength() {
        return 0;
    }
    arrayBufferByteLength() {
        return 0;
    }
    getOwnProperties(_generatePreview, _nonIndexedPropertiesOnly) {
        return this.getAllProperties(false, _generatePreview, _nonIndexedPropertiesOnly);
    }
    async getAllProperties(_accessorPropertiesOnly, _generatePreview, _nonIndexedPropertiesOnly) {
        const { objectId } = this.extensionObject;
        if (objectId) {
            assertNotNullOrUndefined(this.plugin.getProperties);
            const extensionObjectProperties = await this.plugin.getProperties(objectId);
            const properties = await Promise.all(extensionObjectProperties.map(async (p) => new SDK.RemoteObject.RemoteObjectProperty(p.name, await wrapRemoteObject(this.callFrame, p.value, this.plugin))));
            return { properties, internalProperties: null };
        }
        return { properties: null, internalProperties: null };
    }
    release() {
        const { objectId } = this.extensionObject;
        if (objectId) {
            assertNotNullOrUndefined(this.plugin.releaseObject);
            void this.plugin.releaseObject(objectId);
        }
    }
    debuggerModel() {
        return this.callFrame.debuggerModel;
    }
    runtimeModel() {
        return this.callFrame.debuggerModel.runtimeModel();
    }
    isLinearMemoryInspectable() {
        return this.extensionObject.linearMemoryAddress !== undefined;
    }
}
export class DebuggerLanguagePluginManager {
    #workspace;
    #debuggerWorkspaceBinding;
    #console;
    #plugins;
    #debuggerModelToData;
    #rawModuleHandles;
    callFrameByStopId = new Map();
    stopIdByCallFrame = new Map();
    nextStopId = 0n;
    constructor(targetManager, workspace, debuggerWorkspaceBinding, console) {
        this.#workspace = workspace;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.#console = console;
        this.#plugins = [];
        this.#debuggerModelToData = new Map();
        targetManager.observeModels(SDK.DebuggerModel.DebuggerModel, this);
        this.#rawModuleHandles = new Map();
    }
    async evaluateOnCallFrame(callFrame, options) {
        const { script } = callFrame;
        const { expression, returnByValue, throwOnSideEffect } = options;
        const { plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return null;
        }
        const location = getRawLocation(callFrame);
        const sourceLocations = await plugin.rawLocationToSourceLocation(location);
        if (sourceLocations.length === 0) {
            return null;
        }
        if (returnByValue) {
            return { error: 'Cannot return by value' };
        }
        if (throwOnSideEffect) {
            return { error: 'Cannot guarantee side-effect freedom' };
        }
        try {
            const object = await plugin.evaluate(expression, location, this.stopIdForCallFrame(callFrame));
            if (object) {
                return { object: await wrapRemoteObject(callFrame, object, plugin) };
            }
            return { object: new SDK.RemoteObject.LocalJSONObject(undefined) };
        }
        catch (error) {
            if (error instanceof FormattingError) {
                const { exception: object, exceptionDetails } = error;
                return { object, exceptionDetails };
            }
            const { exception: object, exceptionDetails } = FormattingError.makeLocal(callFrame, error.message);
            return { object, exceptionDetails };
        }
    }
    stopIdForCallFrame(callFrame) {
        let stopId = this.stopIdByCallFrame.get(callFrame);
        if (stopId !== undefined) {
            return stopId;
        }
        stopId = this.nextStopId++;
        this.stopIdByCallFrame.set(callFrame, stopId);
        this.callFrameByStopId.set(stopId, callFrame);
        return stopId;
    }
    callFrameForStopId(stopId) {
        return this.callFrameByStopId.get(stopId);
    }
    modelAdded(debuggerModel) {
        this.#debuggerModelToData.set(debuggerModel, new ModelData(debuggerModel, this.#workspace));
        debuggerModel.addEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this.globalObjectCleared, this);
        debuggerModel.addEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, this.parsedScriptSource, this);
        debuggerModel.addEventListener(SDK.DebuggerModel.Events.DebuggerResumed, this.debuggerResumed, this);
        debuggerModel.setEvaluateOnCallFrameCallback(this.evaluateOnCallFrame.bind(this));
    }
    modelRemoved(debuggerModel) {
        debuggerModel.removeEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this.globalObjectCleared, this);
        debuggerModel.removeEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, this.parsedScriptSource, this);
        debuggerModel.removeEventListener(SDK.DebuggerModel.Events.DebuggerResumed, this.debuggerResumed, this);
        debuggerModel.setEvaluateOnCallFrameCallback(null);
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (modelData) {
            modelData.dispose();
            this.#debuggerModelToData.delete(debuggerModel);
        }
        this.#rawModuleHandles.forEach((rawModuleHandle, rawModuleId) => {
            const scripts = rawModuleHandle.scripts.filter(script => script.debuggerModel !== debuggerModel);
            if (scripts.length === 0) {
                rawModuleHandle.plugin.removeRawModule(rawModuleId).catch(error => {
                    this.#console.error(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }), 
                    /* show=*/ false);
                });
                this.#rawModuleHandles.delete(rawModuleId);
            }
            else {
                rawModuleHandle.scripts = scripts;
            }
        });
    }
    globalObjectCleared(event) {
        const debuggerModel = event.data;
        this.modelRemoved(debuggerModel);
        this.modelAdded(debuggerModel);
    }
    addPlugin(plugin) {
        this.#plugins.push(plugin);
        for (const debuggerModel of this.#debuggerModelToData.keys()) {
            for (const script of debuggerModel.scripts()) {
                if (this.hasPluginForScript(script)) {
                    continue;
                }
                this.parsedScriptSource({ data: script });
            }
        }
    }
    removePlugin(plugin) {
        this.#plugins = this.#plugins.filter(p => p !== plugin);
        const scripts = new Set();
        this.#rawModuleHandles.forEach((rawModuleHandle, rawModuleId) => {
            if (rawModuleHandle.plugin !== plugin) {
                return;
            }
            rawModuleHandle.scripts.forEach(script => scripts.add(script));
            this.#rawModuleHandles.delete(rawModuleId);
        });
        for (const script of scripts) {
            const modelData = this.#debuggerModelToData.get(script.debuggerModel);
            modelData.removeScript(script);
            // Let's see if we have another #plugin that's happy to
            // take this orphaned script now. This is important to
            // get right, since the same #plugin might race during
            // unregister/register and we might already have the
            // new instance of the #plugin added before we remove
            // the previous instance.
            this.parsedScriptSource({ data: script });
            if (!this.hasPluginForScript(script)) {
                void this.#debuggerWorkspaceBinding.updateLocations(script);
            }
        }
    }
    hasPluginForScript(script) {
        const rawModuleId = rawModuleIdForScript(script);
        const rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
        return rawModuleHandle?.scripts.includes(script) ?? false;
    }
    /**
     * Returns the responsible language #plugin and the raw module ID for a script.
     *
     * This ensures that the `addRawModule` call finishes first such that the
     * caller can immediately issue calls to the returned #plugin without the
     * risk of racing with the `addRawModule` call. The returned #plugin will be
     * set to undefined to indicate that there's no #plugin for the script.
     */
    async rawModuleIdAndPluginForScript(script) {
        const rawModuleId = rawModuleIdForScript(script);
        const rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
        if (rawModuleHandle) {
            await rawModuleHandle.addRawModulePromise;
            if (rawModuleHandle === this.#rawModuleHandles.get(rawModuleId)) {
                return { rawModuleId, plugin: rawModuleHandle.plugin };
            }
        }
        return { rawModuleId, plugin: null };
    }
    uiSourceCodeForURL(debuggerModel, url, script) {
        const modelData = this.#debuggerModelToData.get(debuggerModel);
        if (modelData) {
            return modelData.uiSourceCodeForURL(url, script);
        }
        return null;
    }
    async rawLocationToUILocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return null;
        }
        const pluginLocation = {
            rawModuleId,
            // RawLocation.#columnNumber is the byte offset in the full raw wasm module. Plugins expect the offset in the code
            // section, so subtract the offset of the code section in the module here.
            codeOffset: rawLocation.columnNumber - (script.codeOffset() || 0),
            inlineFrameIndex: rawLocation.inlineFrameIndex,
        };
        try {
            const sourceLocations = await plugin.rawLocationToSourceLocation(pluginLocation);
            for (const sourceLocation of sourceLocations) {
                const uiSourceCode = this.uiSourceCodeForURL(script.debuggerModel, sourceLocation.sourceFileURL, script);
                if (!uiSourceCode) {
                    continue;
                }
                // Absence of column information is indicated by the value `-1` in talking to language #plugins.
                return uiSourceCode.uiLocation(sourceLocation.lineNumber, sourceLocation.columnNumber >= 0 ? sourceLocation.columnNumber : undefined);
            }
        }
        catch (error) {
            this.#console.error(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }), /* show=*/ false);
        }
        return null;
    }
    uiLocationToRawLocationRanges(uiSourceCode, lineNumber, columnNumber = -1) {
        const locationPromises = [];
        this.scriptsForUISourceCode(uiSourceCode).forEach(script => {
            const rawModuleId = rawModuleIdForScript(script);
            const rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
            if (!rawModuleHandle) {
                return;
            }
            const { plugin } = rawModuleHandle;
            locationPromises.push(getLocations(rawModuleId, plugin, script));
        });
        if (locationPromises.length === 0) {
            return Promise.resolve(null);
        }
        return Promise.all(locationPromises).then(locations => locations.flat()).catch(error => {
            this.#console.error(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }), /* show=*/ false);
            return null;
        });
        async function getLocations(rawModuleId, plugin, script) {
            const pluginLocation = { rawModuleId, sourceFileURL: uiSourceCode.url(), lineNumber, columnNumber };
            const rawLocations = await plugin.sourceLocationToRawLocation(pluginLocation);
            if (!rawLocations) {
                return [];
            }
            return rawLocations.map(m => ({
                start: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.startOffset) + (script.codeOffset() || 0)),
                end: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.endOffset) + (script.codeOffset() || 0)),
            }));
        }
    }
    async uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const locationRanges = await this.uiLocationToRawLocationRanges(uiSourceCode, lineNumber, columnNumber);
        if (!locationRanges) {
            return null;
        }
        return locationRanges.map(({ start }) => start);
    }
    async uiLocationRangeToRawLocationRanges(uiSourceCode, textRange) {
        const locationRangesPromises = [];
        for (let line = textRange.startLine; line <= textRange.endLine; ++line) {
            locationRangesPromises.push(this.uiLocationToRawLocationRanges(uiSourceCode, line));
        }
        const ranges = [];
        for (const locationRanges of await Promise.all(locationRangesPromises)) {
            if (locationRanges === null) {
                return null;
            }
            for (const range of locationRanges) {
                const [startLocation, endLocation] = await Promise.all([
                    this.rawLocationToUILocation(range.start),
                    this.rawLocationToUILocation(range.end),
                ]);
                if (startLocation === null || endLocation === null) {
                    continue;
                }
                // Report all ranges that somehow intersect with the `textRange`. It's the
                // responsibility of the caller to filter / clamp these ranges appropriately.
                const overlap = textRange.intersection(new TextUtils.TextRange.TextRange(startLocation.lineNumber, startLocation.columnNumber ?? 0, endLocation.lineNumber, endLocation.columnNumber ?? Infinity));
                if (!overlap.isEmpty()) {
                    ranges.push(range);
                }
            }
        }
        return ranges;
    }
    /**
     * Translates a raw frame via the language plugin responsible for its script.
     *
     * @returns null if no plugin is responsible for the frame. Otherwise the frame is translated, either
     * successfully, or identity mapped with the "missing debug info details" attached.
     */
    async translateRawFrame(frame, target) {
        const script = target.model(SDK.DebuggerModel.DebuggerModel)?.scriptForId(frame.scriptId ?? '');
        if (!script) {
            return null;
        }
        const functionInfo = await this.getFunctionInfo(script, frame);
        if (!functionInfo) {
            return null;
        }
        if ('frames' in functionInfo && functionInfo.frames.length) {
            const framePromises = functionInfo.frames.map(async ({ name }, index) => {
                const rawLocation = new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, frame.lineNumber, frame.columnNumber, index);
                const uiLocation = await this.rawLocationToUILocation(rawLocation);
                return translatedFromUILocation(uiLocation, name, frame);
            });
            return { kind: "VISIBLE" /* StackTraceImpl.Trie.FrameKind.VISIBLE */, frames: await Promise.all(framePromises), unmapped: false };
        }
        // Translate the location only. We go through via "DebuggerWorkspaceBinding". It'll still try the plugin
        // first, but this way, we'll get a UISourceCode for the raw script if the plugin fails to translate.
        const uiLocation = await this.#debuggerWorkspaceBinding.rawLocationToUILocation(new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, frame.lineNumber, frame.columnNumber));
        const mappedFrame = translatedFromUILocation(uiLocation, frame.functionName, frame);
        const missingDebugInfo = 'missingSymbolFiles' in functionInfo && functionInfo.missingSymbolFiles.length ?
            {
                type: "PARTIAL_INFO" /* StackTrace.StackTrace.MissingDebugInfoType.PARTIAL_INFO */,
                missingDebugFiles: functionInfo.missingSymbolFiles,
            } :
            { type: "NO_INFO" /* StackTrace.StackTrace.MissingDebugInfoType.NO_INFO */ };
        return { kind: "VISIBLE" /* StackTraceImpl.Trie.FrameKind.VISIBLE */, frames: [{ ...mappedFrame, missingDebugInfo }], unmapped: true };
        function translatedFromUILocation(uiLocation, name, fallback) {
            if (uiLocation) {
                return {
                    uiSourceCode: uiLocation.uiSourceCode,
                    name,
                    line: uiLocation.lineNumber,
                    column: uiLocation.columnNumber ?? -1,
                };
            }
            return {
                url: fallback.url,
                name: fallback.functionName,
                line: fallback.lineNumber,
                column: fallback.columnNumber,
            };
        }
    }
    scriptsForUISourceCode(uiSourceCode) {
        for (const modelData of this.#debuggerModelToData.values()) {
            const scripts = modelData.uiSourceCodeToScripts.get(uiSourceCode);
            if (scripts) {
                return scripts;
            }
        }
        return [];
    }
    setDebugInfoURL(script, externalURL) {
        if (this.hasPluginForScript(script)) {
            return;
        }
        script.debugSymbols = { type: "ExternalDWARF" /* Protocol.Debugger.DebugSymbolsType.ExternalDWARF */, externalURL };
        this.parsedScriptSource({ data: script });
        void script.debuggerModel.setDebugInfoURL(script, externalURL);
    }
    parsedScriptSource(event) {
        const script = event.data;
        if (!script.sourceURL) {
            return;
        }
        for (const plugin of this.#plugins) {
            if (!plugin.handleScript(script)) {
                continue;
            }
            const rawModuleId = rawModuleIdForScript(script);
            let rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
            if (!rawModuleHandle) {
                const sourceFileURLsPromise = (async () => {
                    const console = this.#console;
                    const url = script.sourceURL;
                    const symbolsUrl = (script.debugSymbols?.externalURL) || '';
                    if (symbolsUrl) {
                        console.log(i18nString(UIStrings.loadingDebugSymbolsForVia, { PH1: plugin.name, PH2: url, PH3: symbolsUrl }));
                    }
                    else {
                        console.log(i18nString(UIStrings.loadingDebugSymbolsFor, { PH1: plugin.name, PH2: url }));
                    }
                    try {
                        const code = (!symbolsUrl && Common.ParsedURL.schemeIs(url, 'wasm:')) ? await script.getWasmBytecode() : undefined;
                        const addModuleResult = await plugin.addRawModule(rawModuleId, symbolsUrl, { url, code });
                        // Check that the handle isn't stale by now. This works because the code that assigns to
                        // `rawModuleHandle` below will run before this code because of the `await` in the preceding
                        // line. This is primarily to avoid logging the message below, which would give the developer
                        // the misleading information that we're done, while in reality it was a stale call that finished.
                        if (rawModuleHandle !== this.#rawModuleHandles.get(rawModuleId)) {
                            return [];
                        }
                        if ('missingSymbolFiles' in addModuleResult) {
                            const initiator = plugin.createPageResourceLoadInitiator();
                            const missingSymbolFiles = addModuleResult.missingSymbolFiles.map(resource => {
                                const resourceUrl = resource;
                                return { resourceUrl, initiator };
                            });
                            return { missingSymbolFiles };
                        }
                        const sourceFileURLs = addModuleResult;
                        if (sourceFileURLs.length === 0) {
                            console.warn(i18nString(UIStrings.loadedDebugSymbolsForButDidnt, { PH1: plugin.name, PH2: url }));
                        }
                        else {
                            console.log(i18nString(UIStrings.loadedDebugSymbolsForFound, { PH1: plugin.name, PH2: url, PH3: sourceFileURLs.length }));
                        }
                        return sourceFileURLs;
                    }
                    catch (error) {
                        console.error(i18nString(UIStrings.failedToLoadDebugSymbolsFor, { PH1: plugin.name, PH2: url, PH3: error.message }), 
                        /* show=*/ false);
                        this.#rawModuleHandles.delete(rawModuleId);
                        return [];
                    }
                })();
                rawModuleHandle = { rawModuleId, plugin, scripts: [script], addRawModulePromise: sourceFileURLsPromise };
                this.#rawModuleHandles.set(rawModuleId, rawModuleHandle);
            }
            else {
                rawModuleHandle.scripts.push(script);
            }
            // Wait for the addRawModule call to finish and
            // update the #project. It's important to check
            // for the DebuggerModel again, which may disappear
            // in the meantime...
            void rawModuleHandle.addRawModulePromise.then(sourceFileURLs => {
                // The script might have disappeared meanwhile...
                if (script.debuggerModel.scriptForId(script.scriptId) === script) {
                    const modelData = this.#debuggerModelToData.get(script.debuggerModel);
                    if (modelData && Array.isArray(sourceFileURLs)) { // The DebuggerModel could have disappeared meanwhile...
                        modelData.addSourceFiles(script, sourceFileURLs);
                    }
                    void this.#debuggerWorkspaceBinding.updateLocations(script);
                }
            });
            return;
        }
    }
    debuggerResumed(event) {
        const resumedFrames = Array.from(this.callFrameByStopId.values()).filter(callFrame => callFrame.debuggerModel === event.data);
        for (const callFrame of resumedFrames) {
            const stopId = this.stopIdByCallFrame.get(callFrame);
            assertNotNullOrUndefined(stopId);
            this.stopIdByCallFrame.delete(callFrame);
            this.callFrameByStopId.delete(stopId);
        }
    }
    getSourcesForScript(script) {
        const rawModuleId = rawModuleIdForScript(script);
        const rawModuleHandle = this.#rawModuleHandles.get(rawModuleId);
        if (rawModuleHandle) {
            return rawModuleHandle.addRawModulePromise;
        }
        return Promise.resolve(undefined);
    }
    async resolveScopeChain(callFrame) {
        const script = callFrame.script;
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return null;
        }
        const location = {
            rawModuleId,
            codeOffset: callFrame.location().columnNumber - (script.codeOffset() || 0),
            inlineFrameIndex: callFrame.inlineFrameIndex,
        };
        const stopId = this.stopIdForCallFrame(callFrame);
        try {
            const sourceMapping = await plugin.rawLocationToSourceLocation(location);
            if (sourceMapping.length === 0) {
                return null;
            }
            const scopes = new Map();
            const variables = await plugin.listVariablesInScope(location);
            for (const variable of variables || []) {
                let scope = scopes.get(variable.scope);
                if (!scope) {
                    const { type, typeName, icon } = await plugin.getScopeInfo(variable.scope);
                    scope = new SourceScope(callFrame, stopId, type, typeName, icon, plugin);
                    scopes.set(variable.scope, scope);
                }
                scope.object().variables.push(variable);
            }
            return Array.from(scopes.values());
        }
        catch (error) {
            this.#console.error(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }), /* show=*/ false);
            return null;
        }
    }
    async getFunctionInfo(script, location) {
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return null;
        }
        const rawLocation = {
            rawModuleId,
            codeOffset: location.columnNumber - (script.codeOffset() || 0),
            inlineFrameIndex: 0,
        };
        try {
            const functionInfo = await plugin.getFunctionInfo(rawLocation);
            if ('missingSymbolFiles' in functionInfo) {
                const initiator = plugin.createPageResourceLoadInitiator();
                const missingSymbolFiles = functionInfo.missingSymbolFiles.map(resource => {
                    const resourceUrl = resource;
                    return { resourceUrl, initiator };
                });
                return { missingSymbolFiles, ...('frames' in functionInfo && { frames: functionInfo.frames }) };
            }
            return functionInfo;
        }
        catch (error) {
            this.#console.warn(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
            return { frames: [] };
        }
    }
    async getInlinedFunctionRanges(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return [];
        }
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return [];
        }
        const pluginLocation = {
            rawModuleId,
            // RawLocation.#columnNumber is the byte offset in the full raw wasm module. Plugins expect the offset in the code
            // section, so subtract the offset of the code section in the module here.
            codeOffset: rawLocation.columnNumber - (script.codeOffset() || 0),
        };
        try {
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
            // @ts-expect-error
            const locations = await plugin.getInlinedFunctionRanges(pluginLocation);
            return locations.map(m => ({
                start: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.startOffset) + (script.codeOffset() || 0)),
                end: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.endOffset) + (script.codeOffset() || 0)),
            }));
        }
        catch (error) {
            this.#console.warn(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
            return [];
        }
    }
    async getInlinedCalleesRanges(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return [];
        }
        const { rawModuleId, plugin } = await this.rawModuleIdAndPluginForScript(script);
        if (!plugin) {
            return [];
        }
        const pluginLocation = {
            rawModuleId,
            // RawLocation.#columnNumber is the byte offset in the full raw wasm module. Plugins expect the offset in the code
            // section, so subtract the offset of the code section in the module here.
            codeOffset: rawLocation.columnNumber - (script.codeOffset() || 0),
        };
        try {
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
            // @ts-expect-error
            const locations = await plugin.getInlinedCalleesRanges(pluginLocation);
            return locations.map(m => ({
                start: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.startOffset) + (script.codeOffset() || 0)),
                end: new SDK.DebuggerModel.Location(script.debuggerModel, script.scriptId, 0, Number(m.endOffset) + (script.codeOffset() || 0)),
            }));
        }
        catch (error) {
            this.#console.warn(i18nString(UIStrings.errorInDebuggerLanguagePlugin, { PH1: error.message }));
            return [];
        }
    }
    async getMappedLines(uiSourceCode) {
        const rawModuleIds = await Promise.all(this.scriptsForUISourceCode(uiSourceCode).map(s => this.rawModuleIdAndPluginForScript(s)));
        let mappedLines = null;
        for (const { rawModuleId, plugin } of rawModuleIds) {
            if (!plugin) {
                continue;
            }
            const lines = await plugin.getMappedLines(rawModuleId, uiSourceCode.url());
            if (lines === undefined) {
                continue;
            }
            if (mappedLines === null) {
                mappedLines = new Set(lines);
            }
            else {
                lines.forEach(l => mappedLines.add(l));
            }
        }
        return mappedLines;
    }
}
class ModelData {
    #debuggerModel;
    #workspace;
    #projects = new Map();
    uiSourceCodeToScripts;
    constructor(debuggerModel, workspace) {
        this.#debuggerModel = debuggerModel;
        this.#workspace = workspace;
        this.uiSourceCodeToScripts = new Map();
    }
    #projectIdForScript(script) {
        const securityOrigin = script.securityOrigin();
        const originPart = securityOrigin.isOpaque() ? '' : `:${securityOrigin.siteId()}`;
        return `language_plugins::${this.#debuggerModel.target().id()}${originPart}`;
    }
    #projectForScript(script) {
        const projectId = this.#projectIdForScript(script);
        let project = this.#projects.get(projectId);
        if (!project) {
            project = new ContentProviderBasedProject(this.#workspace, projectId, Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */, script.securityOrigin());
            NetworkProject.setTargetForProject(project, this.#debuggerModel.target());
            this.#projects.set(projectId, project);
        }
        return project;
    }
    addSourceFiles(script, urls) {
        const project = this.#projectForScript(script);
        const initiator = script.createPageResourceLoadInitiator();
        for (const url of urls) {
            let uiSourceCode = project.uiSourceCodeForURL(url);
            if (!uiSourceCode) {
                uiSourceCode = project.createUISourceCode(url, Common.ResourceType.resourceTypes.SourceMapScript);
                NetworkProject.setInitialFrameAttribution(uiSourceCode, script.frameId);
                // Bind the uiSourceCode to the script first before we add the
                // uiSourceCode to the #project and thereby notify the rest of
                // the system about the new source file.
                // https://crbug.com/1150295 is an example where the breakpoint
                // resolution logic kicks in right after adding the uiSourceCode
                // and at that point we already need to have the mapping in place
                // otherwise we will not get the breakpoint right.
                this.uiSourceCodeToScripts.set(uiSourceCode, [script]);
                const contentProvider = new SDK.CompilerSourceMappingContentProvider.CompilerSourceMappingContentProvider(url, Common.ResourceType.resourceTypes.SourceMapScript, initiator, script.target().targetManager().getPageResourceLoader());
                const mimeType = Common.ResourceType.ResourceType.mimeFromURL(url) || 'text/javascript';
                project.addUISourceCodeWithProvider(uiSourceCode, contentProvider, null, mimeType);
            }
            else {
                // The same uiSourceCode can be provided by different scripts,
                // but we don't expect that to happen frequently.
                const scripts = this.uiSourceCodeToScripts.get(uiSourceCode);
                if (!scripts.includes(script)) {
                    scripts.push(script);
                }
            }
        }
    }
    removeScript(script) {
        this.uiSourceCodeToScripts.forEach((scripts, uiSourceCode) => {
            scripts = scripts.filter(s => s !== script);
            if (scripts.length === 0) {
                this.uiSourceCodeToScripts.delete(uiSourceCode);
                uiSourceCode.project().removeUISourceCode(uiSourceCode.url());
            }
            else {
                this.uiSourceCodeToScripts.set(uiSourceCode, scripts);
            }
        });
    }
    dispose() {
        for (const project of this.#projects.values()) {
            project.dispose();
        }
        this.#projects.clear();
    }
    uiSourceCodeForURL(url, script) {
        if (script) {
            return this.#projects.get(this.#projectIdForScript(script))?.uiSourceCodeForURL(url) ?? null;
        }
        for (const project of this.#projects.values()) {
            const uiSourceCode = project.uiSourceCodeForURL(url);
            if (uiSourceCode) {
                return uiSourceCode;
            }
        }
        return null;
    }
}
//# sourceMappingURL=DebuggerLanguagePlugins.js.map