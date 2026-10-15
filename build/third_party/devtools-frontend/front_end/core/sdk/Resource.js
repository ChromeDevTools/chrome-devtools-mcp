// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
export class Resource {
    #resourceTreeModel;
    #request;
    #url;
    #documentURL;
    #frameId;
    #loaderId;
    #type;
    #mimeType;
    #isGenerated;
    #lastModified;
    #contentSize;
    #parsedURL;
    #contentData = null;
    /**
     * There is always at most one CDP "getResourceContent" call in-flight. But once it's done
     * we'll hit the backend again in case we failed.
     */
    #pendingContentData = null;
    constructor(resourceTreeModel, request, url, documentURL, frameId, loaderId, type, mimeType, lastModified, contentSize) {
        this.#resourceTreeModel = resourceTreeModel;
        this.#request = request;
        this.url = url;
        this.#documentURL = documentURL;
        this.#frameId = frameId;
        this.#loaderId = loaderId;
        this.#type = type || Common.ResourceType.resourceTypes.Other;
        this.#mimeType = mimeType;
        this.#isGenerated = false;
        this.#lastModified = lastModified && Platform.DateUtilities.isValid(lastModified) ? lastModified : null;
        this.#contentSize = contentSize;
    }
    lastModified() {
        if (this.#lastModified || !this.#request) {
            return this.#lastModified;
        }
        const lastModifiedHeader = this.#request.responseLastModified();
        const date = lastModifiedHeader ? new Date(lastModifiedHeader) : null;
        this.#lastModified = date && Platform.DateUtilities.isValid(date) ? date : null;
        return this.#lastModified;
    }
    contentSize() {
        if (typeof this.#contentSize === 'number' || !this.#request) {
            return this.#contentSize;
        }
        return this.#request.resourceSize;
    }
    get request() {
        return this.#request;
    }
    get url() {
        return this.#url;
    }
    set url(x) {
        this.#url = x;
        this.#parsedURL = new Common.ParsedURL.ParsedURL(x);
    }
    get parsedURL() {
        return this.#parsedURL;
    }
    get documentURL() {
        return this.#documentURL;
    }
    get frameId() {
        return this.#frameId;
    }
    get loaderId() {
        return this.#loaderId;
    }
    get displayName() {
        return this.#parsedURL ? this.#parsedURL.displayName : '';
    }
    resourceType() {
        return this.#request ? this.#request.resourceType() : this.#type;
    }
    get mimeType() {
        return this.#request ? this.#request.mimeType : this.#mimeType;
    }
    get content() {
        if (this.#contentData?.isTextContent) {
            return this.#contentData.text;
        }
        return this.#contentData?.base64 ?? null;
    }
    get isGenerated() {
        return this.#isGenerated;
    }
    set isGenerated(val) {
        this.#isGenerated = val;
    }
    contentURL() {
        return this.#url;
    }
    contentType() {
        if (this.resourceType() === Common.ResourceType.resourceTypes.Document &&
            this.mimeType.indexOf('javascript') !== -1) {
            return Common.ResourceType.resourceTypes.Script;
        }
        return this.resourceType();
    }
    async requestContentData() {
        if (this.#contentData) {
            return this.#contentData;
        }
        if (this.#pendingContentData) {
            return await this.#pendingContentData;
        }
        this.#pendingContentData = this.innerRequestContent().then(contentData => {
            // If an error happended we don't set `this.#contentData` so future `requestContentData` will
            // attempt again to hit the backend for this Resource.
            if (!TextUtils.ContentData.ContentData.isError(contentData)) {
                this.#contentData = contentData;
            }
            this.#pendingContentData = null;
            return contentData;
        });
        return await this.#pendingContentData;
    }
    canonicalMimeType() {
        return this.contentType().canonicalMimeType() || this.mimeType;
    }
    async searchInContent(query, caseSensitive, isRegex) {
        if (!this.frameId) {
            return [];
        }
        if (this.request) {
            return await this.request.searchInContent(query, caseSensitive, isRegex);
        }
        const result = await this.#resourceTreeModel.target().pageAgent().invoke_searchInResource({ frameId: this.frameId, url: this.url, query, caseSensitive, isRegex });
        return TextUtils.TextUtils.performSearchInSearchMatches(result.result || [], query, caseSensitive, isRegex);
    }
    async populateImageSource(image) {
        const contentData = await this.requestContentData();
        if (TextUtils.ContentData.ContentData.isError(contentData)) {
            return;
        }
        const imageSrc = contentData.asImagePreviewUrl();
        image.src = imageSrc ?? ''; // Empty the image if we cannot generate a preview URL
    }
    async innerRequestContent() {
        if (this.request) {
            // The `contentData` promise only resolves once the request is done.
            return await this.request.requestContentData();
        }
        const response = await this.#resourceTreeModel.target().pageAgent().invoke_getResourceContent({ frameId: this.frameId, url: this.url });
        const error = response.getError();
        if (error) {
            return { error };
        }
        return new TextUtils.ContentData.ContentData(response.content, response.base64Encoded, this.mimeType);
    }
    frame() {
        return this.#frameId ? this.#resourceTreeModel.frameForId(this.#frameId) : null;
    }
    statusCode() {
        return this.#request ? this.#request.statusCode : 0;
    }
}
//# sourceMappingURL=Resource.js.map