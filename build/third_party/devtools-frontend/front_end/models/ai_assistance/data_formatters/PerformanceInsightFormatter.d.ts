import type * as CrUXManager from '../../crux-manager/crux-manager.js';
import * as Trace from '../../trace/trace.js';
import type { ConversationSuggestions } from '../agents/AiAgent.js';
import type { AgentFocus } from '../performance/AIContext.js';
export declare class PerformanceInsightFormatter {
    #private;
    constructor(focus: AgentFocus, insight: Trace.Insights.Types.InsightModel, deviceScope?: CrUXManager.DeviceScope | null);
    insightIsSupported(): boolean;
    getSuggestions(): ConversationSuggestions;
    /**
     * Create an AI prompt string out of the Cache Insight model to use with Ask AI.
     * Note: This function accesses the UIStrings within Cache to help build the
     * AI prompt, but does not (and should not) call i18nString to localize these strings. They
     * should all be sent in English (at least for now).
     * @param insight The Cache Insight Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatCacheInsight(insight: Trace.Insights.Models.Cache.CacheInsightModel): string;
    /**
     * Create an AI prompt string out of the CLS Culprits Insight model to use with Ask AI.
     * @param insight The CLS Culprits Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatClsCulpritsInsight(insight: Trace.Insights.Models.CLSCulprits.CLSCulpritsInsightModel): string;
    /**
     * Create an AI prompt string out of the Document Latency Insight model to use with Ask AI.
     * @param insight The Document Latency Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatDocumentLatencyInsight(insight: Trace.Insights.Models.DocumentLatency.DocumentLatencyInsightModel): string;
    /**
     * Create an AI prompt string out of the DOM Size model to use with Ask AI.
     * Note: This function accesses the UIStrings within DomSize to help build the
     * AI prompt, but does not (and should not) call i18nString to localize these strings. They
     * should all be sent in English (at least for now).
     * @param insight The DOM Size Insight Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatDomSizeInsight(insight: Trace.Insights.Models.DOMSize.DOMSizeInsightModel): string;
    /**
     * Create an AI prompt string out of the Duplicated JavaScript Insight model to use with Ask AI.
     * @param insight The Duplicated JavaScript Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatDuplicatedJavaScriptInsight(insight: Trace.Insights.Models.DuplicatedJavaScript.DuplicatedJavaScriptInsightModel): string;
    /**
     * Create an AI prompt string out of the NetworkDependencyTree Insight model to use with Ask AI.
     * Note: This function accesses the UIStrings within NetworkDependencyTree to help build the
     * AI prompt, but does not (and should not) call i18nString to localize these strings. They
     * should all be sent in English (at least for now).
     * @param insight The Network Dependency Tree Insight Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatFontDisplayInsight(insight: Trace.Insights.Models.FontDisplay.FontDisplayInsightModel): string;
    /**
     * Create an AI prompt string out of the Forced Reflow Insight model to use with Ask AI.
     * Note: This function accesses the UIStrings within ForcedReflow model to help build the
     * AI prompt, but does not (and should not) call i18nString to localize these strings. They
     * should all be sent in English (at least for now).
     * @param insight The ForcedReflow Insight Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatForcedReflowInsight(insight: Trace.Insights.Models.ForcedReflow.ForcedReflowInsightModel): string;
    /**
     * Create an AI prompt string out of the INP Brekdown Insight model to use with Ask AI.
     * @param insight The INP Breakdown Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatImageDeliveryInsight(insight: Trace.Insights.Models.ImageDelivery.ImageDeliveryInsightModel): string;
    /**
     * Create an AI prompt string out of the INP Brekdown Insight model to use with Ask AI.
     * @param insight The INP Breakdown Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatInpBreakdownInsight(insight: Trace.Insights.Models.INPBreakdown.INPBreakdownInsightModel): string;
    /**
     * Create an AI prompt string out of the LCP Brekdown Insight model to use with Ask AI.
     * @param insight The LCP Breakdown Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatLcpBreakdownInsight(insight: Trace.Insights.Models.LCPBreakdown.LCPBreakdownInsightModel): string;
    /**
     * Create an AI prompt string out of the LCP Brekdown Insight model to use with Ask AI.
     * @param insight The LCP Breakdown Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatLcpDiscoveryInsight(insight: Trace.Insights.Models.LCPDiscovery.LCPDiscoveryInsightModel): string;
    /**
     * Create an AI prompt string out of the Legacy JavaScript Insight model to use with Ask AI.
     * @param insight The Legacy JavaScript Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatLegacyJavaScriptInsight(insight: Trace.Insights.Models.LegacyJavaScript.LegacyJavaScriptInsightModel): string;
    /**
     * Create an AI prompt string out of the Modern HTTP Insight model to use with Ask AI.
     * @param insight The Modern HTTP Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatModernHttpInsight(insight: Trace.Insights.Models.ModernHTTP.ModernHTTPInsightModel): string;
    /**
     * Create an AI prompt string out of the NetworkDependencyTree Insight model to use with Ask AI.
     * Note: This function accesses the UIStrings within NetworkDependencyTree to help build the
     * AI prompt, but does not (and should not) call i18nString to localize these strings. They
     * should all be sent in English (at least for now).
     * @param insight The Network Dependency Tree Insight Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatNetworkDependencyTreeInsight(insight: Trace.Insights.Models.NetworkDependencyTree.NetworkDependencyTreeInsightModel): string;
    /**
     * Create an AI prompt string out of the Render-blocking Insight model to use with Ask AI.
     * @param insight The Render-blocking Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatRenderBlockingInsight(insight: Trace.Insights.Models.RenderBlocking.RenderBlockingInsightModel): string;
    /**
     * Create an AI prompt string out of the Slow CSS Selector Insight model to use with Ask AI.
     * Note: This function accesses the UIStrings within SlowCSSSelector to help build the
     * AI prompt, but does not (and should not) call i18nString to localize these strings. They
     * should all be sent in English (at least for now).
     * @param insight The Network Dependency Tree Insight Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatSlowCssSelectorsInsight(insight: Trace.Insights.Models.SlowCSSSelector.SlowCSSSelectorInsightModel): string;
    /**
     * Create an AI prompt string out of the ThirdParties Insight model to use with Ask AI.
     * Note: This function accesses the UIStrings within ThirdParties to help build the
     * AI prompt, but does not (and should not) call i18nString to localize these strings. They
     * should all be sent in English (at least for now).
     * @param insight The Third Parties Insight Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatThirdPartiesInsight(insight: Trace.Insights.Models.ThirdParties.ThirdPartiesInsightModel): string;
    /**
     * Create an AI prompt string out of the Viewport [Mobile] Insight model to use with Ask AI.
     * Note: This function accesses the UIStrings within Viewport to help build the
     * AI prompt, but does not (and should not) call i18nString to localize these strings. They
     * should all be sent in English (at least for now).
     * @param insight The Network Dependency Tree Insight Model to query.
     * @returns a string formatted for sending to Ask AI.
     */
    formatCharacterSetInsight(insight: Trace.Insights.Models.CharacterSet.CharacterSetInsightModel): string;
    formatViewportInsight(insight: Trace.Insights.Models.Viewport.ViewportInsightModel): string;
    /**
     * Formats and outputs the insight's data.
     * Pass `{headingLevel: X}` to determine what heading level to use for the
     * titles in the markdown output. The default is 2 (##).
     */
    formatInsight(opts?: {
        headingLevel: number;
    }): string;
    estimatedSavings(): string;
}
