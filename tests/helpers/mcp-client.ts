/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP Test Client - Connects to MCP server for integration testing.
 *
 * This client spawns the MCP server as a subprocess and communicates via stdio,
 * which is the standard MCP transport. This approach:
 * 1. Tests the actual MCP protocol flow
 * 2. Works with the existing hot-reload infrastructure (server rebuilds on source change)
 * 3. Mirrors how Copilot actually connects to the server
 */

import {spawn, type ChildProcess} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline';

import type {McpToolResult, ParsedToolResult, McpTestClientOptions} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the MCP server entry point
const MCP_SERVER_PATH = resolve(__dirname, '../../build/src/index.js');

// Default workspace path for testing - uses the test-workspace folder
const DEFAULT_WORKSPACE_PATH = resolve(__dirname, '../../../test-workspace');

/**
 * JSON-RPC 2.0 request structure
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 response structure
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP Test Client - Manages MCP server subprocess and JSON-RPC communication.
 */
export class McpTestClient {
  private process: ChildProcess | undefined;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private responseBuffer = '';
  private isInitialized = false;
  private readonly timeout: number;
  private readonly workspacePath: string;

  constructor(options: McpTestClientOptions = {}) {
    this.timeout = options.timeout ?? 120_000;
    this.workspacePath = options.workspacePath ?? DEFAULT_WORKSPACE_PATH;
  }

  /**
   * Start the MCP server subprocess and initialize the connection.
   */
  async connect(): Promise<void> {
    if (this.process) {
      return; // Already connected
    }

    const proc = spawn('node', [MCP_SERVER_PATH, '--workspace', this.workspacePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Disable debug output to keep stdio clean
        DEBUG: '',
      },
    });

    this.process = proc;

    // Set up stdout reading for JSON-RPC responses
    if (proc.stdout) {
      const rl = readline.createInterface({input: proc.stdout});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rl as unknown as {on: (event: string, listener: (line: string) => void) => void}).on(
        'line',
        (line: string) => this.handleLine(line),
      );
    }

    // Log stderr for debugging
    if (proc.stderr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (proc.stderr as unknown as {on: (event: string, listener: (data: Buffer) => void) => void}).on(
        'data',
        (_data: Buffer) => {
          // Optionally log stderr for debugging
          // console.error('[MCP stderr]', _data.toString());
        },
      );
    }

    // Handle process exit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (proc as unknown as {on: (event: string, listener: (code: number | null) => void) => void}).on(
      'exit',
      (code: number | null) => {
      this.process = undefined;
      this.isInitialized = false;
      // Reject all pending requests
      for (const [_id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`MCP server exited with code ${code}`));
      }
      this.pendingRequests.clear();
    });

    // Initialize the MCP connection
    await this.initialize();
  }

  /**
   * Send the MCP initialize request.
   */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'vitest-mcp-client',
        version: '1.0.0',
      },
    });

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});

    this.isInitialized = true;
  }

  /**
   * Call an MCP tool and return the parsed result.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ParsedToolResult> {
    if (!this.isInitialized) {
      await this.connect();
    }

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }) as McpToolResult;

    return this.parseToolResult(result);
  }

  /**
   * List available tools.
   */
  async listTools(): Promise<Array<{name: string; description: string}>> {
    if (!this.isInitialized) {
      await this.connect();
    }

    const result = await this.sendRequest('tools/list', {}) as {
      tools: Array<{name: string; description: string}>;
    };

    return result.tools;
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
      this.isInitialized = false;
    }
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('MCP server not connected'));
        return;
      }

      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      const message = JSON.stringify(request) + '\n';
      this.process.stdin.write(message);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) {
      return;
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  /**
   * Handle a line of output from the MCP server.
   */
  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    try {
      const response = JSON.parse(line) as JsonRpcResponse;

      if (response.id !== undefined) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);

          if (response.error) {
            pending.reject(new Error(`MCP error: ${response.error.message}`));
          } else {
            pending.resolve(response.result);
          }
        }
      }
      // Ignore notifications (no id)
    } catch {
      // Ignore non-JSON lines (debug output, etc.)
    }
  }

  /**
   * Parse the raw MCP tool result into a more usable format.
   */
  private parseToolResult(result: McpToolResult): ParsedToolResult {
    // Combine all text content
    const textParts = result.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text);
    const text = textParts.join('\n');

    // Try to parse JSON from text
    // The response may contain JSON followed by markdown (terminal sessions),
    // so we need to extract just the JSON portion
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // Try to extract JSON if it starts with { or [
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        // Find the end of the JSON by looking for the separator
        const separatorIdx = text.indexOf('\n---\n');
        if (separatorIdx > 0) {
          const jsonPart = text.slice(0, separatorIdx).trim();
          try {
            json = JSON.parse(jsonPart);
          } catch {
            // Still not valid JSON
          }
        }
      }
    }

    return {
      raw: result,
      text,
      json,
      isError: result.isError ?? false,
      errorMessage: result.isError ? text : undefined,
    };
  }
}

/**
 * Global client instance for test convenience.
 */
let globalClient: McpTestClient | undefined;

/**
 * Get or create the global MCP test client.
 */
export function getTestClient(options?: McpTestClientOptions): McpTestClient {
  if (!globalClient) {
    globalClient = new McpTestClient(options);
  }
  return globalClient;
}

/**
 * Cleanup the global client - call this in afterAll().
 */
export async function cleanupTestClient(): Promise<void> {
  if (globalClient) {
    await globalClient.disconnect();
    globalClient = undefined;
  }
}
