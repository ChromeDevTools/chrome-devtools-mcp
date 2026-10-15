// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { bytes } from '../data_formatters/UnitFormatters.js';
import { getCookiesForOrigin, resolveAllowedTargetOrigins } from './CookieUtils.js';
import { calculateDOMStoragesUsage, resolveDOMStorages } from './DOMStorageUtils.js';
const lockedString = i18n.i18n.lockedString;
export class GetStorageBreakdownTool {
    name = "getStorageBreakdown" /* ToolName.GET_STORAGE_BREAKDOWN */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Retrieves total storage usage and quota breakdown across all storage types (IndexedDB, CacheStorage, LocalStorage, SessionStorage, cookies) for the top-level page origin.';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        nullable: false,
        properties: {},
        required: [],
    };
    displayInfoFromArgs() {
        return {
            title: lockedString('Retrieving storage breakdown'),
            action: 'getStorageBreakdown()',
        };
    }
    async handler(_args, context) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const targetManager = SDK.TargetManager.TargetManager.instance();
        const targetResolution = resolveAllowedTargetOrigins(undefined, context, targetManager);
        if ('error' in targetResolution) {
            return { error: targetResolution.error };
        }
        const { targetOrigins, primaryPageTarget } = targetResolution;
        const pageOrigin = targetOrigins[0];
        const mainStorageKey = primaryPageTarget.model(SDK.StorageKeyManager.StorageKeyManager)?.mainStorageKey() || undefined;
        const localStorages = resolveDOMStorages(pageOrigin, 'localStorage', targetManager, primaryPageTarget, mainStorageKey);
        const sessionStorages = resolveDOMStorages(pageOrigin, 'sessionStorage', targetManager, primaryPageTarget, mainStorageKey);
        const [response, localStorageBytes, sessionStorageBytes, cookieResult] = await Promise.all([
            primaryPageTarget.storageAgent().invoke_getUsageAndQuota({ origin: pageOrigin }),
            calculateDOMStoragesUsage(localStorages),
            calculateDOMStoragesUsage(sessionStorages),
            getCookiesForOrigin(pageOrigin, primaryPageTarget),
        ]);
        if (response.getError()) {
            return { error: response.getError() || 'Unknown CDP error' };
        }
        let cookieBytes = 0;
        if ('cookies' in cookieResult) {
            for (const cookie of cookieResult.cookies) {
                cookieBytes += cookie.size();
            }
        }
        const rawUsageBreakdown = (response.usageBreakdown ?? []).filter(entry => entry.usage > 0).map(entry => ({
            storageType: entry.storageType,
            rawUsage: entry.usage,
        }));
        rawUsageBreakdown.push({ storageType: 'local_storage', rawUsage: localStorageBytes }, { storageType: 'session_storage', rawUsage: sessionStorageBytes }, { storageType: 'cookies', rawUsage: cookieBytes });
        rawUsageBreakdown.sort((a, b) => b.rawUsage - a.rawUsage);
        const usageBreakdown = rawUsageBreakdown.map(entry => ({
            storageType: entry.storageType,
            usage: bytes(entry.rawUsage),
        }));
        return {
            result: {
                usageBreakdown,
            },
            widgets: [
                {
                    name: 'STORAGE_BREAKDOWN',
                    data: {
                        totalUsageBytes: response.usage,
                        totalQuotaBytes: response.quota,
                        usageBreakdown: rawUsageBreakdown.map(entry => ({
                            storageType: entry.storageType,
                            bytes: entry.rawUsage,
                        })),
                    },
                },
            ],
        };
    }
}
//# sourceMappingURL=GetStorageBreakdown.js.map