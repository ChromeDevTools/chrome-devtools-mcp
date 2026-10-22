/**
 * Quickly determine if gzipped, by seeing if the first 3 bytes of the file header match the gzip signature
 */
export declare function isGzip(ab: ArrayBufferLike): boolean;
/** Decode a gzipped _or_ plain text ArrayBuffer to a decoded string */
export declare function arrayBufferToString(ab: ArrayBufferLike): Promise<string>;
export declare function fileToString(file: File): Promise<string>;
/**
 * Decompress a gzipped ArrayBuffer to a string.
 * Consider using `arrayBufferToString` instead, which can handle both gzipped and plain text buffers.
 */
export declare function decompress(gzippedBuffer: ArrayBufferLike, charset?: string): Promise<string>;
export declare function decompressToBuffer(gzippedBuffer: ArrayBufferLike): Promise<ArrayBuffer>;
/**
 * Decompress a deflate-encoded ArrayBuffer to a string.
 * Tries 'deflate' (zlib wrapper) first, then falls back to 'deflate-raw'.
 */
export declare function decompressDeflate(buffer: ArrayBufferLike, charset?: string): Promise<string>;
export declare function decompressDeflateToBuffer(buffer: ArrayBufferLike): Promise<ArrayBuffer>;
export declare function compress(str: string): Promise<ArrayBuffer>;
export declare function decompressStream(stream: ReadableStream): ReadableStream;
export declare function compressStream(stream: ReadableStream): ReadableStream;
export declare function createMonitoredStream(stream: ReadableStream, onProgress: (bytesRead: number) => void): ReadableStream;
