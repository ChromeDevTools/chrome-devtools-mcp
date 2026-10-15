// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import { LighthouseFormatter } from '../data_formatters/LighthouseFormatter.js';
export class GetLighthouseAuditsTool {
    name = "getLighthouseAudits" /* ToolName.GET_LIGHTHOUSE_AUDITS */;
    permissionPrompt = "never" /* PermissionPrompt.NEVER */;
    description = 'Retrieves audit results and diagnostic details from the active Lighthouse report for all categories (using categoryId: "all") or a specific category (e.g., \'accessibility\').';
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: 'Arguments for retrieving Lighthouse category audits.',
        nullable: false,
        properties: {
            categoryId: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'The category of audits to retrieve. Use "all" to retrieve the full report and all categories, or specify a category: "accessibility", "performance", "best-practices", "seo".',
                nullable: false,
            },
        },
        required: ['categoryId'],
    };
    displayInfoFromArgs(params) {
        return {
            title: `Getting Lighthouse audits for ${params.categoryId}`,
            action: `getLighthouseAudits('${params.categoryId}')`,
        };
    }
    async handler(params, context) {
        const report = context.getLighthouseReport();
        if (!report) {
            return { error: 'Error: Active context is not a Lighthouse report.' };
        }
        const audits = new LighthouseFormatter().formatReport(report, params.categoryId);
        return {
            result: { audits },
        };
    }
}
//# sourceMappingURL=GetLighthouseAudits.js.map