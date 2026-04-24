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

function writeFlagUsageMetrics() {
  const outputPath = path.resolve('src/telemetry/flag_usage_metrics.json');

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    throw new Error(`Error: Directory ${dir} does not exist.`);
  }

  const metrics = getPossibleFlagMetrics(cliOptions);

  // Sort metrics by name for deterministic output
  metrics.sort((a: FlagMetric, b: FlagMetric) => a.name.localeCompare(b.name));

  fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2) + '\n');

  console.log(
    `Successfully wrote ${metrics.length} flag usage metrics to ${outputPath}`,
  );
}

writeFlagUsageMetrics();
