// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../../core/sdk/sdk.js';
import * as CrUXManager from '../../crux-manager/crux-manager.js';
import * as Trace from '../../trace/trace.js';
import { AIQueries } from '../performance/AIQueries.js';
import { NetworkRequestFormatter, sanitizeHeaders } from './NetworkRequestFormatter.js';
import { PerformanceInsightFormatter } from './PerformanceInsightFormatter.js';
import { bytes, micros, millis } from './UnitFormatters.js';
/**
 * Filters response headers to the 7 standard CORS-safelisted headers for
 * opaque cross-origin requests.
 *
 * Note: `NetworkRequestFormatter` (`allowHeader` / `sanitizeHeaders`) applies
 * a second, broader allowlist to redact sensitive header values (like
 * `set-cookie`) even on same-origin requests, but that list permits headers
 * such as `location`, `link`, `content-security-policy`, and `x-forwarded-host`
 * that must not be exposed for cross-origin requests.
 */
function filterToCorsSafelistedHeaders(headers) {
    return headers.filter(header => SDK.NetworkRequestAccess.CORS_SAFELISTED_RESPONSE_HEADERS.has(header.name.toLowerCase().trim()));
}
/**
 * Evaluates whether a traced network request is same-origin with the trace's
 * main frame origin across its entire redirect chain.
 *
 * Trace events record raw network activity from the renderer (including full
 * redirect chains, final post-redirect URLs, and all response headers), even
 * for cross-origin requests where the browser's Same-Origin Policy would hide
 * those details from the page.
 *
 * Unlike live `SDK.NetworkRequest.NetworkRequest` objects evaluated via
 * `SDK.NetworkRequestAccess.evaluateResponseAccessMode`, traced network
 * requests do not record request headers/cookies (needed to determine if a
 * request is credentialed when evaluating `Access-Control-Allow-Origin: *`),
 * Fetch request mode (`cors` vs `no-cors`), `corsErrorStatus`, or intermediate
 * redirect response headers. Consequently, all cross-origin traced requests
 * are treated as opaque (restricting headers to the CORS safelist and omitting
 * redirect chains).
 */
function isSameOriginTraceRequest(request, parsedTrace) {
    const traceUrl = parsedTrace.data?.Meta?.mainFrameURL;
    const targetUrl = request.args.data.url;
    if (!traceUrl || !targetUrl) {
        return false;
    }
    const traceOrigin = SDK.SecurityOrigin.SecurityOrigin.create(traceUrl);
    if (traceOrigin.isOpaque()) {
        return false;
    }
    const redirects = request.args.data.redirects ?? [];
    for (const redirect of redirects) {
        if (!redirect.url || !traceOrigin.isSameOriginWith(SDK.SecurityOrigin.SecurityOrigin.create(redirect.url))) {
            return false;
        }
    }
    return traceOrigin.isSameOriginWith(SDK.SecurityOrigin.SecurityOrigin.create(targetUrl));
}
function filteredResponseHeaders(request, parsedTrace) {
    const headers = request.args.data.responseHeaders;
    if (!headers) {
        return headers;
    }
    if (isSameOriginTraceRequest(request, parsedTrace)) {
        return headers;
    }
    return filterToCorsSafelistedHeaders(headers);
}
function filteredRedirects(request, parsedTrace) {
    if (isSameOriginTraceRequest(request, parsedTrace)) {
        return request.args.data.redirects ?? [];
    }
    return [];
}
/**
 * Returns the URL safe to expose for a traced network request.
 *
 * `request.args.data.url` is the final post-redirect URL. For cross-origin
 * requests that redirected, the final URL (and any intermediate redirect hops)
 * is hidden from the page by the Same-Origin Policy, whereas `redirects[0].url`
 * is the initial pre-redirect URL that the page itself requested.
 */
function filteredUrl(request, parsedTrace) {
    const redirects = request.args.data.redirects ?? [];
    if (redirects.length === 0 || isSameOriginTraceRequest(request, parsedTrace)) {
        return request.args.data.url;
    }
    return redirects[0].url || '<redacted cross-origin redirect destination>';
}
export class PerformanceTraceFormatter {
    #focus;
    #parsedTrace;
    #insightSet;
    #eventsSerializer;
    #formattedFunctionCodes = new Set();
    #deviceScope;
    resolveFunctionCode;
    #cruxManager;
    constructor(focus, deviceScope = null, cruxManager) {
        this.#focus = focus;
        this.#parsedTrace = focus.parsedTrace;
        this.#insightSet = focus.primaryInsightSet;
        this.#eventsSerializer = focus.eventsSerializer;
        this.#deviceScope = deviceScope;
        if (cruxManager) {
            this.#cruxManager = cruxManager;
        }
        else {
            // In environments outside DevTools (like the MCP server or some tests),
            // CrUXManager.instance() can fail due to uninitialized global settings/storage.
            try {
                // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
                this.#cruxManager = CrUXManager.CrUXManager.instance();
            }
            catch {
                this.#cruxManager = null;
            }
        }
    }
    serializeEvent(event) {
        const key = this.#eventsSerializer.keyForEvent(event);
        return `(eventKey: ${key}, ts: ${event.ts})`;
    }
    serializeBounds(bounds) {
        return `{min: ${bounds.min}µs, max: ${bounds.max}µs}`;
    }
    /**
     * Fetching the Crux summary can error outside of DevTools, hence the
     * try-catch around it here.
     */
    #getCruxTraceSummary(insightSet) {
        if (insightSet === null) {
            return [];
        }
        try {
            let cruxScope;
            if (this.#deviceScope) {
                cruxScope = { pageScope: 'url', deviceScope: this.#deviceScope };
            }
            else if (this.#cruxManager) {
                cruxScope = this.#cruxManager.getSelectedScope();
            }
            else {
                return [];
            }
            const parts = [];
            const fieldMetrics = Trace.Insights.Common.getFieldMetricsForInsightSet(insightSet, this.#parsedTrace.metadata, cruxScope);
            const fieldLcp = fieldMetrics?.lcp;
            const fieldInp = fieldMetrics?.inp;
            const fieldCls = fieldMetrics?.cls;
            if (fieldLcp || fieldInp || fieldCls) {
                parts.push('Metrics (field / real users):');
                const serializeFieldMetricTimingResult = (fieldMetric) => {
                    return `${Math.round(fieldMetric.value / 1000)} ms (scope: ${fieldMetric.pageScope})`;
                };
                const serializeFieldMetricNumberResult = (fieldMetric) => {
                    return `${fieldMetric.value.toFixed(2)} (scope: ${fieldMetric.pageScope})`;
                };
                if (fieldLcp) {
                    parts.push(`  - LCP: ${serializeFieldMetricTimingResult(fieldLcp)}`);
                    const fieldLcpBreakdown = fieldMetrics?.lcpBreakdown;
                    if (fieldLcpBreakdown &&
                        (fieldLcpBreakdown.ttfb || fieldLcpBreakdown.loadDelay || fieldLcpBreakdown.loadDuration ||
                            fieldLcpBreakdown.renderDelay)) {
                        parts.push('  - LCP breakdown:');
                        if (fieldLcpBreakdown.ttfb) {
                            parts.push(`    - TTFB: ${serializeFieldMetricTimingResult(fieldLcpBreakdown.ttfb)}`);
                        }
                        if (fieldLcpBreakdown.loadDelay) {
                            parts.push(`    - Load delay: ${serializeFieldMetricTimingResult(fieldLcpBreakdown.loadDelay)}`);
                        }
                        if (fieldLcpBreakdown.loadDuration) {
                            parts.push(`    - Load duration: ${serializeFieldMetricTimingResult(fieldLcpBreakdown.loadDuration)}`);
                        }
                        if (fieldLcpBreakdown.renderDelay) {
                            parts.push(`    - Render delay: ${serializeFieldMetricTimingResult(fieldLcpBreakdown.renderDelay)}`);
                        }
                    }
                }
                if (fieldInp) {
                    parts.push(`  - INP: ${serializeFieldMetricTimingResult(fieldInp)}`);
                }
                if (fieldCls) {
                    parts.push(`  - CLS: ${serializeFieldMetricNumberResult(fieldCls)}`);
                }
                parts.push('  - The above data is from CrUX–Chrome User Experience Report. It\'s how the page performs for real users.');
                parts.push('  - The values shown above are the p75 measure of all real Chrome users');
                parts.push('  - The scope indicates if the data came from the entire origin, or a specific url');
                parts.push('  - Lab metrics describe how this specific page load performed, while field metrics are an aggregation ' +
                    'of results from real-world users. Best practice is to prioritize metrics that are bad in field data. ' +
                    'Lab metrics may be better or worse than fields metrics depending on the developer\'s machine, network, or the ' +
                    'actions performed while tracing.');
            }
            return parts;
        }
        catch {
            return [];
        }
    }
    formatTraceSummary() {
        const parsedTrace = this.#parsedTrace;
        const traceMetadata = this.#parsedTrace.metadata;
        const data = parsedTrace.data;
        const parts = [];
        parts.push(`URL: ${data.Meta.mainFrameURL}`);
        parts.push(`Trace bounds: ${this.serializeBounds(data.Meta.traceBounds)}`);
        parts.push('CPU throttling: ' + (traceMetadata.cpuThrottling ? `${traceMetadata.cpuThrottling}x` : 'none'));
        parts.push(`Network throttling: ${traceMetadata.networkThrottling ?? 'none'}`);
        parts.push('\n# Available insight sets\n');
        parts.push('The following is a list of insight sets. An insight set covers a specific part of the trace, split by navigations. The insights within each insight set are specific to that part of the trace. Be sure to consider the insight set id and bounds when calling functions. If no specific insight set or navigation is mentioned, assume the user is referring to the first one.');
        for (const insightSet of parsedTrace.insights?.values() ?? []) {
            const lcp = Trace.Insights.Common.getLCP(insightSet);
            const cls = Trace.Insights.Common.getCLS(insightSet);
            const inp = Trace.Insights.Common.getINP(insightSet);
            parts.push(`\n## insight set id: ${insightSet.id}\n`);
            parts.push(`URL: ${insightSet.url}`);
            parts.push(`Bounds: ${this.serializeBounds(insightSet.bounds)}`);
            if (lcp || cls || inp) {
                parts.push('Metrics (lab / observed):');
                if (lcp) {
                    const nodeId = insightSet.model.LCPBreakdown?.lcpEvent?.args.data?.nodeId;
                    const nodeIdText = nodeId !== undefined ? `, nodeId: ${nodeId}` : '';
                    parts.push(`  - LCP: ${Math.round(lcp.value / 1000)} ms, event: ${this.serializeEvent(lcp.event)}${nodeIdText}`);
                    const subparts = insightSet.model.LCPBreakdown?.subparts;
                    if (subparts) {
                        const serializeSubpart = (subpart) => {
                            return `${micros(subpart.range)}, bounds: ${this.serializeBounds(subpart)}`;
                        };
                        parts.push('  - LCP breakdown:');
                        parts.push(`    - TTFB: ${serializeSubpart(subparts.ttfb)}`);
                        if (subparts.loadDelay !== undefined) {
                            parts.push(`    - Load delay: ${serializeSubpart(subparts.loadDelay)}`);
                        }
                        if (subparts.loadDuration !== undefined) {
                            parts.push(`    - Load duration: ${serializeSubpart(subparts.loadDuration)}`);
                        }
                        parts.push(`    - Render delay: ${serializeSubpart(subparts.renderDelay)}`);
                    }
                }
                if (inp) {
                    parts.push(`  - INP: ${Math.round(inp.value / 1000)} ms, event: ${this.serializeEvent(inp.event)}`);
                }
                if (cls) {
                    const eventText = cls.worstClusterEvent ? `, event: ${this.serializeEvent(cls.worstClusterEvent)}` : '';
                    parts.push(`  - CLS: ${cls.value.toFixed(2)}${eventText}`);
                }
            }
            else {
                parts.push('Metrics (lab / observed): n/a');
            }
            const cruxParts = insightSet && this.#getCruxTraceSummary(insightSet);
            if (cruxParts?.length) {
                parts.push(...cruxParts);
            }
            else {
                parts.push('Metrics (field / real users): n/a – no data for this page in CrUX');
            }
            parts.push('Available insights:');
            for (const [insightName, model] of Object.entries(insightSet.model)) {
                if (model.state === 'pass') {
                    continue;
                }
                const formatter = new PerformanceInsightFormatter(this.#focus, model);
                if (!formatter.insightIsSupported()) {
                    continue;
                }
                const insightBounds = Trace.Insights.Common.insightBounds(model, insightSet.bounds);
                const insightParts = [
                    `insight name: ${insightName}`,
                    `description: ${model.description}`,
                    `relevant trace bounds: ${this.serializeBounds(insightBounds)}`,
                ];
                const metricSavingsText = formatter.estimatedSavings();
                if (metricSavingsText) {
                    insightParts.push(`estimated metric savings: ${metricSavingsText}`);
                }
                if (model.wastedBytes) {
                    insightParts.push(`estimated wasted bytes: ${bytes(model.wastedBytes)}`);
                }
                for (const suggestion of formatter.getSuggestions()) {
                    insightParts.push(`example question: ${suggestion.title}`);
                }
                const insightPartsText = insightParts.join('\n    ');
                parts.push(`  - ${insightPartsText}`);
            }
        }
        const extensionTrackData = parsedTrace.data.ExtensionTraceData?.extensionTrackData;
        if (extensionTrackData && extensionTrackData.length > 0) {
            parts.push('\n# Custom tracks\n');
            parts.push('The following is a list of custom tracks or track groups from the extensibility API.');
            for (const trackData of extensionTrackData) {
                if (trackData.isTrackGroup) {
                    parts.push(`\n## Group: ${trackData.name}\n`);
                    for (const trackName of Object.keys(trackData.entriesByTrack)) {
                        parts.push(`  - Track: ${trackName}`);
                    }
                }
                else {
                    parts.push(`\n## Track: ${trackData.name}\n`);
                }
            }
        }
        return parts.join('\n');
    }
    async #formatFactByInsightSet(options) {
        const { insights, title, description, empty, cb } = options;
        const lines = [`# ${title}\n`];
        if (description) {
            lines.push(`${description}\n`);
        }
        if (insights?.size) {
            const multipleInsightSets = insights.size > 1;
            for (const insightSet of insights.values()) {
                if (multipleInsightSets) {
                    lines.push(`## insight set id: ${insightSet.id}\n`);
                }
                lines.push((await cb(insightSet) ?? empty) + '\n');
            }
        }
        else {
            lines.push(empty + '\n');
        }
        return lines.join('\n');
    }
    formatCriticalRequests() {
        const parsedTrace = this.#parsedTrace;
        return this.#formatFactByInsightSet({
            insights: parsedTrace.insights,
            title: 'Critical network requests',
            empty: 'none',
            cb: async (insightSet) => {
                const criticalRequests = [];
                const walkRequest = (node) => {
                    criticalRequests.push(node.request);
                    node.children.forEach(walkRequest);
                };
                insightSet.model.NetworkDependencyTree?.rootNodes.forEach(walkRequest);
                return criticalRequests.length ? this.formatNetworkRequests(criticalRequests, { verbose: false }) : null;
            },
        });
    }
    async #serializeBottomUpRootNode(rootNode, limit) {
        // Sorted by selfTime.
        // No nodes less than 1 ms.
        // Limit.
        const topNodes = [...rootNode.children().values()]
            .filter(n => n.totalTime >= 1)
            .sort((a, b) => b.selfTime - a.selfTime)
            .slice(0, limit);
        const callFrames = [];
        function nodeToText(node) {
            const event = node.event;
            let frame;
            if (Trace.Types.Events.isProfileCall(event)) {
                frame = event.callFrame;
                if (node.selfTime >= 100 && callFrames.length < 3) {
                    callFrames.push(frame);
                }
            }
            else {
                frame = Trace.Helpers.Trace.getStackTraceTopCallFrameInEventPayload(event);
            }
            // TODO(crbug.com/452333154): this is not source mapped.
            let source = Trace.Name.forEntry(event);
            if (frame?.url) {
                source += ` (url: ${frame.url}`;
                if (frame.lineNumber !== -1) {
                    source += `, line: ${frame.lineNumber}`;
                }
                if (frame.columnNumber !== -1) {
                    source += `, column: ${frame.columnNumber}`;
                }
                source += ')';
            }
            return `- self: ${millis(node.selfTime)}, total: ${millis(node.totalTime)}, source: ${source}`;
        }
        return topNodes.map(node => nodeToText.call(this, node)).join('\n') +
            await this.#serializeRelevantFunctions(callFrames);
    }
    #getSerializeBottomUpRootNodeFormat(limit) {
        return `This is the bottom-up summary for the entire trace. Only the top ${limit} activities (sorted by self time) are shown. An activity is all the aggregated time spent on the same type of work. For example, it can be all the time spent in a specific JavaScript function, or all the time spent in a specific browser rendering stage (like layout, v8 compile, parsing html). "Self time" represents the aggregated time spent directly in an activity, across all occurrences. "Total time" represents the aggregated time spent in an activity or any of its children.`;
    }
    formatMainThreadBottomUpSummary() {
        const parsedTrace = this.#parsedTrace;
        const limit = 10;
        return this.#formatFactByInsightSet({
            insights: parsedTrace.insights,
            title: 'Main thread bottom-up summary',
            description: this.#getSerializeBottomUpRootNodeFormat(limit),
            empty: 'no activity',
            cb: async (insightSet) => {
                const navigationId = Trace.Helpers.Trace.navigationIDForEvent(insightSet.navigation);
                const rootNode = AIQueries.mainThreadActivityBottomUpSingleNavigation(navigationId, insightSet.bounds, parsedTrace);
                return rootNode ? await this.#serializeBottomUpRootNode(rootNode, limit) : null;
            },
        });
    }
    #formatThirdPartyEntitySummaries(summaries) {
        const topMainThreadTimeEntries = summaries.toSorted((a, b) => b.mainThreadTime - a.mainThreadTime).slice(0, 5);
        if (!topMainThreadTimeEntries.length) {
            return '';
        }
        const listText = topMainThreadTimeEntries
            .map(s => {
            const transferSize = `${bytes(s.transferSize)}`;
            return `- name: ${s.entity.name}, main thread time: ${millis(s.mainThreadTime)}, network transfer size: ${transferSize}`;
        })
            .join('\n');
        return listText;
    }
    formatThirdPartySummary() {
        const parsedTrace = this.#parsedTrace;
        return this.#formatFactByInsightSet({
            insights: parsedTrace.insights,
            title: '3rd party summary',
            empty: 'no 3rd parties',
            cb: async (insightSet) => {
                const thirdPartySummaries = Trace.Extras.ThirdParties.summarizeByThirdParty(parsedTrace.data, insightSet.bounds);
                return thirdPartySummaries.length ? this.#formatThirdPartyEntitySummaries(thirdPartySummaries) : null;
            },
        });
    }
    formatLongestTasks() {
        const parsedTrace = this.#parsedTrace;
        return this.#formatFactByInsightSet({
            insights: parsedTrace.insights,
            title: 'Longest tasks',
            empty: 'none',
            cb: async (insightSet) => {
                const navigationId = Trace.Helpers.Trace.navigationIDForEvent(insightSet.navigation);
                const longestTaskTrees = AIQueries.longestTasks(navigationId, insightSet.bounds, parsedTrace, 3);
                if (!longestTaskTrees?.length) {
                    return null;
                }
                return longestTaskTrees
                    .map(tree => {
                    const time = millis(tree.rootNode.totalTime);
                    return `- total time: ${time}, event: ${this.serializeEvent(tree.rootNode.event)}`;
                })
                    .join('\n');
            },
        });
    }
    #serializeRelatedInsightsForEvents(events) {
        if (!events.length) {
            return '';
        }
        const insightNameToRelatedEvents = new Map();
        if (this.#insightSet) {
            for (const model of Object.values(this.#insightSet.model)) {
                if (!model.relatedEvents) {
                    continue;
                }
                const modeRelatedEvents = Array.isArray(model.relatedEvents) ? model.relatedEvents : [...model.relatedEvents.keys()];
                if (!modeRelatedEvents.length) {
                    continue;
                }
                const relatedEvents = modeRelatedEvents.filter(e => events.includes(e));
                if (relatedEvents.length) {
                    insightNameToRelatedEvents.set(model.insightKey, relatedEvents);
                }
            }
        }
        if (!insightNameToRelatedEvents.size) {
            return '';
        }
        const results = [];
        for (const [insightKey, events] of insightNameToRelatedEvents) {
            // Limit to 5, because some insights (namely ThirdParties) can have a huge
            // number of related events. Mostly, insights probably don't have more than
            // 5.
            const eventsString = events.slice(0, 5).map(e => this.#safeNameForEntry(e) + ' ' + this.serializeEvent(e)).join(', ');
            results.push(`- ${insightKey}: ${eventsString}`);
        }
        return results.join('\n');
    }
    /**
     * Returns the display name for a trace event, replacing the final
     * post-redirect URL on cross-origin network requests with the initial
     * pre-redirect URL (`filteredUrl`) before delegating to `Trace.Name.forEntry`.
     */
    #safeNameForEntry(event) {
        if (Trace.Types.Events.isSyntheticNetworkRequest(event)) {
            const safeUrl = filteredUrl(event, this.#parsedTrace);
            if (safeUrl !== event.args.data.url) {
                const syntheticEvent = {
                    ...event,
                    args: {
                        ...event.args,
                        data: {
                            ...event.args.data,
                            url: safeUrl,
                        },
                    },
                };
                return Trace.Name.forEntry(syntheticEvent);
            }
        }
        return Trace.Name.forEntry(event);
    }
    async formatMainThreadTrackSummary(bounds) {
        if (!this.#parsedTrace.insights) {
            return 'No main thread activity found';
        }
        const results = [];
        const insightSet = this.#parsedTrace.insights?.values().find(insightSet => Trace.Helpers.Timing.boundsIncludeTimeRange({ bounds, timeRange: insightSet.bounds }));
        const navigationId = Trace.Helpers.Trace.navigationIDForEvent(insightSet?.navigation);
        const topDownTree = AIQueries.mainThreadActivityTopDown(navigationId, bounds, this.#parsedTrace);
        if (topDownTree) {
            results.push('# Top-down main thread summary');
            results.push(await this.formatCallTree(topDownTree, 2 /* headerLevel */));
        }
        const bottomUpRootNode = AIQueries.mainThreadActivityBottomUp(bounds, this.#parsedTrace);
        if (bottomUpRootNode) {
            results.push('# Bottom-up main thread summary');
            const limit = 20;
            results.push(this.#getSerializeBottomUpRootNodeFormat(limit));
            results.push(await this.#serializeBottomUpRootNode(bottomUpRootNode, limit));
        }
        const thirdPartySummaries = Trace.Extras.ThirdParties.summarizeByThirdParty(this.#parsedTrace.data, bounds);
        if (thirdPartySummaries.length) {
            results.push('# Third parties');
            results.push(this.#formatThirdPartyEntitySummaries(thirdPartySummaries));
        }
        const relatedInsightsText = this.#serializeRelatedInsightsForEvents([...topDownTree?.rootNode.events ?? [], ...bottomUpRootNode?.events ?? []]);
        if (relatedInsightsText) {
            results.push('# Related insights');
            results.push('Here are all the insights that contain some related event from the main thread in the given range.');
            results.push(relatedInsightsText);
        }
        if (!results.length) {
            return 'No main thread activity found';
        }
        return results.join('\n\n');
    }
    formatNetworkTrackSummary(bounds) {
        const results = [];
        const requests = this.#parsedTrace.data.NetworkRequests.byTime.filter(request => Trace.Helpers.Timing.eventIsInBounds(request, bounds));
        const requestsText = this.formatNetworkRequests(requests, { verbose: false });
        results.push('# Network requests summary');
        results.push(requestsText || 'No requests in the given bounds');
        const relatedInsightsText = this.#serializeRelatedInsightsForEvents(requests);
        if (relatedInsightsText) {
            results.push('# Related insights');
            results.push('Here are all the insights that contain some related request from the given range.');
            results.push(relatedInsightsText);
        }
        return results.join('\n\n');
    }
    formatExtensionTrackSummary(bounds) {
        const extensionTrackData = this.#parsedTrace.data.ExtensionTraceData?.extensionTrackData;
        if (!extensionTrackData || extensionTrackData.length === 0) {
            return 'No custom track activity found';
        }
        const results = [];
        for (const trackData of extensionTrackData) {
            const trackLines = [];
            const header = trackData.isTrackGroup ? `# Track Group: ${trackData.name}` : `# Track: ${trackData.name}`;
            trackLines.push(header);
            let hasEntriesInBounds = false;
            for (const trackName of Object.keys(trackData.entriesByTrack)) {
                const entries = trackData.entriesByTrack[trackName];
                const filteredEntries = entries.filter(entry => Trace.Helpers.Timing.eventIsInBounds(entry, bounds));
                if (filteredEntries.length === 0) {
                    continue;
                }
                hasEntriesInBounds = true;
                if (trackData.isTrackGroup) {
                    trackLines.push(`## Track: ${trackName}`);
                }
                for (const entry of filteredEntries) {
                    const entryKey = this.serializeEvent(entry);
                    const parts = [
                        `Name: ${entry.name}`,
                        `eventKey: ${entryKey}`,
                        `duration: ${micros(entry.dur ?? Trace.Types.Timing.Micro(0))}`,
                    ];
                    if (entry.devtoolsObj.properties) {
                        const props = entry.devtoolsObj.properties.map(prop => `${prop[0]}: ${JSON.stringify(prop[1])}`).join(', ');
                        parts.push(`properties: {${props}}`);
                    }
                    trackLines.push(`- ${parts.join(', ')}`);
                }
            }
            if (hasEntriesInBounds) {
                results.push(trackLines.join('\n'));
            }
        }
        if (results.length === 0) {
            return 'No custom track activity found in the given bounds';
        }
        return results.join('\n\n');
    }
    async formatCallTree(tree, headerLevel = 1) {
        let result = `${tree.serialize(headerLevel)}\n\nIMPORTANT: Never show eventKey to the user.\n`;
        const relevantCallFrames = [];
        if (tree.selectedNode && Trace.Types.Events.isProfileCall(tree.selectedNode.event)) {
            relevantCallFrames.push(tree.selectedNode.event.callFrame);
        }
        const topCallFrameByTotalTime = tree.topCallFrameByTotalTime();
        if (topCallFrameByTotalTime) {
            relevantCallFrames.push(topCallFrameByTotalTime);
        }
        relevantCallFrames.push(...tree.topCallFramesBySelfTime(3));
        result += await this.#serializeRelevantFunctions(relevantCallFrames);
        return result;
    }
    formatRequestUrl(request) {
        return filteredUrl(request, this.#parsedTrace);
    }
    formatNetworkRequests(requests, options) {
        if (requests.length === 0) {
            return '';
        }
        let verbose;
        if (options?.verbose !== undefined) {
            verbose = options.verbose;
        }
        else {
            verbose = requests.length === 1;
        }
        // Use verbose format for a single network request. With the compressed format, a format description
        // needs to be provided, which is not worth sending if only one network request is being stringified.
        if (verbose) {
            return requests.map(request => this.#networkRequestVerbosely(request, options)).join('\n');
        }
        return this.#networkRequestsArrayCompressed(requests);
    }
    #getOrAssignUrlIndex(urlIdToIndex, url) {
        let index = urlIdToIndex.get(url);
        if (index !== undefined) {
            return index;
        }
        index = urlIdToIndex.size;
        urlIdToIndex.set(url, index);
        return index;
    }
    #getInitiatorChain(parsedTrace, request) {
        const initiators = [];
        let cur = request;
        while (cur) {
            const initiator = Trace.Extras.Initiators.getNetworkInitiator(parsedTrace.data, cur);
            if (initiator) {
                // Should never happen, but if it did that would be an infinite loop.
                if (initiators.includes(initiator)) {
                    return [];
                }
                initiators.unshift(initiator);
            }
            cur = initiator;
        }
        return initiators;
    }
    /**
     * This is the data passed to a network request when the Performance Insights
     * agent is asking for information. It is a slimmed down version of the
     * request's data to avoid using up too much of the context window.
     * IMPORTANT: these set of fields have been reviewed by Chrome Privacy &
     * Security; be careful about adding new data here. If you are in doubt please
     * talk to jacktfranklin@.
     */
    #networkRequestVerbosely(request, options) {
        const { statusCode, initialPriority, priority, fromServiceWorker, mimeType, syntheticData, protocol, } = request.args.data;
        const parsedTrace = this.#parsedTrace;
        const url = filteredUrl(request, parsedTrace);
        const responseHeaders = filteredResponseHeaders(request, parsedTrace);
        const titlePrefix = `## ${options?.customTitle ?? 'Network request'}`;
        const navigationForEvent = Trace.Helpers.Trace.getNavigationForTraceEvent(request, request.args.data.frame, parsedTrace.data.Meta.navigationsByFrameId);
        const baseTime = navigationForEvent?.ts ?? parsedTrace.data.Meta.traceBounds.min;
        // Gets all the timings for this request, relative to the base time.
        // Note that this is the start time, not total time. E.g. "queuedAt: X"
        // means that the request was queued at Xms, not that it queued for Xms.
        const startTimesForLifecycle = {
            queuedAt: request.ts - baseTime,
            requestSentAt: syntheticData.sendStartTime - baseTime,
            downloadCompletedAt: syntheticData.finishTime - baseTime,
            processingCompletedAt: request.ts + request.dur - baseTime,
        };
        const mainThreadProcessingDuration = startTimesForLifecycle.processingCompletedAt - startTimesForLifecycle.downloadCompletedAt;
        const downloadTime = syntheticData.finishTime - syntheticData.downloadStart;
        const renderBlocking = Trace.Helpers.Network.isSyntheticNetworkRequestEventRenderBlocking(request);
        const initiator = Trace.Extras.Initiators.getNetworkInitiator(parsedTrace.data, request);
        const priorityLines = [];
        if (initialPriority === priority) {
            priorityLines.push(`Priority: ${priority}`);
        }
        else {
            priorityLines.push(`Initial priority: ${initialPriority}`);
            priorityLines.push(`Final priority: ${priority}`);
        }
        const redirects = filteredRedirects(request, parsedTrace).map((redirect, index) => {
            const startTime = redirect.ts - baseTime;
            return `#### Redirect ${index + 1}: ${redirect.url}
- Start time: ${micros(startTime)}
- Duration: ${micros(redirect.dur)}`;
        });
        const initiators = this.#getInitiatorChain(parsedTrace, request);
        const initiatorUrls = initiators.map(initiator => filteredUrl(initiator, parsedTrace));
        const eventKey = this.#eventsSerializer.keyForEvent(request);
        const eventKeyLine = eventKey ? `eventKey: ${eventKey}\n` : '';
        return `${titlePrefix}: ${url}
${eventKeyLine}Timings:
- Queued at: ${micros(startTimesForLifecycle.queuedAt)}
- Request sent at: ${micros(startTimesForLifecycle.requestSentAt)}
- Download complete at: ${micros(startTimesForLifecycle.downloadCompletedAt)}
- Main thread processing completed at: ${micros(startTimesForLifecycle.processingCompletedAt)}
Durations:
- Download time: ${micros(downloadTime)}
- Main thread processing time: ${micros(mainThreadProcessingDuration)}
- Total duration: ${micros(request.dur)}${initiator ? `\nInitiator: ${filteredUrl(initiator, parsedTrace)}` : ''}
Redirects:${redirects.length ? '\n' + redirects.join('\n') : ' no redirects'}
Status code: ${statusCode}
MIME Type: ${mimeType}
Protocol: ${protocol}
${priorityLines.join('\n')}
Render-blocking: ${renderBlocking ? 'Yes' : 'No'}
From a service worker: ${fromServiceWorker ? 'Yes' : 'No'}
Initiators (root request to the request that directly loaded this one): ${initiatorUrls.join(', ') || 'none'}
${NetworkRequestFormatter.formatHeaders('Response headers', responseHeaders ?? [], true)}`;
    }
    // A compact network requests format designed to save tokens when sending multiple network requests to the model.
    // It creates a map that maps request URLs to IDs and references the IDs in the compressed format.
    //
    // Important: Do not use this method for stringifying a single network request. With this format, a format description
    // needs to be provided, which is not worth sending if only one network request is being stringified.
    // For a single request, use `formatRequestVerbosely`, which formats with all fields specified and does not require a
    // format description.
    #networkRequestsArrayCompressed(requests) {
        const networkDataString = `
Network requests data:

`;
        const urlIdToIndex = new Map();
        const allRequestsText = requests
            .map(request => {
            const urlIndex = this.#getOrAssignUrlIndex(urlIdToIndex, filteredUrl(request, this.#parsedTrace));
            return this.#networkRequestCompressedFormat(urlIndex, request, urlIdToIndex);
        })
            .join('\n');
        const urlsMapString = 'allUrls = ' +
            `[${Array.from(urlIdToIndex.entries())
                .map(([url, index]) => {
                return `${index}: ${url}`;
            })
                .join(', ')}]`;
        return networkDataString + '\n\n' + urlsMapString + '\n\n' + allRequestsText;
    }
    static callFrameDataFormatDescription = `Each call frame is presented in the following format:

'id;eventKey;name;duration;selfTime;urlIndex;childRange;[line];[column];[S]'

Key definitions:

* id: A unique numerical identifier for the call frame. Never mention this id in the output to the user.
* eventKey: String that uniquely identifies this event in the flame chart.
* name: A concise string describing the call frame (e.g., 'Evaluate Script', 'render', 'fetchData').
* duration: The total execution time of the call frame, including its children.
* selfTime: The time spent directly within the call frame, excluding its children's execution.
* urlIndex: Index referencing the "All URLs" list. Empty if no specific script URL is associated.
* childRange: Specifies the direct children of this node using their IDs. If empty ('' or 'S' at the end), the node has no children. If a single number (e.g., '4'), the node has one child with that ID. If in the format 'firstId-lastId' (e.g., '4-5'), it indicates a consecutive range of child IDs from 'firstId' to 'lastId', inclusive.
* line: An optional field for a call frame's line number. This is where the function is defined.
* column: An optional field for a call frame's column number. This is where the function is defined.
* S: _Optional_. The letter 'S' terminates the line if that call frame was selected by the user.

Example Call Tree:

1;r-123;main;500;100;0;1;;
2;r-124;update;200;50;;3;0;1;
3;p-49575-15428179-2834-374;animate;150;20;0;4-5;0;1;S
4;p-49575-15428179-3505-1162;calculatePosition;80;80;0;1;;
5;p-49575-15428179-5391-2767;applyStyles;50;50;0;1;;
`;
    /**
     * Network requests format description that is sent to the model as a fact.
     */
    static networkDataFormatDescription = `Network requests are formatted like this:
\`urlIndex;eventKey;queuedTime;requestSentTime;downloadCompleteTime;processingCompleteTime;totalDuration;downloadDuration;mainThreadProcessingDuration;statusCode;mimeType;priority;initialPriority;finalPriority;renderBlocking;protocol;fromServiceWorker;initiators;redirects:[[redirectUrlIndex|startTime|duration]];responseHeaders:[header1Value|header2Value|...]\`

- \`urlIndex\`: Numerical index for the request's URL, referencing the "All URLs" list.
- \`eventKey\`: String that uniquely identifies this request's trace event.
Timings (all in milliseconds, relative to navigation start):
- \`queuedTime\`: When the request was queued.
- \`requestSentTime\`: When the request was sent.
- \`downloadCompleteTime\`: When the download completed.
- \`processingCompleteTime\`: When main thread processing finished.
Durations (all in milliseconds):
- \`totalDuration\`: Total time from the request being queued until its main thread processing completed.
- \`downloadDuration\`: Time spent actively downloading the resource.
- \`mainThreadProcessingDuration\`: Time spent on the main thread after the download completed.
- \`statusCode\`: The HTTP status code of the response (e.g., 200, 404).
- \`mimeType\`: The MIME type of the resource (e.g., "text/html", "application/javascript").
- \`priority\`: The final network request priority (e.g., "VeryHigh", "Low").
- \`initialPriority\`: The initial network request priority.
- \`finalPriority\`: The final network request priority (redundant if \`priority\` is always final, but kept for clarity if \`initialPriority\` and \`priority\` differ).
- \`renderBlocking\`: 't' if the request was render-blocking, 'f' otherwise.
- \`protocol\`: The network protocol used (e.g., "h2", "http/1.1").
- \`fromServiceWorker\`: 't' if the request was served from a service worker, 'f' otherwise.
- \`initiators\`: A list (separated by ,) of URL indices for the initiator chain of this request. Listed in order starting from the root request to the request that directly loaded this one. This represents the network dependencies necessary to load this request. If there is no initiator, this is empty.
- \`redirects\`: A comma-separated list of redirects, enclosed in square brackets. Each redirect is formatted as
\`[redirectUrlIndex|startTime|duration]\`, where: \`redirectUrlIndex\`: Numerical index for the redirect's URL. \`startTime\`: The start time of the redirect in milliseconds, relative to navigation start. \`duration\`: The duration of the redirect in milliseconds.
- \`responseHeaders\`: A list (separated by '|') of values for specific, pre-defined response headers, enclosed in square brackets.
The order of headers corresponds to an internal fixed list. If a header is not present, its value will be empty.
`;
    /**
     * This is the network request data passed to the Performance agent.
     *
     * The `urlIdToIndex` Map is used to map URLs to numerical indices in order to not need to pass whole url every time it's mentioned.
     * The map content is passed in the response together will all the requests data.
     *
     * See `networkDataFormatDescription` above for specifics.
     */
    #networkRequestCompressedFormat(urlIndex, request, urlIdToIndex) {
        const { statusCode, initialPriority, priority, fromServiceWorker, mimeType, syntheticData, protocol, } = request.args.data;
        const parsedTrace = this.#parsedTrace;
        const responseHeaders = filteredResponseHeaders(request, parsedTrace);
        const navigationForEvent = Trace.Helpers.Trace.getNavigationForTraceEvent(request, request.args.data.frame, parsedTrace.data.Meta.navigationsByFrameId);
        const baseTime = navigationForEvent?.ts ?? parsedTrace.data.Meta.traceBounds.min;
        const queuedTime = micros(request.ts - baseTime);
        const requestSentTime = micros(syntheticData.sendStartTime - baseTime);
        const downloadCompleteTime = micros(syntheticData.finishTime - baseTime);
        const processingCompleteTime = micros(request.ts + request.dur - baseTime);
        const totalDuration = micros(request.dur);
        const downloadDuration = micros(syntheticData.finishTime - syntheticData.downloadStart);
        const mainThreadProcessingDuration = micros(request.ts + request.dur - syntheticData.finishTime);
        const renderBlocking = Trace.Helpers.Network.isSyntheticNetworkRequestEventRenderBlocking(request) ? 't' : 'f';
        const finalPriority = priority;
        const headerValues = responseHeaders
            ?.map(header => {
            const value = NetworkRequestFormatter.allowHeader(header.name) ? header.value : '<redacted>';
            return `${header.name}: ${value}`;
        })
            .join('|');
        const redirects = filteredRedirects(request, parsedTrace)
            .map(redirect => {
            const urlIndex = this.#getOrAssignUrlIndex(urlIdToIndex, redirect.url);
            const redirectStartTime = micros(redirect.ts - baseTime);
            const redirectDuration = micros(redirect.dur);
            return `[${urlIndex}|${redirectStartTime}|${redirectDuration}]`;
        })
            .join(',');
        const initiators = this.#getInitiatorChain(parsedTrace, request);
        const initiatorUrlIndices = initiators.map(initiator => this.#getOrAssignUrlIndex(urlIdToIndex, filteredUrl(initiator, parsedTrace)));
        const parts = [
            urlIndex,
            this.#eventsSerializer.keyForEvent(request) ?? '',
            queuedTime,
            requestSentTime,
            downloadCompleteTime,
            processingCompleteTime,
            totalDuration,
            downloadDuration,
            mainThreadProcessingDuration,
            statusCode,
            mimeType,
            priority,
            initialPriority,
            finalPriority,
            renderBlocking,
            protocol,
            fromServiceWorker ? 't' : 'f',
            initiatorUrlIndices.join(','),
            `[${redirects}]`,
            `[${headerValues ?? ''}]`,
        ];
        return parts.join(';');
    }
    resolveFunctionCodeAtLocation(url, line, column) {
        if (!this.resolveFunctionCode) {
            throw new Error('missing resolveFunctionCode');
        }
        return this.resolveFunctionCode(url, line, column);
    }
    formatFunctionCode(code) {
        return this.#getFormattedFunctionCodeExplainer() + '\n\n' + this.#formatFunctionCode(code);
    }
    #getFormattedFunctionCodeExplainer() {
        return 'The following are markdown block(s) of code that ran in the page, each representing a separate function. <FUNCTION_START> and <FUNCTION_END> marks the exact function declaration, and everything outside that is provided for additional context. Comments at the end of each line indicate the runtime performance cost of that code. Do not show the user the function markers or the additional context.';
    }
    #functionCodeToKey(code) {
        return code.functionBounds.uiSourceCode.url() + ':' + code.functionBounds.range.toString();
    }
    #hasFormattedFunctionCode(code) {
        return this.#formattedFunctionCodes.has(this.#functionCodeToKey(code));
    }
    #formatFunctionCode(code) {
        this.#formattedFunctionCodes.add(this.#functionCodeToKey(code));
        const { startLine, startColumn } = code.range;
        const { startLine: contextStartLine, startColumn: contextStartColumn, endLine: contextEndLine, endColumn: contextEndColumn, } = code.rangeWithContext;
        const name = code.functionBounds.name || '(anonymous)';
        const url = code.functionBounds.uiSourceCode.url();
        const parts = [];
        parts.push(`${name} @ ${url}:${startLine}:${startColumn}. With added context, chunk is from ${contextStartLine}:${contextStartColumn} to ${contextEndLine}:${contextEndColumn}`);
        parts.push('```');
        parts.push(code.codeWithContext);
        parts.push('```');
        return parts.join('\n');
    }
    /**
     * Formats only the first line of the function code to save space in summaries.
     * The agent can use this information (url, line, column) to get the whole function source.
     */
    #formatFunctionCodeSummary(code) {
        this.#formattedFunctionCodes.add(this.#functionCodeToKey(code));
        const { startLine, startColumn } = code.range;
        const name = code.functionBounds.name || '(anonymous)';
        const url = code.functionBounds.uiSourceCode.url();
        const lines = code.code.split('\n');
        const firstLine = lines[0] || '';
        const parts = [];
        parts.push(`${name} @ ${url}:${startLine}:${startColumn}`);
        parts.push('```');
        parts.push(firstLine);
        parts.push('```');
        return parts.join('\n');
    }
    /**
     * Appends the code of each call frame's function, but only if the function was not
     * serialized previously.
     */
    async #serializeRelevantFunctions(callFrames) {
        const resolveFunctionCode = this.resolveFunctionCode;
        if (!resolveFunctionCode) {
            return '';
        }
        const functionCodeStrings = [];
        const functionCodes = await Promise.all(callFrames.map(frame => resolveFunctionCode(frame.url, frame.lineNumber, frame.columnNumber)));
        for (const code of functionCodes) {
            if (code && !this.#hasFormattedFunctionCode(code)) {
                functionCodeStrings.push(this.#formatFunctionCodeSummary(code));
            }
        }
        if (!functionCodeStrings.length) {
            return '';
        }
        return '\n' + [
            this.#getFormattedFunctionCodeExplainer(),
            functionCodeStrings.length > 1 ? `Here is the first line of ${functionCodeStrings.length} relevant functions:` :
                `Here is the first line of a relevant function:`,
            ...functionCodeStrings,
        ].join('\n\n');
    }
}
function sanitizeSyntheticNetworkRequestEvent(event, parsedTrace) {
    const safeUrl = filteredUrl(event, parsedTrace);
    const headers = filteredResponseHeaders(event, parsedTrace);
    const sanitizedEvent = {
        ...event,
        args: {
            ...event.args,
            data: {
                ...event.args.data,
                url: safeUrl,
                redirects: filteredRedirects(event, parsedTrace),
                responseHeaders: headers ? sanitizeHeaders(headers) : null,
            },
        },
    };
    if (event.rawSourceEvent?.args?.data) {
        sanitizedEvent.rawSourceEvent = {
            ...event.rawSourceEvent,
            args: {
                ...event.rawSourceEvent.args,
                data: {
                    ...event.rawSourceEvent.args.data,
                    url: safeUrl,
                },
            },
        };
    }
    return sanitizedEvent;
}
/**
 * Serializes a trace event to a JSON string for AI consumption,
 * ensuring sensitive data (like headers and raw script source code)
 * is sanitized or redacted.
 */
export function formatEventForAI(event, parsedTrace) {
    if (Trace.Types.Events.isSyntheticNetworkRequest(event)) {
        return JSON.stringify(sanitizeSyntheticNetworkRequestEvent(event, parsedTrace));
    }
    if (Trace.Types.Events.isResourceSendRequest(event)) {
        const syntheticRequest = parsedTrace.data?.NetworkRequests?.byTime?.find(r => r.args.data.requestId === event.args.data.requestId);
        let safeUrl = '<redacted cross-origin redirect destination>';
        if (syntheticRequest) {
            safeUrl = isSameOriginTraceRequest(syntheticRequest, parsedTrace) ? event.args.data.url :
                filteredUrl(syntheticRequest, parsedTrace);
        }
        else {
            const traceUrl = parsedTrace.data?.Meta?.mainFrameURL;
            const traceOrigin = traceUrl ? SDK.SecurityOrigin.SecurityOrigin.create(traceUrl) : null;
            if (traceOrigin && !traceOrigin.isOpaque() &&
                traceOrigin.isSameOriginWith(SDK.SecurityOrigin.SecurityOrigin.create(event.args.data.url))) {
                safeUrl = event.args.data.url;
            }
        }
        return JSON.stringify({
            ...event,
            args: {
                ...event.args,
                data: {
                    ...event.args.data,
                    url: safeUrl,
                },
            },
        });
    }
    if (Trace.Types.Events.isResourceReceiveResponse(event)) {
        const syntheticRequest = parsedTrace.data?.NetworkRequests?.byTime?.find(r => r.args.data.requestId === event.args.data.requestId);
        const isSameOrigin = Boolean(syntheticRequest && isSameOriginTraceRequest(syntheticRequest, parsedTrace));
        const filteredHeaders = event.args.data.headers ?
            (isSameOrigin ? event.args.data.headers : filterToCorsSafelistedHeaders(event.args.data.headers)) :
            undefined;
        return JSON.stringify({
            ...event,
            args: {
                ...event.args,
                data: {
                    ...event.args.data,
                    headers: filteredHeaders ? sanitizeHeaders(filteredHeaders) : undefined,
                },
            },
        });
    }
    if (Trace.Types.Events.isRundownScriptSource(event)) {
        // Redact sensitive cross-origin script source text.
        const safeData = {
            isolate: event.args.data.isolate,
            scriptId: event.args.data.scriptId,
            length: event.args.data.length,
        };
        return JSON.stringify({
            ...event,
            args: {
                ...event.args,
                data: safeData,
            },
        });
    }
    if (Trace.Types.Events.isRundownScriptSourceLarge(event)) {
        // Redact sensitive cross-origin script source text.
        const safeData = {
            isolate: event.args.data.isolate,
            scriptId: event.args.data.scriptId,
            splitIndex: event.args.data.splitIndex,
            splitCount: event.args.data.splitCount,
        };
        return JSON.stringify({
            ...event,
            args: {
                ...event.args,
                data: safeData,
            },
        });
    }
    if (Trace.Types.Events.isScreenshot(event) || Trace.Types.Events.isLegacyScreenshot(event)) {
        return JSON.stringify({
            ...event,
            args: {
                ...event.args,
                snapshot: '<redacted base64 image data>',
            },
        });
    }
    if (Trace.Types.Events.isLegacySyntheticScreenshot(event)) {
        return JSON.stringify({
            ...event,
            args: {
                ...event.args,
                dataUri: '<redacted base64 image data>',
            },
        });
    }
    return JSON.stringify(event);
}
//# sourceMappingURL=PerformanceTraceFormatter.js.map