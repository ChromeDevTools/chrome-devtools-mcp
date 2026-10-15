// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Logs from '../../logs/logs.js';
import * as NetworkTimeCalculator from '../../network_time_calculator/network_time_calculator.js';
import { NetworkRequestFormatter } from '../data_formatters/NetworkRequestFormatter.js';
import { isOriginAllowedByLock, resolveOriginFromLock, } from './Tool.js';
const UIStringsNotTranslate = {
    gettingNetworkRequestDetails: 'Getting network request details',
};
const lockedString = i18n.i18n.lockedString;
/**
 * A tool that retrieves detailed information about a specific network request.
 * The details include request/response headers, status code, timings, and the response body.
 */
export class GetNetworkRequestDetailsTool {
    name = "getNetworkRequestDetails" /* ToolName.GET_NETWORK_REQUEST_DETAILS */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Retrieves the full headers, timing, status, and body details of a specific network request by ID.';
    #networkLog;
    constructor(networkLog) {
        this.#networkLog = networkLog;
    }
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: 'Arguments for retrieving detailed information about a specific network request.',
        nullable: false,
        properties: {
            id: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'The unique requestId obtained from listNetworkRequests.',
                nullable: false,
            },
        },
        required: ['id'],
    };
    displayInfoFromArgs(args) {
        return {
            title: lockedString(UIStringsNotTranslate.gettingNetworkRequestDetails),
            action: `getNetworkRequestDetails(${args.id})`,
        };
    }
    /**
     * Handles the request to retrieve details for a network request by its ID.
     * Filters by the conversation's established origin to prevent cross-origin data exposure.
     */
    async handler(args, context) {
        const originLock = context.getOriginLock();
        const originResult = resolveOriginFromLock(originLock);
        if ('error' in originResult) {
            return originResult;
        }
        const establishedOrigin = originResult.origin;
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const networkLog = this.#networkLog ?? Logs.NetworkLog.NetworkLog.instance();
        const request = networkLog.requests().find(req => {
            if (req.requestId() !== args.id) {
                return false;
            }
            // If the conversation is locked to an origin, only allow accessing requests from that origin.
            return isOriginAllowedByLock(originLock, req.initiatorSecurityOrigin());
        });
        if (!request) {
            return {
                error: 'No request found',
            };
        }
        const calculator = new NetworkTimeCalculator.NetworkTransferTimeCalculator();
        const formatter = new NetworkRequestFormatter(request, calculator, {
            accessingSecurityOrigin: establishedOrigin,
            networkLog,
        });
        const formattedDetails = await formatter.formatNetworkRequest();
        return {
            result: formattedDetails,
            widgets: [{
                    name: 'NETWORK_REQUEST_GENERAL_HEADERS',
                    data: {
                        request,
                    },
                }],
        };
    }
}
//# sourceMappingURL=GetNetworkRequestDetails.js.map