// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { getCookiesForOrigin, resolveAllowedTargetOrigins } from './CookieUtils.js';
const lockedString = i18n.i18n.lockedString;
export class ListCookiesTool {
    name = "listCookies" /* ToolName.LIST_COOKIES */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Lists all cookie names for requested origins (or the current page origin if omitted), strictly excluding their values.';
    annotations = ["redact-from-history" /* ToolAnnotation.REDACT_FROM_HISTORY */];
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        nullable: false,
        properties: {
            origins: {
                type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                description: 'Optional list of origins to list cookies for. Defaults to the current page origin if omitted.',
                items: { type: 1 /* Host.AidaClient.ParametersTypes.STRING */, description: 'An origin URL.' },
                nullable: true,
            },
        },
        required: [],
    };
    displayInfoFromArgs(args) {
        return {
            title: lockedString('Reading cookies'),
            action: `listCookies(${JSON.stringify(args?.origins ?? [])})`,
        };
    }
    async handler(args, context) {
        context.disableLogging();
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const targetManager = SDK.TargetManager.TargetManager.instance();
        const targetOriginsResult = resolveAllowedTargetOrigins(args?.origins, context, targetManager);
        if ('error' in targetOriginsResult) {
            return { error: targetOriginsResult.error };
        }
        const { targetOrigins, primaryPageTarget } = targetOriginsResult;
        const cookieNamesByOrigin = {};
        await Promise.all(targetOrigins.map(async (origin) => {
            const result = await getCookiesForOrigin(origin, primaryPageTarget);
            if ('error' in result) {
                cookieNamesByOrigin[origin] = { error: result.error };
                return;
            }
            const uniqueNames = Array.from(new Set(result.cookies.map(c => c.name())));
            cookieNamesByOrigin[origin] = { cookies: uniqueNames };
        }));
        return { result: { cookieNamesByOrigin } };
    }
}
//# sourceMappingURL=ListCookies.js.map