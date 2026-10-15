// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { ExecuteJavaScriptTool } from './ExecuteJavaScript.js';
import { GetCookieValuesTool } from './GetCookieValues.js';
import { GetDetailedCallTreeTool } from './GetDetailedCallTree.js';
import { GetElementAccessibilityDetailsTool } from './GetElementAccessibilityDetails.js';
import { GetInsightDetailsTool } from './GetInsightDetails.js';
import { GetLighthouseAuditsTool } from './GetLighthouseAudits.js';
import { GetNetworkRequestDetailsTool } from './GetNetworkRequestDetails.js';
import { GetSourceContentTool } from './GetSourceContent.js';
import { GetStorageBreakdownTool } from './GetStorageBreakdown.js';
import { GetStorageValuesTool } from './GetStorageValues.js';
import { GetStylesTool } from './GetStyles.js';
import { GetTraceEventByKeyTool } from './GetTraceEventByKey.js';
import { GetTraceFunctionCodeTool } from './GetTraceFunctionCode.js';
import { GetTraceMainThreadSummaryTool } from './GetTraceMainThreadSummary.js';
import { GetTraceNetworkSummaryTool } from './GetTraceNetworkSummary.js';
import { GetTraceResourceContentTool } from './GetTraceResourceContent.js';
import { ListCookiesTool } from './ListCookies.js';
import { ListNetworkRequestsTool } from './ListNetworkRequests.js';
import { ListPageOriginsTool } from './ListPageOrigins.js';
import { ListSourcesTool } from './ListSources.js';
import { ListStorageKeysTool } from './ListStorageKeys.js';
import { RecordPerformanceTraceTool } from './RecordPerformanceTrace.js';
import { ResolveDevtoolsNodePathTool } from './ResolveDevtoolsNodePath.js';
import { RunLighthouseTool } from './RunLighthouse.js';
import { SelectTraceEventByKeyTool } from './SelectTraceEventByKey.js';
/**
 * Plain object registry containing concrete instantiated tools.
 */
export const TOOLS = {
    ["executeJavaScript" /* ToolName.EXECUTE_JAVASCRIPT */]: new ExecuteJavaScriptTool(),
    ["getStyles" /* ToolName.GET_STYLES */]: new GetStylesTool(),
    ["listNetworkRequests" /* ToolName.LIST_NETWORK_REQUESTS */]: new ListNetworkRequestsTool(),
    ["getNetworkRequestDetails" /* ToolName.GET_NETWORK_REQUEST_DETAILS */]: new GetNetworkRequestDetailsTool(),
    ["getLighthouseAudits" /* ToolName.GET_LIGHTHOUSE_AUDITS */]: new GetLighthouseAuditsTool(),
    ["resolveDevtoolsNodePath" /* ToolName.RESOLVE_DEVTOOLS_NODE_PATH */]: new ResolveDevtoolsNodePathTool(),
    ["getElementAccessibilityDetails" /* ToolName.GET_ELEMENT_ACCESSIBILITY_DETAILS */]: new GetElementAccessibilityDetailsTool(),
    ["recordPerformanceTrace" /* ToolName.RECORD_PERFORMANCE_TRACE */]: new RecordPerformanceTraceTool(),
    ["listPageOrigins" /* ToolName.LIST_PAGE_ORIGINS */]: new ListPageOriginsTool(),
    ["listStorageKeys" /* ToolName.LIST_STORAGE_KEYS */]: new ListStorageKeysTool(),
    ["getStorageValues" /* ToolName.GET_STORAGE_VALUES */]: new GetStorageValuesTool(),
    ["listCookies" /* ToolName.LIST_COOKIES */]: new ListCookiesTool(),
    ["getCookieValues" /* ToolName.GET_COOKIE_VALUES */]: new GetCookieValuesTool(),
    ["getTraceEventByKey" /* ToolName.GET_TRACE_EVENT_BY_KEY */]: new GetTraceEventByKeyTool(),
    ["selectTraceEventByKey" /* ToolName.SELECT_TRACE_EVENT_BY_KEY */]: new SelectTraceEventByKeyTool(),
    ["listSources" /* ToolName.LIST_SOURCES */]: new ListSourcesTool(),
    ["getSourceContent" /* ToolName.GET_SOURCE_CONTENT */]: new GetSourceContentTool(),
    ["getTraceMainThreadSummary" /* ToolName.GET_TRACE_MAIN_THREAD_SUMMARY */]: new GetTraceMainThreadSummaryTool(),
    ["getTraceNetworkSummary" /* ToolName.GET_TRACE_NETWORK_SUMMARY */]: new GetTraceNetworkSummaryTool(),
    ["runLighthouse" /* ToolName.RUN_LIGHTHOUSE */]: new RunLighthouseTool(),
    ["getDetailedCallTree" /* ToolName.GET_DETAILED_CALL_TREE */]: new GetDetailedCallTreeTool(),
    ["getTraceFunctionCode" /* ToolName.GET_TRACE_FUNCTION_CODE */]: new GetTraceFunctionCodeTool(),
    ["getTraceResourceContent" /* ToolName.GET_TRACE_RESOURCE_CONTENT */]: new GetTraceResourceContentTool(),
    ["getInsightDetails" /* ToolName.GET_INSIGHT_DETAILS */]: new GetInsightDetailsTool(),
    ["getStorageBreakdown" /* ToolName.GET_STORAGE_BREAKDOWN */]: new GetStorageBreakdownTool(),
};
/**
 * Registry class for registering and querying AI Assistance Tools.
 */
export class ToolRegistry {
    static get(name) {
        // We use a double assertion (`as unknown as Tool<...>`) here. TypeScript's variance
        // rules prevent direct casting from specific concrete tools (which have narrowed,
        // capability-specific contexts) to the generic `Tool` signature that uses `AllToolsCapabilities`.
        // This cast is runtime-safe because any capability requested by a specific tool is
        // guaranteed to be satisfied by `AllToolsCapabilities`, and the handler will only access
        // the capabilities it expects.
        return Object.prototype.hasOwnProperty.call(TOOLS, name) ?
            TOOLS[name] :
            undefined;
    }
}
//# sourceMappingURL=ToolRegistry.js.map