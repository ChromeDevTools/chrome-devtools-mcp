/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

import {
  InspectorClient,
  inspectorUrlFrom,
  type Measurement,
} from './inspector.ts';
import {startSourceMapTestServer} from './source_map_server.ts';
import type {ProfileScenario, ScenarioArgs} from './types.ts';
import {
  formatBytes,
  isScenarioModule,
  parseNonNegativeInteger,
} from './utils.ts';

interface ProfileOptions {
  iterations: number;
  warmupIterations: number;
  thresholdPercentage?: number;
}

interface ScenarioEntry {
  name: string;
  scenario: ProfileScenario;
}

async function loadScenario(filePath: string): Promise<ProfileScenario> {
  const fileUrl = pathToFileURL(filePath).href;
  const importedModule: unknown = await import(fileUrl);
  if (!isScenarioModule(importedModule)) {
    throw new Error(
      `Scenario file ${filePath} does not export a 'get' function.`,
    );
  }
  return importedModule;
}

async function discoverScenarios(
  scenariosDir: string,
  scenarioFilter?: string,
): Promise<ScenarioEntry[]> {
  const entries = fs.readdirSync(scenariosDir);
  const scenarioFiles: string[] = [];

  for (const entry of entries) {
    if (entry.endsWith('.ts') || entry.endsWith('.js')) {
      scenarioFiles.push(entry);
    }
  }

  if (scenarioFilter !== undefined && scenarioFilter.length > 0) {
    const normalizedFilter =
      scenarioFilter.endsWith('.ts') || scenarioFilter.endsWith('.js')
        ? scenarioFilter
        : `${scenarioFilter}.ts`;
    const targetFile = scenarioFiles.find(
      file => file === scenarioFilter || file === normalizedFilter,
    );
    if (!targetFile) {
      throw new Error(
        `Scenario "${scenarioFilter}" not found in ${scenariosDir}. Available scenarios: ${scenarioFiles.map(f => path.basename(f, path.extname(f))).join(', ')}`,
      );
    }
    const scenario = await loadScenario(path.join(scenariosDir, targetFile));
    return [
      {name: path.basename(targetFile, path.extname(targetFile)), scenario},
    ];
  }

  const results: ScenarioEntry[] = [];
  for (const file of scenarioFiles) {
    const scenario = await loadScenario(path.join(scenariosDir, file));
    results.push({name: path.basename(file, path.extname(file)), scenario});
  }
  return results;
}

interface ScenarioResult {
  name: string;
  summary: string;
  isGrowth: boolean;
  exceededThreshold: boolean;
}

async function profileScenario(
  scenarioEntry: ScenarioEntry,
  scenarioArgs: ScenarioArgs,
  options: ProfileOptions,
  rootDir: string,
): Promise<ScenarioResult> {
  const {name: scenarioName, scenario} = scenarioEntry;
  const {outputDir} = scenarioArgs;
  fs.mkdirSync(outputDir, {recursive: true});

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS = 'true';

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      '--inspect=127.0.0.1:0',
      path.join(rootDir, 'build/src/bin/chrome-devtools-mcp.js'),
      '--headless',
      '--isolated',
    ],
    env,
    stderr: 'pipe',
  });
  const inspectorUrlPromise = inspectorUrlFrom(transport);
  const client = new Client(
    {name: 'mcp-heap-profiler', version: '1.0.0'},
    {capabilities: {}},
  );
  let inspector: InspectorClient | undefined;
  const measurements: Measurement[] = [];

  const toolCalls = await scenario.get(scenarioArgs);

  const runIteration = async (): Promise<void> => {
    const results: unknown[] = [];
    for (const call of toolCalls) {
      let args: Record<string, unknown> | undefined;
      if (typeof call.arguments === 'function') {
        const resolved = await call.arguments({results});
        args = resolved;
      } else {
        args = call.arguments;
      }
      const result = await client.callTool({
        name: call.name,
        arguments: args,
      });
      results.push(result);
    }
  };

  const record = async (
    label: string,
    takeSnapshot: boolean,
  ): Promise<void> => {
    if (!inspector) {
      throw new Error('Inspector is not connected');
    }
    const usage = await inspector.getHeapUsage();
    const measurement: Measurement = {
      label,
      timestamp: new Date().toISOString(),
      ...usage,
    };
    measurements.push(measurement);
    console.log(
      `[${scenarioName}] ${label}: used ${formatBytes(usage.usedSize)}, total ${formatBytes(usage.totalSize)}`,
    );
    if (!takeSnapshot) {
      return;
    }
    const snapshotPath = path.join(outputDir, `${label}.heapsnapshot`);
    await inspector.takeHeapSnapshot(snapshotPath);
    console.log(`  snapshot: ${snapshotPath}`);
  };

  try {
    await client.connect(transport);
    inspector = await InspectorClient.connect(await inspectorUrlPromise);
    console.log(`\n=== Scenario: ${scenarioName} ===`);
    console.log(`MCP server PID: ${transport.pid}`);
    console.log(`Target URL: ${scenarioArgs.targetUrl}`);
    console.log(`Output directory: ${outputDir}`);

    await record('connected', false);
    for (
      let iteration = 1;
      iteration <= options.warmupIterations;
      iteration++
    ) {
      console.log(
        `[${scenarioName}] Warm-up ${iteration}/${options.warmupIterations}`,
      );
      await runIteration();
    }

    // Taking a heap snapshot exercises Node inspector and serialization paths.
    // Prime those paths before capturing the baseline so their JIT-compiled code
    // is not mistaken for workload growth in the final comparison.
    await record('snapshot-primer', true);
    await record('baseline', true);

    for (let iteration = 1; iteration <= options.iterations; iteration++) {
      console.log(
        `[${scenarioName}] Measured iteration ${iteration}/${options.iterations}`,
      );
      await runIteration();
      await record(`iteration-${iteration}`, false);
    }
    await record('final', true);

    let summary = `[${scenarioName}] Unable to compute heap comparison.`;
    let isGrowth = false;
    let exceededThreshold = false;
    const baseline = measurements.find(
      measurement => measurement.label === 'baseline',
    );
    const final = measurements.find(
      measurement => measurement.label === 'final',
    );
    if (baseline && final) {
      const growth = final.usedSize - baseline.usedSize;
      if (growth > 0) {
        isGrowth = true;
        const percentage = (growth / baseline.usedSize) * 100;
        if (
          options.thresholdPercentage !== undefined &&
          percentage > options.thresholdPercentage
        ) {
          exceededThreshold = true;
          summary = `[${scenarioName}] FAIL: The MCP heap grew by ${formatBytes(growth)} (${percentage.toFixed(2)}%) across ${options.iterations} measured iterations, exceeding the threshold of ${options.thresholdPercentage}%. Compare baseline.heapsnapshot with final.heapsnapshot to determine whether retained workload objects accumulated.`;
          console.error(summary);
        } else {
          summary = `[${scenarioName}] The MCP heap grew by ${formatBytes(growth)} (${percentage.toFixed(2)}%) across ${options.iterations} measured iterations. Compare baseline.heapsnapshot with final.heapsnapshot to determine whether retained workload objects accumulated.`;
          console.warn(summary);
        }
      } else {
        summary = `[${scenarioName}] The MCP heap did not grow across the measured iterations (${formatBytes(growth)}).`;
        console.log(summary);
      }
    }

    const reportPath = path.join(outputDir, 'heap-usage.json');
    fs.writeFileSync(
      reportPath,
      `${JSON.stringify({scenario: scenarioName, pid: transport.pid, url: scenarioArgs.targetUrl, options, measurements}, null, 2)}\n`,
    );
    console.log(`Report: ${reportPath}`);

    return {name: scenarioName, summary, isGrowth, exceededThreshold};
  } finally {
    inspector?.close();
    await client.close();
  }
}

async function main(): Promise<void> {
  const {values} = parseArgs({
    options: {
      'output-dir': {type: 'string'},
      iterations: {type: 'string'},
      'warmup-iterations': {type: 'string'},
      scenario: {type: 'string'},
      url: {type: 'string'},
      'threshold-percentage': {type: 'string'},
    },
  });

  const cliIterations =
    values.iterations !== undefined
      ? parseNonNegativeInteger(values.iterations, '--iterations')
      : undefined;
  const cliWarmupIterations =
    values['warmup-iterations'] !== undefined
      ? parseNonNegativeInteger(
          values['warmup-iterations'],
          '--warmup-iterations',
        )
      : undefined;
  const thresholdPercentage =
    values['threshold-percentage'] !== undefined
      ? Number(values['threshold-percentage'])
      : undefined;

  const rootDir = path.resolve(import.meta.dirname, '../..');
  const scenariosDir = path.join(import.meta.dirname, 'scenarios');
  const scenarios = await discoverScenarios(scenariosDir, values.scenario);

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const baseOutputDir = path.resolve(
    values['output-dir'] ?? path.join(rootDir, 'mcp-heap-profiles', timestamp),
  );
  fs.mkdirSync(baseOutputDir, {recursive: true});

  const sourceMapTestServer = await startSourceMapTestServer();
  const targetUrl = values.url ?? sourceMapTestServer.url;

  const results: ScenarioResult[] = [];
  try {
    console.log(
      `Source map test server listening at: ${sourceMapTestServer.url}`,
    );
    if (values.url !== undefined) {
      console.log(`Using custom target URL: ${targetUrl}`);
    }
    console.log(`Scenarios to run: ${scenarios.map(s => s.name).join(', ')}`);

    for (const scenarioEntry of scenarios) {
      const scenarioDefaults =
        scenarioEntry.scenario.getNumIterations?.() ?? {};
      const iterations = cliIterations ?? scenarioDefaults.iterations ?? 10;
      const warmupIterations =
        cliWarmupIterations ?? scenarioDefaults.warmupIterations ?? 10;

      if (iterations === 0 && warmupIterations === 0) {
        throw new Error(
          `--iterations and --warmup-iterations cannot both be 0 for scenario "${scenarioEntry.name}"`,
        );
      }

      const options: ProfileOptions = {
        iterations,
        warmupIterations,
        thresholdPercentage,
      };

      const scenarioOutputDir =
        scenarios.length === 1 && values['output-dir'] !== undefined
          ? baseOutputDir
          : path.join(baseOutputDir, scenarioEntry.name);

      const scenarioArgs: ScenarioArgs = {
        targetUrl,
        outputDir: scenarioOutputDir,
      };

      const result = await profileScenario(
        scenarioEntry,
        scenarioArgs,
        options,
        rootDir,
      );
      results.push(result);
    }
  } finally {
    await sourceMapTestServer.close();
  }

  console.log('\n=== Summary ===');
  let hasFailures = false;
  for (const result of results) {
    if (result.exceededThreshold) {
      hasFailures = true;
      console.error(result.summary);
    } else if (result.isGrowth) {
      console.warn(result.summary);
    } else {
      console.log(result.summary);
    }
  }

  if (hasFailures) {
    console.error(
      '\nMemory growth threshold exceeded for one or more scenarios.',
    );
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
