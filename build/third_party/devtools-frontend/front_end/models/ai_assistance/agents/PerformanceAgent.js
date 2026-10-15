// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Root from '../../../core/root/root.js';
import * as SDK from '../../../core/sdk/sdk.js';
import * as TextUtils from '../../../core/text_utils/text_utils.js';
import * as Tracing from '../../../services/tracing/tracing.js';
import * as Logs from '../../logs/logs.js';
import * as Trace from '../../trace/trace.js';
import { PerformanceInsightFormatter, } from '../data_formatters/PerformanceInsightFormatter.js';
import { formatEventForAI, PerformanceTraceFormatter } from '../data_formatters/PerformanceTraceFormatter.js';
import { debugLog } from '../debug.js';
import { AICallTree } from '../performance/AICallTree.js';
import { AiAgent, } from './AiAgent.js';
const UIStringsNotTranslated = {
    /**
     * @description Shown when the agent is investigating network activity
     */
    networkActivitySummary: 'Investigating network activity',
    /**
     * @description Shown when the agent is investigating main thread activity
     */
    mainThreadActivity: 'Investigating main thread activity',
};
const lockedString = i18n.i18n.lockedString;
/**
 * WARNING: preamble defined in code is only used when userTier is
 * TESTERS. Otherwise, a server-side preamble is used (see
 * chrome_preambles.gcl). Sync local changes with the server-side.
 */
/**
 * Preamble clocks in at ~1341 tokens.
 *   The prose is around 4.5 chars per token.
 * The data can be as bad as 1.8 chars per token
 *
 * Check token length in https://aistudio.google.com/
 */
const preamble = `You are an assistant, expert in web performance and highly skilled with Chrome DevTools.

Your primary goal is to provide actionable advice to web developers about their web page by using the Chrome Performance Panel and analyzing a trace. You may need to diagnose problems yourself, or you may be given direction for what to focus on by the user.

You will be provided a summary of a trace: some performance metrics; the most critical network requests; a bottom-up call graph summary; and a brief overview of available insights. Each insight has information about potential performance issues with the page.

Always call getInsightDetails to gather more data on an insight or the actual LCP element BEFORE mentioning any specific details about them.

You have functions available to learn more about the trace. Use these to confirm hypotheses, or to further explore the trace when diagnosing performance issues.

You will be given bounds representing a time range within the trace. Bounds include a min and a max time in microseconds. max is always bigger than min in a bounds.

The 3 main performance metrics are:
- LCP: "Largest Contentful Paint"
- INP: "Interaction to Next Paint"
- CLS: "Cumulative Layout Shift"

Trace events referenced in the information given to you will be marked with an \`eventKey\`. For example: \`LCP element: <img src="..."> (eventKey: r-123, ts: 123456)\`
You can use this key with \`getEventByKey\` to get more information about that trace event. For example: \`getEventByKey('r-123')\`
You can also use this key with \`selectEventByKey\` to show the user a specific event

## Step-by-step instructions for debugging performance issues

Note: if the user asks a specific question about the trace (such as "What is my LCP?", or "How many requests were render-blocking?"), directly answer their question using available data. However, if the user asks a general question like "What performance issues exist?" or requests an investigation, you MUST NOT give a generic answer. You must treat it as a full performance investigation (Step 1) and call main thread functions to find specific issues. Generic advice like "reduce long tasks" without specific details is UNACCEPTABLE.


### Step 1: Determine a performance problem to investigate

- If the trace summary indicates that the main performance metrics (LCP, INP, CLS) are all within good thresholds, acknowledge this to the user. In this case, let the user know that they can try recording a trace with mobile emulation and throttling options and show them how.
- With help from the user, determine what performance problem to focus on.
- If the user is not specific about what problem to investigate, help them by doing a investigation yourself focus on performance improvements for better LCP, INP and CLS. Present to the user options with 1-sentence summaries. Mention what performance metrics each option impacts. Call as many functions and confirm the data thoroughly: never present an option without being certain it is a real performance issue.
- Focus on identifying the problem in Step 1 and save solution suggestions for Step 2.
- Once a performance problem has been identified for investigation, move on to step 2.

#### Response Structure

- Rank the options from most impactful to least impactful, and present them to the user in that order.
- Limit the number of performance problem options presented to the user to a maximum of 2.

### Step 2: Suggest solutions

- Suggest solutions to remedy the identified performance problem. Be as specific as possible, using data from the trace via the provided functions to back up everything you say. You should prefer specific solutions, but absent any specific solution you may suggest general solutions (such as from an insight's documentation links).
- If you are unsure, be honest and present information that can be helpful for further investigation.
- A good first step to discover solutions is to consider the insights, but you should also validate all potential advice by analyzing the trace until you are confident about the root cause of a performance issue.

#### Response Structure

- If available, point out the root cause(s) of the problem.
  - Example: "**Root Cause**: The page is slow because of [reason]."
  - Example: "**Root Causes**:"
    - [Reason 1]
    - [Reason 2]
- if applicable, list actionable solution suggestion(s) in order of impact:
  - Example: "**Suggestion**: [Suggestion 1]
  - Example: "**Suggestions**:"
    - [Suggestion 1]
    - [Suggestion 2]

## Guidelines

- You must call \`getMainThreadTrackSummaryByLabel\` (with the relevant label) to investigate the main thread activity before giving the user a reply or suggesting solutions for any performance problem or insight. This applies even if you already have some information about that period from \`getInsightDetails\` or the initial trace summary.
- Dig Deeper: Before replying, you should really dig into the main thread activity to uncover what the performance issues actually are. Do not solely rely on the information from the initial data; ensure you identify the root cause before suggesting solutions.
- No Shortcutting: Even if the initial facts contain specific line numbers or function names, you are not allowed to reply using only that information. You MUST call \`getMainThreadTrackSummaryByLabel\` to inspect its context before describing it to the user.
- Look for Aggregated Cost: Performance issues are not always caused by a single "Long Task". Many small, frequent events (like unthrottled \`mousemove\` or \`scroll\` handlers) can add up to significant main thread blockage. Use the Bottom-Up summary in \`getMainThreadTrackSummaryByLabel\` to identify functions with high total time, even if they are not associated with a Long Task.
- Use the provided functions to get detailed performance data. Prioritize functions that provide context relevant to the performance issue being investigated.
- Before finalizing your advice, look over it and validate using any relevant functions. If something seems off, refine the advice before giving it to the user.
- Base your analysis and advice solely on the data retrieved through the provided functions. Always use the provided functions to gather sufficient data when needed.
- Use absolute microsecond timestamps for any function that requires a \`min\` and \`max\` bounds. These timestamps can be found in the trace summary or within the details of an insight.
- Available labels for \`getMainThreadTrackSummaryByLabel\` include:
  - \`trace-bounds\` (entire trace)
  - \`nav-to-lcp\` (navigation to LCP)
  - \`lcp-ttfb\` (LCP TTFB phase)
  - \`lcp-render-delay\` (LCP render delay phase)
  - Insight names: \`LCPBreakdown\`, \`INPBreakdown\`, \`CLSCulprits\`, \`ThirdParties\`, \`DocumentLatency\`, \`DOMSize\`, \`DuplicatedJavaScript\`, \`FontDisplay\`, \`ForcedReflow\`, \`ImageDelivery\`, \`LCPDiscovery\`, \`LegacyJavaScript\`, \`NetworkDependencyTree\`, \`RenderBlocking\`, \`SlowCSSSelector\`, \`Viewport\`, \`ModernHTTP\`, \`Cache\`, \`CharacterSet\`
  - Navigation IDs: \`NAVIGATION_0\`, \`NAVIGATION_1\`, etc.
- Use \`getEventByKey\` to get data on a specific trace event. This is great for root-cause analysis or validating any assumptions.
- Provide clear, actionable recommendations. Avoid technical jargon unless necessary, and explain any technical terms used.
- If you see a generic task like "Task", "Evaluate script" or "(anonymous)" in the main thread activity, try to look at its children to see what actual functions are executed and refer to those. When referencing the main thread activity, be as specific as you can. Ensure you identify to the user relevant functions and which script they were defined in. Avoid referencing "Task", "Evaluate script" and "(anonymous)" nodes if possible and instead focus on their children.
- Structure your response using markdown headings and bullet points for improved readability.
- Be direct and to the point. Avoid unnecessary introductory phrases or filler content. Focus on delivering actionable advice efficiently.

## Strict Constraints

Adhere to the following critical requirements:

- Never show bounds to the user.
- Never show eventKey to the user.
- Ensure your responses only use ms for time units.
- Ensure numbers for time units are rounded to the nearest whole number.
- Ensure comprehensive data retrieval through function calls to provide accurate and complete recommendations.
- If the user asks a specific question about web performance that doesn't have anything to do with the trace, don't call any functions and be succinct in your answer.
- Before suggesting changing the format of an image, consider what format it is already in. For example, if the mime type is image/webp, do not suggest to the user that the image is converted to WebP, as the image is already in that format.
- Do not mention the functions you call to gather information about the trace (e.g., \`getEventByKey\`, \`getMainThreadTrackSummaryByLabel\`) in your output. These are internal implementation details that should be hidden from the user.
- Do not mention that you are an AI, or refer to yourself in the third person. You are simulating a performance expert.
- If asked about sensitive topics (religion, race, politics, sexuality, gender, etc.), respond with: "My expertise is limited to website performance analysis. I cannot provide information on that topic.".
- Do not provide answers on non-web-development topics, such as legal, financial, medical, or personal advice.
- Use the precision of Strunk & White, the brevity of Hemingway, and the simple clarity of Vonnegut. Don't add repeated information, and keep the whole answer short.
`;
const extraPreambleWhenNotExternal = `Additional notes:

When referring to a trace event that has a corresponding \`eventKey\`, annotate your output using markdown link syntax. For example:
- When referring to an event that is a long task: [Long task](#r-123)
- When referring to a URL for which you know the eventKey of: [https://www.example.com](#s-1827)
- Never show the eventKey (like "eventKey: s-1852") in your running text. When using markdown links, the URL must be only the hash (e.g., \`#s-1852\`), never \`eventKey: s-1852\`.

When asking the user to make a choice between options, output a list of choices at the end of your text response. The format is \`SUGGESTIONS: ["suggestion1", "suggestion2", "suggestion3"]\`. This MUST start on a newline, and be a single line.
`;
const freshTracePreamble = `Additional notes:

When referring to an element for which you know the nodeId, annotate your output using markdown link syntax:
- For example, if nodeId is 23: [LCP element](#node-23)
- This link will reveal the element in the Elements panel
- Never mention node or nodeId when referring to the element, and especially not in the link text.
- When referring to the LCP, it's useful to also mention what the LCP element is via its nodeId. Use the markdown link syntax to do so.
`;
var ScorePriority;
(function (ScorePriority) {
    ScorePriority[ScorePriority["REQUIRED"] = 3] = "REQUIRED";
    ScorePriority[ScorePriority["CRITICAL"] = 2] = "CRITICAL";
    ScorePriority[ScorePriority["DEFAULT"] = 1] = "DEFAULT";
})(ScorePriority || (ScorePriority = {}));
// 16k Tokens * ~4 char per token.
const MAX_FUNCTION_RESULT_BYTE_LENGTH = 16384 * 4;
function getInsightModel(model, key) {
    if (Object.prototype.hasOwnProperty.call(model, key)) {
        return model[key];
    }
    return undefined;
}
/**
 * One agent instance handles one conversation. Create a new agent
 * instance for a new conversation.
 */
export class PerformanceAgent extends AiAgent {
    preamble = preamble;
    #tracker;
    #networkLog;
    constructor(opts) {
        super(opts);
        this.#tracker = opts.tracker ?? Tracing.FreshRecording.Tracker.instance();
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        this.#networkLog = opts.networkLog ?? Logs.NetworkLog.NetworkLog.instance();
    }
    #formatter = null;
    #lastEventForEnhancedQuery;
    #lastInsightForEnhancedQuery;
    /**
     * Cache of all function calls made by the agent. This allows us to include (as a
     * fact) every function call to conversation requests, allowing the AI to access
     * all the results rather than just the most recent.
     *
     * TODO(b/442392194): I'm not certain this is needed. I do see past function call
     * responses in "historical_contexts", though I think it isn't including any
     * parameters in the "functionCall" entries.
     *
     * The record key is the result of a function's displayInfoFromArgs.
     */
    #functionCallCacheForFocus = new Map();
    #notExternalExtraPreambleFact = {
        text: extraPreambleWhenNotExternal,
        metadata: { source: 'devtools', score: ScorePriority.CRITICAL },
    };
    #freshTraceExtraPreambleFact = {
        text: freshTracePreamble,
        metadata: { source: 'devtools', score: ScorePriority.CRITICAL },
    };
    #networkDataDescriptionFact = {
        text: PerformanceTraceFormatter.networkDataFormatDescription,
        metadata: { source: 'devtools', score: ScorePriority.CRITICAL },
    };
    #callFrameDataDescriptionFact = {
        text: PerformanceTraceFormatter.callFrameDataFormatDescription,
        metadata: { source: 'devtools', score: ScorePriority.CRITICAL },
    };
    #traceFacts = [];
    /**
     * These facts do not contain page data, they are static instructions to the
     * LLM, so we don't need to add them to the disclosure.
     */
    #factsToNeverDisclose = new Set([
        this.#callFrameDataDescriptionFact,
        this.#networkDataDescriptionFact,
        this.#freshTraceExtraPreambleFact,
        this.#notExternalExtraPreambleFact,
    ]);
    /**
     * When we enhance the query with additional information, we need to know it
     * so we can show it in the disclosure UI. This is cleared and then populated
     * on each prompt.
     */
    #additionalSelectionsForDisclosure = [];
    get clientFeature() {
        return Host.AidaClient.ClientFeature.CHROME_PERFORMANCE_FULL_AGENT;
    }
    get userTier() {
        return Root.Runtime.hostConfig.devToolsAiAssistancePerformanceAgent?.userTier;
    }
    get options() {
        const temperature = Root.Runtime.hostConfig.devToolsAiAssistancePerformanceAgent?.temperature;
        const modelId = Root.Runtime.hostConfig.devToolsAiAssistancePerformanceAgent?.modelId;
        return {
            temperature,
            modelId,
        };
    }
    async *handleContextDetails(context) {
        if (!context) {
            return;
        }
        const contextDisclosure = [];
        for (const fact of this.currentFacts()) {
            if (this.#factsToNeverDisclose.has(fact)) {
                continue;
            }
            contextDisclosure.push(fact.text);
        }
        contextDisclosure.push(...this.#additionalSelectionsForDisclosure);
        const widgets = await context.getWidgets();
        yield {
            type: "context" /* ResponseType.CONTEXT */,
            details: [
                {
                    title: 'Trace details',
                    text: contextDisclosure.join('\n'),
                },
            ],
            widgets,
        };
    }
    #callTreeContextSet = new WeakSet();
    #isFunctionResponseTooLarge(response) {
        return response.length > MAX_FUNCTION_RESULT_BYTE_LENGTH;
    }
    /**
     * Sometimes the model will output URLs as plaintext; or a markdown link
     * where the link is the actual URL. This function transforms such output
     * to an eventKey link.
     *
     * A simple way to see when this gets utilized is:
     *   1. go to paulirish.com, record a trace
     *   2. say "What performance issues exist with my page?"
     *   3. then say "images"
     */
    #parseForKnownUrls(response) {
        const focus = this.context?.getItem();
        if (!focus) {
            return response;
        }
        // Regex with two main parts, separated by | (OR):
        // 1. (\[(.*?)\]\((.*?)\)): Captures a full markdown link.
        //    - Group 1: The whole link, e.g., "[text](url)"
        //    - Group 2: The link text, e.g., "text"
        //    - Group 3: The link destination, e.g., "url"
        // 2. (https?:\/\/[^\s<>()]+): Captures a standalone URL.
        //    - Group 4: The standalone URL, e.g., "https://google.com"
        const urlRegex = /(\[(.*?)\][ \t]*\((.*?)\))|(https?:\/\/[^\s<>()]+)/g;
        return response.replace(urlRegex, (match, markdownLink, linkText, linkDest, standaloneUrlText) => {
            if (markdownLink) {
                if (linkDest.startsWith('#')) {
                    return match;
                }
                const eventKeyMatch = linkDest.match(/eventKey:\s*([^\s,)]+)/);
                if (eventKeyMatch) {
                    const eventKey = eventKeyMatch[1];
                    return `[${linkText}](#${eventKey})`;
                }
                const event = focus.lookupEvent(linkDest);
                if (event) {
                    return `[${linkText}](#${linkDest})`;
                }
            }
            const urlText = linkDest ?? standaloneUrlText;
            if (!urlText) {
                return match;
            }
            const request = focus.parsedTrace.data.NetworkRequests.byTime.find(request => request.args.data.url === urlText);
            if (!request) {
                return match;
            }
            const eventKey = focus.eventsSerializer.keyForEvent(request);
            if (!eventKey) {
                return match;
            }
            return `[${urlText}](#${eventKey})`;
        });
    }
    #parseMarkdown(response) {
        /**
         * Sometimes the LLM responds with code chunks that wrap a text based markdown response.
         * If this happens, we want to remove those before continuing.
         * See b/405054694 for more details.
         */
        const FIVE_BACKTICKS = '`````';
        if (response.startsWith(FIVE_BACKTICKS) && response.endsWith(FIVE_BACKTICKS)) {
            return response.slice(FIVE_BACKTICKS.length, -FIVE_BACKTICKS.length);
        }
        return response;
    }
    parseTextResponse(response) {
        const parsedResponse = super.parseTextResponse(response);
        parsedResponse.answer = this.#parseForKnownUrls(parsedResponse.answer);
        parsedResponse.answer = this.#parseMarkdown(parsedResponse.answer);
        return parsedResponse;
    }
    async enhanceQuery(query, context) {
        if (!context) {
            this.clearDeclaredFunctions();
            return query;
        }
        this.clearDeclaredFunctions();
        this.#declareFunctions(context);
        const focus = context.getItem();
        const selected = [];
        if (focus.event) {
            const includeEventInfo = focus.event !== this.#lastEventForEnhancedQuery;
            this.#lastEventForEnhancedQuery = focus.event;
            if (includeEventInfo) {
                selected.push(`User selected an event ${this.#formatter?.serializeEvent(focus.event)}.\n\n`);
            }
        }
        if (focus.callTree) {
            // If this is a followup chat about the same call tree, don't include the call tree serialization again.
            // We don't need to repeat it and we'd rather have more the context window space.
            let contextString = '';
            if (!this.#callTreeContextSet.has(focus.callTree)) {
                contextString = focus.callTree.serialize();
                this.#callTreeContextSet.add(focus.callTree);
            }
            if (contextString) {
                selected.push(`User selected the following call tree:\n\n${contextString}\n\n`);
            }
        }
        if (focus.insight) {
            // We only need to add Insight info to a prompt when the context changes. For example:
            // User clicks Insight A. We need to send info on Insight A with the prompt.
            // User asks follow up question. We do not need to resend Insight A with the prompt.
            // User clicks Insight B. We now need to send info on Insight B with the prompt.
            // User clicks Insight A. We should resend the Insight info with the prompt.
            const includeInsightInfo = focus.insight !== this.#lastInsightForEnhancedQuery;
            this.#lastInsightForEnhancedQuery = focus.insight;
            if (includeInsightInfo) {
                selected.push(`User selected the ${focus.insight.insightKey} insight.\n\n`);
            }
        }
        if (!selected.length) {
            this.#additionalSelectionsForDisclosure = [];
            return query;
        }
        selected.push(`# User query\n\n${query}`);
        this.#additionalSelectionsForDisclosure = [...selected];
        return selected.join('');
    }
    async *run(initialQuery, options) {
        const focus = options.selected?.getItem();
        // Clear any previous facts in case the user changed the active context.
        this.clearFacts();
        if (options.selected && focus) {
            await this.#addFacts(options.selected);
        }
        yield* super.run(initialQuery, options);
    }
    /**
     * Clears performance-agent-specific caches and state.
     * This is called when the conversation needs to be reset (e.g. on navigation)
     * to prevent stale formatters, trace facts, or selection contexts from leaking
     * into subsequent runs.
     */
    clearCache() {
        super.clearCache();
        // Clear the function call cache to prevent stashed tool execution results
        // (which might contain cross-origin resource content fetched before navigation
        // was detected) from being replayed as facts in subsequent runs.
        this.#functionCallCacheForFocus.clear();
        // Reset the formatter and trace facts so they are recreated with the
        // correct target and origin on the next execution.
        this.#formatter = null;
        this.#traceFacts = [];
        this.#lastEventForEnhancedQuery = undefined;
        this.#lastInsightForEnhancedQuery = undefined;
        this.#additionalSelectionsForDisclosure = [];
        this.#callTreeContextSet = new WeakSet();
    }
    #createFactForTraceSummary() {
        if (!this.#formatter) {
            return;
        }
        const text = this.#formatter.formatTraceSummary();
        if (!text) {
            return;
        }
        this.#traceFacts.push({ text: `Trace summary:\n${text}`, metadata: { source: 'devtools', score: ScorePriority.REQUIRED } });
    }
    async #createFactForCriticalRequests() {
        if (!this.#formatter) {
            return;
        }
        const text = await this.#formatter.formatCriticalRequests();
        if (!text) {
            return;
        }
        this.#traceFacts.push({
            text,
            metadata: { source: 'devtools', score: ScorePriority.CRITICAL },
        });
    }
    async #createFactForMainThreadBottomUpSummary() {
        if (!this.#formatter) {
            return;
        }
        const formatter = this.#formatter;
        const text = await formatter.formatMainThreadBottomUpSummary();
        if (!text) {
            return;
        }
        this.#traceFacts.push({
            text,
            metadata: { source: 'devtools', score: ScorePriority.CRITICAL },
        });
    }
    async #createFactForThirdPartySummary() {
        if (!this.#formatter) {
            return;
        }
        const text = await this.#formatter.formatThirdPartySummary();
        if (!text) {
            return;
        }
        this.#traceFacts.push({
            text,
            metadata: { source: 'devtools', score: ScorePriority.CRITICAL },
        });
    }
    async #createFactForLongestTasks() {
        if (!this.#formatter) {
            return;
        }
        const text = await this.#formatter.formatLongestTasks();
        if (!text) {
            return;
        }
        this.#traceFacts.push({
            text,
            metadata: { source: 'devtools', score: ScorePriority.CRITICAL },
        });
    }
    async #addFacts(context) {
        const focus = context.getItem();
        this.addFact(this.#notExternalExtraPreambleFact);
        const isFresh = this.#tracker.recordingIsFresh(focus.parsedTrace);
        if (isFresh) {
            this.addFact(this.#freshTraceExtraPreambleFact);
        }
        this.addFact(this.#callFrameDataDescriptionFact);
        this.addFact(this.#networkDataDescriptionFact);
        if (!this.#traceFacts.length) {
            const target = this.targetManager.primaryPageTarget();
            if (!target) {
                throw new Error('missing target');
            }
            this.#formatter = context.createFormatter();
            this.#createFactForTraceSummary();
            await this.#createFactForCriticalRequests();
            await this.#createFactForMainThreadBottomUpSummary();
            await this.#createFactForThirdPartySummary();
            await this.#createFactForLongestTasks();
        }
        for (const fact of this.#traceFacts) {
            this.addFact(fact);
        }
        const cachedFunctionCalls = this.#functionCallCacheForFocus.get(focus);
        if (cachedFunctionCalls) {
            for (const fact of Object.values(cachedFunctionCalls)) {
                this.addFact(fact);
            }
        }
    }
    #cacheFunctionResult(focus, key, result) {
        const fact = {
            text: `This is the result of calling ${key}:\n${result}`,
            metadata: { source: key, score: ScorePriority.DEFAULT },
        };
        const cache = this.#functionCallCacheForFocus.get(focus) ?? {};
        cache[key] = fact;
        this.#functionCallCacheForFocus.set(focus, cache);
    }
    async #handleMainThreadTrackSummary(bounds, focus, functionName, cacheKey) {
        const formatter = this.#formatter;
        if (!formatter) {
            throw new Error('missing formatter');
        }
        const summary = await formatter.formatMainThreadTrackSummary(bounds);
        if (this.#isFunctionResponseTooLarge(summary)) {
            return {
                error: `${functionName} response is too large. Try investigating using other functions, or a more narrow bounds`,
            };
        }
        this.#cacheFunctionResult(focus, cacheKey, summary);
        const widgets = [];
        widgets.push({
            name: 'TIMELINE_RANGE_SUMMARY',
            data: {
                parsedTrace: focus.parsedTrace,
                bounds,
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
        return {
            result: { summary },
            widgets,
        };
    }
    #declareFunctions(context) {
        const focus = context.getItem();
        const { parsedTrace } = focus;
        const isFresh = this.#tracker.recordingIsFresh(parsedTrace);
        this.declareFunction('getInsightDetails', {
            description: 'Returns detailed information about a specific insight of an insight set. Use this before commenting on any specific issue to get more information.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    insightSetId: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The id for the specific insight set. Only use the ids given in the "Available insight sets" list.',
                        nullable: false,
                    },
                    insightName: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The name of the insight. Only use the insight names given in the "Available insights" list.',
                        nullable: false,
                    },
                },
                required: ['insightSetId', 'insightName'],
            },
            displayInfoFromArgs: params => {
                return {
                    title: lockedString(`Investigating insight ${params.insightName}`),
                    action: `getInsightDetails('${params.insightSetId}', '${params.insightName}')`,
                };
            },
            handler: async (params) => {
                debugLog('Function call: getInsightDetails', params);
                const insightSet = parsedTrace.insights?.get(params.insightSetId);
                if (!insightSet) {
                    const valid = ([...parsedTrace.insights?.values() ?? []])
                        .map(insightSet => `id: ${insightSet.id}, url: ${insightSet.url}, bounds: ${this.#formatter?.serializeBounds(insightSet.bounds)}`)
                        .join('; ');
                    return { error: `Invalid insight set id. Valid insight set ids are: ${valid}` };
                }
                const insight = getInsightModel(insightSet.model, params.insightName);
                if (!insight) {
                    const valid = Object.keys(insightSet.model).join(', ');
                    return { error: `No insight available. Valid insight names are: ${valid}` };
                }
                const details = new PerformanceInsightFormatter(focus, insight).formatInsight();
                const widgets = [];
                if (Trace.Insights.Models.LCPDiscovery.isLCPDiscoveryInsight(insight) ||
                    Trace.Insights.Models.LCPBreakdown.isLCPBreakdownInsight(insight)) {
                    const lcpMetric = Trace.Insights.Common.getLCP(insightSet);
                    const lcpEvent = lcpMetric?.event;
                    if (lcpEvent && Trace.Types.Events.isAnyLargestContentfulPaintCandidate(lcpEvent)) {
                        const nodeId = lcpEvent.args.data?.nodeId;
                        if (nodeId) {
                            const target = this.targetManager.primaryPageTarget();
                            const domModel = target?.model(SDK.DOMModel.DOMModel);
                            if (domModel) {
                                const nodeMap = await domModel.pushNodesByBackendIdsToFrontend(new Set([nodeId]));
                                const node = nodeMap?.get(nodeId);
                                if (node) {
                                    const lcpSyntheticRequest = insight.lcpRequest;
                                    const [snapshot, imageContent] = await Promise.all([
                                        node.takeSnapshot(),
                                        lcpSyntheticRequest ? this.#getNetworkRequestImageData(lcpSyntheticRequest) :
                                            Promise.resolve(undefined),
                                    ]);
                                    let networkRequest;
                                    if (lcpSyntheticRequest) {
                                        networkRequest = {
                                            url: lcpSyntheticRequest.args.data.url,
                                            size: lcpSyntheticRequest.args.data.decodedBodyLength ??
                                                lcpSyntheticRequest.args.data.encodedDataLength ?? 0,
                                            resourceType: lcpSyntheticRequest.args.data.resourceType,
                                            mimeType: lcpSyntheticRequest.args.data.mimeType ?? '',
                                            imageContent,
                                        };
                                    }
                                    widgets.push({
                                        name: 'DOM_TREE',
                                        data: {
                                            root: snapshot,
                                            networkRequest,
                                            title: lockedString('LCP element'),
                                            accessibleRevealLabel: lockedString('Reveal LCP element'),
                                        },
                                    });
                                }
                            }
                        }
                    }
                }
                const insightKey = params.insightName;
                if (Trace.Insights.Common.isInsightKey(insightKey)) {
                    widgets.push({
                        name: 'PERF_INSIGHT',
                        data: {
                            insight: insightKey,
                            insightData: insight,
                        },
                    });
                }
                const key = `getInsightDetails('${params.insightSetId}', '${params.insightName}')`;
                this.#cacheFunctionResult(focus, key, details);
                return { result: { details }, widgets };
            },
        });
        this.declareFunction('getEventByKey', {
            description: 'Returns detailed information about a specific event. Use the detail returned to validate performance issues, but do not tell the user about irrelevant raw data from a trace event.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    eventKey: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The key for the event.',
                        nullable: false,
                    },
                },
                required: ['eventKey'],
            },
            displayInfoFromArgs: params => {
                return { title: lockedString('Looking at trace event'), action: `getEventByKey('${params.eventKey}')` };
            },
            handler: async (params) => {
                debugLog('Function call: getEventByKey', params);
                const event = focus.lookupEvent(params.eventKey);
                if (!event) {
                    return { error: 'Invalid eventKey' };
                }
                // TODO(b/425270067): Format in the same way that "Summary" detail tab does.
                const details = formatEventForAI(event, parsedTrace);
                const key = `getEventByKey('${params.eventKey}')`;
                this.#cacheFunctionResult(focus, key, details);
                return {
                    result: { details },
                    widgets: [{
                            name: 'TIMELINE_EVENT_SUMMARY',
                            data: {
                                event,
                                parsedTrace,
                            },
                        }],
                };
            },
        });
        this.declareFunction('getMainThreadTrackSummaryByLabel', {
            description: 'Returns a focused, detailed summary of the main thread for a predefined labeled period. Use this to get more relevant detail than the initial trace summary before diagnosing issues.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    label: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The label of the period to investigate (e.g., \'LCPBreakdown\', \'CLSCulprits\', \'nav-to-lcp\').',
                        nullable: false,
                    },
                },
                required: ['label'],
            },
            displayInfoFromArgs: args => {
                const labelName = context.getLabelName(args.label);
                return {
                    title: lockedString(`${UIStringsNotTranslated.mainThreadActivity}: ${labelName}`),
                    action: `getMainThreadTrackSummaryByLabel('${args.label}')`,
                };
            },
            handler: async (args) => {
                debugLog('Function call: getMainThreadTrackSummaryByLabel');
                const bounds = context.getBoundsForLabel(args.label);
                if (!bounds) {
                    return { error: `Invalid label: ${args.label}` };
                }
                const key = `getMainThreadTrackSummaryByLabel('${args.label}')`;
                return await this.#handleMainThreadTrackSummary(bounds, focus, 'getMainThreadTrackSummaryByLabel', key);
            },
        });
        this.declareFunction('getNetworkTrackSummary', {
            description: 'Returns a summary of the network for the given bounds.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    min: {
                        type: 3 /* Host.AidaClient.ParametersTypes.INTEGER */,
                        description: `The minimum time of the bounds, in microseconds (the current trace starts at ${parsedTrace.data.Meta.traceBounds.min})`,
                        nullable: true,
                    },
                    max: {
                        type: 3 /* Host.AidaClient.ParametersTypes.INTEGER */,
                        description: `The maximum time of the bounds, in microseconds (the current trace ends at ${parsedTrace.data.Meta.traceBounds.max})`,
                        nullable: true,
                    },
                },
                required: [],
            },
            displayInfoFromArgs: args => {
                const min = args.min ?? parsedTrace.data.Meta.traceBounds.min;
                const max = args.max ?? parsedTrace.data.Meta.traceBounds.max;
                return {
                    title: lockedString(UIStringsNotTranslated.networkActivitySummary),
                    action: `getNetworkTrackSummary({min: ${min}, max: ${max}})`,
                };
            },
            handler: async (args) => {
                debugLog('Function call: getNetworkTrackSummary');
                if (!this.#formatter) {
                    throw new Error('missing formatter');
                }
                const bounds = context.createBounds(args.min, args.max);
                if (!bounds) {
                    return { error: 'invalid bounds' };
                }
                const summary = this.#formatter.formatNetworkTrackSummary(bounds);
                if (this.#isFunctionResponseTooLarge(summary)) {
                    return {
                        error: 'getNetworkTrackSummary response is too large. Try investigating using other functions, or a more narrow bounds',
                    };
                }
                const key = `getNetworkTrackSummary({min: ${bounds.min}, max: ${bounds.max}})`;
                this.#cacheFunctionResult(focus, key, summary);
                return {
                    result: { summary },
                    widgets: [{
                            name: 'NETWORK_TRACK',
                            data: {
                                parsedTrace,
                                bounds,
                            },
                        }],
                };
            },
        });
        this.declareFunction('getDetailedCallTree', {
            description: 'Returns a detailed call tree for the given main thread event.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    eventKey: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The key for the event.',
                        nullable: false,
                    },
                },
                required: ['eventKey'],
            },
            displayInfoFromArgs: args => {
                return { title: lockedString('Looking at call tree'), action: `getDetailedCallTree('${args.eventKey}')` };
            },
            handler: async (args) => {
                debugLog('Function call: getDetailedCallTree');
                if (!this.#formatter) {
                    throw new Error('missing formatter');
                }
                const event = focus.lookupEvent(args.eventKey);
                if (!event) {
                    return { error: 'Invalid eventKey' };
                }
                const tree = AICallTree.fromEvent(event, parsedTrace);
                if (!tree) {
                    return { error: 'No call tree found' };
                }
                const formatter = this.#formatter;
                const callTree = await formatter.formatCallTree(tree);
                const key = `getDetailedCallTree(${args.eventKey})`;
                this.#cacheFunctionResult(focus, key, callTree);
                const { startTime, endTime } = Trace.Helpers.Timing.eventTimingsMicroSeconds(event);
                const bounds = Trace.Helpers.Timing.traceWindowFromMicroSeconds(startTime, endTime);
                const widgets = [
                    {
                        name: 'BOTTOM_UP_TREE',
                        data: {
                            bounds,
                            parsedTrace,
                        },
                    },
                    {
                        name: 'TIMELINE_RANGE_SUMMARY',
                        data: {
                            bounds,
                            parsedTrace,
                            track: 'main',
                        },
                    },
                ];
                return { result: { callTree }, widgets };
            },
        });
        this.declareFunction('getFunctionCode', {
            description: 'Returns the code for a function defined at the given location. The result is annotated with the runtime performance of each line of code.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    scriptUrl: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The url of the function.',
                        nullable: false,
                    },
                    line: {
                        type: 3 /* Host.AidaClient.ParametersTypes.INTEGER */,
                        description: 'The line number where the function is defined.',
                        nullable: false,
                    },
                    column: {
                        type: 3 /* Host.AidaClient.ParametersTypes.INTEGER */,
                        description: 'The column number where the function is defined.',
                        nullable: false,
                    },
                },
                required: ['scriptUrl', 'line', 'column'],
            },
            displayInfoFromArgs: args => {
                return {
                    title: lockedString('Looking up function code'),
                    action: `getFunctionCode('${args.scriptUrl}', ${args.line}, ${args.column})`,
                };
            },
            handler: async (args) => {
                debugLog('Function call: getFunctionCode');
                if (!isFresh) {
                    return {
                        error: 'Cannot use this tool on an imported file.',
                    };
                }
                if (args.line === undefined) {
                    return { error: 'Missing arg: line' };
                }
                if (args.column === undefined) {
                    return { error: 'Missing arg: column' };
                }
                if (!context.canAccessResource(args.scriptUrl)) {
                    return { error: 'Resource not found' };
                }
                if (!this.#formatter) {
                    throw new Error('missing formatter');
                }
                const target = this.targetManager.primaryPageTarget();
                if (!target) {
                    throw new Error('missing target');
                }
                const url = args.scriptUrl;
                const code = await this.#formatter.resolveFunctionCodeAtLocation(url, args.line, args.column);
                if (!code) {
                    return { error: 'Could not find code' };
                }
                const result = this.#formatter.formatFunctionCode(code);
                const key = `getFunctionCode('${args.scriptUrl}', ${args.line}, ${args.column})`;
                this.#cacheFunctionResult(focus, key, result);
                return {
                    result: { result },
                    widgets: [{
                            name: 'SOURCE_CODE',
                            data: {
                                url: args.scriptUrl,
                                line: args.line,
                                column: args.column,
                                code: code.code,
                            },
                        }],
                };
            },
        });
        const isTraceApp = Root.Runtime.Runtime.isTraceApp();
        this.declareFunction('getResourceContent', {
            description: 'Returns the content of the resource with the given url. Only use this for text resource types. This function is helpful for getting script contents in order to further analyze main thread activity and suggest code improvements. When analyzing the main thread activity, always call this function to get more detail. Always call this function when asked to provide specifics about what is happening in the code. Never ask permission to call this function, just do it.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    url: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The url for the resource.',
                        nullable: false,
                    },
                },
                required: ['url'],
            },
            displayInfoFromArgs: args => {
                return { title: lockedString('Looking at resource content'), action: `getResourceContent('${args.url}')` };
            },
            handler: async (args) => {
                debugLog('Function call: getResourceContent');
                if (!isFresh) {
                    return { error: 'Cannot use this tool on an imported file.' };
                }
                const url = args.url;
                if (!context.canAccessResource(url)) {
                    return { error: 'Resource not found' };
                }
                let content;
                // First check parsedTrace.data.Scripts.
                // Then, check ResourceTreeModel, but only when it is valid. Don't want to
                // use if viewing a loaded trace from DevTools attached to an unrelated
                // page.
                const script = parsedTrace.data.Scripts.scripts.find((script) => script.url === url);
                if (script?.content !== undefined) {
                    content = script.content;
                }
                else if (isFresh || isTraceApp) {
                    const resource = SDK.ResourceTreeModel.ResourceTreeModel.resourceForURL(this.targetManager, url);
                    if (!resource) {
                        return { error: 'Resource not found' };
                    }
                    const data = await resource.requestContentData();
                    if ('error' in data) {
                        return { error: `Could not get resource content: ${data.error}` };
                    }
                    content = data.text;
                }
                else {
                    return { error: 'Resource not found' };
                }
                if (content === undefined) {
                    return { error: 'Resource content not found' };
                }
                const key = `getResourceContent(${args.url})`;
                this.#cacheFunctionResult(focus, key, content);
                return {
                    result: { content },
                    widgets: [{
                            name: 'SOURCE_CODE',
                            data: {
                                url: args.url,
                                code: content,
                            },
                        }],
                };
            },
        });
        this.declareFunction('selectEventByKey', {
            description: 'Selects the event in the flamechart for the user. If the user asks to show them something, it\'s likely a good idea to call this function.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    eventKey: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The key for the event.',
                        nullable: false,
                    },
                },
                required: ['eventKey'],
            },
            displayInfoFromArgs: params => {
                return { title: lockedString('Selecting event'), action: `selectEventByKey('${params.eventKey}')` };
            },
            handler: async (params) => {
                debugLog('Function call: selectEventByKey', params);
                const event = focus.lookupEvent(params.eventKey);
                if (!event) {
                    return { error: 'Invalid eventKey' };
                }
                const revealable = new SDK.TraceObject.RevealableEvent(event);
                await Common.Revealer.reveal(revealable);
                return {
                    result: { success: true },
                    widgets: [{
                            name: 'TIMELINE_EVENT_SUMMARY',
                            data: {
                                event,
                                parsedTrace,
                            },
                        }],
                };
            },
        });
    }
    async #getNetworkRequestImageData(lcpRequest) {
        const target = this.targetManager.primaryPageTarget();
        const networkManager = target?.model(SDK.NetworkManager.NetworkManager);
        if (!target || !networkManager) {
            return undefined;
        }
        const networkLog = this.#networkLog;
        const requestId = lcpRequest.args.data.requestId;
        const sdkRequest = networkLog.requestByManagerAndId(networkManager, requestId);
        if (sdkRequest?.contentType().isImage()) {
            const contentData = await sdkRequest.requestContentData();
            if (!TextUtils.ContentData.ContentData.isError(contentData)) {
                return contentData;
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=PerformanceAgent.js.map