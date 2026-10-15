// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import { PerformanceTraceContext } from '../contexts/PerformanceTraceContext.js';
const UIStringsNotTranslate = {
    recordingPerformanceTrace: 'Recording a performance trace',
};
const lockedString = i18n.i18n.lockedString;
export class RecordPerformanceTraceTool {
    name = "recordPerformanceTrace" /* ToolName.RECORD_PERFORMANCE_TRACE */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Reloads the page and records a new performance trace to measure, analyze, and debug page performance. Preferred tool for measuring page load performance and Core Web Vitals.';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: 'Parameters for recording a performance trace.',
        nullable: false,
        properties: {},
        required: [],
    };
    displayInfoFromArgs() {
        return {
            title: lockedString(UIStringsNotTranslate.recordingPerformanceTrace),
            action: 'recordPerformanceTrace()',
        };
    }
    async handler(_params, capabilities) {
        if (!capabilities.performanceRecordAndReload) {
            return { error: 'Performance recording is not available.' };
        }
        try {
            const result = await capabilities.performanceRecordAndReload();
            return {
                context: PerformanceTraceContext.fromParsedTrace(result),
                description: 'User recorded a performance trace',
                widgets: [{ name: 'PERFORMANCE_TRACE', data: { parsedTrace: result } }],
            };
        }
        catch (err) {
            return { error: `Failed to record performance trace: ${err instanceof Error ? err.message : String(err)}` };
        }
    }
}
//# sourceMappingURL=RecordPerformanceTrace.js.map