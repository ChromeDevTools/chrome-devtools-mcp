// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
import { metadataForURL } from './ResourceUtils.js';
const uiSourceCodeToStyleMap = new WeakMap();
export class StylesSourceMapping {
    #cssModel;
    #project;
    #styleFiles = new Map();
    #eventListeners;
    constructor(cssModel, workspace) {
        this.#cssModel = cssModel;
        const target = this.#cssModel.target();
        this.#project = new ContentProviderBasedProject(workspace, 'css:' + target.id(), Workspace.Workspace.projectTypes.Network, '', false /* isServiceProject */);
        NetworkProject.setTargetForProject(this.#project, target);
        this.#eventListeners = [
            this.#cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetAdded, this.styleSheetAdded, this),
            this.#cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetRemoved, this.styleSheetRemoved, this),
            this.#cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetChanged, this.styleSheetChanged, this),
        ];
    }
    addSourceMap(sourceUrl, sourceMapUrl) {
        this.#styleFiles.get(sourceUrl)?.addSourceMap(sourceUrl, sourceMapUrl);
    }
    rawLocationToUILocation(rawLocation) {
        const header = rawLocation.header();
        if (!header || !this.acceptsHeader(header)) {
            return null;
        }
        const styleFile = this.#styleFiles.get(header.resourceURL());
        if (!styleFile) {
            return null;
        }
        let lineNumber = rawLocation.lineNumber;
        let columnNumber = rawLocation.columnNumber;
        if (header.isInline && header.hasSourceURL) {
            lineNumber -= header.lineNumberInSource(0);
            const headerColumnNumber = header.columnNumberInSource(lineNumber, 0);
            if (typeof headerColumnNumber === 'undefined') {
                columnNumber = headerColumnNumber;
            }
            else {
                columnNumber -= headerColumnNumber;
            }
        }
        return styleFile.getUiSourceCode().uiLocation(lineNumber, columnNumber);
    }
    uiLocationToRawLocations(uiLocation) {
        const styleFile = uiSourceCodeToStyleMap.get(uiLocation.uiSourceCode);
        if (!styleFile) {
            return [];
        }
        const rawLocations = [];
        for (const header of styleFile.getHeaders()) {
            let lineNumber = uiLocation.lineNumber;
            let columnNumber = uiLocation.columnNumber;
            if (header.isInline && header.hasSourceURL) {
                // TODO(crbug.com/1153123): Revisit the `#columnNumber || 0` and also preserve `undefined` for source maps?
                columnNumber = header.columnNumberInSource(lineNumber, uiLocation.columnNumber || 0);
                lineNumber = header.lineNumberInSource(lineNumber);
            }
            rawLocations.push(new SDK.CSSModel.CSSLocation(header, lineNumber, columnNumber));
        }
        return rawLocations;
    }
    acceptsHeader(header) {
        if (header.isConstructedByNew()) {
            return false;
        }
        if (header.isInline && !header.hasSourceURL && header.origin !== 'inspector') {
            return false;
        }
        if (!header.resourceURL()) {
            return false;
        }
        return true;
    }
    styleSheetAdded(event) {
        const header = event.data;
        if (!this.acceptsHeader(header)) {
            return;
        }
        const url = header.resourceURL();
        let styleFile = this.#styleFiles.get(url);
        if (!styleFile) {
            styleFile = new StyleFile(this.#cssModel, this.#project, header);
            this.#styleFiles.set(url, styleFile);
        }
        else {
            styleFile.addHeader(header);
        }
    }
    styleSheetRemoved(event) {
        const header = event.data;
        if (!this.acceptsHeader(header)) {
            return;
        }
        const url = header.resourceURL();
        const styleFile = this.#styleFiles.get(url);
        if (styleFile) {
            if (styleFile.getHeaders().size === 1) {
                styleFile.dispose();
                this.#styleFiles.delete(url);
            }
            else {
                styleFile.removeHeader(header);
            }
        }
    }
    styleSheetChanged(event) {
        const header = this.#cssModel.styleSheetHeaderForId(event.data.styleSheetId);
        if (!header || !this.acceptsHeader(header)) {
            return;
        }
        const styleFile = this.#styleFiles.get(header.resourceURL());
        if (styleFile) {
            styleFile.styleSheetChanged(header);
        }
    }
    dispose() {
        for (const styleFile of this.#styleFiles.values()) {
            styleFile.dispose();
        }
        this.#styleFiles.clear();
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.#project.removeProject();
    }
}
export class StyleFile {
    #cssModel;
    #project;
    headers;
    uiSourceCode;
    #eventListeners;
    #throttler = new Common.Throttler.Throttler(200);
    #terminated = false;
    #isAddingRevision;
    #isUpdatingHeaders;
    constructor(cssModel, project, header) {
        this.#cssModel = cssModel;
        this.#project = project;
        this.headers = new Set([header]);
        const target = cssModel.target();
        const url = header.resourceURL();
        const metadata = metadataForURL(target, header.frameId, url);
        this.uiSourceCode = this.#project.createUISourceCode(url, header.contentType());
        uiSourceCodeToStyleMap.set(this.uiSourceCode, this);
        NetworkProject.setInitialFrameAttribution(this.uiSourceCode, header.frameId);
        if (header.hasSourceURL) {
            NetworkProject.setSourceURLSynthesized(this.uiSourceCode);
        }
        this.#project.addUISourceCodeWithProvider(this.uiSourceCode, this, metadata, 'text/css');
        this.#eventListeners = [
            this.uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.workingCopyChanged, this),
            this.uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.workingCopyCommitted, this),
        ];
    }
    addHeader(header) {
        this.headers.add(header);
        if (header.hasSourceURL) {
            NetworkProject.setSourceURLSynthesized(this.uiSourceCode);
        }
        NetworkProject.addFrameAttribution(this.uiSourceCode, header.frameId);
    }
    removeHeader(header) {
        this.headers.delete(header);
        NetworkProject.removeFrameAttribution(this.uiSourceCode, header.frameId);
    }
    styleSheetChanged(header) {
        console.assert(this.headers.has(header));
        if (this.#isUpdatingHeaders || !this.headers.has(header)) {
            return;
        }
        const mirrorContentBound = this.mirrorContent.bind(this, header, true /* majorChange */);
        void this.#throttler.schedule(mirrorContentBound, "Default" /* Common.Throttler.Scheduling.DEFAULT */);
    }
    workingCopyCommitted() {
        if (this.#isAddingRevision) {
            return;
        }
        const mirrorContentBound = this.mirrorContent.bind(this, this.uiSourceCode, true /* majorChange */);
        void this.#throttler.schedule(mirrorContentBound, "AsSoonAsPossible" /* Common.Throttler.Scheduling.AS_SOON_AS_POSSIBLE */);
    }
    workingCopyChanged() {
        if (this.#isAddingRevision) {
            return;
        }
        const mirrorContentBound = this.mirrorContent.bind(this, this.uiSourceCode, false /* majorChange */);
        void this.#throttler.schedule(mirrorContentBound, "Default" /* Common.Throttler.Scheduling.DEFAULT */);
    }
    async mirrorContent(fromProvider, majorChange) {
        if (this.#terminated) {
            this.styleFileSyncedForTest();
            return;
        }
        let newContent = null;
        if (fromProvider === this.uiSourceCode) {
            newContent = this.uiSourceCode.workingCopy();
        }
        else {
            newContent = TextUtils.ContentData.ContentData.textOr(await fromProvider.requestContentData(), null);
        }
        if (newContent === null || this.#terminated) {
            this.styleFileSyncedForTest();
            return;
        }
        if (fromProvider !== this.uiSourceCode) {
            this.#isAddingRevision = true;
            this.uiSourceCode.setWorkingCopy(newContent);
            this.#isAddingRevision = false;
        }
        this.#isUpdatingHeaders = true;
        const promises = [];
        for (const header of this.headers) {
            if (header === fromProvider) {
                continue;
            }
            promises.push(this.#cssModel.setStyleSheetText(header.id, newContent, majorChange));
        }
        // ------ ASYNC ------
        await Promise.all(promises);
        this.#isUpdatingHeaders = false;
        this.styleFileSyncedForTest();
    }
    styleFileSyncedForTest() {
    }
    dispose() {
        if (this.#terminated) {
            return;
        }
        this.#terminated = true;
        this.#project.removeUISourceCode(this.uiSourceCode.url());
        Common.EventTarget.removeEventListeners(this.#eventListeners);
    }
    contentURL() {
        console.assert(this.headers.size > 0);
        return this.#firstHeader().originalContentProvider().contentURL();
    }
    contentType() {
        console.assert(this.headers.size > 0);
        return this.#firstHeader().originalContentProvider().contentType();
    }
    requestContentData() {
        console.assert(this.headers.size > 0);
        return this.#firstHeader().originalContentProvider().requestContentData();
    }
    searchInContent(query, caseSensitive, isRegex) {
        console.assert(this.headers.size > 0);
        return this.#firstHeader().originalContentProvider().searchInContent(query, caseSensitive, isRegex);
    }
    #firstHeader() {
        console.assert(this.headers.size > 0);
        return this.headers.values().next().value;
    }
    getHeaders() {
        return this.headers;
    }
    getUiSourceCode() {
        return this.uiSourceCode;
    }
    addSourceMap(sourceUrl, sourceMapUrl) {
        const sourceMapManager = this.#cssModel.sourceMapManager();
        this.headers.forEach(header => {
            sourceMapManager.detachSourceMap(header);
            sourceMapManager.attachSourceMap(header, sourceUrl, sourceMapUrl, "user" /* SDK.SourceMap.SourceMapProvenance.USER */);
        });
    }
}
//# sourceMappingURL=StylesSourceMapping.js.map