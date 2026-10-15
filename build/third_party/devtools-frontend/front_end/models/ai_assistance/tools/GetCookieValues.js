// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { getCookiesForOrigin, resolveAllowedTargetOrigins, } from './CookieUtils.js';
const lockedString = i18n.i18n.lockedString;
// Maximum character length allowed per cookie value to prevent oversized cookies
// from exceeding the LLM context window.
export const MAX_NUM_CHAR_LENGTH = 10000;
export class GetCookieValuesTool {
    name = "getCookieValues" /* ToolName.GET_COOKIE_VALUES */;
    permissionPrompt = "allow-once" /* PermissionPrompt.ALLOW_ONCE */;
    permissionTitle = lockedString('Allow reading cookie values?');
    description = 'Retrieve the values and detailed metadata of specific cookies by their names across origins.';
    annotations = ["redact-from-history" /* ToolAnnotation.REDACT_FROM_HISTORY */];
    parameters = {
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
                description: 'Optional list of origins the cookies belong to. Defaults to the current page origin if omitted.',
                items: { type: 1 /* Host.AidaClient.ParametersTypes.STRING */, description: 'An origin URL.' },
                nullable: true,
            },
        },
        required: ['cookieNames'],
    };
    displayInfoFromArgs(args) {
        return {
            title: lockedString('Reading cookie values and metadata'),
            action: `getCookieValues(${JSON.stringify(args?.cookieNames ?? [])}, ${JSON.stringify(args?.origins ?? [])})`,
        };
    }
    async handler(args, context, options) {
        context.disableLogging();
        if (!args || !Array.isArray(args.cookieNames) || args.cookieNames.length === 0) {
            return { error: 'No cookie names provided.' };
        }
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const targetManager = SDK.TargetManager.TargetManager.instance();
        const targetOriginsResult = resolveAllowedTargetOrigins(args?.origins, context, targetManager);
        if ('error' in targetOriginsResult) {
            return { error: targetOriginsResult.error };
        }
        const { targetOrigins, primaryPageTarget } = targetOriginsResult;
        if (options?.approved !== true) {
            const cookieString = args.cookieNames.map(name => `\`${name}\``).join(', ');
            const targetsDesc = targetOrigins.join(', ');
            return {
                requiresApproval: true,
                description: lockedString(`The AI wants to access the value(s) and metadata of cookie(s) ${cookieString} on ${targetsDesc}.`),
            };
        }
        const cookiesByOrigin = {};
        await Promise.all(targetOrigins.map(async (origin) => {
            const result = await getCookiesForOrigin(origin, primaryPageTarget);
            if ('error' in result) {
                cookiesByOrigin[origin] = { error: result.error };
                return;
            }
            const matchingCookies = result.cookies.filter(c => args.cookieNames.includes(c.name()));
            const cookieData = matchingCookies.map(cookie => {
                const value = cookie.value();
                const truncatedValue = value.length > MAX_NUM_CHAR_LENGTH ? value.substring(0, MAX_NUM_CHAR_LENGTH) + '... <truncated>' : value;
                return {
                    name: cookie.name(),
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
    }
}
//# sourceMappingURL=GetCookieValues.js.map