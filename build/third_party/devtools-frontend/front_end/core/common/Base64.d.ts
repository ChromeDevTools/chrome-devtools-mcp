export declare const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export declare const BASE64_CODES: Uint8Array;
/**
 * Decodes Base64-encoded data from a string without performing any kind of checking.
 */
export declare function decode(input: string): Uint8Array<ArrayBuffer>;
export type BlobPart = ArrayBufferLike | Uint8Array | Blob | string;
/**
 * Note: if input can be very large (larger than the max string size), callers should
 * expect this to throw an error.
 */
export declare function encode(input: BlobPart): Promise<string>;
