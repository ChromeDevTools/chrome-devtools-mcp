// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
export class SASSSourceMapping {
    #sourceMapManager;
    #project;
    #eventListeners;
    #bindings;
    #cssWorkspaceBinding;
    constructor(target, sourceMapManager, workspace, cssWorkspaceBinding) {
        this.#sourceMapManager = sourceMapManager;
        this.#cssWorkspaceBinding = cssWorkspaceBinding;
        this.#project =
            new ContentProviderBasedProject(workspace, 'cssSourceMaps:' + target.id(), Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */);
        NetworkProject.setTargetForProject(this.#project, target);
        this.#bindings = new Map();
        this.#eventListeners = [
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this),
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this),
        ];
    }
    sourceMapAttachedForTest(_sourceMap) {
    }
    async sourceMapAttached(event) {
        const header = event.data.client;
        const sourceMap = event.data.sourceMap;
        const project = this.#project;
        const bindings = this.#bindings;
        for (const sourceURL of sourceMap.sourceURLs()) {
            let binding = bindings.get(sourceURL);
            if (!binding) {
                binding = new Binding(project, sourceURL, header.createPageResourceLoadInitiator(), header.cssModel().target().targetManager().getPageResourceLoader());
                bindings.set(sourceURL, binding);
            }
            binding.addSourceMap(sourceMap, header.frameId);
        }
        await this.#cssWorkspaceBinding.updateLocations(header);
        this.sourceMapAttachedForTest(sourceMap);
    }
    async sourceMapDetached(event) {
        const header = event.data.client;
        const sourceMap = event.data.sourceMap;
        const bindings = this.#bindings;
        for (const sourceURL of sourceMap.sourceURLs()) {
            const binding = bindings.get(sourceURL);
            if (binding) {
                binding.removeSourceMap(sourceMap, header.frameId);
                if (!binding.getUiSourceCode()) {
                    bindings.delete(sourceURL);
                }
            }
        }
        await this.#cssWorkspaceBinding.updateLocations(header);
    }
    rawLocationToUILocation(rawLocation) {
        const header = rawLocation.header();
        if (!header) {
            return null;
        }
        const sourceMap = this.#sourceMapManager.sourceMapForClient(header);
        if (!sourceMap) {
            return null;
        }
        let { lineNumber, columnNumber } = rawLocation;
        // If the source map maps the origin (line:0, column:0) but the CSS header is inline (in a HTML doc),
        // then adjust the line and column numbers.
        if (sourceMap.mapsOrigin() && header.isInline) {
            lineNumber -= header.startLine;
            if (lineNumber === 0) {
                columnNumber -= header.startColumn;
            }
        }
        const entry = sourceMap.findEntry(lineNumber, columnNumber);
        if (!entry?.sourceURL) {
            return null;
        }
        const uiSourceCode = this.#project.uiSourceCodeForURL(entry.sourceURL);
        if (!uiSourceCode) {
            return null;
        }
        return uiSourceCode.uiLocation(entry.sourceLineNumber, entry.sourceColumnNumber);
    }
    uiLocationToRawLocations(uiLocation) {
        // TODO(crbug.com/1153123): Revisit the `#columnNumber || 0` and also preserve `undefined` for source maps?
        const { uiSourceCode, lineNumber, columnNumber = 0 } = uiLocation;
        const binding = uiSourceCodeToBinding.get(uiSourceCode);
        if (!binding) {
            return [];
        }
        const locations = [];
        for (const sourceMap of binding.getReferringSourceMaps()) {
            const entries = sourceMap.findReverseEntries(uiSourceCode.url(), lineNumber, columnNumber);
            const header = this.#sourceMapManager.clientForSourceMap(sourceMap);
            if (header) {
                locations.push(...entries.map(entry => new SDK.CSSModel.CSSLocation(header, entry.lineNumber, entry.columnNumber)));
            }
        }
        return locations;
    }
    static uiSourceOrigin(uiSourceCode) {
        const binding = uiSourceCodeToBinding.get(uiSourceCode);
        if (binding) {
            return binding.getReferringSourceMaps().map(sourceMap => sourceMap.compiledURL());
        }
        return [];
    }
    static sourceMapURLsForUISourceCode(uiSourceCode) {
        const binding = uiSourceCodeToBinding.get(uiSourceCode);
        return binding?.getReferringSourceMaps().map(sourceMap => sourceMap.url()) ?? [];
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.#project.dispose();
    }
}
const uiSourceCodeToBinding = new WeakMap();
class Binding {
    #project;
    #url;
    #initiator;
    #pageResourceLoader;
    referringSourceMaps;
    uiSourceCode;
    constructor(project, url, initiator, pageResourceLoader) {
        this.#project = project;
        this.#url = url;
        this.#initiator = initiator;
        this.#pageResourceLoader = pageResourceLoader;
        this.referringSourceMaps = [];
        this.uiSourceCode = null;
    }
    recreateUISourceCodeIfNeeded(frameId) {
        const sourceMap = this.referringSourceMaps[this.referringSourceMaps.length - 1];
        const contentType = Common.ResourceType.resourceTypes.SourceMapStyleSheet;
        const embeddedContent = sourceMap.embeddedContentByURL(this.#url);
        const contentProvider = embeddedContent !== null ?
            TextUtils.StaticContentProvider.StaticContentProvider.fromString(this.#url, contentType, embeddedContent) :
            new SDK.CompilerSourceMappingContentProvider.CompilerSourceMappingContentProvider(this.#url, contentType, this.#initiator, this.#pageResourceLoader);
        const newUISourceCode = this.#project.createUISourceCode(this.#url, contentType);
        uiSourceCodeToBinding.set(newUISourceCode, this);
        const mimeType = Common.ResourceType.ResourceType.mimeFromURL(this.#url) || contentType.canonicalMimeType();
        const metadata = typeof embeddedContent === 'string' ?
            new Workspace.UISourceCode.UISourceCodeMetadata(null, embeddedContent.length) :
            null;
        if (this.uiSourceCode) {
            NetworkProject.cloneInitialFrameAttribution(this.uiSourceCode, newUISourceCode);
            this.#project.removeUISourceCode(this.uiSourceCode.url());
        }
        else {
            NetworkProject.setInitialFrameAttribution(newUISourceCode, frameId);
        }
        this.uiSourceCode = newUISourceCode;
        this.#project.addUISourceCodeWithProvider(this.uiSourceCode, contentProvider, metadata, mimeType);
    }
    addSourceMap(sourceMap, frameId) {
        if (this.uiSourceCode) {
            NetworkProject.addFrameAttribution(this.uiSourceCode, frameId);
        }
        this.referringSourceMaps.push(sourceMap);
        this.recreateUISourceCodeIfNeeded(frameId);
    }
    removeSourceMap(sourceMap, frameId) {
        const uiSourceCode = this.uiSourceCode;
        NetworkProject.removeFrameAttribution(uiSourceCode, frameId);
        const lastIndex = this.referringSourceMaps.lastIndexOf(sourceMap);
        if (lastIndex !== -1) {
            this.referringSourceMaps.splice(lastIndex, 1);
        }
        if (!this.referringSourceMaps.length) {
            this.#project.removeUISourceCode(uiSourceCode.url());
            this.uiSourceCode = null;
        }
        else {
            this.recreateUISourceCodeIfNeeded(frameId);
        }
    }
    getReferringSourceMaps() {
        return this.referringSourceMaps;
    }
    getUiSourceCode() {
        return this.uiSourceCode;
    }
}
//# sourceMappingURL=SASSSourceMapping.js.map