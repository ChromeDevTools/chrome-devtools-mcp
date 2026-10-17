// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Trace from '../../trace/trace.js';
import { AICallTree } from '../performance/AICallTree.js';
const UIStringsNotTranslate = {
    lookingAtCallTree: 'Looking at call tree',
};
const lockedString = i18n.i18n.lockedString;
export class GetDetailedCallTreeTool {
    name = "getDetailedCallTree" /* ToolName.GET_DETAILED_CALL_TREE */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Retrieves a bottom-up call tree and execution breakdown for a specific main thread event by its eventKey.';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: 'Arguments for looking up a call tree.',
        nullable: false,
        properties: {
            eventKey: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'The key for the event.',
                nullable: false,
            },
        },
        required: ['eventKey'],
    };
    displayInfoFromArgs(params) {
        return {
            title: lockedString(UIStringsNotTranslate.lookingAtCallTree),
            action: `getDetailedCallTree('${params.eventKey}')`,
        };
    }
    async handler(params, capabilities) {
        const performanceTraceContext = capabilities.getPerformanceTraceContext();
        if (!performanceTraceContext) {
            return { error: 'Performance trace context is not available.' };
        }
        if (!params.eventKey) {
            return { error: 'Missing arg: eventKey' };
        }
        const focus = performanceTraceContext.getItem();
        const event = focus.lookupEvent(params.eventKey);
        if (!event) {
            return { error: 'Invalid eventKey' };
        }
        const tree = AICallTree.fromEvent(event, focus.parsedTrace);
        if (!tree) {
            return { error: 'No call tree found' };
        }
        const formatter = performanceTraceContext.createFormatter();
        const callTree = await formatter.formatCallTree(tree);
        const bounds = Trace.Helpers.Timing.traceWindowFromEvent(event);
        return {
            result: callTree,
            widgets: [
                {
                    name: 'BOTTOM_UP_TREE',
                    data: {
                        bounds,
                        parsedTrace: focus.parsedTrace,
                    },
                },
                {
                    name: 'TIMELINE_RANGE_SUMMARY',
                    data: {
                        bounds,
                        parsedTrace: focus.parsedTrace,
                        track: 'main',
                    },
                },
            ],
        };
    }
}
//# sourceMappingURL=GetDetailedCallTree.js.map