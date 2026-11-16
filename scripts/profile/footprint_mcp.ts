/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Measures the idle memory footprint of a freshly launched MCP server.
 *
 * The script launches the server over stdio, completes the MCP handshake
 * (`initialize` and `tools/list`), waits for the process tree to settle and
 * then reads the memory of every process in the tree from the OS. The tree
 * includes the telemetry watchdog when usage statistics are on.
 */

import {execFile} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {parseArgs, promisify} from 'node:util';

import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

import {formatBytes, parseNonNegativeInteger} from './utils.ts';

const execFileAsync = promisify(execFile);

interface ProcessMemory {
  pid: number;
  ppid: number;
  command: string;
  rssBytes: number;
  /** Proportional set size. Linux only. */
  pssBytes?: number;
  /** Private clean + private dirty pages. Linux only. */
  privateBytes?: number;
  /** Swapped out pages. Linux only. */
  swapBytes?: number;
}

interface TreeMeasurement {
  iteration: number;
  timestamp: string;
  processes: ProcessMemory[];
  totals: MemoryTotals;
}

interface MemoryTotals {
  processCount: number;
  rssBytes: number;
  pssBytes?: number;
  privateBytes?: number;
  swapBytes?: number;
}

interface FootprintConfiguration {
  name: string;
  description: string;
  serverArgs: string[];
  usageStatistics: boolean;
  /**
   * Budget for the median private memory of the process tree. The run fails
   * when the measured value exceeds the budget.
   */
  maxPrivateBytes: number;
}

interface ConfigurationResult {
  name: string;
  description: string;
  measurements: TreeMeasurement[];
  median: MemoryTotals;
  maxPrivateBytes: number;
  exceededBudget: boolean;
}

interface FootprintOptions {
  iterations: number;
  settleMs: number;
  ignoreBudgets: boolean;
  /** Overrides of `maxPrivateBytes` by configuration name. */
  budgetOverrides: Map<string, number>;
}

const MiB = 1024 * 1024;

// Budgets are strict: about 3% above the median measured on Linux x64
// (default: 116.8 MiB, no-usage-statistics: 106.6 MiB). Raise a budget only
// together with a change that needs the memory.
const CONFIGURATIONS: FootprintConfiguration[] = [
  {
    name: 'default',
    description: 'usage statistics on (server + telemetry watchdog)',
    serverArgs: ['--usage-statistics'],
    usageStatistics: true,
    maxPrivateBytes: 120 * MiB,
  },
  {
    name: 'no-usage-statistics',
    description: 'usage statistics off (server only)',
    serverArgs: ['--no-usage-statistics'],
    usageStatistics: false,
    maxPrivateBytes: 110 * MiB,
  },
];

function parseKiB(text: string, field: string): number | undefined {
  const match = new RegExp(`^${field}:\\s+(\\d+) kB`, 'm').exec(text);
  const value = match?.[1];
  return value === undefined ? undefined : Number(value) * 1024;
}

function readLinuxSmaps(
  pid: number,
): Pick<ProcessMemory, 'pssBytes' | 'privateBytes' | 'swapBytes'> {
  let text: string;
  try {
    text = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
  } catch {
    return {};
  }
  const privateClean = parseKiB(text, 'Private_Clean');
  const privateDirty = parseKiB(text, 'Private_Dirty');
  return {
    pssBytes: parseKiB(text, 'Pss'),
    privateBytes:
      privateClean === undefined || privateDirty === undefined
        ? undefined
        : privateClean + privateDirty,
    swapBytes: parseKiB(text, 'Swap'),
  };
}

async function listProcesses(): Promise<ProcessMemory[]> {
  if (process.platform === 'win32') {
    throw new Error('footprint_mcp.ts supports Linux and macOS only');
  }
  const {stdout} = await execFileAsync('ps', ['-axo', 'pid=,ppid=,rss=,args=']);
  const processes: ProcessMemory[] = [];
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const [, pid, ppid, rssKiB, command] = match;
    processes.push({
      pid: Number(pid),
      ppid: Number(ppid),
      command: command ?? '',
      rssBytes: Number(rssKiB) * 1024,
    });
  }
  return processes;
}

async function measureTree(
  rootPid: number,
  iteration: number,
): Promise<TreeMeasurement> {
  const all = await listProcesses();
  const byParent = new Map<number, ProcessMemory[]>();
  for (const info of all) {
    const children = byParent.get(info.ppid) ?? [];
    children.push(info);
    byParent.set(info.ppid, children);
  }
  const root = all.find(info => info.pid === rootPid);
  if (!root) {
    throw new Error(`MCP server process ${rootPid} is not running`);
  }
  const tree: ProcessMemory[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    tree.push(current);
    queue.push(...(byParent.get(current.pid) ?? []));
  }

  if (process.platform === 'linux') {
    for (const info of tree) {
      Object.assign(info, readLinuxSmaps(info.pid));
    }
  }

  return {
    iteration,
    timestamp: new Date().toISOString(),
    processes: tree,
    totals: sumTotals(tree),
  };
}

function sumOptional(values: Array<number | undefined>): number | undefined {
  let sum = 0;
  for (const value of values) {
    if (value === undefined) {
      return undefined;
    }
    sum += value;
  }
  return sum;
}

function sumTotals(processes: ProcessMemory[]): MemoryTotals {
  return {
    processCount: processes.length,
    rssBytes: processes.reduce((sum, info) => sum + info.rssBytes, 0),
    pssBytes: sumOptional(processes.map(info => info.pssBytes)),
    privateBytes: sumOptional(processes.map(info => info.privateBytes)),
    swapBytes: sumOptional(processes.map(info => info.swapBytes)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const low = sorted[middle - 1];
  const high = sorted[middle];
  if (high === undefined) {
    throw new Error('median() needs at least one value');
  }
  return sorted.length % 2 === 0 && low !== undefined ? (low + high) / 2 : high;
}

function medianOptional(values: Array<number | undefined>): number | undefined {
  const defined: number[] = [];
  for (const value of values) {
    if (value === undefined) {
      return undefined;
    }
    defined.push(value);
  }
  return median(defined);
}

function medianTotals(measurements: TreeMeasurement[]): MemoryTotals {
  const totals = measurements.map(m => m.totals);
  return {
    processCount: median(totals.map(t => t.processCount)),
    rssBytes: median(totals.map(t => t.rssBytes)),
    pssBytes: medianOptional(totals.map(t => t.pssBytes)),
    privateBytes: medianOptional(totals.map(t => t.privateBytes)),
    swapBytes: medianOptional(totals.map(t => t.swapBytes)),
  };
}

function formatOptional(bytes: number | undefined): string {
  return bytes === undefined ? 'n/a' : formatBytes(bytes);
}

function formatTotals(totals: MemoryTotals): string {
  return `${totals.processCount} process(es), RSS ${formatBytes(totals.rssBytes)}, PSS ${formatOptional(totals.pssBytes)}, private ${formatOptional(totals.privateBytes)}, swap ${formatOptional(totals.swapBytes)}`;
}

function shortCommand(command: string): string {
  return command
    .split(' ')
    .map(part => (part.includes('/') ? path.basename(part) : part))
    .join(' ');
}

/**
 * Accepts telemetry uploads so that the default configuration never sends
 * data off the machine.
 */
async function startMockClearcutServer(): Promise<{
  url: string;
  close(): Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({next_request_wait_millis: 60_000}));
    });
  });
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Mock Clearcut server did not report a TCP port');
  }
  const port: number = (address satisfies AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      }),
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pids: number[], timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every(pid => !isProcessAlive(pid))) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  for (const pid of pids) {
    if (isProcessAlive(pid)) {
      console.warn(`Process ${pid} did not exit. Sending SIGKILL.`);
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // The process exited between the check and the kill.
      }
    }
  }
}

async function launchAndMeasure(
  configuration: FootprintConfiguration,
  iteration: number,
  options: FootprintOptions,
  rootDir: string,
  clearcutUrl: string,
): Promise<TreeMeasurement> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  // Keep the run hermetic: no network update checks and no config files from
  // the developer's home directory.
  env.CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS = 'true';
  env.CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY = 'true';
  if (configuration.usageStatistics) {
    // CI and the env var below force usage statistics off. The flag on the
    // command line must win so that the watchdog is part of the measurement.
    delete env.CI;
    delete env.CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS;
  } else {
    env.CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS = 'true';
  }

  const args = [
    path.join(rootDir, 'out/Default/gen/src/bin/chrome-devtools-mcp.js'),
    '--headless',
    '--isolated',
    ...configuration.serverArgs,
  ];
  if (configuration.usageStatistics) {
    args.push(`--clearcutEndpoint=${clearcutUrl}`);
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    env,
    stderr: 'pipe',
  });
  const client = new Client(
    {name: 'mcp-footprint-profiler', version: '1.0.0'},
    {capabilities: {}},
  );

  let treePids: number[] = [];
  try {
    await client.connect(transport);
    const pid = transport.pid;
    if (pid === null) {
      throw new Error('MCP server did not start');
    }
    await client.listTools();
    await new Promise(resolve => setTimeout(resolve, options.settleMs));
    const measurement = await measureTree(pid, iteration);
    treePids = measurement.processes.map(info => info.pid);
    return measurement;
  } finally {
    await client.close();
    await waitForExit(treePids, 5_000);
  }
}

async function profileConfiguration(
  configuration: FootprintConfiguration,
  options: FootprintOptions,
  rootDir: string,
  clearcutUrl: string,
): Promise<ConfigurationResult> {
  console.log(`\n=== Configuration: ${configuration.name} ===`);
  console.log(configuration.description);
  const measurements: TreeMeasurement[] = [];
  for (let iteration = 1; iteration <= options.iterations; iteration++) {
    const measurement = await launchAndMeasure(
      configuration,
      iteration,
      options,
      rootDir,
      clearcutUrl,
    );
    measurements.push(measurement);
    console.log(
      `[${configuration.name}] launch ${iteration}/${options.iterations}: ${formatTotals(measurement.totals)}`,
    );
    for (const info of measurement.processes) {
      console.log(
        `  pid ${info.pid}: RSS ${formatBytes(info.rssBytes)}, PSS ${formatOptional(info.pssBytes)}, private ${formatOptional(info.privateBytes)}: ${shortCommand(info.command)}`,
      );
    }
  }

  const medianValues = medianTotals(measurements);
  const maxPrivateBytes =
    options.budgetOverrides.get(configuration.name) ??
    configuration.maxPrivateBytes;
  const exceededBudget =
    !options.ignoreBudgets &&
    medianValues.privateBytes !== undefined &&
    medianValues.privateBytes > maxPrivateBytes;
  console.log(
    `[${configuration.name}] median over ${options.iterations} launch(es): ${formatTotals(medianValues)}`,
  );
  return {
    name: configuration.name,
    description: configuration.description,
    measurements,
    median: medianValues,
    maxPrivateBytes,
    exceededBudget,
  };
}

function parseBudgetOverrides(
  entries: string[] | undefined,
): Map<string, number> {
  const overrides = new Map<string, number>();
  for (const entry of entries ?? []) {
    const separator = entry.indexOf('=');
    const name = entry.slice(0, separator);
    const megabytes = Number(entry.slice(separator + 1));
    if (
      separator === -1 ||
      !CONFIGURATIONS.some(c => c.name === name) ||
      !(megabytes > 0)
    ) {
      throw new Error(
        `--max-private-mb expects <configuration>=<MiB> with a positive number, got "${entry}". Available configurations: ${CONFIGURATIONS.map(c => c.name).join(', ')}`,
      );
    }
    overrides.set(name, megabytes * MiB);
  }
  return overrides;
}

async function main(): Promise<void> {
  const {values} = parseArgs({
    options: {
      'output-dir': {type: 'string'},
      iterations: {type: 'string'},
      'settle-ms': {type: 'string'},
      configuration: {type: 'string'},
      'max-private-mb': {type: 'string', multiple: true},
      'ignore-budgets': {type: 'boolean', default: false},
    },
  });

  const options: FootprintOptions = {
    iterations:
      values.iterations === undefined
        ? 3
        : parseNonNegativeInteger(values.iterations, '--iterations'),
    settleMs:
      values['settle-ms'] === undefined
        ? 3_000
        : parseNonNegativeInteger(values['settle-ms'], '--settle-ms'),
    ignoreBudgets: values['ignore-budgets'],
    budgetOverrides: parseBudgetOverrides(values['max-private-mb']),
  };
  if (options.iterations === 0) {
    throw new Error('--iterations must be at least 1');
  }

  const configurations =
    values.configuration === undefined
      ? CONFIGURATIONS
      : CONFIGURATIONS.filter(c => c.name === values.configuration);
  if (configurations.length === 0) {
    throw new Error(
      `Configuration "${values.configuration}" not found. Available configurations: ${CONFIGURATIONS.map(c => c.name).join(', ')}`,
    );
  }

  const rootDir = path.resolve(import.meta.dirname, '../..');
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const outputDir = path.resolve(
    values['output-dir'] ??
      path.join(rootDir, 'mcp-footprint-profiles', timestamp),
  );
  fs.mkdirSync(outputDir, {recursive: true});

  console.log(
    `Platform: ${process.platform} ${os.arch()}, Node ${process.version}`,
  );
  console.log(
    `Launches per configuration: ${options.iterations}, settle time: ${options.settleMs} ms`,
  );
  if (options.ignoreBudgets) {
    console.log('Private memory budgets are ignored (--ignore-budgets).');
  } else if (process.platform !== 'linux') {
    console.warn(
      `Private memory is not available on ${process.platform}. Budgets are not checked.`,
    );
  }

  const clearcut = await startMockClearcutServer();
  const results: ConfigurationResult[] = [];
  try {
    for (const configuration of configurations) {
      results.push(
        await profileConfiguration(
          configuration,
          options,
          rootDir,
          clearcut.url,
        ),
      );
    }
  } finally {
    await clearcut.close();
  }

  const reportPath = path.join(outputDir, 'footprint.json');
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        platform: process.platform,
        arch: os.arch(),
        node: process.version,
        options: {
          ...options,
          budgetOverrides: Object.fromEntries(options.budgetOverrides),
        },
        results,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nReport: ${reportPath}`);

  console.log('\n=== Summary ===');
  let hasFailures = false;
  for (const result of results) {
    const line = `[${result.name}] median private ${formatOptional(result.median.privateBytes)}, budget ${formatBytes(result.maxPrivateBytes)} (${formatTotals(result.median)})`;
    if (result.exceededBudget) {
      hasFailures = true;
      console.error(`${line}: exceeds the budget.`);
    } else {
      console.log(line);
    }
  }

  if (hasFailures) {
    console.error(
      '\nIdle private memory exceeded the budget for one or more configurations.',
    );
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
