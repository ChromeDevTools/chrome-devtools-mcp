// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * IMPORTANT! Make sure that any class that is exported here has related unit
 * tests added to foundation_unittests. See front_end/core/i18n/BUILD.gn as an
 * example.
 */
export * as Common from '../front_end/core/common/common.js';
export * as Host from '../front_end/core/host/host.js';
export * as I18n from '../front_end/core/i18n/i18n.js';
export * as Platform from '../front_end/core/platform/platform.js';
export { ConnectionTransport } from '../front_end/core/protocol_client/ConnectionTransport.js';
export * as ProtocolClient from '../front_end/core/protocol_client/protocol_client.js';
export { PuppeteerDevToolsConnection } from '../front_end/core/protocol_client/PuppeteerDevToolsConnection.js';
export * as CSSMatchedStyles from '../front_end/core/sdk/CSSMatchedStyles.js';
export * as CSSMetadata from '../front_end/core/sdk/CSSMetadata.js';
export * as CSSModel from '../front_end/core/sdk/CSSModel.js';
export * as CSSProperty from '../front_end/core/sdk/CSSProperty.js';
export * as CSSRule from '../front_end/core/sdk/CSSRule.js';
export * as CSSStyleDeclaration from '../front_end/core/sdk/CSSStyleDeclaration.js';
export { DebuggerModel, skipAllPausesSettingDescriptor } from '../front_end/core/sdk/DebuggerModel.js';
export * as DOMModel from '../front_end/core/sdk/DOMModel.js';
export * as NetworkManager from '../front_end/core/sdk/NetworkManager.js';
export { RuntimeModel } from '../front_end/core/sdk/RuntimeModel.js';
export * as SDKSettings from '../front_end/core/sdk/SDKSettings.js';
export * as SourceMapManager from '../front_end/core/sdk/SourceMapManager.js';
export { Target } from '../front_end/core/sdk/Target.js';
export { TargetManager } from '../front_end/core/sdk/TargetManager.js';
export * as WebAuthnModel from '../front_end/core/sdk/WebAuthnModel.js';
export { VALID_PLACEHOLDER_MATCH_PATTERN } from '../front_end/core/text_utils/Markdown.js';
export * as Foundation from '../front_end/foundation/foundation.js';
export * as Protocol from '../front_end/generated/protocol.js';
export * as NetworkRequestFormatter from '../front_end/models/ai_assistance/data_formatters/NetworkRequestFormatter.js';
export { PerformanceInsightFormatter, } from '../front_end/models/ai_assistance/data_formatters/PerformanceInsightFormatter.js';
export { PerformanceTraceFormatter, } from '../front_end/models/ai_assistance/data_formatters/PerformanceTraceFormatter.js';
export { AgentFocus } from '../front_end/models/ai_assistance/performance/AIContext.js';
export { DebuggerWorkspaceBinding } from '../front_end/models/bindings/DebuggerWorkspaceBinding.js';
export * as BreakpointManager from '../front_end/models/breakpoints/BreakpointManager.js';
export * as CrUXManager from '../front_end/models/crux-manager/CrUXManager.js';
export * as Formatter from '../front_end/models/formatter/formatter.js';
export * as HeapSnapshotModel from '../front_end/models/heap_snapshot/heap_snapshot.js';
export { Issue } from '../front_end/models/issues_manager/Issue.js';
export { AggregatedIssue, Events as IssueAggregatorEvents, IssueAggregator, } from '../front_end/models/issues_manager/IssueAggregator.js';
export { createIssuesFromProtocolIssue, Events as IssuesManagerEvents, isIssueCodeSupported, IssuesManager, } from '../front_end/models/issues_manager/IssuesManager.js';
export * as MarkdownIssueDescription from '../front_end/models/issues_manager/MarkdownIssueDescription.js';
export * as StackTrace from '../front_end/models/stack_trace/stack_trace.js';
export * as TraceEngine from '../front_end/models/trace/trace.js';
export { DefaultCategories as TracingDefaultCategories, OptionalCategories as TracingOptionalCategories, } from '../front_end/models/trace/types/TraceEvents.js';
export { IgnoreListManager } from '../front_end/models/workspace/IgnoreListManager.js';
export * as Workspace from '../front_end/models/workspace/workspace.js';
export * as Marked from '../front_end/third_party/marked/marked.js';
//# sourceMappingURL=mcp.js.map