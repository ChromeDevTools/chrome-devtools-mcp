// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import { contentAsDataURL } from './ContentProvider.js';
import { Text } from './Text.js';
const objectUrlRegistry = new FinalizationRegistry(url => {
    URL.revokeObjectURL(url);
});
/**
 * The maximum size in bytes that we are willing to convert to a Blob.
 * 10MB is chosen as a safe upper limit to prevent freezing the DevTools UI
 * when synchronously decoding large Base64 strings.
 */
const MAX_BLOB_SIZE_BYTES = 10 * 1024 * 1024;
/**
 * Returns `charset` if `TextDecoder` supports it, and 'utf-8' otherwise.
 * The charset usually comes straight from a `Content-Type` header, and
 * `TextDecoder` has no non-throwing way to check a label.
 */
function supportedCharsetOrUtf8(charset) {
    if (!charset) {
        return 'utf-8';
    }
    try {
        new TextDecoder(charset);
        return charset;
    }
    catch {
        return 'utf-8';
    }
}
/**
 * This class is a small wrapper around either raw binary or text data.
 * As the binary data can actually contain textual data, we also store the
 * MIME type and if applicable, the charset.
 *
 * This information should be generally kept together, as interpreting text
 * from raw bytes requires an encoding.
 *
 * Note that we only rarely have to decode text ourselves in the frontend,
 * this is mostly handled by the backend. There are cases though (e.g. SVG,
 * or streaming response content) where we receive text data in
 * binary (base64-encoded) form.
 *
 * The class only implements decoding. We currently don't have a use-case
 * to re-encode text into base64 bytes using a specified charset.
 */
export class ContentData {
    mimeType;
    charset;
    #contentAsBase64;
    #contentAsText;
    #contentAsTextObj;
    #imagePreviewUrl;
    constructor(data, isBase64, mimeType, charset) {
        this.charset = supportedCharsetOrUtf8(charset);
        if (isBase64) {
            this.#contentAsBase64 = data;
        }
        else {
            this.#contentAsText = data;
        }
        this.mimeType = mimeType;
        if (!this.mimeType) {
            // Tests or broken requests might pass an empty/undefined mime type. Fallback to
            // "default" mime types.
            this.mimeType = isBase64 ? 'application/octet-stream' : 'text/plain';
        }
    }
    static async fromCompressedBase64(data, mimeType, charset, contentEncoding) {
        const normalizedEncoding = contentEncoding?.toLowerCase();
        if (!normalizedEncoding) {
            return new ContentData(data, true, mimeType, charset);
        }
        let contentAsBase64 = data;
        try {
            const bytes = Common.Base64.decode(data);
            let decompressed = null;
            if (normalizedEncoding.includes('gzip') && Common.Gzip.isGzip(bytes.buffer)) {
                decompressed = await Common.Gzip.decompressToBuffer(bytes.buffer);
            }
            else if (normalizedEncoding.includes('deflate')) {
                decompressed = await Common.Gzip.decompressDeflateToBuffer(bytes.buffer);
            }
            if (decompressed) {
                contentAsBase64 = await Common.Base64.encode(decompressed);
            }
        }
        catch (e) {
            console.warn('Failed to decompress base64 content data:', e);
        }
        return new ContentData(contentAsBase64, true, mimeType, charset);
    }
    /**
     * Returns the data as base64.
     *
     * @throws if this `ContentData` was constructed from text content.
     */
    get base64() {
        if (this.#contentAsBase64 === undefined) {
            throw new Error('Encoding text content as base64 is not supported');
        }
        return this.#contentAsBase64;
    }
    /**
     * Returns the content as text. If this `ContentData` was constructed with base64
     * encoded bytes, it will use the provided charset to attempt to decode the bytes.
     *
     * @throws if `mimeType` is not a text type.
     */
    get text() {
        if (this.#contentAsText !== undefined) {
            return this.#contentAsText;
        }
        if (!this.isTextContent) {
            throw new Error('Cannot interpret binary data as text');
        }
        const bytes = Common.Base64.decode(this.#contentAsBase64);
        this.#contentAsText = new TextDecoder(this.charset).decode(bytes);
        return this.#contentAsText;
    }
    /** @returns true, if this `ContentData` was constructed from text content or the mime type indicates text that can be decoded */
    get isTextContent() {
        return this.#createdFromText || Platform.MimeType.isTextType(this.mimeType);
    }
    get isEmpty() {
        // Don't trigger unnecessary decoding. Only check if both of the strings are empty.
        return !Boolean(this.#contentAsBase64) && !Boolean(this.#contentAsText);
    }
    get createdFromBase64() {
        return this.#contentAsBase64 !== undefined;
    }
    get #createdFromText() {
        return this.#contentAsBase64 === undefined;
    }
    /**
     * Returns the text content as a `Text` object. The returned object is always the same to
     * minimize the number of times we have to calculate the line endings array.
     *
     * @throws if `mimeType` is not a text type.
     */
    get textObj() {
        if (this.#contentAsTextObj === undefined) {
            this.#contentAsTextObj = new Text(this.text);
        }
        return this.#contentAsTextObj;
    }
    /**
     * @returns True, iff the contents (base64 or text) are equal.
     * Does not compare mime type and charset, but will decode base64 data if both
     * mime types indicate that it's text content.
     */
    contentEqualTo(other) {
        if (this.#contentAsBase64 !== undefined && other.#contentAsBase64 !== undefined) {
            return this.#contentAsBase64 === other.#contentAsBase64;
        }
        if (this.#contentAsText !== undefined && other.#contentAsText !== undefined) {
            return this.#contentAsText === other.#contentAsText;
        }
        if (this.isTextContent && other.isTextContent) {
            return this.text === other.text;
        }
        return false;
    }
    asDataUrl() {
        // To keep with existing behavior we prefer to return the content
        // encoded if that is how this ContentData was constructed with.
        if (this.#contentAsBase64 !== undefined) {
            const charset = this.isTextContent ? this.charset : null;
            return contentAsDataURL(this.#contentAsBase64, this.mimeType ?? '', true, charset);
        }
        return contentAsDataURL(this.text, this.mimeType ?? '', false, 'utf-8');
    }
    /**
     * Returns the content as a Blob.
     *
     * We prefer Base64 as the source for the Blob because it represents the raw binary
     * bytes. Converting binary data (like an image) to a UTF-16 string (contentAsText)
     * is destructive and will corrupt the image data.
     *
     * @returns The Blob representation, or `null` if the content exceeds the 10MB safety limit.
     */
    asBlob() {
        // We prefer Base64 as the source for the Blob because it represents the raw binary
        // bytes. Converting binary data (like an image) to a UTF-16 string (contentAsText)
        // is destructive and will corrupt the image data.
        if (this.#contentAsBase64 !== undefined) {
            // Base64 encoding uses 4 characters to represent 3 bytes of data.
            // Therefore, the byte size is approximately 75% of the string length.
            if (this.#contentAsBase64.length * 0.75 > MAX_BLOB_SIZE_BYTES) {
                return null;
            }
            const bytes = Common.Base64.decode(this.#contentAsBase64);
            return new Blob([bytes], { type: this.mimeType });
        }
        const text = this.#contentAsText ?? '';
        if (text.length > MAX_BLOB_SIZE_BYTES) {
            return null;
        }
        return new Blob([text], { type: this.mimeType });
    }
    /**
     * Gets the image as either a data: or blob: URL.
     *
     * We prefer data: for simplicity, but these are limited in size to 1MB. If
     * the resource is >1MB, we fall back to a blob: URL.
     *
     * @returns An object URL, or `null` if the content exceeds the 10MB safety limit.
     */
    asImagePreviewUrl() {
        if (this.#imagePreviewUrl) {
            return this.#imagePreviewUrl;
        }
        const url = this.asDataUrl();
        if (url !== null) {
            this.#imagePreviewUrl = url;
            return this.#imagePreviewUrl;
        }
        const blob = this.asBlob();
        if (blob === null) {
            return null;
        }
        this.#imagePreviewUrl = URL.createObjectURL(blob);
        objectUrlRegistry.register(this, this.#imagePreviewUrl);
        return this.#imagePreviewUrl;
    }
    /**
     * @deprecated Used during migration from `DeferredContent` to `ContentData`.
     */
    asDeferedContent() {
        // To prevent encoding mistakes, we'll return text content already decoded.
        if (this.isTextContent) {
            return { content: this.text, isEncoded: false };
        }
        if (this.#contentAsText !== undefined) {
            // Unknown text mime type, this should not really happen.
            return { content: this.#contentAsText, isEncoded: false };
        }
        if (this.#contentAsBase64 !== undefined) {
            return { content: this.#contentAsBase64, isEncoded: true };
        }
        throw new Error('Unreachable');
    }
    static isError(contentDataOrError) {
        return 'error' in contentDataOrError;
    }
    /** @returns `value` if the passed `ContentDataOrError` is an error, or the text content otherwise */
    static textOr(contentDataOrError, value) {
        if (ContentData.isError(contentDataOrError)) {
            return value;
        }
        return contentDataOrError.text;
    }
    /** @returns an empty 'text/plain' content data if the passed `ContentDataOrError` is an error, or the content data itself otherwise */
    static contentDataOrEmpty(contentDataOrError) {
        if (ContentData.isError(contentDataOrError)) {
            return EMPTY_TEXT_CONTENT_DATA;
        }
        return contentDataOrError;
    }
    /**
     * @deprecated Used during migration from `DeferredContent` to `ContentData`.
     */
    static asDeferredContent(contentDataOrError) {
        if (ContentData.isError(contentDataOrError)) {
            return { error: contentDataOrError.error, content: null, isEncoded: false };
        }
        return contentDataOrError.asDeferedContent();
    }
}
export const EMPTY_TEXT_CONTENT_DATA = new ContentData('', /* isBase64 */ false, 'text/plain');
//# sourceMappingURL=ContentData.js.map