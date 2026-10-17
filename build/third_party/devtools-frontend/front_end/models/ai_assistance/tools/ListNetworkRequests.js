// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Logs from '../../logs/logs.js';
import { formatBytesToKb, seconds } from '../data_formatters/UnitFormatters.js';
import { isOriginAllowedByLock, resolveOriginFromLock, } from './Tool.js';
const UIStringsNotTranslate = {
    listingNetworkRequests: 'Listing network requests',
};
const lockedString = i18n.i18n.lockedString;
/**
 * A tool that lists all network requests recorded by DevTools.
 * Filters the list by the conversation's established origin to prevent cross-origin data exposure.
 */
export class ListNetworkRequestsTool {
    name = "listNetworkRequests" /* ToolName.LIST_NETWORK_REQUESTS */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Lists recorded network requests for the active origin, including request ID, URL, HTTP status code, duration, and transfer size.';
    #networkLog;
    constructor(networkLog) {
        this.#networkLog = networkLog;
    }
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        nullable: true,
        required: [],
        properties: {},
    };
    displayInfoFromArgs() {
        return {
            title: lockedString(UIStringsNotTranslate.listingNetworkRequests),
            action: 'listNetworkRequests()',
        };
    }
    /**
     * Handles the request to list network requests.
     * Returns requests matching the conversation's established origin, if set.
     */
    async handler(_params, context) {
        const requests = [];
        // A conversation is locked to an origin once the first query is made.
        // We only allow inspecting requests matching the conversation's established origin.
        const originLock = context.getOriginLock();
        const originResult = resolveOriginFromLock(originLock);
        if ('error' in originResult) {
            return originResult;
        }
        const establishedOrigin = originResult.origin;
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const networkLog = this.#networkLog ?? Logs.NetworkLog.NetworkLog.instance();
        let hasCrossOriginRequest = false;
        const requestsToShow = [];
        for (const request of networkLog.requests()) {
            // If the request's initiator origin does not match the locked origin, skip it.
            if (!isOriginAllowedByLock(originLock, request.initiatorSecurityOrigin())) {
                hasCrossOriginRequest = true;
                continue;
            }
            requests.push({
                id: request.requestId(),
                url: request.url(),
                statusCode: request.statusCode,
                duration: seconds(request.duration),
                transferSize: formatBytesToKb(request.transferSize),
            });
            requestsToShow.push(request);
        }
        if (requests.length === 0) {
            if (hasCrossOriginRequest) {
                return {
                    error: `No requests showing with origin ${establishedOrigin.siteId()}. Tell the user to start a new chat`,
                };
            }
            return {
                result: JSON.stringify([]),
                widgets: [{
                        name: 'NETWORK_REQUESTS_LIST',
                        data: {
                            requests: [],
                        },
                    }],
            };
        }
        return {
            result: JSON.stringify(requests),
            widgets: [{
                    name: 'NETWORK_REQUESTS_LIST',
                    data: {
                        requests: requestsToShow,
                    },
                }],
        };
    }
}
//# sourceMappingURL=ListNetworkRequests.js.map