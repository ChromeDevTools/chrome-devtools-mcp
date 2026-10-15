// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../core/sdk/sdk.js';
import * as Tracing from '../../../services/tracing/tracing.js';
import * as Bindings from '../../bindings/bindings.js';
import * as SourceMapScopes from '../../source_map_scopes/source_map_scopes.js';
import * as Trace from '../../trace/trace.js';
import { ConversationContext, } from '../agents/AiAgent.js';
import { PerformanceInsightFormatter, } from '../data_formatters/PerformanceInsightFormatter.js';
import { PerformanceTraceFormatter } from '../data_formatters/PerformanceTraceFormatter.js';
import { AgentFocus } from '../performance/AIContext.js';
/**
 * The conversation context for AI queries regarding performance traces.
 * Encapsulates the user's active trace selection/focus and handles formatting
 * the context data for the LLM prompt and user-facing accordion disclosures.
 */
export class PerformanceTraceContext extends ConversationContext {
    static fromParsedTrace(parsedTrace, 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    targetManager = SDK.TargetManager.TargetManager.instance(), freshRecordingTracker = Tracing.FreshRecording.Tracker.instance(), debuggerWorkspaceBinding = 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance()) {
        return new PerformanceTraceContext(AgentFocus.fromParsedTrace(parsedTrace), targetManager, freshRecordingTracker, debuggerWorkspaceBinding);
    }
    static fromInsight(parsedTrace, insight, 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    targetManager = SDK.TargetManager.TargetManager.instance(), freshRecordingTracker = Tracing.FreshRecording.Tracker.instance(), debuggerWorkspaceBinding = 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance()) {
        return new PerformanceTraceContext(AgentFocus.fromInsight(parsedTrace, insight), targetManager, freshRecordingTracker, debuggerWorkspaceBinding);
    }
    static fromCallTree(callTree, 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    targetManager = SDK.TargetManager.TargetManager.instance(), freshRecordingTracker = Tracing.FreshRecording.Tracker.instance(), debuggerWorkspaceBinding = 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance()) {
        return new PerformanceTraceContext(AgentFocus.fromCallTree(callTree), targetManager, freshRecordingTracker, debuggerWorkspaceBinding);
    }
    jslogContext = 'ai-context-performance-trace';
    #focus;
    #targetManager;
    #freshRecordingTracker;
    #debuggerWorkspaceBinding;
    #origin;
    constructor(focus, 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    targetManager = SDK.TargetManager.TargetManager.instance(), freshRecordingTracker = Tracing.FreshRecording.Tracker.instance(), debuggerWorkspaceBinding = 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance()) {
        super();
        this.#focus = focus;
        this.#targetManager = targetManager;
        this.#freshRecordingTracker = freshRecordingTracker;
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
    }
    /**
     * Returns a PerformanceTraceFormatter configured to resolve function
     * code from source maps using the active page target.
     *
     * Note: Function code resolution from source maps is only supported for fresh
     * recordings (recorded in the current session on the active target page). For
     * imported traces, it returns null to prevent mismatched source resolution.
     */
    createFormatter() {
        const focus = this.#focus;
        const target = this.#targetManager.primaryPageTarget();
        const formatter = new PerformanceTraceFormatter(focus);
        const isFresh = this.#freshRecordingTracker.recordingIsFresh(focus.parsedTrace);
        formatter.resolveFunctionCode = async (url, line, column) => {
            if (!target || !isFresh) {
                return null;
            }
            return await SourceMapScopes.FunctionCodeResolver.getFunctionCodeFromLocation(target, url, line, column, this.#debuggerWorkspaceBinding, { contextLength: 200, contextLineLength: 5, appendProfileData: true });
        };
        return formatter;
    }
    /**
     * Returns whether this trace was imported rather than recorded live in the current session.
     */
    isImported() {
        return !this.#freshRecordingTracker.recordingIsFresh(this.#focus.parsedTrace);
    }
    /**
     * Checks whether the AI can access the resource at the specified URL.
     *
     * Access requires the resource origin to match the trace origin.
     * Always rejects `file://` URLs to prevent local file leaks (b/523743289).
     *
     * @param url The URL of the resource to access.
     * @returns `true` if the resource is same-origin with the trace and not a `file://` URL; otherwise `false`.
     */
    canAccessResource(url) {
        const traceOrigin = this.getOrigin();
        const targetOrigin = SDK.SecurityOrigin.SecurityOrigin.create(url);
        // We explicitly block all file:// URLs even if same-origin (b/523743289).
        // Allowing local file access in trace AI risks leaking local system files
        // (such as /etc/passwd) via prompt injection across filesystem edge cases.
        if (traceOrigin.isFile() || targetOrigin.isFile()) {
            return false;
        }
        return traceOrigin.isSameOriginWith(targetOrigin);
    }
    /**
     * Returns the security origin for the performance trace.
     *
     * Live traces use the origin of the main frame URL.
     *
     * Imported traces use a custom scheme (`imported-trace://${host}`) to isolate
     * them from live pages (such as `https://${host}`). This isolation prevents
     * cross-origin prompt injection and requires a new conversation when switching
     * between imported traces and live pages.
     *
     * If an imported trace origin does not contain a host, this method returns a
     * unique opaque origin.
     *
     * @returns The security origin for the trace.
     */
    getOrigin() {
        if (!this.#origin) {
            if (this.isImported()) {
                this.#origin = SDK.SecurityOrigin.SecurityOrigin.createForImportedTrace(this.#focus.parsedTrace.data.Meta.mainFrameURL);
            }
            else {
                this.#origin = SDK.SecurityOrigin.SecurityOrigin.create(this.#focus.parsedTrace.data.Meta.mainFrameURL);
            }
        }
        return this.#origin;
    }
    getItem() {
        return this.#focus;
    }
    getTitle() {
        const focus = this.#focus;
        let url = focus.primaryInsightSet?.url;
        if (!url) {
            url = new URL(focus.parsedTrace.data.Meta.mainFrameURL);
        }
        const parts = [`Trace: ${url.hostname}`];
        if (focus.insight) {
            parts.push(focus.insight.title);
        }
        if (focus.event) {
            parts.push(Trace.Name.forEntry(focus.event));
        }
        if (focus.callTree) {
            const node = focus.callTree.selectedNode ?? focus.callTree.rootNode;
            parts.push(Trace.Name.forEntry(node.event));
        }
        return parts.join(' – ');
    }
    /**
     * Presents the default suggestions that are shown when the user first clicks
     * "Ask AI".
     */
    async getSuggestions() {
        const focus = this.#focus;
        if (focus.callTree) {
            return [
                { title: 'What\'s the purpose of this work?', jslogContext: 'performance-default' },
                { title: 'Where is time being spent?', jslogContext: 'performance-default' },
                { title: 'How can I optimize this?', jslogContext: 'performance-default' },
            ];
        }
        if (focus.insight) {
            return new PerformanceInsightFormatter(focus, focus.insight).getSuggestions();
        }
        const suggestions = [{ title: 'What performance issues exist with my page?', jslogContext: 'performance-default' }];
        const insightSet = focus.primaryInsightSet;
        if (insightSet) {
            const lcp = Trace.Insights.Common.getLCP(insightSet);
            const cls = Trace.Insights.Common.getCLS(insightSet);
            const inp = Trace.Insights.Common.getINP(insightSet);
            const ModelHandlers = Trace.Handlers.ModelHandlers;
            const GOOD = Trace.Handlers.ModelHandlers.PageLoadMetrics.ScoreClassification.GOOD;
            const poorMetrics = new Set();
            if (lcp && ModelHandlers.PageLoadMetrics.scoreClassificationForLargestContentfulPaint(lcp.value) !== GOOD) {
                suggestions.push({ title: 'How can I improve LCP?', jslogContext: 'performance-default' });
                poorMetrics.add(Trace.Insights.Types.InsightKeys.LCP_BREAKDOWN);
                poorMetrics.add(Trace.Insights.Types.InsightKeys.LCP_DISCOVERY);
            }
            if (inp && ModelHandlers.UserInteractions.scoreClassificationForInteractionToNextPaint(inp.value) !== GOOD) {
                suggestions.push({ title: 'How can I improve INP?', jslogContext: 'performance-default' });
                poorMetrics.add(Trace.Insights.Types.InsightKeys.INP_BREAKDOWN);
            }
            if (cls && ModelHandlers.LayoutShifts.scoreClassificationForLayoutShift(cls.value) !== GOOD) {
                suggestions.push({ title: 'How can I improve CLS?', jslogContext: 'performance-default' });
                poorMetrics.add(Trace.Insights.Types.InsightKeys.CLS_CULPRITS);
            }
            // Add up to 4 suggestions total (including those already added) from the top failing insights
            // that aren't already covered by CWV suggestions.
            const additionalSuggestionsRequired = Math.max(0, 4 - suggestions.length);
            if (additionalSuggestionsRequired > 0) {
                const failingInsightSuggestions = Object.values(insightSet.model)
                    .filter(model => {
                    return model.state !== 'pass' && Trace.Insights.Common.isInsightKey(model.insightKey) &&
                        !poorMetrics.has(model.insightKey);
                })
                    .map(model => new PerformanceInsightFormatter(focus, model).getSuggestions().at(-1))
                    .filter((suggestion) => !!suggestion)
                    .slice(0, additionalSuggestionsRequired);
                suggestions.push(...failingInsightSuggestions);
            }
        }
        return suggestions;
    }
    /**
     * Returns a markdown-formatted payload containing the trace data facts
     * (summary, critical requests, activities, third-party code, and longest tasks)
     * to be included directly in the LLM's prompt.
     *
     * Invariant: The content returned here must align with the user-facing details
     * returned by `getUserFacingDetails()` to ensure complete data transparency.
     */
    async getPromptDetails() {
        const formatter = this.createFormatter();
        const details = [];
        const traceSummary = formatter.formatTraceSummary();
        if (traceSummary) {
            details.push(`Trace summary:\n${traceSummary}`);
        }
        const criticalRequests = await formatter.formatCriticalRequests();
        if (criticalRequests) {
            details.push(criticalRequests);
        }
        const mainThreadBottomUp = await formatter.formatMainThreadBottomUpSummary();
        if (mainThreadBottomUp) {
            details.push(mainThreadBottomUp);
        }
        const thirdPartySummary = await formatter.formatThirdPartySummary();
        if (thirdPartySummary) {
            details.push(thirdPartySummary);
        }
        const longestTasks = await formatter.formatLongestTasks();
        if (longestTasks) {
            details.push(longestTasks);
        }
        return details.length > 0 ? details.join('\n\n') : null;
    }
    /**
     * Returns structured trace context details to be displayed to the user in the UI
     * (under the "Analyzing data" disclosure accordion).
     *
     * Invariant: The details shown here must correspond exactly to the data sent to
     * the LLM prompt via `getPromptDetails()`.
     */
    async getUserFacingDetails() {
        const formatter = this.createFormatter();
        const details = [];
        const traceSummary = formatter.formatTraceSummary();
        if (traceSummary) {
            details.push({
                title: 'Trace summary',
                text: traceSummary,
            });
        }
        const criticalRequests = await formatter.formatCriticalRequests();
        if (criticalRequests) {
            details.push({
                title: 'Critical requests',
                text: criticalRequests,
            });
        }
        const mainThreadBottomUp = await formatter.formatMainThreadBottomUpSummary();
        if (mainThreadBottomUp) {
            details.push({
                title: 'Main thread activities',
                text: mainThreadBottomUp,
            });
        }
        const thirdPartySummary = await formatter.formatThirdPartySummary();
        if (thirdPartySummary) {
            details.push({
                title: 'Third party summary',
                text: thirdPartySummary,
            });
        }
        const longestTasks = await formatter.formatLongestTasks();
        if (longestTasks) {
            details.push({
                title: 'Longest tasks',
                text: longestTasks,
            });
        }
        return details.length > 0 ? details : null;
    }
    /**
     * Returns initial UI widgets to display with the conversation context header
     * depending on the active focus:
     * - Specific task (call tree) -> timeline summary & bottom up tree widgets
     * - Insight -> PERF_INSIGHT widget & Core Web Vitals widget
     * - Whole Trace -> Core Web Vitals widget
     */
    async getWidgets() {
        const widgets = [];
        const focus = this.#focus;
        // Case 1: Specific task (call tree) -> timeline summary & bottom up tree widgets
        if (focus.callTree) {
            const event = focus.callTree.selectedNode?.event ?? focus.callTree.rootNode.event;
            if (event) {
                const { startTime, endTime } = Trace.Helpers.Timing.eventTimingsMicroSeconds(event);
                const bounds = Trace.Helpers.Timing.traceWindowFromMicroSeconds(startTime, endTime);
                widgets.push({
                    name: 'TIMELINE_RANGE_SUMMARY',
                    data: {
                        bounds,
                        parsedTrace: focus.parsedTrace,
                        track: 'main',
                    },
                });
                widgets.push({
                    name: 'BOTTOM_UP_TREE',
                    data: {
                        bounds,
                        parsedTrace: focus.parsedTrace,
                    },
                });
            }
            return widgets;
        }
        // Case 2: Insight -> PERF_INSIGHT widget
        if (focus.insight) {
            const insightKey = focus.insight.insightKey;
            if (Trace.Insights.Common.isInsightKey(insightKey)) {
                widgets.push({
                    name: 'PERF_INSIGHT',
                    data: {
                        insight: insightKey,
                        insightData: focus.insight,
                    },
                });
            }
        }
        // Case 3: Whole Trace or insight -> CWV widget
        const primaryInsightSet = focus.primaryInsightSet;
        if (primaryInsightSet) {
            widgets.push({
                name: 'CORE_VITALS',
                data: {
                    parsedTrace: focus.parsedTrace,
                    insightSetKey: primaryInsightSet.id,
                },
            });
        }
        return widgets;
    }
    getBoundsForLabel(label) {
        const focus = this.#focus;
        const { parsedTrace } = focus;
        const insightSet = focus.primaryInsightSet;
        if (label === 'nav-to-lcp') {
            if (insightSet) {
                const lcp = Trace.Insights.Common.getLCP(insightSet);
                if (lcp) {
                    return Trace.Helpers.Timing.traceWindowFromMicroSeconds(insightSet.bounds.min, lcp.event.ts);
                }
            }
            return null;
        }
        if (label === 'lcp-ttfb') {
            if (insightSet) {
                const subparts = insightSet.model.LCPBreakdown?.subparts;
                if (subparts?.ttfb) {
                    return subparts.ttfb;
                }
            }
            return null;
        }
        if (label === 'lcp-render-delay') {
            if (insightSet) {
                const subparts = insightSet.model.LCPBreakdown?.subparts;
                if (subparts?.renderDelay) {
                    return subparts.renderDelay;
                }
            }
            return null;
        }
        if (label === 'trace-bounds') {
            return parsedTrace.data.Meta.traceBounds;
        }
        const insightSetById = parsedTrace.insights?.get(label);
        if (insightSetById) {
            return insightSetById.bounds;
        }
        if (insightSet) {
            const model = getInsightModel(insightSet.model, label);
            if (model) {
                return Trace.Insights.Common.insightBounds(model, insightSet.bounds);
            }
        }
        for (const is of parsedTrace.insights?.values() ?? []) {
            const model = getInsightModel(is.model, label);
            if (model) {
                return Trace.Insights.Common.insightBounds(model, is.bounds);
            }
        }
        return null;
    }
    getLabelName(label) {
        return getLabelName(label, this.#focus.parsedTrace);
    }
    createBounds(min, max) {
        const { min: bMin, max: bMax } = this.#focus.parsedTrace.data.Meta.traceBounds;
        const clampedMin = Math.round(Math.max(min ?? bMin, bMin));
        const clampedMax = Math.round(Math.min(max ?? bMax, bMax));
        if (clampedMin > clampedMax) {
            return null;
        }
        return Trace.Helpers.Timing.traceWindowFromMicroSeconds(clampedMin, clampedMax);
    }
}
const STATIC_LABEL_NAMES = {
    'nav-to-lcp': 'navigation to LCP',
    'lcp-ttfb': 'LCP to TTFB',
    'lcp-render-delay': 'LCP render delay',
    'trace-bounds': 'the entire trace',
    NO_NAVIGATION: 'the period before the first navigation',
};
function getInsightModel(model, key) {
    if (Object.prototype.hasOwnProperty.call(model, key)) {
        return model[key];
    }
    return undefined;
}
function getLabelName(label, parsedTrace) {
    if (Object.prototype.hasOwnProperty.call(STATIC_LABEL_NAMES, label)) {
        return STATIC_LABEL_NAMES[label];
    }
    const insightSetById = parsedTrace.insights?.get(label);
    if (insightSetById) {
        return `navigation to ${insightSetById.url.href}`;
    }
    for (const insightSet of parsedTrace.insights?.values() ?? []) {
        const model = getInsightModel(insightSet.model, label);
        if (model) {
            return `${model.title} insight`;
        }
    }
    return label;
}
//# sourceMappingURL=PerformanceTraceContext.js.map