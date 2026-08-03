/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

interface HeapUsage {
  usedSize: number;
  totalSize: number;
}

interface Measurement extends HeapUsage {
  label: string;
  timestamp: string;
}

interface ProfileOptions {
  iterations: number;
  warmupIterations: number;
}

interface PendingRequest {
  reject(error: Error): void;
  resolve(result: unknown): void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function parsePositiveInteger(value: string | undefined, name: string): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

class InspectorClient {
  readonly #pending = new Map<number, PendingRequest>();
  #nextId = 1;
  #snapshotStream: fs.WriteStream | undefined;
  readonly #webSocket: WebSocket;

  private constructor(webSocket: WebSocket) {
    this.#webSocket = webSocket;
    webSocket.addEventListener('message', event => {
      this.#handleMessage(event.data);
    });
  }

  static connect(url: string): Promise<InspectorClient> {
    return new Promise((resolve, reject) => {
      const webSocket = new WebSocket(url);
      webSocket.addEventListener('open', () => {
        resolve(new InspectorClient(webSocket));
      });
      webSocket.addEventListener('error', () => {
        reject(new Error(`Failed to connect to Node inspector at ${url}`));
      });
    });
  }

  #handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      return;
    }
    const message: unknown = JSON.parse(data);
    if (!isObject(message)) {
      return;
    }

    if (message.method === 'HeapProfiler.addHeapSnapshotChunk') {
      const params = message.params;
      if (
        this.#snapshotStream &&
        isObject(params) &&
        typeof params.chunk === 'string'
      ) {
        this.#snapshotStream.write(params.chunk);
      }
      return;
    }

    if (typeof message.id !== 'number') {
      return;
    }
    const pending = this.#pending.get(message.id);
    if (!pending) {
      return;
    }
    this.#pending.delete(message.id);
    if (isObject(message.error)) {
      const errorMessage =
        typeof message.error.message === 'string'
          ? message.error.message
          : 'Unknown inspector error';
      pending.reject(new Error(errorMessage));
      return;
    }
    pending.resolve(message.result);
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {resolve, reject});
      this.#webSocket.send(JSON.stringify({id, method, params}));
    });
  }

  async getHeapUsage(): Promise<HeapUsage> {
    await this.send('HeapProfiler.collectGarbage');
    const result = await this.send('Runtime.getHeapUsage');
    if (
      !isObject(result) ||
      typeof result.usedSize !== 'number' ||
      typeof result.totalSize !== 'number'
    ) {
      throw new Error('Node inspector returned invalid heap usage data');
    }
    return {usedSize: result.usedSize, totalSize: result.totalSize};
  }

  async takeHeapSnapshot(filePath: string): Promise<void> {
    const stream = fs.createWriteStream(filePath, {encoding: 'utf8'});
    this.#snapshotStream = stream;
    try {
      await this.send('HeapProfiler.takeHeapSnapshot', {reportProgress: false});
    } finally {
      this.#snapshotStream = undefined;
      await new Promise<void>((resolve, reject) => {
        stream.end(resolve);
        stream.on('error', reject);
      });
    }
  }

  close(): void {
    this.#webSocket.close();
  }
}

function inspectorUrlFrom(transport: StdioClientTransport): Promise<string> {
  const stderr = transport.stderr;
  if (!stderr) {
    throw new Error('MCP server stderr is unavailable');
  }
  return new Promise((resolve, reject) => {
    let buffered = '';
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for the Node inspector URL. Server stderr: ${buffered}`,
        ),
      );
    }, 10_000);
    stderr.setEncoding('utf8');
    stderr.on('data', chunk => {
      if (typeof chunk !== 'string') {
        return;
      }
      buffered += chunk;
      const match = /Debugger listening on (ws:\/\/\S+)/.exec(buffered);
      const url = match?.[1];
      if (url) {
        clearTimeout(timeout);
        resolve(url);
      }
    });
  });
}

async function main(): Promise<void> {
  const {values} = parseArgs({
    options: {
      url: {type: 'string', default: 'https://developers.google.com'},
      'output-dir': {type: 'string'},
      iterations: {type: 'string', default: '10'},
      'warmup-iterations': {type: 'string', default: '10'},
    },
  });
  const options: ProfileOptions = {
    iterations: parsePositiveInteger(values.iterations, '--iterations'),
    warmupIterations: parsePositiveInteger(
      values['warmup-iterations'],
      '--warmup-iterations',
    ),
  };
  const rootDir = path.resolve(import.meta.dirname, '..');
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const outputDir = path.resolve(
    values['output-dir'] ?? path.join(rootDir, 'mcp-heap-profiles', timestamp),
  );
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

  const runIteration = async (): Promise<void> => {
    await client.callTool({
      name: 'navigate_page',
      arguments: {type: 'url', url: values.url},
    });
    await client.callTool({
      name: 'navigate_page',
      arguments: {type: 'url', url: values.url},
    });
    await client.callTool({
      name: 'navigate_page',
      arguments: {type: 'url', url: values.url},
    });
    await client.callTool({
      name: 'navigate_page',
      arguments: {type: 'url', url: values.url},
    });
    await client.callTool({name: 'take_snapshot', arguments: {}});
    await client.callTool({
      name: 'take_screenshot',
      arguments: {
        filePath: path.join(outputDir, 'page.png'),
      },
    });
    await client.callTool({name: 'list_network_requests', arguments: {}});
  };

  const record = async (
    label: string,
    takeSnapshot: boolean,
  ): Promise<void> => {
    if (!inspector) {
      throw new Error('Inspector is not connected');
    }
    const usage = await inspector.getHeapUsage();
    const measurement = {
      label,
      timestamp: new Date().toISOString(),
      ...usage,
    };
    measurements.push(measurement);
    console.log(
      `${label}: used ${formatBytes(usage.usedSize)}, total ${formatBytes(usage.totalSize)}`,
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
    console.log(`MCP server PID: ${transport.pid}`);
    console.log(`Target URL: ${values.url}`);
    console.log(`Output directory: ${outputDir}`);

    await record('connected', false);
    for (
      let iteration = 1;
      iteration <= options.warmupIterations;
      iteration++
    ) {
      console.log(`Warm-up ${iteration}/${options.warmupIterations}`);
      await runIteration();
    }

    // Taking a heap snapshot exercises Node inspector and serialization paths.
    // Prime those paths before capturing the baseline so their JIT-compiled code
    // is not mistaken for workload growth in the final comparison.
    await record('snapshot-primer', true);
    await record('baseline', true);

    for (let iteration = 1; iteration <= options.iterations; iteration++) {
      console.log(`Measured iteration ${iteration}/${options.iterations}`);
      await runIteration();
      await record(`iteration-${iteration}`, false);
    }
    await record('final', true);

    const baseline = measurements.find(
      measurement => measurement.label === 'baseline',
    );
    const final = measurements.find(
      measurement => measurement.label === 'final',
    );
    if (baseline && final) {
      const growth = final.usedSize - baseline.usedSize;
      if (growth > 0) {
        const percentage = (growth / baseline.usedSize) * 100;
        console.warn(
          `The MCP heap grew by ${formatBytes(growth)} (${percentage.toFixed(2)}%) across ${options.iterations} measured iterations. Compare baseline.heapsnapshot with final.heapsnapshot to determine whether retained workload objects accumulated.`,
        );
      } else {
        console.log(
          `The MCP heap did not grow across the measured iterations (${formatBytes(growth)}).`,
        );
      }
    }

    const reportPath = path.join(outputDir, 'heap-usage.json');
    fs.writeFileSync(
      reportPath,
      `${JSON.stringify({pid: transport.pid, url: values.url, options, measurements}, null, 2)}\n`,
    );
    console.log(`Report: ${reportPath}`);
  } finally {
    inspector?.close();
    await client.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
