/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

import {logger} from './logger.js';

export interface BridgeResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface AttachDebuggerResult {
  attached: boolean;
  port: number;
  name: string;
}

const BRIDGE_TIMEOUT_MS = 10_000;
const ATTACH_TIMEOUT_MS = 15_000;

/**
 * Discover the extension-bridge socket path for a given workspace.
 * Reads bridgeSocketPath from .vscode/devtools.json written by extension-bridge on activation.
 */
export function discoverBridgePath(workspaceFolder: string): string {
  const configPath = path.join(workspaceFolder, '.vscode', 'devtools.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Cannot find devtools.json at ${configPath}.\n` +
        'Ensure VS Code is running with the extension-bridge extension installed and active.\n' +
        'Install: code --install-extension extension-bridge',
    );
  }

  let config: {bridgeSocketPath?: string};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    throw new Error(
      `Failed to parse devtools.json at ${configPath}.\n` +
        `Error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const socketPath = config.bridgeSocketPath;
  if (!socketPath) {
    throw new Error(
      `No bridgeSocketPath in devtools.json at ${configPath}.\n` +
        'The extension-bridge may have failed to start. Check VS Code output panel.',
    );
  }

  logger('Discovered bridge path:', socketPath);
  return socketPath;
}

/**
 * Send an 'exec' command to extension-bridge and wait for response.
 * The code runs in a `new Function('vscode', 'payload', ...)` context.
 * `require()` is NOT available — only `vscode` API and `payload`.
 */
export function bridgeExec(
  bridgePath: string,
  code: string,
  payload?: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(bridgePath);
    const reqId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let response = '';
    client.setEncoding('utf8');

    client.on('connect', () => {
      const request =
        JSON.stringify({id: reqId, action: 'exec', code, payload}) + '\n';
      client.write(request);
    });

    client.on('data', (chunk: string) => {
      response += chunk;
      const nlIdx = response.indexOf('\n');
      if (nlIdx !== -1) {
        try {
          const result = JSON.parse(response.slice(0, nlIdx)) as BridgeResponse;
          client.end();
          if (result.ok) {
            resolve(result.result);
          } else {
            reject(
              new Error(
                `extension-bridge exec failed: ${result.error ?? 'Unknown error'}`,
              ),
            );
          }
        } catch (e) {
          client.end();
          reject(
            new Error(
              `Failed to parse bridge response: ${(e as Error).message}`,
            ),
          );
        }
      }
    });

    client.on('error', (err: Error) => {
      reject(new Error(`Bridge connection error: ${err.message}`));
    });

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`Bridge exec request timed out (${BRIDGE_TIMEOUT_MS}ms)`));
    }, BRIDGE_TIMEOUT_MS);

    client.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Tell the Host bridge to programmatically attach the VS Code debugger.
 * Lights up the full debug UI: orange status bar, floating toolbar, call stack.
 *
 * Uses the bridge's 'attach-debugger' action which calls
 * `vscode.debug.startDebugging(undefined, { type, request: 'attach', port })`.
 */
export function bridgeAttachDebugger(
  bridgePath: string,
  port: number,
  name = `Extension Host (port ${port})`,
): Promise<AttachDebuggerResult> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(bridgePath);
    const reqId = `attach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let response = '';
    client.setEncoding('utf8');

    client.on('connect', () => {
      const request =
        JSON.stringify({
          id: reqId,
          action: 'attach-debugger',
          port,
          type: 'node',
          name,
        }) + '\n';
      client.write(request);
    });

    client.on('data', (chunk: string) => {
      response += chunk;
      const nlIdx = response.indexOf('\n');
      if (nlIdx !== -1) {
        try {
          const result = JSON.parse(response.slice(0, nlIdx)) as BridgeResponse;
          client.end();
          if (result.ok) {
            resolve(result.result as AttachDebuggerResult);
          } else {
            reject(
              new Error(
                `Attach debugger failed: ${result.error ?? 'Unknown error'}`,
              ),
            );
          }
        } catch (e) {
          client.end();
          reject(
            new Error(
              `Failed to parse attach response: ${(e as Error).message}`,
            ),
          );
        }
      }
    });

    client.on('error', (err: Error) => {
      reject(new Error(`Bridge connection error: ${err.message}`));
    });

    const timeout = setTimeout(() => {
      client.destroy();
      reject(
        new Error(
          `Attach debugger request timed out (${ATTACH_TIMEOUT_MS}ms)`,
        ),
      );
    }, ATTACH_TIMEOUT_MS);

    client.on('close', () => {
      clearTimeout(timeout);
    });
  });
}
