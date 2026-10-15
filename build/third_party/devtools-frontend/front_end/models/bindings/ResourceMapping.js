// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Formatter from '../formatter/formatter.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
import { resourceMetadata } from './ResourceUtils.js';
const styleSheetRangeMap = new WeakMap();
const scriptRangeMap = new WeakMap();
const boundUISourceCodes = new WeakSet();
function computeScriptRange(script) {
    return new TextUtils.TextRange.TextRange(script.lineOffset, script.columnOffset, script.endLine, script.endColumn);
}
function computeStyleSheetRange(header) {
    return new TextUtils.TextRange.TextRange(header.startLine, header.startColumn, header.endLine, header.endColumn);
}
export class ResourceMapping {
    workspace;
    #modelToInfo = new Map();
    #debuggerLocationUpdater = null;
    #cssLocationUpdater = null;
    constructor(targetManager, workspace) {
        this.workspace = workspace;
        targetManager.observeModels(SDK.ResourceTreeModel.ResourceTreeModel, this);
    }
    get debuggerLocationUpdater() {
        // TODO(crbug.com/458180550): Throw when this.#debuggerLocationUpdater is null and never return null.
        //                            The only reason we don't throw and return an instance unconditionally
        //                            is that unit tests often don't set-up both updaters.
        return this.#debuggerLocationUpdater;
    }
    /* The concrete DebuggerWorkspaceBinding requires ResourceMapping during construction, so we must wire up this updater afterward. */
    set debuggerLocationUpdater(debuggerLocationUpdater) {
        if (this.#debuggerLocationUpdater) {
            throw new Error('DebuggerLocationUpdater already set');
        }
        this.#debuggerLocationUpdater = debuggerLocationUpdater;
    }
    get cssLocationUpdater() {
        // TODO(crbug.com/458180550): Throw when this.#cssLocationUpdater is null and never return null.
        //                            The only reason we don't throw and return an instance unconditionally
        //                            is that unit tests often don't set-up both updaters.
        return this.#cssLocationUpdater;
    }
    /* The concrete CSSWorkspaceBinding requires ResourceMapping during construction, so we must wire up this updater afterward. */
    set cssLocationUpdater(cssLocationUpdater) {
        if (this.#cssLocationUpdater) {
            throw new Error('CSSLocationUpdater already set');
        }
        this.#cssLocationUpdater = cssLocationUpdater;
    }
    modelAdded(resourceTreeModel) {
        const info = new ModelInfo(this, resourceTreeModel);
        this.#modelToInfo.set(resourceTreeModel, info);
    }
    modelRemoved(resourceTreeModel) {
        const info = this.#modelToInfo.get(resourceTreeModel);
        if (info) {
            info.dispose();
            this.#modelToInfo.delete(resourceTreeModel);
        }
    }
    infoForTarget(target) {
        const resourceTreeModel = target.model(SDK.ResourceTreeModel.ResourceTreeModel);
        return resourceTreeModel ? this.#modelToInfo.get(resourceTreeModel) || null : null;
    }
    uiSourceCodeForScript(script) {
        const info = this.infoForTarget(script.debuggerModel.target());
        if (!info) {
            return null;
        }
        const project = info.getProject();
        const uiSourceCode = project.uiSourceCodeForURL(script.sourceURL);
        return uiSourceCode;
    }
    cssLocationToUILocation(cssLocation) {
        const header = cssLocation.header();
        if (!header) {
            return null;
        }
        const info = this.infoForTarget(cssLocation.cssModel().target());
        if (!info) {
            return null;
        }
        const uiSourceCode = info.getProject().uiSourceCodeForURL(cssLocation.url);
        if (!uiSourceCode) {
            return null;
        }
        const offset = styleSheetRangeMap.get(header) ?? computeStyleSheetRange(header);
        const lineNumber = cssLocation.lineNumber + offset.startLine - header.startLine;
        let columnNumber = cssLocation.columnNumber;
        if (cssLocation.lineNumber === header.startLine) {
            columnNumber += offset.startColumn - header.startColumn;
        }
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    jsLocationToUILocation(jsLocation) {
        const script = jsLocation.script();
        if (!script) {
            return null;
        }
        const info = this.infoForTarget(jsLocation.debuggerModel.target());
        if (!info) {
            return null;
        }
        const embedderName = script.embedderName();
        if (!embedderName) {
            return null;
        }
        const uiSourceCode = info.getProject().uiSourceCodeForURL(embedderName);
        if (!uiSourceCode) {
            return null;
        }
        const { startLine, startColumn } = scriptRangeMap.get(script) ?? computeScriptRange(script);
        let { lineNumber, columnNumber } = jsLocation;
        if (lineNumber === script.lineOffset) {
            columnNumber += startColumn - script.columnOffset;
        }
        lineNumber += startLine - script.lineOffset;
        if (script.hasSourceURL) {
            if (lineNumber === 0) {
                columnNumber += script.columnOffset;
            }
            lineNumber += script.lineOffset;
        }
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    uiLocationToJSLocations(uiSourceCode, lineNumber, columnNumber) {
        if (!boundUISourceCodes.has(uiSourceCode)) {
            return [];
        }
        const target = NetworkProject.targetForUISourceCode(uiSourceCode);
        if (!target) {
            return [];
        }
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        if (!debuggerModel) {
            return [];
        }
        const locations = [];
        for (const script of debuggerModel.scripts()) {
            if (script.embedderName() !== uiSourceCode.url()) {
                continue;
            }
            const range = scriptRangeMap.get(script) ?? computeScriptRange(script);
            if (!range.containsLocation(lineNumber, columnNumber)) {
                continue;
            }
            let scriptLineNumber = lineNumber;
            let scriptColumnNumber = columnNumber;
            if (script.hasSourceURL) {
                scriptLineNumber -= range.startLine;
                if (scriptLineNumber === 0) {
                    scriptColumnNumber -= range.startColumn;
                }
            }
            locations.push(debuggerModel.createRawLocation(script, scriptLineNumber, scriptColumnNumber));
        }
        return locations;
    }
    uiLocationRangeToJSLocationRanges(uiSourceCode, textRange) {
        if (!boundUISourceCodes.has(uiSourceCode)) {
            return null;
        }
        const target = NetworkProject.targetForUISourceCode(uiSourceCode);
        if (!target) {
            return null;
        }
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        if (!debuggerModel) {
            return null;
        }
        const ranges = [];
        for (const script of debuggerModel.scripts()) {
            if (script.embedderName() !== uiSourceCode.url()) {
                continue;
            }
            const scriptTextRange = scriptRangeMap.get(script) ?? computeScriptRange(script);
            const range = scriptTextRange.intersection(textRange);
            if (range.isEmpty()) {
                continue;
            }
            let { startLine, startColumn, endLine, endColumn } = range;
            if (script.hasSourceURL) {
                startLine -= range.startLine;
                if (startLine === 0) {
                    startColumn -= range.startColumn;
                }
                endLine -= range.startLine;
                if (endLine === 0) {
                    endColumn -= range.startColumn;
                }
            }
            const start = debuggerModel.createRawLocation(script, startLine, startColumn);
            const end = debuggerModel.createRawLocation(script, endLine, endColumn);
            ranges.push({ start, end });
        }
        return ranges;
    }
    getMappedLines(uiSourceCode) {
        if (!boundUISourceCodes.has(uiSourceCode)) {
            return null;
        }
        const target = NetworkProject.targetForUISourceCode(uiSourceCode);
        if (!target) {
            return null;
        }
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        if (!debuggerModel) {
            return null;
        }
        const mappedLines = new Set();
        for (const script of debuggerModel.scripts()) {
            if (script.embedderName() !== uiSourceCode.url()) {
                continue;
            }
            const { startLine, endLine } = scriptRangeMap.get(script) ?? computeScriptRange(script);
            for (let line = startLine; line <= endLine; ++line) {
                mappedLines.add(line);
            }
        }
        return mappedLines;
    }
    uiLocationToCSSLocations(uiLocation) {
        if (!boundUISourceCodes.has(uiLocation.uiSourceCode)) {
            return [];
        }
        const target = NetworkProject.targetForUISourceCode(uiLocation.uiSourceCode);
        if (!target) {
            return [];
        }
        const cssModel = target.model(SDK.CSSModel.CSSModel);
        if (!cssModel) {
            return [];
        }
        return cssModel.createRawLocationsByURL(uiLocation.uiSourceCode.url(), uiLocation.lineNumber, uiLocation.columnNumber);
    }
    async functionBoundsAtRawLocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const info = this.infoForTarget(script.debuggerModel.target());
        if (!info) {
            return null;
        }
        const embedderName = script.embedderName();
        if (!embedderName) {
            return null;
        }
        const uiSourceCode = info.getProject().uiSourceCodeForURL(embedderName);
        if (!uiSourceCode) {
            return null;
        }
        let { lineNumber, columnNumber } = rawLocation;
        lineNumber -= script.lineOffset;
        if (lineNumber === 0) {
            columnNumber -= script.columnOffset;
        }
        const scopeTreeAndText = script ? await SDK.ScopeTreeCache.scopeTreeForScript(script) : null;
        if (!scopeTreeAndText) {
            return null;
        }
        // Find the inner-most scope that maps to the given position.
        const offset = scopeTreeAndText.text.offsetFromPosition(lineNumber, columnNumber);
        const results = [];
        (function walk(nodes) {
            for (const node of nodes) {
                if (!(offset >= node.start && offset < node.end)) {
                    continue;
                }
                results.push(node);
                walk(node.children);
            }
        })([scopeTreeAndText.scopeTree]);
        const result = results.findLast(node => node.kind === 2 /* Formatter.FormatterWorkerPool.ScopeKind.FUNCTION */ ||
            node.kind === 4 /* Formatter.FormatterWorkerPool.ScopeKind.ARROW_FUNCTION */);
        if (!result) {
            return null;
        }
        // Map back to positions.
        const startPosition = scopeTreeAndText.text.positionFromOffset(result.start);
        const endPosition = scopeTreeAndText.text.positionFromOffset(result.end);
        startPosition.lineNumber += script.lineOffset;
        if (startPosition.lineNumber === script.lineOffset) {
            startPosition.columnNumber += script.columnOffset;
        }
        endPosition.lineNumber += script.lineOffset;
        if (endPosition.lineNumber === script.lineOffset) {
            endPosition.columnNumber += script.columnOffset;
        }
        const name = ''; // TODO(crbug.com/452333154): update ScopeVariableAnalysis to include function name.
        const range = new TextUtils.TextRange.TextRange(startPosition.lineNumber, startPosition.columnNumber, endPosition.lineNumber, endPosition.columnNumber);
        return new Workspace.UISourceCode.UIFunctionBounds(uiSourceCode, range, name);
    }
    resetForTest(target) {
        const resourceTreeModel = target.model(SDK.ResourceTreeModel.ResourceTreeModel);
        const info = resourceTreeModel ? this.#modelToInfo.get(resourceTreeModel) : null;
        if (info) {
            info.resetForTest();
        }
    }
}
class ModelInfo {
    project;
    #bindings = new Map();
    #cssModel;
    #eventListeners;
    resourceMapping;
    constructor(resourceMapping, resourceTreeModel) {
        const target = resourceTreeModel.target();
        this.resourceMapping = resourceMapping;
        this.project =
            new ContentProviderBasedProject(resourceMapping.workspace, 'resources:' + target.id(), Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */);
        NetworkProject.setTargetForProject(this.project, target);
        const cssModel = target.model(SDK.CSSModel.CSSModel);
        console.assert(Boolean(cssModel));
        this.#cssModel = cssModel;
        for (const frame of resourceTreeModel.frames()) {
            for (const resource of frame.getResourcesMap().values()) {
                this.addResource(resource);
            }
        }
        this.#eventListeners = [
            resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.ResourceAdded, this.resourceAdded, this),
            resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameWillNavigate, this.frameWillNavigate, this),
            resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameDetached, this.frameDetached, this),
            this.#cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetChanged, event => {
                void this.styleSheetChanged(event);
            }, this),
        ];
    }
    async styleSheetChanged(event) {
        const header = this.#cssModel.styleSheetHeaderForId(event.data.styleSheetId);
        if (!header || !header.isInline || (header.isInline && header.isMutable)) {
            return;
        }
        const binding = this.#bindings.get(header.resourceURL());
        if (!binding) {
            return;
        }
        await binding.styleSheetChanged(header, event.data.edit || null);
    }
    acceptsResource(resource) {
        const resourceType = resource.resourceType();
        // Only load selected resource types from resources.
        if (resourceType !== Common.ResourceType.resourceTypes.Image &&
            resourceType !== Common.ResourceType.resourceTypes.Font &&
            resourceType !== Common.ResourceType.resourceTypes.Document &&
            resourceType !== Common.ResourceType.resourceTypes.Manifest &&
            resourceType !== Common.ResourceType.resourceTypes.Fetch &&
            resourceType !== Common.ResourceType.resourceTypes.XHR) {
            return false;
        }
        // Ignore non-images and non-fonts.
        if (resourceType === Common.ResourceType.resourceTypes.Image && resource.mimeType &&
            !resource.mimeType.startsWith('image')) {
            return false;
        }
        if (resourceType === Common.ResourceType.resourceTypes.Font && resource.mimeType &&
            !resource.mimeType.includes('font')) {
            return false;
        }
        if ((resourceType === Common.ResourceType.resourceTypes.Image ||
            resourceType === Common.ResourceType.resourceTypes.Font) &&
            Common.ParsedURL.schemeIs(resource.contentURL(), 'data:')) {
            return false;
        }
        return true;
    }
    resourceAdded(event) {
        this.addResource(event.data);
    }
    addResource(resource) {
        if (!this.acceptsResource(resource)) {
            return;
        }
        let binding = this.#bindings.get(resource.url);
        if (!binding) {
            binding = new Binding(this, resource);
            this.#bindings.set(resource.url, binding);
        }
        else {
            binding.addResource(resource);
        }
    }
    removeFrameResources(frame) {
        for (const resource of frame.resources()) {
            if (!this.acceptsResource(resource)) {
                continue;
            }
            const binding = this.#bindings.get(resource.url);
            if (!binding) {
                continue;
            }
            if (binding.resources.size === 1) {
                binding.dispose();
                this.#bindings.delete(resource.url);
            }
            else {
                binding.removeResource(resource);
            }
        }
    }
    frameWillNavigate(event) {
        this.removeFrameResources(event.data);
    }
    frameDetached(event) {
        this.removeFrameResources(event.data.frame);
    }
    resetForTest() {
        for (const binding of this.#bindings.values()) {
            binding.dispose();
        }
        this.#bindings.clear();
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        for (const binding of this.#bindings.values()) {
            binding.dispose();
        }
        this.#bindings.clear();
        this.project.removeProject();
    }
    getProject() {
        return this.project;
    }
}
class Binding {
    resources;
    #project;
    #uiSourceCode;
    #edits = [];
    #debuggerLocationUpdater;
    #cssLocationUpdater;
    constructor(modelInfo, resource) {
        this.resources = new Set([resource]);
        this.#project = modelInfo.project;
        this.#debuggerLocationUpdater = modelInfo.resourceMapping.debuggerLocationUpdater;
        this.#cssLocationUpdater = modelInfo.resourceMapping.cssLocationUpdater;
        this.#uiSourceCode = this.#project.createUISourceCode(resource.url, resource.contentType());
        boundUISourceCodes.add(this.#uiSourceCode);
        if (resource.frameId) {
            NetworkProject.setInitialFrameAttribution(this.#uiSourceCode, resource.frameId);
        }
        this.#project.addUISourceCodeWithProvider(this.#uiSourceCode, this, resourceMetadata(resource), resource.mimeType);
        void Promise.all([
            ...this.inlineScripts().map(script => this.#debuggerLocationUpdater?.updateLocations(script)),
            ...this.inlineStyles().map(style => this.#cssLocationUpdater?.updateLocations(style)),
        ]);
    }
    inlineStyles() {
        const target = NetworkProject.targetForUISourceCode(this.#uiSourceCode);
        const stylesheets = [];
        if (!target) {
            return stylesheets;
        }
        const cssModel = target.model(SDK.CSSModel.CSSModel);
        if (cssModel) {
            for (const headerId of cssModel.getStyleSheetIdsForURL(this.#uiSourceCode.url())) {
                const header = cssModel.styleSheetHeaderForId(headerId);
                if (header) {
                    stylesheets.push(header);
                }
            }
        }
        return stylesheets;
    }
    inlineScripts() {
        const target = NetworkProject.targetForUISourceCode(this.#uiSourceCode);
        if (!target) {
            return [];
        }
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        if (!debuggerModel) {
            return [];
        }
        return debuggerModel.scripts().filter(script => script.embedderName() === this.#uiSourceCode.url());
    }
    async styleSheetChanged(stylesheet, edit) {
        this.#edits.push({ stylesheet, edit });
        if (this.#edits.length > 1) {
            return;
        } // There is already a styleSheetChanged loop running
        const content = await this.#uiSourceCode.requestContentData();
        if (!TextUtils.ContentData.ContentData.isError(content)) {
            await this.innerStyleSheetChanged(content.text);
        }
        this.#edits = [];
    }
    async innerStyleSheetChanged(content) {
        const scripts = this.inlineScripts();
        const styles = this.inlineStyles();
        let text = new TextUtils.Text.Text(content);
        for (const data of this.#edits) {
            const edit = data.edit;
            if (!edit) {
                continue;
            }
            const stylesheet = data.stylesheet;
            const startLocation = styleSheetRangeMap.get(stylesheet) ?? computeStyleSheetRange(stylesheet);
            const oldRange = edit.oldRange.relativeFrom(startLocation.startLine, startLocation.startColumn);
            const newRange = edit.newRange.relativeFrom(startLocation.startLine, startLocation.startColumn);
            text = new TextUtils.Text.Text(text.replaceRange(oldRange, edit.newText));
            const updatePromises = [];
            for (const script of scripts) {
                const range = scriptRangeMap.get(script) ?? computeScriptRange(script);
                if (!range.follows(oldRange)) {
                    continue;
                }
                scriptRangeMap.set(script, range.rebaseAfterTextEdit(oldRange, newRange));
                updatePromises.push(this.#debuggerLocationUpdater?.updateLocations(script));
            }
            for (const style of styles) {
                const range = styleSheetRangeMap.get(style) ?? computeStyleSheetRange(style);
                if (!range.follows(oldRange)) {
                    continue;
                }
                styleSheetRangeMap.set(style, range.rebaseAfterTextEdit(oldRange, newRange));
                updatePromises.push(this.#cssLocationUpdater?.updateLocations(style));
            }
            await Promise.all(updatePromises);
        }
        this.#uiSourceCode.addRevision(text.value());
    }
    addResource(resource) {
        this.resources.add(resource);
        if (resource.frameId) {
            NetworkProject.addFrameAttribution(this.#uiSourceCode, resource.frameId);
        }
    }
    removeResource(resource) {
        this.resources.delete(resource);
        if (resource.frameId) {
            NetworkProject.removeFrameAttribution(this.#uiSourceCode, resource.frameId);
        }
    }
    dispose() {
        this.#project.removeUISourceCode(this.#uiSourceCode.url());
        void Promise.all([
            ...this.inlineScripts().map(script => this.#debuggerLocationUpdater?.updateLocations(script)),
            ...this.inlineStyles().map(style => this.#cssLocationUpdater?.updateLocations(style)),
        ]);
    }
    firstResource() {
        console.assert(this.resources.size > 0);
        return this.resources.values().next().value;
    }
    contentURL() {
        return this.firstResource().contentURL();
    }
    contentType() {
        return this.firstResource().contentType();
    }
    requestContentData() {
        return this.firstResource().requestContentData();
    }
    searchInContent(query, caseSensitive, isRegex) {
        return this.firstResource().searchInContent(query, caseSensitive, isRegex);
    }
}
//# sourceMappingURL=ResourceMapping.js.map