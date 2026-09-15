/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';

import type {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

import {isObject} from './utils.ts';

export interface HeapUsage {
  usedSize: number;
  totalSize: number;
}

export interface Measurement extends HeapUsage {
  label: string;
  timestamp: string;
}

interface PendingRequest {
  reject(error: Error): void;
  resolve(result: unknown): void;
}

export class InspectorClient {
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

export function inspectorUrlFrom(
  transport: StdioClientTransport,
): Promise<string> {
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
