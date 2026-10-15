// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export const BASE64_CODES = new Uint8Array(123);
for (let index = 0; index < BASE64_CHARS.length; ++index) {
    BASE64_CODES[BASE64_CHARS.charCodeAt(index)] = index;
}
/**
 * Decodes Base64-encoded data from a string without performing any kind of checking.
 */
export function decode(input) {
    let bytesLength = ((input.length * 3) / 4) >>> 0;
    if (input.charCodeAt(input.length - 2) === 0x3d /* '=' */) {
        bytesLength -= 2;
    }
    else if (input.charCodeAt(input.length - 1) === 0x3d /* '=' */) {
        bytesLength -= 1;
    }
    const bytes = new Uint8Array(bytesLength);
    for (let index = 0, offset = 0; index < input.length; index += 4) {
        const a = BASE64_CODES[input.charCodeAt(index + 0)];
        const b = BASE64_CODES[input.charCodeAt(index + 1)];
        const c = BASE64_CODES[input.charCodeAt(index + 2)];
        const d = BASE64_CODES[input.charCodeAt(index + 3)];
        bytes[offset++] = (a << 2) | (b >> 4);
        bytes[offset++] = ((b & 0x0f) << 4) | (c >> 2);
        bytes[offset++] = ((c & 0x03) << 6) | (d & 0x3f);
    }
    return bytes;
}
/**
 * Note: if input can be very large (larger than the max string size), callers should
 * expect this to throw an error.
 */
export async function encode(input) {
    const maybeFileReader = globalThis['FileReader'];
    // Node.js environment (for foundation unit tests)
    if (!maybeFileReader) {
        const blob = new Blob([input]);
        const arrayBuffer = await blob.arrayBuffer();
        // Use globalThis.Buffer to avoid TypeScript errors if Node types are not included.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return globalThis.Buffer.from(arrayBuffer).toString('base64');
    }
    // Browser environment
    return await new Promise((resolve, reject) => {
        const reader = new maybeFileReader();
        reader.onerror = () => reject(new Error('failed to convert to base64: internal error'));
        reader.onload = () => {
            // The input was too large to encode as a string. The caller should anticipate
            // this and use a workaround. See TimelinePanel.ts innerSaveToFile for an example.
            // For more information, see crbug.com/436482118.
            if (reader.result === '') {
                reject(new Error('failed to convert to base64: input too large to encode as base64 string'));
                return;
            }
            // This string can be very large, so take care to not double memory. `split`
            // was used here before, which always results in new strings in V8. By using
            // slice instead, we leverage the sliced string optimization in V8 and avoid
            // doubling the memory requirement (even if temporarily: that is a potential
            // source of OOM crashes given large enough input, such as is common with
            // Performance traces).
            const blobAsUrl = reader.result;
            const index = blobAsUrl.indexOf(',');
            const base64 = blobAsUrl.slice(index + 1);
            resolve(base64);
        };
        reader.readAsDataURL(new Blob([input]));
    });
}
//# sourceMappingURL=Base64.js.map