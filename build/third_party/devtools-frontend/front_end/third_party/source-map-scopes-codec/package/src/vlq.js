// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @fileoverview
 *
 * VLQ implementation taken mostly verbatim from Chrome DevTools itself.
 */
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_CODES = new Uint8Array(123);
for (let index = 0; index < BASE64_CHARS.length; ++index) {
    BASE64_CODES[BASE64_CHARS.charCodeAt(index)] = index;
}
const VLQ_BASE_SHIFT = 5;
const VLQ_BASE_MASK = (1 << 5) - 1;
const VLQ_CONTINUATION_MASK = 1 << 5;
export function encodeSigned(n) {
    // Set the sign bit as the least significant bit.
    n = n >= 0 ? 2 * n : 1 - 2 * n;
    return encodeUnsigned(n);
}
export function encodeUnsigned(n) {
    // Encode into a base64 run.
    let result = "";
    while (true) {
        // Extract the lowest 5 bits and remove them from the number.
        const digit = n & 0x1f;
        n >>>= 5;
        // Is there anything more left to encode?
        if (n === 0) {
            // We are done encoding, finish the run.
            result += BASE64_CHARS[digit];
            break;
        }
        else {
            // There is still more encode, so add the digit and the continuation bit.
            result += BASE64_CHARS[0x20 + digit];
        }
    }
    return result;
}
export class TokenIterator {
    #string;
    #strict;
    #position;
    constructor(string, strict = false) {
        this.#string = string;
        this.#strict = strict;
        this.#position = 0;
    }
    nextChar() {
        return this.#string.charAt(this.#position++);
    }
    /** Returns the unicode value of the next character and advances the iterator  */
    nextCharCode() {
        return this.#string.charCodeAt(this.#position++);
    }
    peek() {
        return this.#string.charAt(this.#position);
    }
    hasNext() {
        return this.#position < this.#string.length;
    }
    nextSignedVLQ() {
        let result = this.nextUnsignedVLQ();
        // Fix the sign.
        const negative = result & 1;
        result >>>= 1;
        return negative ? -result : result;
    }
    nextUnsignedVLQ() {
        let result = 0;
        let shift = 0;
        let continuation = 0;
        do {
            const charCode = this.nextCharCode();
            const digit = BASE64_CODES[charCode];
            if (digit === undefined) {
                // `charCode` is either `NaN` (we ran past the end of a truncated
                // string) or points outside the base64 alphabet. Either way the
                // previous digit's continuation bit promised another digit that isn't
                // there, so the VLQ is truncated/malformed. In lax mode we stop and
                // keep whatever we decoded so far; in strict mode this is an error.
                if (this.#strict) {
                    throw new Error("Encountered truncated or malformed VLQ");
                }
                break;
            }
            result += (digit & VLQ_BASE_MASK) << shift;
            shift += VLQ_BASE_SHIFT;
            continuation = digit & VLQ_CONTINUATION_MASK;
        } while (continuation);
        return result;
    }
    currentChar() {
        return this.#string.charAt(this.#position - 1);
    }
}
//# sourceMappingURL=vlq.js.map