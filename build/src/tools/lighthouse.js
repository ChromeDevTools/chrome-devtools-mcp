/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import { lighthouseRunner, generateReport, zod, } from '../third_party/index.js';
import { ToolCategory } from './categories.js';
import { startTrace } from './performance.js';
import { definePageTool, } from './ToolDefinition.js';
// Kept in sync with `constants.userAgents` in Lighthouse's
// core/config/constants.js, which `lighthouse:default` and the `desktop`
// preset use. The bundle in src/third_party only re-exports the runner
// entrypoints, so these cannot be imported and are mirrored here alongside the
// screen emulation metrics below. Refresh via scripts/update-lighthouse.ts.
const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36';
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
// Caps the number of DOM nodes returned inline per failing audit to keep the
// response compact. The full list remains available in the saved reports.
const MAX_NODES_PER_AUDIT = 10;
const isRecord = (value) => {
    return typeof value === 'object' && value !== null;
};
const getString = (value) => {
    return typeof value === 'string' ? value : undefined;
};
const toAuditNode = (value) => {
    const node = {};
    const selector = getString(value.selector);
    const snippet = getString(value.snippet);
    const nodeLabel = getString(value.nodeLabel);
    const explanation = getString(value.explanation);
    if (selector) {
        node.selector = selector;
    }
    if (snippet) {
        node.snippet = snippet;
    }
    if (nodeLabel) {
        node.nodeLabel = nodeLabel;
    }
    if (explanation) {
        node.explanation = explanation;
    }
    return node;
};
const getNodeKey = (value, nodes) => {
    const id = getString(value.lhId) ?? getString(value.path);
    if (id) {
        return `id:${id}`;
    }
    const selector = getString(value.selector);
    const snippet = getString(value.snippet);
    if (selector || snippet) {
        return `selector:${selector ?? ''}|${snippet ?? ''}`;
    }
    // Nodes without any identifying fields cannot be deduplicated reliably, so
    // each one gets a unique key.
    return `unidentified:${nodes.size}`;
};
// Recursively collects node values from audit details. Walking the details
// generically covers tables and lists of tables alike. Sub-items are skipped:
// for axe audits they hold related context (e.g. the background element for
// `color-contrast`) rather than failing elements.
const collectNodes = (value, nodes) => {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectNodes(item, nodes);
        }
        return;
    }
    if (!isRecord(value) ||
        value.type === 'debugdata' ||
        value.type === 'subitems') {
        return;
    }
    if (value.type === 'node') {
        const key = getNodeKey(value, nodes);
        // Merge duplicates so that fields such as `explanation` are kept
        // regardless of which occurrence carries them.
        nodes.set(key, { ...toAuditNode(value), ...nodes.get(key) });
        return;
    }
    for (const [name, child] of Object.entries(value)) {
        if (name === 'subItems') {
            continue;
        }
        collectNodes(child, nodes);
    }
};
const getFailedAudits = (lhr) => {
    const categoriesByAudit = new Map();
    for (const category of Object.values(lhr.categories)) {
        for (const ref of category.auditRefs) {
            const categoryIds = categoriesByAudit.get(ref.id) ?? [];
            categoryIds.push(category.id);
            categoriesByAudit.set(ref.id, categoryIds);
        }
    }
    const failedAudits = [];
    for (const audit of Object.values(lhr.audits)) {
        if (audit.score === null || audit.score >= 1) {
            continue;
        }
        const nodes = new Map();
        collectNodes(audit.details, nodes);
        const failedAudit = {
            id: audit.id,
            title: audit.title,
            score: audit.score,
            categories: categoriesByAudit.get(audit.id) ?? [],
            nodes: [...nodes.values()].slice(0, MAX_NODES_PER_AUDIT),
            totalNodes: nodes.size,
        };
        if (audit.description) {
            failedAudit.description = audit.description;
        }
        if (audit.displayValue) {
            failedAudit.displayValue = audit.displayValue;
        }
        failedAudits.push(failedAudit);
    }
    return failedAudits;
};
export const lighthouseAudit = definePageTool((args) => ({
    name: 'lighthouse_audit',
    description: `Get Lighthouse scores, failing audits, and the DOM nodes they flag for accessibility, SEO, best practices, and agentic browsing. Full reports are saved to disk. This excludes performance. For performance audits, run ${startTrace(args).name}`,
    annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
    },
    schema: {
        mode: zod
            .enum(['navigation', 'snapshot'])
            .default('navigation')
            .describe('"navigation" reloads & audits. "snapshot" analyzes current state.'),
        device: zod
            .enum(['desktop', 'mobile'])
            .default('desktop')
            .describe('Device to emulate.'),
        outputDirPath: zod
            .string()
            .optional()
            .describe('Directory for reports. If omitted, uses temporary files.'),
    },
    blockedByDialog: true,
    verifyFilesSchema: {
        outputDirPath: true,
    },
    handler: async (request, response, context) => {
        const page = request.page;
        const categories = [
            'accessibility',
            'seo',
            'best-practices',
            'agentic-browsing',
        ];
        const formats = ['json', 'html'];
        const { mode = 'navigation', device = 'desktop', outputDirPath, } = request.params;
        const flags = {
            onlyCategories: categories,
            output: formats,
            // Default 30 second timeout for page load.
            maxWaitForLoad: 30_000,
        };
        if (device === 'desktop') {
            flags.formFactor = 'desktop';
            flags.screenEmulation = {
                mobile: false,
                width: 1350,
                height: 940,
                deviceScaleFactor: 1,
                disabled: false,
            };
            flags.emulatedUserAgent = DESKTOP_USER_AGENT;
        }
        else {
            flags.formFactor = 'mobile';
            flags.screenEmulation = {
                mobile: true,
                width: 412,
                height: 823,
                deviceScaleFactor: 1.75,
                disabled: false,
            };
            flags.emulatedUserAgent = MOBILE_USER_AGENT;
        }
        let result;
        try {
            if (mode === 'navigation') {
                result = await lighthouseRunner.navigation(page.pptrPage, page.pptrPage.url(), {
                    flags,
                });
            }
            else {
                result = await lighthouseRunner.snapshot(page.pptrPage, {
                    flags,
                });
            }
            if (!result) {
                throw new Error('Lighthouse audit failed.');
            }
        }
        finally {
            await page.restoreEmulation();
        }
        const lhr = result.lhr;
        const reportPaths = [];
        const encoder = new TextEncoder();
        const savePromises = formats.map(async (format) => {
            const report = generateReport(lhr, format);
            const data = encoder.encode(report);
            if (outputDirPath) {
                const reportPath = path.join(outputDirPath, `report`);
                const { filename } = await context.saveFile(data, reportPath, `.${format}`);
                return filename;
            }
            const { filepath } = await context.saveTemporaryFile(data, `report.${format}`);
            return filepath;
        });
        const results = await Promise.allSettled(savePromises);
        for (const res of results) {
            if (res.status === 'rejected') {
                throw res.reason;
            }
            reportPaths.push(res.value);
        }
        const categoryScores = Object.values(lhr.categories).map(c => ({
            id: c.id,
            title: c.title,
            score: c.score,
        }));
        const failedAudits = getFailedAudits(lhr);
        const passedAudits = Object.values(lhr.audits).filter(a => a.score === 1).length;
        const output = {
            summary: {
                mode,
                device,
                // `mainDocumentUrl` is only set for navigations, whereas
                // `finalDisplayedUrl` is populated for every gather mode.
                url: lhr.finalDisplayedUrl,
                scores: categoryScores,
                audits: {
                    failed: failedAudits.length,
                    passed: passedAudits,
                },
                timing: {
                    total: lhr.timing.total,
                },
            },
            failedAudits,
            reports: reportPaths,
        };
        response.attachLighthouseResult(output);
    },
}));
//# sourceMappingURL=lighthouse.js.map