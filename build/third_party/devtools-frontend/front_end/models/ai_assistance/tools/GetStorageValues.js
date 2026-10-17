// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { resolveAllowedTargetOrigins } from './CookieUtils.js';
import { resolveDOMStorages } from './DOMStorageUtils.js';
const lockedString = i18n.i18n.lockedString;
// Maximum character length allowed per storage value to prevent large values (e.g. huge JSON blobs)
// from exceeding the LLM context window.
export const MAX_NUM_CHAR_LENGTH = 10000;
export class GetStorageValuesTool {
    name = "getStorageValues" /* ToolName.GET_STORAGE_VALUES */;
    permissionPrompt = "allow-once" /* PermissionPrompt.ALLOW_ONCE */;
    permissionTitle = lockedString('Allow reading storage values?');
    description = 'Retrieve specific string values from storage partitions for requested keys across origins.';
    annotations = ["redact-from-history" /* ToolAnnotation.REDACT_FROM_HISTORY */];
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        nullable: false,
        properties: {
            type: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'Storage type: localStorage or sessionStorage',
                nullable: false,
            },
            keys: {
                type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                description: 'A list of keys to retrieve values for.',
                items: { type: 1 /* Host.AidaClient.ParametersTypes.STRING */, description: 'A storage key.' },
                nullable: false,
            },
            origins: {
                type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                description: 'List of origins to get values for.',
                items: { type: 1 /* Host.AidaClient.ParametersTypes.STRING */, description: 'An origin URL.' },
                nullable: false,
            },
            storageKey: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'Optional. Specific storageKey partition to get values for. Only applies if single origin is provided.',
                nullable: true,
            },
        },
        required: ['type', 'keys', 'origins'],
    };
    displayInfoFromArgs(args) {
        let title;
        switch (args.type) {
            case 'localStorage':
                title = lockedString('Reading local storage values');
                break;
            case 'sessionStorage':
                title = lockedString('Reading session storage values');
                break;
            default:
                Platform.TypeScriptUtilities.assertNever(args.type, `Unknown storage type: ${args.type}`);
        }
        return {
            title,
            action: `getStorageValues('${args.type}', ${JSON.stringify(args.keys)}, ${JSON.stringify(args.origins)})`,
        };
    }
    async handler(args, context, options) {
        context.disableLogging();
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const targetManager = SDK.TargetManager.TargetManager.instance();
        const targetOriginsResult = resolveAllowedTargetOrigins(args.origins, context, targetManager);
        if ('error' in targetOriginsResult) {
            return { error: targetOriginsResult.error };
        }
        const { targetOrigins, primaryPageTarget } = targetOriginsResult;
        const storageKey = (targetOrigins.length === 1 && args.storageKey) ? args.storageKey : undefined;
        const allStoragesMap = {};
        let totalStoragesCount = 0;
        for (const origin of targetOrigins) {
            const storages = resolveDOMStorages(origin, args.type, targetManager, primaryPageTarget, storageKey);
            if (storages.length > 0) {
                allStoragesMap[origin] = storages;
                totalStoragesCount += storages.length;
            }
        }
        if (totalStoragesCount === 0) {
            return { error: 'No matching storage partitions found.' };
        }
        if (options?.approved !== true) {
            const keyString = args.keys.map(k => `\`${k}\``).join(', ');
            const targetsDesc = Object.keys(allStoragesMap).join(', ');
            return {
                requiresApproval: true,
                description: lockedString(`The AI wants to access the value(s) of ${args.type} keys ${keyString} on ${targetsDesc}.`),
            };
        }
        const storageValuesByOrigin = {};
        await Promise.all(targetOrigins.map(async (origin) => {
            const storages = allStoragesMap[origin] || [];
            const itemsResult = [];
            const keyAndItems = await Promise.all(storages.map(async (storage) => {
                // Silently catch CDP errors (e.g. target navigation, detachment, or frame crash)
                // so that transient target loss does not fail the entire batch.
                const items = await storage.getItems().catch(() => null);
                return { storageKey: storage.storageKey, items };
            }));
            for (const { storageKey: partitionKey, items } of keyAndItems) {
                if (!items || !partitionKey) {
                    continue;
                }
                const itemMap = new Map();
                for (const [key, value] of items) {
                    itemMap.set(key, value);
                }
                const storageValues = {};
                for (const key of args.keys) {
                    const value = itemMap.get(key);
                    if (value === undefined) {
                        continue;
                    }
                    const truncatedValue = value.length > MAX_NUM_CHAR_LENGTH ? value.substring(0, MAX_NUM_CHAR_LENGTH) + '... <truncated>' : value;
                    storageValues[key] = truncatedValue;
                }
                itemsResult.push({ storageKey: partitionKey, values: storageValues });
            }
            storageValuesByOrigin[origin] = { items: itemsResult };
        }));
        return { result: { storageValuesByOrigin } };
    }
}
//# sourceMappingURL=GetStorageValues.js.map