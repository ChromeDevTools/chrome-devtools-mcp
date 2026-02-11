/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tools for discovering and listing CDP targets (pages, iframes, webviews).
 */

import {getAllTargets, getAttachedTargets} from '../vscode.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

const TargetInfoSchema = zod.object({
  targetId: zod.string(),
  type: zod.string(),
  title: zod.string(),
  url: zod.string(),
  attached: zod.boolean(),
});

const ListTargetsOutputSchema = zod.object({
  total: zod.number(),
  attached: zod.number(),
  targets: zod.array(TargetInfoSchema),
});

export const listTargets = defineTool({
  name: 'list_targets',
  description: `List all CDP targets (pages, iframes, webviews, service workers) available for debugging.

This tool discovers all targets in the debug session, including:
- Main VS Code window (page)
- OOPIF webviews (iframe type)
- Service workers
- Other browser contexts

Args:
  - type (string): Filter by target type ('page', 'iframe', 'service_worker', etc.). Optional.
  - attachedOnly (boolean): Only show attached targets. Default: false.
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { total, attached, targets: [{ targetId, type, title, url, attached }] }
  Markdown format: Formatted list of targets with status

Use Cases:
  - Debugging which webviews are available
  - Checking if specific targets are attached for interaction
  - Understanding the structure of the VS Code debug session`,
  timeoutMs: 10000,
  annotations: {
    category: ToolCategory.DEV_DIAGNOSTICS,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['standalone'],
  },
  schema: {
    response_format: responseFormatSchema,
    type: zod
      .string()
      .optional()
      .describe(
        'Filter targets by type (e.g., "page", "iframe", "service_worker"). Omit to show all types.',
      ),
    attachedOnly: zod
      .boolean()
      .optional()
      .describe(
        'Only show targets that are currently attached. Default: false.',
      ),
  },
  outputSchema: ListTargetsOutputSchema,
  handler: async (request, response) => {
    const {type: typeFilter, attachedOnly} = request.params;

    // Get all targets from CDP
    const allTargets = await getAllTargets();
    
    // Get attached targets for comparison
    const attachedTargetIds = new Set(
      getAttachedTargets().map(t => t.targetId)
    );

    // Filter and transform targets
    let targets = allTargets.map(t => ({
      targetId: t.targetId,
      type: t.type,
      title: t.title || '(untitled)',
      url: t.url || '',
      attached: t.attached || attachedTargetIds.has(t.targetId),
    }));

    // Apply filters
    if (typeFilter) {
      targets = targets.filter(t => t.type === typeFilter);
    }
    if (attachedOnly) {
      targets = targets.filter(t => t.attached);
    }

    const attachedCount = targets.filter(t => t.attached).length;

    if (request.params.response_format === ResponseFormat.JSON) {
      const output = {
        total: targets.length,
        attached: attachedCount,
        targets,
      };
      response.appendResponseLine(JSON.stringify(output, null, 2));
      return;
    }

    // Markdown format
    response.appendResponseLine('## CDP Targets');
    response.appendResponseLine('');
    response.appendResponseLine(
      `Found **${targets.length}** target(s) (${attachedCount} attached)`
    );
    response.appendResponseLine('');

    if (targets.length === 0) {
      response.appendResponseLine('_No targets found matching the filter._');
      return;
    }

    // Group by type for better readability
    const byType = new Map<string, typeof targets>();
    for (const target of targets) {
      const existing = byType.get(target.type) ?? [];
      existing.push(target);
      byType.set(target.type, existing);
    }

    for (const [targetType, typeTargets] of byType) {
      response.appendResponseLine(`### ${targetType} (${typeTargets.length})`);
      response.appendResponseLine('');
      
      for (const target of typeTargets) {
        const status = target.attached ? '✅' : '⚪';
        const title = target.title.length > 50 
          ? target.title.substring(0, 47) + '...' 
          : target.title;
        response.appendResponseLine(
          `${status} **${title}**`
        );
        if (target.url) {
          const displayUrl = target.url.length > 80 
            ? target.url.substring(0, 77) + '...' 
            : target.url;
          response.appendResponseLine(`   URL: \`${displayUrl}\``);
        }
        response.appendResponseLine(`   ID: \`${target.targetId}\``);
        response.appendResponseLine('');
      }
    }
  },
});
