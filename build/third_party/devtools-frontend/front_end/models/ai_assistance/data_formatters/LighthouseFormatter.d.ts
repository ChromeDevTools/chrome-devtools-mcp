import type * as LHModel from '../../lighthouse/lighthouse.js';
/**
 * Category argument for Lighthouse tools, accepting a specific category ID or `'all'`
 * to target a full report across all standard categories.
 */
export type LighthouseCategoryArg = 'all' | LHModel.RunTypes.CategoryId;
/**
 * A formatter that takes a raw Lighthouse report JSON and creates a markdown
 * summary for an AI Agent.
 */
export declare class LighthouseFormatter {
    #private;
    /**
     * Returns an overall summary and high-level overview of the Lighthouse report.
     */
    summary(report: LHModel.ReporterTypes.ReportJSON): string;
    /**
     * Returns the title and score of every failing audit (score < 90), grouped by category.
     * Descriptions and details tables are left out to keep the prompt small. Each category
     * heading includes its category ID so the agent can request the full audit details.
     */
    failingAuditsSummary(report: LHModel.ReporterTypes.ReportJSON): string;
    /**
     * Formats a Lighthouse report for an AI Agent. If categoryId is 'all', returns
     * each category's audits. Otherwise, returns audits for the specified category.
     * The output does not include the report summary, because the conversation
     * context already sends it.
     */
    formatReport(report: LHModel.ReporterTypes.ReportJSON, categoryId: LighthouseCategoryArg): string;
    /**
     * Returns a markdown list of all audits in a given category.
     * Highlight failing audits (score < 90).
     */
    audits(report: LHModel.ReporterTypes.ReportJSON, categoryOrId: LHModel.RunTypes.CategoryId | LHModel.ReporterTypes.CategoryJSON): string;
}
