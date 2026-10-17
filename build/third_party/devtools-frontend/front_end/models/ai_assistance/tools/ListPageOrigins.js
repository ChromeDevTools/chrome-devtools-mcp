// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { isOriginAllowedByLock, resolveOriginFromLock, } from './Tool.js';
const lockedString = i18n.i18n.lockedString;
export class ListPageOriginsTool {
    name = "listPageOrigins" /* ToolName.LIST_PAGE_ORIGINS */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Lists all active, non-empty frame origins loaded by the page. Call this first to discover all page origins before calling listCookies or listStorageKeys, unless the user\'s explicit request focuses only on the primary page.';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        nullable: false,
        properties: {},
        required: [],
    };
    displayInfoFromArgs() {
        return {
            title: lockedString('Listing page origins'),
            action: 'listPageOrigins()',
        };
    }
    /**
     * Retrieves the set of unique frame origins loaded within the primary page's target tree.
     *
     * To prevent data leakage across different tabs/windows, this tool:
     * 1. Restricts the frame search to those belonging to the `primaryPageTarget`'s outermost target tree.
     * 2. Filters out any origins that are not equivalent to the established allowed origin.
     *    Note: Under site isolation, frames may be hosted on different sub-targets or processes,
     *    so we check `frame.securityOrigin` directly instead of the frame's target origin.
     */
    async handler(_args, context) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const targetManager = SDK.TargetManager.TargetManager.instance();
        const primaryPageTarget = targetManager.primaryPageTarget();
        const originLock = context.getOriginLock();
        const originResult = resolveOriginFromLock(originLock);
        if ('error' in originResult) {
            return originResult;
        }
        const pageOrigin = primaryPageTarget ? SDK.SecurityOrigin.SecurityOrigin.create(primaryPageTarget.inspectedURL()) : null;
        if (!pageOrigin || !isOriginAllowedByLock(originLock, pageOrigin)) {
            return { error: 'No origin available or not allowed.' };
        }
        const origins = [];
        for (const frame of SDK.ResourceTreeModel.ResourceTreeModel.frames(targetManager)) {
            if (frame.resourceTreeModel().target().outermostTarget() !== primaryPageTarget) {
                continue;
            }
            const frameOrigin = frame.securityOrigin();
            // Filter out frames that are not same-origin to the page's allowed origin.
            // Under site isolation, frames can be hosted on different targets/processes,
            // so we check the security origin of the frame directly instead of the target.
            if (!isOriginAllowedByLock(originLock, frameOrigin)) {
                continue;
            }
            if (!origins.some(existing => existing.isSameOriginWith(frameOrigin))) {
                origins.push(frameOrigin);
            }
        }
        return { result: { origins: origins.map(o => o.siteId()) } };
    }
}
//# sourceMappingURL=ListPageOrigins.js.map