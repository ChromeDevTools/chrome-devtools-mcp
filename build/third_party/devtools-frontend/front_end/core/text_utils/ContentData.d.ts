import { type DeferredContent } from './ContentProvider.js';
import { Text } from './Text.js';
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
export declare class ContentData {
    #private;
    readonly mimeType: string;
    readonly charset: string;
    constructor(data: string, isBase64: boolean, mimeType: string, charset?: string);
    static fromCompressedBase64(data: string, mimeType: string, charset?: string, contentEncoding?: string): Promise<ContentData>;
    /**
     * Returns the data as base64.
     *
     * @throws if this `ContentData` was constructed from text content.
     */
    get base64(): string;
    /**
     * Returns the content as text. If this `ContentData` was constructed with base64
     * encoded bytes, it will use the provided charset to attempt to decode the bytes.
     *
     * @throws if `mimeType` is not a text type.
     */
    get text(): string;
    /** @returns true, if this `ContentData` was constructed from text content or the mime type indicates text that can be decoded */
    get isTextContent(): boolean;
    get isEmpty(): boolean;
    get createdFromBase64(): boolean;
    /**
     * Returns the text content as a `Text` object. The returned object is always the same to
     * minimize the number of times we have to calculate the line endings array.
     *
     * @throws if `mimeType` is not a text type.
     */
    get textObj(): Text;
    /**
     * @returns True, iff the contents (base64 or text) are equal.
     * Does not compare mime type and charset, but will decode base64 data if both
     * mime types indicate that it's text content.
     */
    contentEqualTo(other: ContentData): boolean;
    asDataUrl(): string | null;
    /**
     * Returns the content as a Blob.
     *
     * We prefer Base64 as the source for the Blob because it represents the raw binary
     * bytes. Converting binary data (like an image) to a UTF-16 string (contentAsText)
     * is destructive and will corrupt the image data.
     *
     * @returns The Blob representation, or `null` if the content exceeds the 10MB safety limit.
     */
    asBlob(): Blob | null;
    /**
     * Gets the image as either a data: or blob: URL.
     *
     * We prefer data: for simplicity, but these are limited in size to 1MB. If
     * the resource is >1MB, we fall back to a blob: URL.
     *
     * @returns An object URL, or `null` if the content exceeds the 10MB safety limit.
     */
    asImagePreviewUrl(): string | null;
    /**
     * @deprecated Used during migration from `DeferredContent` to `ContentData`.
     */
    asDeferedContent(): DeferredContent;
    static isError(contentDataOrError: ContentDataOrError): contentDataOrError is {
        error: string;
    };
    /** @returns `value` if the passed `ContentDataOrError` is an error, or the text content otherwise */
    static textOr<T>(contentDataOrError: ContentDataOrError, value: T): string | T;
    /** @returns an empty 'text/plain' content data if the passed `ContentDataOrError` is an error, or the content data itself otherwise */
    static contentDataOrEmpty(contentDataOrError: ContentDataOrError): ContentData;
    /**
     * @deprecated Used during migration from `DeferredContent` to `ContentData`.
     */
    static asDeferredContent(contentDataOrError: ContentDataOrError): DeferredContent;
}
export declare const EMPTY_TEXT_CONTENT_DATA: ContentData;
export type ContentDataOrError = ContentData | {
    error: string;
};
