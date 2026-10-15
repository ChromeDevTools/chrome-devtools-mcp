// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { DeferredDOMNode } from './DOMModel.js';
import { ResourceTreeModel } from './ResourceTreeModel.js';
const UIStrings = {
    /**
     * @description Error message for when a CSS file can't be loaded.
     */
    couldNotFindTheOriginalStyle: 'Couldn’t find the original style sheet',
    /**
     * @description Error message to display when a source CSS file could not be retrieved.
     */
    couldNotRetrieveSourceStyles: 'Couldn’t retrieve source styles',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/CSSStyleSheetHeader.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class CSSStyleSheetHeader {
    #cssModel;
    id;
    frameId;
    sourceURL;
    hasSourceURL;
    origin;
    title;
    disabled;
    isInline;
    isMutable;
    isConstructed;
    startLine;
    startColumn;
    endLine;
    endColumn;
    contentLength;
    ownerNode;
    sourceMapURL;
    loadingFailed;
    #originalContentProvider;
    constructor(cssModel, payload) {
        this.#cssModel = cssModel;
        this.id = payload.styleSheetId;
        this.frameId = payload.frameId;
        this.sourceURL = payload.sourceURL;
        this.hasSourceURL = Boolean(payload.hasSourceURL);
        this.origin = payload.origin;
        this.title = payload.title;
        this.disabled = payload.disabled;
        this.isInline = payload.isInline;
        this.isMutable = payload.isMutable;
        this.isConstructed = payload.isConstructed;
        this.startLine = payload.startLine;
        this.startColumn = payload.startColumn;
        this.endLine = payload.endLine;
        this.endColumn = payload.endColumn;
        this.contentLength = payload.length;
        if (payload.ownerNode) {
            this.ownerNode = new DeferredDOMNode(cssModel.target(), payload.ownerNode);
        }
        this.sourceMapURL = payload.sourceMapURL;
        this.loadingFailed = payload.loadingFailed ?? false;
        this.#originalContentProvider = null;
    }
    originalContentProvider() {
        if (!this.#originalContentProvider) {
            const lazyContent = (async () => {
                const originalText = await this.#cssModel.originalStyleSheetText(this);
                if (originalText === null) {
                    return { error: i18nString(UIStrings.couldNotFindTheOriginalStyle) };
                }
                return new TextUtils.ContentData.ContentData(originalText, /* isBase64=*/ false, 'text/css');
            });
            this.#originalContentProvider =
                new TextUtils.StaticContentProvider.StaticContentProvider(this.contentURL(), this.contentType(), lazyContent);
        }
        return this.#originalContentProvider;
    }
    setSourceMapURL(sourceMapURL) {
        this.sourceMapURL = sourceMapURL;
    }
    cssModel() {
        return this.#cssModel;
    }
    isAnonymousInlineStyleSheet() {
        return !this.resourceURL() && !this.#cssModel.sourceMapManager().sourceMapForClient(this);
    }
    isConstructedByNew() {
        return this.isConstructed && this.sourceURL.length === 0;
    }
    resourceURL() {
        return this.isViaInspector() ? this.viaInspectorResourceURL() : this.sourceURL;
    }
    getFrameURLPath() {
        const model = this.#cssModel.target().model(ResourceTreeModel);
        console.assert(Boolean(model));
        if (!model) {
            return '';
        }
        const frame = model.frameForId(this.frameId);
        if (!frame) {
            return '';
        }
        console.assert(Boolean(frame));
        const parsedURL = new Common.ParsedURL.ParsedURL(frame.url);
        let urlPath = parsedURL.host;
        if (parsedURL.port) {
            urlPath += ':' + parsedURL.port;
        }
        urlPath += parsedURL.folderPathComponents;
        if (!urlPath.endsWith('/')) {
            urlPath += '/';
        }
        return urlPath;
    }
    viaInspectorResourceURL() {
        return `inspector://${this.getFrameURLPath()}inspector-stylesheet#${this.id}`;
    }
    lineNumberInSource(lineNumberInStyleSheet) {
        return this.startLine + lineNumberInStyleSheet;
    }
    columnNumberInSource(lineNumberInStyleSheet, columnNumberInStyleSheet) {
        return (lineNumberInStyleSheet ? 0 : this.startColumn) + columnNumberInStyleSheet;
    }
    /**
     * Checks whether the position is in this style sheet. Assumes that the
     * position's columnNumber is consistent with line endings.
     */
    containsLocation(lineNumber, columnNumber) {
        const afterStart = (lineNumber === this.startLine && columnNumber >= this.startColumn) || lineNumber > this.startLine;
        const beforeEnd = lineNumber < this.endLine || (lineNumber === this.endLine && columnNumber <= this.endColumn);
        return afterStart && beforeEnd;
    }
    contentURL() {
        return this.resourceURL();
    }
    contentType() {
        return Common.ResourceType.resourceTypes.Stylesheet;
    }
    async requestContentData() {
        const cssText = await this.#cssModel.getStyleSheetText(this.id);
        if (cssText === null) {
            return { error: i18nString(UIStrings.couldNotRetrieveSourceStyles) };
        }
        return new TextUtils.ContentData.ContentData(cssText, /* isBase64=*/ false, 'text/css');
    }
    async searchInContent(query, caseSensitive, isRegex) {
        const contentData = await this.requestContentData();
        return TextUtils.TextUtils.performSearchInContentData(contentData, query, caseSensitive, isRegex);
    }
    isViaInspector() {
        return this.origin === 'inspector';
    }
    createPageResourceLoadInitiator() {
        return {
            target: this.#cssModel.target(),
            frameId: this.frameId,
            initiatorUrl: this.hasSourceURL ? Platform.DevToolsPath.EmptyUrlString : this.sourceURL,
        };
    }
    debugId() {
        return null;
    }
}
//# sourceMappingURL=CSSStyleSheetHeader.js.map