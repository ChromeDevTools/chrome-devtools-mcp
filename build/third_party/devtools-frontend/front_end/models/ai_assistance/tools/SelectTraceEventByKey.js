// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
const UIStringsNotTranslate = {
    selectingTraceEvent: 'Selecting trace event',
};
const lockedString = i18n.i18n.lockedString;
export class SelectTraceEventByKeyTool {
    name = "selectTraceEventByKey" /* ToolName.SELECT_TRACE_EVENT_BY_KEY */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Selects and reveals a specific event by its key in the Performance panel Flamechart.';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: 'Arguments for selecting a trace event.',
        nullable: false,
        properties: {
            eventKey: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'The key of the event to select.',
                nullable: false,
            },
        },
        required: ['eventKey'],
    };
    displayInfoFromArgs(params) {
        return {
            title: lockedString(UIStringsNotTranslate.selectingTraceEvent),
            action: `selectTraceEventByKey('${params.eventKey}')`,
        };
    }
    async handler(params, capabilities) {
        const performanceTraceContext = capabilities.getPerformanceTraceContext();
        if (!performanceTraceContext) {
            return { error: 'Performance trace context is not available.' };
        }
        const focus = performanceTraceContext.getItem();
        const event = focus.lookupEvent(params.eventKey);
        if (!event) {
            return { error: `Could not find event with key "${params.eventKey}".` };
        }
        const revealable = new SDK.TraceObject.RevealableEvent(event);
        try {
            await Common.Revealer.reveal(revealable);
        }
        catch {
            // A failed reveal should not block returning the selected event context.
        }
        return {
            result: 'Event selected',
            widgets: [{
                    name: 'TIMELINE_EVENT_SUMMARY',
                    data: {
                        event,
                        parsedTrace: focus.parsedTrace,
                    },
                }],
        };
    }
}
//# sourceMappingURL=SelectTraceEventByKey.js.map