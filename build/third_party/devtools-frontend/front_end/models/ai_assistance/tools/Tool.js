// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Checks whether a target origin matches the established conversation origin lock.
 * Returns `false` if the lock is not established, either origin is opaque, or the
 * target origin does not match the established origin.
 */
export function isOriginAllowedByLock(originLock, targetOrigin) {
    if (originLock.status !== 'ESTABLISHED_ORIGIN') {
        return false;
    }
    if (originLock.origin.isOpaque()) {
        return false;
    }
    if (!targetOrigin || targetOrigin.isOpaque()) {
        return false;
    }
    return targetOrigin.isSameOriginWith(originLock.origin);
}
/**
 * Resolves the conversation's established origin from the origin lock state.
 * Returns an error object if origin access is blocked by navigation, the lock
 * is uninitialized, or the established origin is opaque.
 */
export function resolveOriginFromLock(originLock) {
    if (originLock.status === 'BLOCKED_BY_NAVIGATION') {
        return { error: 'Cross-origin access blocked due to navigation.' };
    }
    if (originLock.status === 'UNINITIALIZED') {
        return { error: 'No origin established for this conversation.' };
    }
    if (originLock.origin.isOpaque()) {
        return { error: 'No origin available or not allowed.' };
    }
    return { origin: originLock.origin };
}
// The maximum size (in bytes) of a function execution result.
// Approximately 16k tokens at ~4 characters per token, designed to limit
// result sizes to prevent overloading the LLM's context window.
export const MAX_FUNCTION_RESULT_BYTE_LENGTH = 16384 * 4;
export var ToolName;
(function (ToolName) {
    ToolName["EXECUTE_JAVASCRIPT"] = "executeJavaScript";
    ToolName["GET_STYLES"] = "getStyles";
    ToolName["LIST_NETWORK_REQUESTS"] = "listNetworkRequests";
    ToolName["GET_NETWORK_REQUEST_DETAILS"] = "getNetworkRequestDetails";
    ToolName["GET_LIGHTHOUSE_AUDITS"] = "getLighthouseAudits";
    ToolName["RESOLVE_DEVTOOLS_NODE_PATH"] = "resolveDevtoolsNodePath";
    ToolName["GET_ELEMENT_ACCESSIBILITY_DETAILS"] = "getElementAccessibilityDetails";
    ToolName["RECORD_PERFORMANCE_TRACE"] = "recordPerformanceTrace";
    ToolName["LIST_PAGE_ORIGINS"] = "listPageOrigins";
    ToolName["LIST_STORAGE_KEYS"] = "listStorageKeys";
    ToolName["GET_STORAGE_VALUES"] = "getStorageValues";
    ToolName["LIST_COOKIES"] = "listCookies";
    ToolName["GET_COOKIE_VALUES"] = "getCookieValues";
    ToolName["GET_TRACE_EVENT_BY_KEY"] = "getTraceEventByKey";
    ToolName["SELECT_TRACE_EVENT_BY_KEY"] = "selectTraceEventByKey";
    ToolName["LIST_SOURCES"] = "listSources";
    ToolName["GET_SOURCE_CONTENT"] = "getSourceContent";
    ToolName["GET_TRACE_MAIN_THREAD_SUMMARY"] = "getTraceMainThreadSummary";
    ToolName["GET_TRACE_NETWORK_SUMMARY"] = "getTraceNetworkSummary";
    ToolName["RUN_LIGHTHOUSE"] = "runLighthouse";
    ToolName["GET_DETAILED_CALL_TREE"] = "getDetailedCallTree";
    ToolName["GET_TRACE_FUNCTION_CODE"] = "getTraceFunctionCode";
    ToolName["GET_TRACE_RESOURCE_CONTENT"] = "getTraceResourceContent";
    ToolName["GET_INSIGHT_DETAILS"] = "getInsightDetails";
    ToolName["GET_STORAGE_BREAKDOWN"] = "getStorageBreakdown";
})(ToolName || (ToolName = {}));
/**
 * Choices the permission prompt offers when a tool asks for approval.
 *
 * The tool still decides whether a given call needs approval by returning a
 * `ToolApprovalResult`. This enum decides what the user can choose and whether
 * a stored "always allow" decision can skip the prompt.
 */
export var PermissionPrompt;
(function (PermissionPrompt) {
    /**
     * No permission prompt is shown. Should be used for tools which don't require
     * user permission to run.
     */
    PermissionPrompt["NEVER"] = "never";
    /**
     * The prompt offers: Skip / Allow Once.
     * A stored "always allow" decision is ignored, so the user is asked on every call.
     */
    PermissionPrompt["ALLOW_ONCE"] = "allow-once";
    /**
     * The prompt offers: Skip / Always Allow / Allow Once.
     * If the user previously chose "always allow" for this tool, the prompt is skipped.
     */
    PermissionPrompt["ALLOW_ONCE_OR_ALWAYS"] = "allow-once-or-always";
})(PermissionPrompt || (PermissionPrompt = {}));
/**
 * The user's answer to a permission prompt.
 */
export var PermissionDecision;
(function (PermissionDecision) {
    /**
     * Don't call the tool.
     */
    PermissionDecision["REJECT"] = "reject";
    /**
     * Allow to call the tool.
     */
    PermissionDecision["ALLOW_ONCE"] = "allow-once";
    /**
     * Allow to call the tool, and the tool is added to the allowed tools list so
     * future calls do not prompt. Only offered for `PermissionPrompt.ALLOW_ONCE_OR_ALWAYS`.
     */
    PermissionDecision["ALLOW_ALWAYS"] = "allow-always";
})(PermissionDecision || (PermissionDecision = {}));
export var ToolAnnotation;
(function (ToolAnnotation) {
    ToolAnnotation["REDACT_FROM_HISTORY"] = "redact-from-history";
})(ToolAnnotation || (ToolAnnotation = {}));
//# sourceMappingURL=Tool.js.map