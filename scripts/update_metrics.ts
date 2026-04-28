/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  cliOptions,
  parseArguments,
} from '../build/src/bin/chrome-devtools-mcp-cli-options.js';
import {
  getPossibleFlagMetrics,
  type FlagMetric,
} from '../build/src/telemetry/flagUtils.js';
import {
  applyToExisting,
  applyToExistingMetrics,
  generateToolMetrics,
  type ToolMetric,
} from '../build/src/telemetry/toolMetricsUtils.js';
import {createTools} from '../build/src/tools/tools.js';

export function HaveUniqueNames(tools: Array<{name: string}>): boolean {
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

  // Avoid 'as ParsedArguments' by using parseArguments
  const fullTools = createTools(parseArguments('0.0.0', ['', '']));
  const slimTools = createTools(parseArguments('0.0.0', ['', '', '--slim']));

  const allTools = [...fullTools, ...slimTools];

  if (!HaveUniqueNames(allTools)) {
    throw new Error('Error: Duplicate tool names found.');
  }

  let existingMetrics: ToolMetric[] = [];
  if (fs.existsSync(outputPath)) {
    try {
      existingMetrics = JSON.parse(
        fs.readFileSync(outputPath, 'utf8'),
      ) as ToolMetric[];
    } catch {
      console.warn(
        `Warning: Failed to parse existing metrics from ${outputPath}. Starting fresh.`,
      );
    }
  }

  const newMetrics = generateToolMetrics(allTools);
  const mergedMetrics = applyToExistingMetrics(existingMetrics, newMetrics);

  fs.writeFileSync(outputPath, JSON.stringify(mergedMetrics, null, 2) + '\n');

  console.log(
    `Successfully wrote ${mergedMetrics.length} total tool metrics (including deprecated ones) to ${outputPath}`,
  );
}

function writeFlagUsageMetrics() {
  const outputPath = path.resolve('src/telemetry/flag_usage_metrics.json');

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    throw new Error(`Error: Directory ${dir} does not exist.`);
  }

  let existingMetrics: FlagMetric[] = [];
  if (fs.existsSync(outputPath)) {
    try {
      existingMetrics = JSON.parse(
        fs.readFileSync(outputPath, 'utf8'),
      ) as FlagMetric[];
    } catch {
      console.warn(
        `Warning: Failed to parse existing metrics from ${outputPath}. Starting fresh.`,
      );
    }
  }

  const newMetrics = getPossibleFlagMetrics(cliOptions);
  const mergedMetrics = applyToExisting<FlagMetric>(
    existingMetrics,
    newMetrics,
  );

  fs.writeFileSync(outputPath, JSON.stringify(mergedMetrics, null, 2) + '\n');

  console.log(
    `Successfully wrote ${mergedMetrics.length} flag usage metrics to ${outputPath}`,
  );
}

function main() {
  writeToolCallMetricsConfig();
  writeFlagUsageMetrics();
}

main();
