// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * This is useful to keep TypeScript happy in a test - if you have a value
 * that's potentially `null` you can use this function to assert that it isn't,
 * and satisfy TypeScript that the value is present.
 */
export function assertNotNullOrUndefined(val, message) {
    if (val === null || val === undefined) {
        throw new Error(`Expected given value to not be null/undefined but it was: ${val}${message ? `\n${message}` : ''}`);
    }
}
export function assertNever(_type, message) {
    throw new Error(message);
}
//# sourceMappingURL=TypescriptUtilities.js.map