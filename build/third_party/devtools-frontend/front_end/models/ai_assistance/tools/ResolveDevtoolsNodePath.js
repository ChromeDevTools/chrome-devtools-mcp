// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { isOriginAllowedByLock, } from './Tool.js';
/**
 * A tool that resolves a DevTools node path to a backend node ID.
 *
 * This is used by the AI assistant to identify specific DOM nodes referred to in
 * Lighthouse reports or other sources using node paths. It ensures the resolved node
 * belongs to the locked origin.
 */
export class ResolveDevtoolsNodePathTool {
    name = "resolveDevtoolsNodePath" /* ToolName.RESOLVE_DEVTOOLS_NODE_PATH */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Resolves a DevTools node path (e.g. from a Lighthouse audit snippet) to an element backend node ID for further DOM, style, or accessibility inspection.';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: 'Arguments for resolving a DevTools node path to a backend node ID.',
        nullable: false,
        properties: {
            explanation: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'Reason for requesting this resolution.',
                nullable: false,
            },
            path: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'DevTools node path string (e.g. "1,HTML,1,BODY,2,DIV").',
                nullable: false,
            },
        },
        required: ['explanation', 'path'],
    };
    displayInfoFromArgs(params) {
        return {
            title: 'Resolving element path',
            thought: params.explanation,
            action: `resolveDevtoolsNodePath('${params.path}')`,
        };
    }
    /**
     * Handles the resolution request.
     *
     * It retrieves the node path using the target's DOMModel and verifies
     * that the node's origin matches the established origin lock to prevent
     * access to nodes from other origins.
     */
    async handler(params, context) {
        const target = context.getTarget();
        const domModel = target?.model(SDK.DOMModel.DOMModel);
        if (!domModel) {
            return { error: 'Error: Inspected target not found.' };
        }
        let nodeId;
        try {
            // Resolves the DevTools node path (a representation of the path to a node)
            // and ensures the node is loaded into the frontend DOM model, returning its ID.
            nodeId = await domModel.pushNodeByPathToFrontend(params.path);
        }
        catch {
            // pushNodeByPathToFrontend throws when the path is invalid or the node cannot be found.
            // Swallow the error here so execution falls through to the structured error response below.
        }
        if (!nodeId) {
            return { error: 'Error: Could not find node by path.' };
        }
        const node = domModel.nodeForId(nodeId);
        if (!node) {
            return { error: 'Error: Could not retrieve resolved node.' };
        }
        // Security check: Ensure the resolved node belongs to the same origin
        // that this AI assistance session is locked to, preventing cross-origin access.
        if (!isOriginAllowedByLock(context.getOriginLock(), node.securityOrigin())) {
            return { error: 'Error: Node does not belong to the current origin.' };
        }
        // Take a snapshot of the resolved node's DOM structure. This is required
        // by the DOM_TREE UI widget to render the element's local tree in the AI response panel.
        const snapshot = await node.takeSnapshot();
        return {
            result: { backendNodeId: node.backendNodeId() },
            widgets: [{
                    name: 'DOM_TREE',
                    data: {
                        root: snapshot,
                        title: i18n.i18n.lockedString('Element details'),
                        accessibleRevealLabel: i18n.i18n.lockedString('Reveal element'),
                    },
                }],
        };
    }
}
//# sourceMappingURL=ResolveDevtoolsNodePath.js.map