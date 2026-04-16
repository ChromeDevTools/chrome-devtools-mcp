/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {cliOptions} from '../build/src/bin/chrome-devtools-mcp-cli-options.js';
import {
  getPossibleFlagMetrics,
  type FlagMetric,
} from '../build/src/telemetry/flagUtils.js';
import {applyToExisting} from '../build/src/telemetry/toolMetricsUtils.js';

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

writeFlagUsageMetrics();
