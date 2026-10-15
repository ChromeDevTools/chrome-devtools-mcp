// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Root from '../../../core/root/root.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { bytes } from '../data_formatters/UnitFormatters.js';
import { CookieItem, DOMStorageItem } from '../StorageItem.js';
import { AiAgent, } from './AiAgent.js';
const lockedString = i18n.i18n.lockedString;
const preamble = `You are a Senior Software Engineer specializing in state audit and storage analysis within Chrome DevTools. Your mission is to help developers debug storage-related issues faster by analyzing the evidence in LocalStorage, SessionStorage, and Cookies.

 You have access to the site's storage using tools like \`getStorageBreakdown\`, \`listPageOrigins\`, \`listStorageKeys\`, \`getStorageValues\`, \`listCookies\`, and \`getCookieValues\`.

 # Goals

 1.  **Explain Purpose**: Identify what specific storage entries or cookies are for.
 2.  **Understand Application State**: Help users inspect, understand, and audit the state stored in browser storage or cookies, and how it relates to application behavior or issues (such as state mismatch/drift, security misconfigurations, or oversized cookies).
 3.  **Top-Level Page First**: Your primary goal is to assist the user in understanding and debugging the storage of the **top-level page**. This context is the most critical for debugging and should be your default starting point for any analysis.

 # Tools & Workflow

 -   **Top-Level Context**: Generally, questions refer to the primary page target ("my page", "this page", etc.). If the user selects a general category or a specific selection, answers should refer to that particular selection, but follow-up questions may switch to the primary page target.
 -   **Storage Breakdown**: Calling \`getStorageBreakdown\` gives you the total usage and quota per storage for the top-level page.
 -   **Address Specific Selections**: The user can select individual storage items in the DevTools UI (provided in the '# Active Context' section of the prompt). If the query is about a selected item (e.g., "Why is this cookie set?"), focus your response on that specific item.
 -   **General Category Selection**: If a general storage category (such as Cookies, Local Storage, or Session Storage) is selected in the active context (indicated by an empty context origin), your first step MUST be to look through all cookies or local/session storage entries across all active page origins (by calling \`listPageOrigins\` to discover origins, then passing all discovered origins to \`listCookies\` or \`listStorageKeys\`), unless the user's explicit request hints otherwise.
 -   **Expand Scope When Necessary**: For general questions or those implying a wider scope (e.g., "Check all storages," "Are there related cookies on subdomains?"), proactively use your tools to explore other relevant storage contexts, including iframes and different origins.
 -   **Discovery**: Start by calling \`listPageOrigins\` to discover all active, non-empty frame origins loaded by the page.
 -   **Storage Partitioning (LocalStorage / SessionStorage)**:
     -   Use \`listStorageKeys\` to survey keys. The results are grouped into **partitions** characterized by unique \`storageKey\` strings.
     -   Be aware that the same origin can have multiple storage partitions depending on frame ancestry.
     -   Use \`getStorageValues\` to inspect specific keys. The results are grouped into an array of partition \`items\` matching the requested keys under their unique \`storageKey\`.
 -   **Cookies**:
     -   Use \`listCookies\` to discover active cookies for an origin. Note that cookies are visible by domain scopes, paths, and partition status.
     -   Use \`getCookieValues\` to retrieve the values and detailed metadata of specific cookies by name.
     -   **HttpOnly Protection**: You don't have access to \`HttpOnly\` cookies. They are filtered out from both discovery and retrieval tools for security reasons.
 -   **Active Context**: Start by inspecting the active context's origin (provided in the '# Active Context' section of the prompt).
 -   **Value Minimization**: Only request values using \`getStorageValues\` or \`getCookieValues\` when key names/cookie names alone are insufficient.

 # Considerations

 -   **Strictly Read-Only**: You cannot write, clear, delete, or edit storage or cookies.
 -   **DevTools UI Fallback**: If the user asks you to modify state, politely decline and provide exact step-by-step visual navigation directions on how they can perform the edit manually in the DevTools Application panel. Do NOT supply Console scripts.
 -   **Raw Evidence**: Treat storage data as raw evidence. Do not make assumptions about values without reading them first.
 -   **Dynamic State**: Always re-request values if you suspect they might have changed, rather than relying on past tool outputs.
 -   **CRITICAL**: Use the precision of Strunk & White, the brevity of Hemingway, and the simple clarity of Vonnegut. Don't add repeated information, and keep the whole answer short.
 -   **CRITICAL**: You are a storage debugging assistant. NEVER answer unrelated topics (legal, financial, race, sexuality, medical, religion, politics). If asked, respond: "Sorry, I can't answer that. I'm best at questions about debugging web pages."
 `;
function isSamePrimaryPageOrigin(targetManager, context) {
    const primaryPageTarget = targetManager.primaryPageTarget();
    return isSamePageOrigin(primaryPageTarget, context);
}
export function isSamePageOrigin(target, context) {
    if (!target || !context) {
        return false;
    }
    const inspectedURL = target.inspectedURL();
    if (!inspectedURL) {
        return false;
    }
    const pageOrigin = SDK.SecurityOrigin.SecurityOrigin.create(inspectedURL);
    return !pageOrigin.isOpaque() && context.isOriginAllowed(pageOrigin);
}
const MAX_TARGET_ORIGINS = 100;
function resolveTargetOrigins(context, origins) {
    const primaryOrigin = context?.getOrigin();
    const primaryString = primaryOrigin?.siteId();
    const rawList = (origins && origins.length > 0) ? origins : (primaryString ? [primaryString] : []);
    const uniqueOrigins = Array.from(new Set(rawList));
    return uniqueOrigins.slice(0, MAX_TARGET_ORIGINS);
}
// Maximum character length of values allowed.
const MAX_NUM_CHAR_LENGTH = 10000;
export class StorageAgent extends AiAgent {
    preamble = preamble;
    clientFeature = Host.AidaClient.ClientFeature.CHROME_STORAGE_AGENT;
    get userTier() {
        return Root.Runtime.hostConfig.devToolsFreestyler?.userTier;
    }
    get options() {
        const temperature = Root.Runtime.hostConfig.devToolsFreestyler?.temperature;
        const modelId = Root.Runtime.hostConfig.devToolsFreestyler?.modelId;
        return {
            temperature,
            modelId,
        };
    }
    constructor(opts) {
        super(opts);
        this.declareFunction('listPageOrigins', {
            description: 'Lists all active, non-empty frame origins loaded by the page. Use this first when generic category context is active to discover all page origins, then pass them to listCookies or listStorageKeys, unless the user\'s explicit request hints at focusing only on the primary page.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {},
                required: [],
            },
            displayInfoFromArgs: () => {
                return {
                    title: lockedString('Listing page origins'),
                    action: 'listPageOrigins()',
                };
            },
            handler: async () => {
                if (!isSamePrimaryPageOrigin(this.targetManager, this.context)) {
                    return { error: 'No origin available or not allowed.' };
                }
                const origins = [];
                for (const frame of SDK.ResourceTreeModel.ResourceTreeModel.frames(this.targetManager)) {
                    if (!isSamePageOrigin(frame.resourceTreeModel().target().outermostTarget(), this.context)) {
                        continue;
                    }
                    const origin = frame.securityOrigin();
                    if (origin.isOpaque()) {
                        continue;
                    }
                    if (!origins.some(existing => existing.isSameOriginWith(origin))) {
                        origins.push(origin);
                    }
                }
                return { result: { origins: origins.map(o => o.siteId()) } };
            },
        });
        this.declareFunction('listStorageKeys', {
            description: 'Lists all keys for a given storage type for requested origins. Returns keys grouped by storage partition under their origin.',
            parameters: {
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
            },
            displayInfoFromArgs: args => {
                return {
                    title: lockedString('Reading storage keys'),
                    action: `listStorageKeys('${args.type}', ${JSON.stringify(args.origins)})`,
                };
            },
            handler: async (args) => {
                this.disableServerSideLogging();
                if (!isSamePrimaryPageOrigin(this.targetManager, this.context)) {
                    return { error: 'No origin available or not allowed.' };
                }
                const targetOrigins = resolveTargetOrigins(this.context, args.origins);
                const storageKey = (targetOrigins.length === 1 && args.storageKey) ? args.storageKey : undefined;
                const storageKeysByOrigin = {};
                await Promise.all(targetOrigins.map(async (origin) => {
                    const storages = resolveDOMStorages(this.context, args.type, origin, this.targetManager, storageKey);
                    const keyAndItems = await Promise.all(storages.map(async (storage) => {
                        const items = await storage.getItems();
                        return { storageKey: storage.storageKey, items };
                    }));
                    const partitions = [];
                    for (const { storageKey, items } of keyAndItems) {
                        if (!items) {
                            continue;
                        }
                        const keys = items.map(([key]) => key);
                        if (keys.length > 0) {
                            partitions.push({ storageKey, keys });
                        }
                    }
                    storageKeysByOrigin[origin] = { partitions };
                }));
                return { result: { storageKeysByOrigin } };
            },
        });
        this.declareFunction('getStorageValues', {
            description: 'Retrieve specific string values from storage partitions for requested keys across origins.',
            parameters: {
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
            },
            displayInfoFromArgs: args => {
                return {
                    title: lockedString('Reading storage values'),
                    action: `getStorageValues('${args.type}', ${JSON.stringify(args.keys)}, ${JSON.stringify(args.origins)}${args.storageKey ? `, '${args.storageKey}'` : ''})`,
                };
            },
            handler: async (args, options) => {
                this.disableServerSideLogging();
                if (!isSamePrimaryPageOrigin(this.targetManager, this.context)) {
                    return { error: 'No origin available or not allowed.' };
                }
                const targetOrigins = resolveTargetOrigins(this.context, args.origins);
                const storageKey = (targetOrigins.length === 1 && args.storageKey) ? args.storageKey : undefined;
                const allStoragesMap = {};
                let totalStoragesCount = 0;
                for (const origin of targetOrigins) {
                    const storages = resolveDOMStorages(this.context, args.type, origin, this.targetManager, storageKey);
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
                        const items = await storage.getItems();
                        return { storageKey: storage.storageKey, items };
                    }));
                    for (const { storageKey: partitionKey, items } of keyAndItems) {
                        if (!items) {
                            continue;
                        }
                        const itemMap = new Map(items);
                        const storageValues = {};
                        for (const key of args.keys) {
                            const value = itemMap.get(key);
                            if (value === undefined) {
                                continue;
                            }
                            const truncatedValue = value.length > MAX_NUM_CHAR_LENGTH ?
                                value.substring(0, MAX_NUM_CHAR_LENGTH) + '... <truncated>' :
                                value;
                            storageValues[key] = truncatedValue;
                        }
                        itemsResult.push({ storageKey: partitionKey, values: storageValues });
                    }
                    storageValuesByOrigin[origin] = { items: itemsResult };
                }));
                return { result: { storageValuesByOrigin } };
            },
        });
        this.declareFunction('listCookies', {
            description: 'Lists all cookies for requested origins, strictly excluding their values.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    origins: {
                        type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                        description: 'List of origins to list cookies for.',
                        items: { type: 1 /* Host.AidaClient.ParametersTypes.STRING */, description: 'An origin URL.' },
                        nullable: false,
                    },
                },
                required: ['origins'],
            },
            displayInfoFromArgs: args => {
                return {
                    title: lockedString('Reading cookies'),
                    action: `listCookies(${JSON.stringify(args.origins)})`,
                };
            },
            handler: async (args) => {
                this.disableServerSideLogging();
                if (!isSamePrimaryPageOrigin(this.targetManager, this.context)) {
                    return { error: 'No origin available or not allowed.' };
                }
                const targetOrigins = resolveTargetOrigins(this.context, args.origins);
                const cookieNamesByOrigin = {};
                await Promise.all(targetOrigins.map(async (origin) => {
                    const frame = findFrameForOrigin(this.context, origin, this.targetManager);
                    if (!frame) {
                        cookieNamesByOrigin[origin] = { error: 'Frame not found or origin disallowed' };
                        return;
                    }
                    const target = frame.resourceTreeModel().target();
                    const cookies = await getCookiesForDomain(target, origin);
                    const uniqueNames = Array.from(new Set(cookies?.map(c => c.name())));
                    cookieNamesByOrigin[origin] = { cookies: uniqueNames };
                }));
                return { result: { cookieNamesByOrigin } };
            },
        });
        this.declareFunction('getCookieValues', {
            description: 'Retrieve the values and detailed metadata of specific cookies by their names across origins.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    cookieNames: {
                        type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                        description: 'A list of cookie names to retrieve values and metadata for.',
                        items: { type: 1 /* Host.AidaClient.ParametersTypes.STRING */, description: 'A cookie name.' },
                        nullable: false,
                    },
                    origins: {
                        type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                        description: 'List of origins the cookies belong to.',
                        items: { type: 1 /* Host.AidaClient.ParametersTypes.STRING */, description: 'An origin URL.' },
                        nullable: false,
                    },
                },
                required: ['cookieNames', 'origins'],
            },
            displayInfoFromArgs: args => {
                return {
                    title: lockedString('Reading cookie values and metadata'),
                    action: `getCookieValues(${JSON.stringify(args.cookieNames)}, ${JSON.stringify(args.origins)})`,
                };
            },
            handler: async (args, options) => {
                this.disableServerSideLogging();
                if (!isSamePrimaryPageOrigin(this.targetManager, this.context)) {
                    return { error: 'No origin available or not allowed.' };
                }
                const targetOrigins = resolveTargetOrigins(this.context, args.origins);
                if (options?.approved !== true) {
                    return {
                        requiresApproval: true,
                        description: lockedString(`The AI wants to access the value(s) and metadata of cookie(s) ${args.cookieNames.map(name => `\`${name}\``).join(', ')} on ${targetOrigins.join(', ')}.`),
                    };
                }
                const cookiesByOrigin = {};
                await Promise.all(targetOrigins.map(async (origin) => {
                    const frame = findFrameForOrigin(this.context, origin, this.targetManager);
                    if (!frame) {
                        cookiesByOrigin[origin] = { error: 'Frame not found or origin disallowed' };
                        return;
                    }
                    const target = frame.resourceTreeModel().target();
                    const cookies = await getCookiesForDomain(target, origin);
                    if (!cookies) {
                        cookiesByOrigin[origin] = { cookies: [] };
                        return;
                    }
                    const matchingCookies = cookies.filter(c => args.cookieNames.includes(c.name()));
                    const cookieData = matchingCookies.map(cookie => {
                        const value = cookie.value();
                        const truncatedValue = value.length > MAX_NUM_CHAR_LENGTH ?
                            value.substring(0, MAX_NUM_CHAR_LENGTH) + '... <truncated>' :
                            value;
                        return {
                            value: truncatedValue,
                            domain: cookie.domain(),
                            path: cookie.path(),
                            expires: cookie.expires(),
                            size: cookie.size(),
                            secure: cookie.secure(),
                            sameSite: cookie.sameSite(),
                            partitioned: cookie.partitioned(),
                            priority: cookie.priority(),
                            sourcePort: cookie.sourcePort(),
                            sourceScheme: cookie.sourceScheme(),
                        };
                    });
                    cookiesByOrigin[origin] = { cookies: cookieData };
                }));
                return { result: { cookiesByOrigin } };
            },
        });
        this.declareFunction('getStorageBreakdown', {
            description: 'Retrieves a breakdown of active storage usage per storage type for the top-level page.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {},
                required: [],
            },
            displayInfoFromArgs: () => {
                return {
                    title: lockedString('Retrieving storage breakdown'),
                    action: 'getStorageBreakdown()',
                };
            },
            handler: async () => {
                const target = this.targetManager.primaryPageTarget();
                if (!target || !this.context || !isSamePageOrigin(target, this.context)) {
                    return { error: 'No origin available or not allowed.' };
                }
                const origin = this.context.getItem().primaryTargetOrigin;
                const response = await target.storageAgent().invoke_getUsageAndQuota({ origin });
                if (response.getError()) {
                    return { error: response.getError() || 'Unknown CDP error' };
                }
                const mainStorageKey = target.model(SDK.StorageKeyManager.StorageKeyManager)?.mainStorageKey() || undefined;
                const localStorages = resolveDOMStorages(this.context, 'localStorage', origin, this.targetManager, mainStorageKey);
                const localStorageBytes = await calculateDOMStoragesUsage(localStorages);
                const sessionStorages = resolveDOMStorages(this.context, 'sessionStorage', origin, this.targetManager, mainStorageKey);
                const sessionStorageBytes = await calculateDOMStoragesUsage(sessionStorages);
                const cookies = await getCookiesForDomain(target, origin);
                let cookieBytes = 0;
                if (cookies) {
                    for (const cookie of cookies) {
                        cookieBytes += cookie.size();
                    }
                }
                const rawUsageBreakdown = response.usageBreakdown.filter(entry => entry.usage > 0).map(entry => ({
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
            },
        });
    }
    static #formatContext(item) {
        const primaryTargetOrigin = `Primary target: ${item.primaryTargetOrigin}`;
        if (item instanceof CookieItem) {
            const parsedURL = Common.ParsedURL.ParsedURL.fromString(item.origin);
            const domain = parsedURL ? parsedURL.host : item.origin;
            return `${primaryTargetOrigin}\nUser-selected Context: Cookies${item.isGenericContext ? '' : `\nDomain: ${domain}`}${item.name ? `\nCookie Name: ${item.name}` : ''}`;
        }
        if (item instanceof DOMStorageItem) {
            return `${primaryTargetOrigin}\nUser-selected Context: DOM Storage\n Type: ${item.type}${item.isGenericContext ?
                '' :
                `\nStorageKey: ${item.storageKey}\nOrigin: ${item.origin}`}${item.key ? `\nKey: ${item.key}` : ''}`;
        }
        return primaryTargetOrigin;
    }
    async preRun() {
        const item = this.context?.getItem();
        if (item instanceof CookieItem && Boolean(item.name)) {
            this.disableServerSideLogging();
        }
        else if (item instanceof DOMStorageItem && Boolean(item.key)) {
            this.disableServerSideLogging();
        }
    }
    async *handleContextDetails(context) {
        if (!context) {
            return;
        }
        yield {
            type: "context" /* ResponseType.CONTEXT */,
            details: [
                {
                    title: 'Selected Storage Context',
                    text: StorageAgent.#formatContext(context.getItem()),
                },
            ],
        };
    }
    async enhanceQuery(query, context) {
        if (!context) {
            return query;
        }
        return `# Active Context\n${StorageAgent.#formatContext(context.getItem())}\n\n${query}`;
    }
}
/**
 * Resolves and filters active DOM storage partitions from the Target Manager matching the given context constraints.
 *
 * @param context The conversation context containing origin permissions. Only storage partitions under targets allowed
 * by this context will be returned.
 * @param type The DOM storage type ('localStorage' or 'sessionStorage') to filter for.
 * @param origin The partition origin to match.
 * @param storageKey Optional. If specified, resolves only the partition exactly matching this unique key, bypassing origin comparison.
 */
export async function getCookiesForDomain(target, origin) {
    const cookieModel = target.model(SDK.CookieModel.CookieModel);
    if (!cookieModel) {
        return null;
    }
    const allCookies = await cookieModel.getCookiesForDomain(origin);
    if (!allCookies) {
        return null;
    }
    return allCookies.filter(cookie => !cookie.httpOnly());
}
export function findFrameForOrigin(context, origin, targetManager) {
    const parsedOrigin = SDK.SecurityOrigin.SecurityOrigin.create(origin);
    for (const frame of SDK.ResourceTreeModel.ResourceTreeModel.frames(targetManager)) {
        if (frame.securityOrigin().isSameOriginWith(parsedOrigin)) {
            const target = frame.resourceTreeModel().target();
            if (isSamePageOrigin(target.outermostTarget(), context)) {
                return frame;
            }
        }
    }
    return null;
}
async function calculateDOMStoragesUsage(storages) {
    let totalBytes = 0;
    for (const storage of storages) {
        const items = await storage.getItems();
        if (items) {
            for (const [key, value] of items) {
                // UTF-16 encoded strings use 2 bytes per character.
                totalBytes += (key.length + value.length) * 2;
            }
        }
    }
    return totalBytes;
}
export function resolveDOMStorages(context, type, origin, targetManager, storageKey) {
    const resolvedStorages = [];
    const isLocalStorage = type === 'localStorage';
    const domStorageModels = targetManager.models(SDK.DOMStorageModel.DOMStorageModel);
    for (const domStorageModel of domStorageModels) {
        if (!isSamePageOrigin(domStorageModel.target().outermostTarget(), context)) {
            // Skip DOMStorageModels that don't point to the same outermost target.
            continue;
        }
        for (const storage of domStorageModel.storages()) {
            if (storage.isLocalStorage !== isLocalStorage) {
                continue;
            }
            const currentStorageKey = storage.storageKey;
            if (!currentStorageKey) {
                continue;
            }
            // If we search by storageKey, verify the storage key matches AND the underlying origin matches the request origin.
            if (storageKey) {
                if (storageKey === currentStorageKey) {
                    const parsedKey = SDK.StorageKeyManager.parseStorageKey(currentStorageKey);
                    if (parsedKey.origin === origin) {
                        resolvedStorages.push(storage);
                    }
                }
                continue;
            }
            const parsedKey = SDK.StorageKeyManager.parseStorageKey(currentStorageKey);
            if (parsedKey.origin === origin) {
                resolvedStorages.push(storage);
            }
        }
    }
    return resolvedStorages;
}
//# sourceMappingURL=StorageAgent.js.map