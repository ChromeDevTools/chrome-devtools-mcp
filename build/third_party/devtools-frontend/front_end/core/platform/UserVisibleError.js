// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Represents an error that might become visible to the user. Where errors
 * might be surfaced to the user (such as by displaying the message to the
 * console), this class should be used to enforce that the message is
 * localized on the way in.
 */
export class UserVisibleError extends Error {
    message;
    constructor(message) {
        super(message);
        this.message = message;
    }
}
export function isUserVisibleError(error) {
    if (typeof error === 'object' && error !== null) {
        return error instanceof UserVisibleError;
    }
    return false;
}
//# sourceMappingURL=UserVisibleError.js.map