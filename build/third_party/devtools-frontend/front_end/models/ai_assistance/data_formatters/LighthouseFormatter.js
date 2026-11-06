// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { bytes, millis } from './UnitFormatters.js';
/**
 * A formatter that takes a raw Lighthouse report JSON and creates a markdown
 * summary for an AI Agent.
 */
export class LighthouseFormatter {
    /**
     * Returns an overall summary and high-level overview of the Lighthouse report.
     */
    summary(report) {
        const lines = [];
        lines.push('# Lighthouse Report Summary');
        lines.push(`URL: ${report.finalDisplayedUrl}`);
        lines.push(`Fetch Time: ${report.fetchTime}`);
        lines.push(`Lighthouse Version: ${report.lighthouseVersion}`);
        lines.push('');
        lines.push('## Category Scores');
        for (const category of Object.values(report.categories)) {
            const score = category.score !== null ? Math.round(category.score * 100) : 'n/a';
            lines.push(`- ${category.title}: ${score}`);
        }
        return lines.join('\n');
    }
    /**
     * Returns the title and score of every failing audit (score < 90), grouped by category.
     * Descriptions and details tables are left out to keep the prompt small. Each category
     * heading includes its category ID so the agent can request the full audit details.
     */
    failingAuditsSummary(report) {
        const lines = [];
        lines.push('## Failing audits');
        for (const [categoryId, category] of Object.entries(report.categories)) {
            lines.push('');
            lines.push(`### ${category.title} (categoryId: "${categoryId}")`);
            const failingAudits = this.#findFailingAudits(report, category);
            if (failingAudits.length === 0) {
                lines.push('- No failing audits.');
                continue;
            }
            for (const audit of failingAudits) {
                lines.push(`- ${audit.title}: ${this.#formatScore(audit.score)}`);
            }
        }
        return lines.join('\n');
    }
    /**
     * Formats a Lighthouse report for an AI Agent. If categoryId is 'all', returns
     * each category's audits. Otherwise, returns audits for the specified category.
     * The output does not include the report summary, because the conversation
     * context already sends it.
     */
    formatReport(report, categoryId) {
        if (categoryId === 'all') {
            return Object.values(report.categories).map(category => this.audits(report, category)).join('\n\n');
        }
        return this.audits(report, categoryId);
    }
    /**
     * Returns a markdown list of all audits in a given category.
     * Highlight failing audits (score < 90).
     */
    audits(report, categoryOrId) {
        const category = typeof categoryOrId === 'string' ? report.categories[categoryOrId] : categoryOrId;
        if (!category) {
            return `Category "${categoryOrId}" not found.`;
        }
        const lines = [];
        lines.push(`# Audits for ${category.title}`);
        if (category.description) {
            lines.push(`${category.description.replace(/\n/g, ' ')}`);
        }
        lines.push('');
        const failingAudits = this.#findFailingAudits(report, category);
        if (failingAudits.length === 0) {
            lines.push('All audits in this category passed (score >= 90).');
            return lines.join('\n');
        }
        lines.push('The following audits in this category have a score below 90 and may need attention:');
        for (const audit of failingAudits) {
            let line = `- **${audit.title}**: ${this.#formatScore(audit.score)}`;
            if (audit.displayValue) {
                line += ` (${audit.displayValue})`;
            }
            lines.push(line);
            lines.push(`  * ${audit.description.replace(/\n/g, ' ')}`);
            if (audit.details) {
                const formattedDetails = this.#formatDetails(audit.details);
                if (formattedDetails) {
                    lines.push('');
                    lines.push(formattedDetails.split('\n').map(l => `    ${l}`).join('\n'));
                }
            }
        }
        return lines.join('\n');
    }
    /**
     * Returns the audits in a category that scored below 90, in the category's order.
     * Audits without a score (such as informative or manual audits) cannot fail, so they
     * are excluded.
     */
    #findFailingAudits(report, category) {
        return category.auditRefs.map(ref => report.audits[ref.id])
            .filter((audit) => Boolean(audit) && audit.score !== null && audit.score < 0.9);
    }
    #formatScore(score) {
        return Math.round(score * 100);
    }
    #formatDetails(details) {
        switch (details.type) {
            case 'table': {
                const lines = [];
                if (details.summary) {
                    const summaryParts = [];
                    // Purposefully rule out 0 because we want to skip if there is 0 wasted time.
                    if (details.summary.wastedMs) {
                        summaryParts.push(`Wasted time: ${details.summary.wastedMs}ms`);
                    }
                    // Purposefully rule out 0 because we want to skip if there is 0 wasted time.
                    if (details.summary.wastedBytes) {
                        summaryParts.push(`Wasted bytes: ${details.summary.wastedBytes}`);
                    }
                    if (summaryParts.length > 0) {
                        lines.push(summaryParts.join('\n'));
                    }
                }
                lines.push(this.#formatTable(details.headings, details.items));
                return lines.join('\n');
            }
            case 'opportunity': {
                const lines = [];
                const summaryParts = [];
                if (details.overallSavingsMs) {
                    summaryParts.push(`Potential savings: ${details.overallSavingsMs}ms`);
                }
                if (details.overallSavingsBytes) {
                    summaryParts.push(`Potential savings: ${details.overallSavingsBytes} bytes`);
                }
                if (summaryParts.length > 0) {
                    lines.push(summaryParts.join(', '));
                }
                lines.push(this.#formatTable(details.headings, details.items));
                return lines.join('\n');
            }
            default:
                return '';
        }
    }
    #formatTable(headings, items) {
        const lines = [];
        for (const item of items) {
            const itemLines = [];
            for (const heading of headings) {
                const value = item[heading.key];
                const formattedValues = this.#formatTableValues(value, heading.valueType);
                for (const { labelSuffix, value: v } of formattedValues) {
                    const baseLabel = heading.label || heading.key;
                    const label = labelSuffix ? `${baseLabel} ${labelSuffix}` : baseLabel;
                    itemLines.push(`  * **${label}**: ${v}`);
                }
                const subItems = item.subItems;
                // subItems can technically be a string (TableItemValue), but we
                // only care about it here if it's a SubItemsJSON (type:
                // 'subitems'), which represents a nested table of values.
                if (subItems && typeof subItems === 'object' && 'type' in subItems && subItems.type === 'subitems' &&
                    heading.subItemsHeading) {
                    for (const subItem of subItems.items) {
                        const subValue = subItem[heading.subItemsHeading.key];
                        // Skip sub-item values that are identical to the main item's value
                        // for the same heading to avoid redundant output (e.g. if both
                        // show the same "Est Savings" value).
                        if (subValue === value) {
                            continue;
                        }
                        const formattedSubValues = this.#formatTableValues(subValue, heading.subItemsHeading.valueType);
                        for (const { value: v } of formattedSubValues) {
                            itemLines.push(`    * ${v}`);
                        }
                    }
                }
            }
            if (itemLines.length > 0) {
                lines.push(`- Item:`);
                lines.push(...itemLines);
            }
        }
        return lines.join('\n');
    }
    #formatTableValues(value, valueType) {
        if (value === undefined || value === null) {
            return [];
        }
        if (typeof value === 'string' || typeof value === 'number') {
            return [{ value: this.#formatValue(value, valueType) }];
        }
        if (typeof value === 'object' && 'type' in value) {
            switch (value.type) {
                case 'node': {
                    const results = [];
                    const label = value.nodeLabel || value.selector || value.snippet || '(node)';
                    results.push({ value: label });
                    if (value.selector && value.selector !== label) {
                        results.push({ labelSuffix: 'selector', value: value.selector });
                    }
                    if (value.path) {
                        results.push({ labelSuffix: 'path', value: value.path });
                    }
                    if (value.explanation) {
                        results.push({ labelSuffix: 'explanation', value: value.explanation.replace(/\n/g, ' ') });
                    }
                    return results;
                }
                case 'source-location': {
                    const parts = [];
                    if (value.url) {
                        parts.push(value.url);
                    }
                    if (value.line) {
                        parts.push(String(value.line));
                    }
                    if (value.column) {
                        parts.push(String(value.column));
                    }
                    return [{ value: parts.join(':') }];
                }
            }
        }
        return [];
    }
    #formatValue(value, valueType) {
        if (typeof value === 'string') {
            return value;
        }
        switch (valueType) {
            case 'bytes': {
                return bytes(value);
            }
            case 'timespanMs':
            case 'ms': {
                return millis(value);
            }
            default:
                return String(value);
        }
    }
}
//# sourceMappingURL=LighthouseFormatter.js.map