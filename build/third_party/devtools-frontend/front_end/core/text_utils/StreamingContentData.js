// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import { ContentData } from './ContentData.js';
/**
 * Usage of this class is mostly intended for content that is never "complete".
 * E.g. streaming XHR/fetch requests.
 *
 * Due to the streaming nature this class only supports base64-encoded binary data.
 * Decoding to text only happens on-demand by clients. This ensures that at most we have
 * incomplete unicode at the end and not in-between chunks.
 */
export class StreamingContentData extends Common.ObjectWrapper.ObjectWrapper {
    mimeType;
    #charset;
    #disallowStreaming;
    #chunks = [];
    #contentData;
    constructor(mimeType, charset, initialContent) {
        super();
        this.mimeType = mimeType;
        this.#charset = charset;
        this.#disallowStreaming = Boolean(initialContent && !initialContent.createdFromBase64);
        this.#contentData = initialContent;
    }
    /**
     * Creates a new StreamingContentData with the given MIME type/charset.
     */
    static create(mimeType, charset) {
        return new StreamingContentData(mimeType, charset);
    }
    /**
     * Creates a new StringContentData from an existing ContentData instance.
     *
     * Calling `addChunk` is on the resulting `StreamingContentData` is illegal if
     * `content` was not created from base64 data. The reason is that JavaScript TextEncoder
     * only supports UTF-8. We can't convert text with arbitrary encoding back to base64 for concatenation.
     */
    static from(content) {
        return new StreamingContentData(content.mimeType, content.charset, content);
    }
    /** @returns true, if this `ContentData` was constructed from text content or the mime type indicates text that can be decoded */
    get isTextContent() {
        if (this.#contentData) {
            return this.#contentData.isTextContent;
        }
        return Platform.MimeType.isTextType(this.mimeType);
    }
    /** @param chunk base64 encoded data */
    addChunk(chunk) {
        if (this.#disallowStreaming) {
            throw new Error('Cannot add base64 data to a text-only ContentData.');
        }
        this.#chunks.push(chunk);
        this.dispatchEventToListeners("ChunkAdded" /* Events.CHUNK_ADDED */, { content: this, chunk });
    }
    /** @returns An immutable ContentData with all the bytes received so far */
    content() {
        if (this.#contentData && this.#chunks.length === 0) {
            return this.#contentData;
        }
        const initialBase64 = this.#contentData?.base64 ?? '';
        const base64Content = this.#chunks.reduce((acc, chunk) => Platform.StringUtilities.concatBase64(acc, chunk), initialBase64);
        this.#contentData = new ContentData(base64Content, /* isBase64=*/ true, this.mimeType, this.#charset);
        this.#chunks = [];
        return this.#contentData;
    }
}
export const isError = function (contentDataOrError) {
    return 'error' in contentDataOrError;
};
export const asContentDataOrError = function (contentDataOrError) {
    if (isError(contentDataOrError)) {
        return contentDataOrError;
    }
    return contentDataOrError.content();
};
//# sourceMappingURL=StreamingContentData.js.map