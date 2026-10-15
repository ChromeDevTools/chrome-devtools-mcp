// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../core/sdk/sdk.js';
import { MAX_TARGET_ORIGINS } from './DOMStorageUtils.js';
import { isOriginAllowedByLock, resolveOriginFromLock } from './Tool.js';
/**
 * Resolves and validates target origins against the conversation's origin lock state and primary page target.
 *
 * When `requestedOrigins` is empty or omitted, defaults to the established context origin.
 * Rejects opaque origins, mismatches with the primary page origin, and cross-origin targets.
 * Limits results to at most `MAX_TARGET_ORIGINS` unique origins.
 *
 * @param requestedOrigins Optional list of origin URLs to validate.
 * @param context The origin lock capability providing access to the conversation's origin lock state.
 * @param targetManager The target manager used to resolve the primary page target.
 * @returns An object with validated target origins and the primary page target, or an error object.
 */
export function resolveAllowedTargetOrigins(requestedOrigins, context, targetManager) {
    const originLock = context.getOriginLock();
    const originResult = resolveOriginFromLock(originLock);
    if ('error' in originResult) {
        return originResult;
    }
    const establishedOrigin = originResult.origin;
    const primaryPageTarget = targetManager.primaryPageTarget();
    if (!primaryPageTarget) {
        return { error: 'Primary page target not found.' };
    }
    const pageOrigin = primaryPageTarget.inspectedSecurityOrigin();
    if (!isOriginAllowedByLock(originLock, pageOrigin)) {
        return { error: 'Page origin does not match allowed origin.' };
    }
    const candidateOrigins = (Array.isArray(requestedOrigins) && requestedOrigins.length > 0) ?
        requestedOrigins.map(origin => SDK.SecurityOrigin.SecurityOrigin.create(origin)) :
        [establishedOrigin];
    const validOrigins = candidateOrigins.filter(origin => isOriginAllowedByLock(originLock, origin)).map(origin => origin.siteId());
    const targetOrigins = Array.from(new Set(validOrigins)).slice(0, MAX_TARGET_ORIGINS);
    if (targetOrigins.length === 0) {
        return { error: 'No valid origins found.' };
    }
    return { targetOrigins, primaryPageTarget };
}
/**
 * Retrieves all cookies accessible to the target origin, excluding HttpOnly cookies.
 * Locates the matching frame within the primary page target tree, queries its CookieModel,
 * and filters cookies by security origin.
 */
export async function getCookiesForOrigin(origin, primaryPageTarget) {
    const targetOrigin = SDK.SecurityOrigin.SecurityOrigin.create(origin);
    const frame = SDK.ResourceTreeModel.ResourceTreeModel.frameForOrigin(primaryPageTarget, targetOrigin);
    if (!frame) {
        return { error: `Frame not found or origin disallowed for ${origin}` };
    }
    const target = frame.resourceTreeModel().target();
    const cookieModel = target.model(SDK.CookieModel.CookieModel);
    if (!cookieModel) {
        return { error: `Cookie model not found for ${origin}` };
    }
    const allCookies = await cookieModel.getCookiesForDomain(origin, true).catch(() => null);
    if (!allCookies) {
        return { error: `Failed to fetch cookies for ${origin}` };
    }
    return { cookies: allCookies.filter(cookie => !cookie.httpOnly() && cookie.matchesSecurityOrigin(origin)) };
}
//# sourceMappingURL=CookieUtils.js.map