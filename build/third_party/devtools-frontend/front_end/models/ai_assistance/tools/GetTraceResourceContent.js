// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Root from '../../../core/root/root.js';
import * as SDK from '../../../core/sdk/sdk.js';
import * as TextUtils from '../../../core/text_utils/text_utils.js';
const UIStringsNotTranslate = {
    lookingAtResourceContent: 'Looking at resource content',
};
const lockedString = i18n.i18n.lockedString;
/**
 * Retrieves text content for a resource or script captured in the performance trace.
 *
 * Precedence:
 * 1. Checks trace metadata (`parsedTrace.data.Scripts`) for scripts captured during recording.
 * 2. Falls back to querying the live page target's `ResourceTreeModel`.
 *
 * Preconditions:
 * - Requires an active, freshly recorded trace session (fails on imported traces).
 * - Fails if resource is binary/non-text, cross-origin, or a `file://` URL.
 */
export class GetTraceResourceContentTool {
    name = "getTraceResourceContent" /* ToolName.GET_TRACE_RESOURCE_CONTENT */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Retrieves the text content of a script or resource captured within the recorded performance trace by URL. Only use this for text resource types. Do not call this tool on imported traces or for general workspace files (use listSources and getSourceContent instead).';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: 'Arguments for looking up resource content from the performance trace.',
        nullable: false,
        properties: {
            url: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'The URL of the resource captured in the performance trace to retrieve.',
                nullable: false,
            },
        },
        required: ['url'],
    };
    displayInfoFromArgs(params) {
        return {
            title: lockedString(UIStringsNotTranslate.lookingAtResourceContent),
            action: `getTraceResourceContent('${params.url}')`,
        };
    }
    async handler(params, capabilities) {
        const performanceTraceContext = capabilities.getPerformanceTraceContext();
        if (!performanceTraceContext) {
            return { error: 'Performance trace context is not available.' };
        }
        if (performanceTraceContext.isImported()) {
            return { error: 'Cannot use this tool on an imported file.' };
        }
        if (!params.url) {
            return { error: 'Missing arg: url' };
        }
        if (!performanceTraceContext.canAccessResource(params.url)) {
            return { error: 'Resource not found' };
        }
        const focus = performanceTraceContext.getItem();
        const { parsedTrace } = focus;
        let content;
        const url = params.url;
        // Check trace metadata for scripts captured during recording before falling back to live page resources.
        const script = parsedTrace.data.Scripts?.scripts.find(script => script.url === params.url);
        if (script?.content !== undefined) {
            content = script.content;
        }
        else {
            const target = capabilities.getTarget();
            const isTraceApp = Root.Runtime.Runtime.isTraceApp();
            if (target || isTraceApp) {
                const targetManager = target?.targetManager() ??
                    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
                    SDK.TargetManager.TargetManager.instance();
                const resource = SDK.ResourceTreeModel.ResourceTreeModel.resourceForURL(targetManager, url);
                if (!resource) {
                    return { error: 'Resource not found' };
                }
                const data = await resource.requestContentData();
                if (TextUtils.ContentData.ContentData.isError(data)) {
                    return { error: `Could not get resource content: ${data.error}` };
                }
                if (!data.isTextContent) {
                    return { error: 'Cannot retrieve content for non-text resource' };
                }
                content = data.text;
            }
            else {
                return { error: 'Resource not found' };
            }
        }
        return {
            result: { content },
            widgets: [{
                    name: 'SOURCE_CODE',
                    data: {
                        url,
                        code: content,
                    },
                }],
        };
    }
}
//# sourceMappingURL=GetTraceResourceContent.js.map