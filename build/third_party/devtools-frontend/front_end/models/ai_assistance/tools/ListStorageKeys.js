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
export class ListStorageKeysTool {
    name = "listStorageKeys" /* ToolName.LIST_STORAGE_KEYS */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Lists all keys for a given storage type for requested origins. Returns keys grouped by storage partition under their origin.';
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
            origins: {
                type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                description: 'List of origins to list keys for.',
                items: { type: 1 /* Host.AidaClient.ParametersTypes.STRING */, description: 'An origin URL.' },
                nullable: false,
            },
            storageKey: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'Optional. Specific storageKey to list keys for. Only applies if single origin is provided.',
                nullable: true,
            },
        },
        required: ['type', 'origins'],
    };
    displayInfoFromArgs(args) {
        let title;
        switch (args.type) {
            case 'localStorage':
                title = lockedString('Reading local storage keys');
                break;
            case 'sessionStorage':
                title = lockedString('Reading session storage keys');
                break;
            default:
                Platform.TypeScriptUtilities.assertNever(args.type, `Unknown storage type: ${args.type}`);
        }
        return {
            title,
            action: `listStorageKeys('${args.type}', ${JSON.stringify(args.origins)})`,
        };
    }
    async handler(args, context) {
        context.disableLogging();
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const targetManager = SDK.TargetManager.TargetManager.instance();
        const targetOriginsResult = resolveAllowedTargetOrigins(args.origins, context, targetManager);
        if ('error' in targetOriginsResult) {
            return { error: targetOriginsResult.error };
        }
        const { targetOrigins, primaryPageTarget } = targetOriginsResult;
        const storageKey = (targetOrigins.length === 1 && args.storageKey) ? args.storageKey : undefined;
        const storageKeysByOrigin = {};
        await Promise.all(targetOrigins.map(async (origin) => {
            const storages = resolveDOMStorages(origin, args.type, targetManager, primaryPageTarget, storageKey);
            const keyAndItems = await Promise.all(storages.map(async (storage) => {
                // Silently catch CDP errors (e.g. target navigation, detachment, or frame crash)
                // so that transient target loss does not fail the entire batch.
                const items = await storage.getItems().catch(() => null);
                return { storageKey: storage.storageKey, items };
            }));
            const partitions = [];
            for (const { storageKey: partKey, items } of keyAndItems) {
                if (!items || !partKey) {
                    continue;
                }
                const keys = items.map(([key]) => key);
                if (keys.length > 0) {
                    partitions.push({ storageKey: partKey, keys });
                }
            }
            storageKeysByOrigin[origin] = { partitions };
        }));
        return { result: { storageKeysByOrigin } };
    }
}
//# sourceMappingURL=ListStorageKeys.js.map