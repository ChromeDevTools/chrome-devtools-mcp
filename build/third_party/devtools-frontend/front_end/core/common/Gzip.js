// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Quickly determine if gzipped, by seeing if the first 3 bytes of the file header match the gzip signature
 */
export function isGzip(ab) {
    const buf = new Uint8Array(ab);
    if (!buf || buf.length < 3) {
        return false;
    }
    // https://www.rfc-editor.org/rfc/rfc1952#page-6
    return buf[0] === 0x1F && buf[1] === 0x8B && buf[2] === 0x08;
}
/** Decode a gzipped _or_ plain text ArrayBuffer to a decoded string */
export async function arrayBufferToString(ab) {
    if (isGzip(ab)) {
        return await decompress(ab);
    }
    const str = new TextDecoder('utf-8').decode(new Uint8Array(ab));
    return str;
}
export async function fileToString(file) {
    let stream = file.stream();
    if (file.type.endsWith('gzip')) {
        stream = decompressStream(stream);
    }
    const arrayBuffer = await new Response(stream).arrayBuffer();
    const str = new TextDecoder('utf-8').decode(arrayBuffer);
    return str;
}
/**
 * Decompress a gzipped ArrayBuffer to a string.
 * Consider using `arrayBufferToString` instead, which can handle both gzipped and plain text buffers.
 */
export async function decompress(gzippedBuffer, charset = 'utf-8') {
    const buffer = await decompressToBuffer(gzippedBuffer);
    const str = new TextDecoder(charset).decode(buffer);
    return str;
}
export async function decompressToBuffer(gzippedBuffer) {
    return await gzipCodec(gzippedBuffer, new DecompressionStream('gzip'));
}
/**
 * Decompress a deflate-encoded ArrayBuffer to a string.
 * Tries 'deflate' (zlib wrapper) first, then falls back to 'deflate-raw'.
 */
export async function decompressDeflate(buffer, charset = 'utf-8') {
    const decompressedBuffer = await decompressDeflateToBuffer(buffer);
    return new TextDecoder(charset).decode(decompressedBuffer);
}
export async function decompressDeflateToBuffer(buffer) {
    try {
        return await gzipCodec(buffer, new DecompressionStream('deflate'));
    }
    catch {
        // Try deflate-raw format if zlib-wrapped deflate fails.
        return await gzipCodec(buffer, new DecompressionStream('deflate-raw'));
    }
}
export async function compress(str) {
    const encoded = new TextEncoder().encode(str);
    const buffer = await gzipCodec(encoded, new CompressionStream('gzip'));
    return buffer;
}
/** Private coder/decoder **/
async function gzipCodec(buffer, codecStream) {
    const readable = new ReadableStream({
        start(controller) {
            controller.enqueue(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer);
            controller.close();
        },
    });
    const codecReadable = readable.pipeThrough(codecStream);
    // A response is a convenient way to get an ArrayBuffer from a ReadableStream.
    return await new Response(codecReadable).arrayBuffer();
}
export function decompressStream(stream) {
    // https://github.com/wicg/compression/blob/main/explainer.md#deflate-compress-an-arraybuffer
    const ds = new DecompressionStream('gzip');
    return stream.pipeThrough(ds);
}
export function compressStream(stream) {
    const cs = new CompressionStream('gzip');
    return stream.pipeThrough(cs);
}
export function createMonitoredStream(stream, onProgress) {
    let bytesRead = 0;
    const progressTransformer = new TransformStream({
        transform(chunk, controller) {
            bytesRead += chunk.byteLength;
            onProgress(bytesRead);
            controller.enqueue(chunk);
        },
    });
    return stream.pipeThrough(progressTransformer);
}
//# sourceMappingURL=Gzip.js.map