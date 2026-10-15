// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { isOriginAllowedByLock, } from './Tool.js';
export class GetStylesTool {
    name = "getStyles" /* ToolName.GET_STYLES */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = `Retrieves computed and authored CSS styles for one or more elements by their backend node IDs (uids).

**CRITICAL** An element uid is a number, not a selector.
**CRITICAL** Use selectors to refer to elements in the text output. Do not use uids.
**CRITICAL** Always provide the explanation argument to explain what and why you query.
**CRITICAL** You MUST provide a specific list of CSS property names. Do not use generic values like "all" or "*".`;
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        nullable: false,
        properties: {
            explanation: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'Explain why you want to get styles',
                nullable: false,
            },
            elements: {
                type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                description: 'A list of element uids to get data for. These are numbers, not selectors.',
                items: { type: 3 /* Host.AidaClient.ParametersTypes.INTEGER */, description: 'An element uid.' },
                nullable: false,
            },
            styleProperties: {
                type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                description: 'One or more specific CSS style property names to fetch. Generic values like "all" or "*" are not supported.',
                nullable: false,
                items: {
                    type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                    description: 'A CSS style property name to retrieve. For example, \'background-color\'.',
                },
            },
        },
        required: ['explanation', 'elements', 'styleProperties'],
    };
    displayInfoFromArgs(params) {
        return {
            title: 'Reading computed and source styles',
            thought: params.explanation,
            action: `getStyles(${JSON.stringify(params.elements)}, ${JSON.stringify(params.styleProperties)})`,
        };
    }
    /**
     * Handles the request to retrieve computed and authored CSS styles for specified elements.
     *
     * Resolves element backend node IDs using the primary page target and verifies that each
     * element's security origin matches the established origin lock before querying CSS models.
     */
    async handler(params, context, _options) {
        const widgets = [];
        const result = {};
        const target = context.getTarget();
        if (!target) {
            return { error: 'Error: Could not find the inspected page.' };
        }
        for (const uid of params.elements) {
            result[uid] = { computed: {}, authored: {} };
            const node = new SDK.DOMModel.DeferredDOMNode(target, uid);
            const resolved = await node.resolvePromise();
            if (!resolved) {
                return { error: 'Error: Could not find the element with uid=' + uid };
            }
            // Security check: Ensure the resolved element belongs to the locked origin.
            // Because getTarget() returns the primary page target to support resolving elements
            // across frames, origin validation must be enforced directly on the resolved node.
            if (!isOriginAllowedByLock(context.getOriginLock(), resolved.securityOrigin())) {
                return { error: 'Error: Node does not belong to the current origin.' };
            }
            const styles = await resolved.domModel().cssModel().getComputedStyle(resolved.id);
            if (!styles) {
                return { error: 'Error: Could not get computed styles.' };
            }
            const matchedStyles = await resolved.domModel().cssModel().getMatchedStyles(resolved.id);
            if (!matchedStyles) {
                return { error: 'Error: Could not get authored styles.' };
            }
            widgets.push({
                name: 'COMPUTED_STYLES',
                data: {
                    computedStyles: styles,
                    backendNodeId: node.backendNodeId(),
                    matchedCascade: matchedStyles,
                    properties: params.styleProperties,
                },
            });
            for (const prop of params.styleProperties) {
                result[uid].computed[prop] = styles.get(prop);
            }
            for (const style of matchedStyles.nodeStyles()) {
                for (const property of style.allProperties()) {
                    if (!params.styleProperties.includes(property.name)) {
                        continue;
                    }
                    const state = matchedStyles.propertyState(property);
                    if (state === "Active" /* SDK.CSSMatchedStyles.PropertyState.ACTIVE */) {
                        result[uid].authored[property.name] = property.value;
                    }
                }
            }
        }
        return {
            result: JSON.stringify(result, null, 2),
            widgets,
        };
    }
}
//# sourceMappingURL=GetStyles.js.map