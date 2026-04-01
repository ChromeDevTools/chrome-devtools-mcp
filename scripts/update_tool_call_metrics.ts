/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {ParsedArguments} from '../build/src/bin/chrome-devtools-mcp-cli-options.js';
import {generateToolMetrics} from '../build/src/telemetry/toolMetricsUtils.js';
import type {ToolDefinition} from '../build/src/tools/ToolDefinition.js';
import {createTools} from '../build/src/tools/tools.js';

export function HaveUniqueNames(tools: ToolDefinition[]): boolean {
  const toolNames = tools.map(tool => tool.name);
  const toolNamesSet = new Set(toolNames);
  return toolNamesSet.size === toolNames.length;
}

function writeToolCallMetricsConfig() {
  const outputPath = path.resolve('src/telemetry/tool_call_metrics.json');

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    throw new Error(`Error: Directory ${dir} does not exist.`);
  }

  const fullTools = createTools({slim: false} as ParsedArguments);
  const slimTools = createTools({slim: true} as ParsedArguments);

  const allTools = [...fullTools, ...slimTools];

  if (!HaveUniqueNames(allTools)) {
    throw new Error('Error: Duplicate tool names found.');
  }

  // Map tools to their metadata
  const toolData = generateToolMetrics(allTools);

  // Sort by name for determinism
  toolData.sort((a, b) => a.name.localeCompare(b.name));

  fs.writeFileSync(outputPath, JSON.stringify(toolData, null, 2) + '\n');

  console.log(
    `Successfully wrote ${toolData.length} tool names with arguments to ${outputPath}`,
  );
}

writeToolCallMetricsConfig();
