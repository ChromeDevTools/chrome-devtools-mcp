// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Checks whether a target origin matches the established conversation origin lock.
 * Returns `false` if the lock is not established, either origin is opaque, or the
 * target origin does not match the established origin.
 */
export function isOriginAllowedByLock(originLock, targetOrigin) {
    if (originLock.status !== 'ESTABLISHED_ORIGIN') {
        return false;
    }
    if (originLock.origin.isOpaque()) {
        return false;
    }
    if (!targetOrigin || targetOrigin.isOpaque()) {
        return false;
    }
    return targetOrigin.isSameOriginWith(originLock.origin);
}
/**
 * Resolves the conversation's established origin from the origin lock state.
 * Returns an error object if origin access is blocked by navigation, the lock
 * is uninitialized, or the established origin is opaque.
 */
export function resolveOriginFromLock(originLock) {
    if (originLock.status === 'BLOCKED_BY_NAVIGATION') {
        return { error: 'Cross-origin access blocked due to navigation.' };
    }
    if (originLock.status === 'UNINITIALIZED') {
        return { error: 'No origin established for this conversation.' };
    }
    if (originLock.origin.isOpaque()) {
        return { error: 'No origin available or not allowed.' };
    }
    return { origin: originLock.origin };
}
// The maximum size (in bytes) of a function execution result.
// Approximately 16k tokens at ~4 characters per token, designed to limit
// result sizes to prevent overloading the LLM's context window.
export const MAX_FUNCTION_RESULT_BYTE_LENGTH = 16384 * 4;
//# sourceMappingURL=Tool.js.map