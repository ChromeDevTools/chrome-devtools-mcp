/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {spawnSync} from 'node:child_process';
import os from 'node:os';

/**
 * Detect MCP client type from parent process
 * Returns client ID like "claude-code", "codex", "cursor", or "default"
 */
export function detectClientType(): string {
  const ppid = process.ppid;
  if (!ppid) {
    return 'default';
  }

  try {
    const platform = os.platform();

    if (platform === 'darwin' || platform === 'linux') {
      // macOS and Linux: use ps command
      const result = spawnSync('ps', ['-p', String(ppid), '-o', 'comm='], {
        encoding: 'utf8',
        timeout: 500,
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      if (result.status === 0 && result.stdout) {
        const processName = result.stdout.trim().toLowerCase();
        return mapProcessNameToClient(processName);
      }
    } else if (platform === 'win32') {
      // Windows: use wmic command
      const result = spawnSync(
        'wmic',
        ['process', 'where', `ProcessId=${ppid}`, 'get', 'Name', '/value'],
        {
          encoding: 'utf8',
          timeout: 500,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      );

      if (result.status === 0 && result.stdout) {
        const match = result.stdout.match(/Name=(.+)/i);
        if (match) {
          const processName = match[1].trim().toLowerCase();
          return mapProcessNameToClient(processName);
        }
      }
    }
  } catch (error) {
    console.error(`[client-detector] Failed to detect client: ${error}`);
  }

  return 'default';
}

/**
 * Map process name to MCP client ID
 */
function mapProcessNameToClient(processName: string): string {
  // Remove .exe extension (Windows)
  const name = processName.replace(/\.exe$/i, '');

  // Known MCP clients
  if (name.includes('claude')) {
    return 'claude-code';
  }
  if (name.includes('codex')) {
    return 'codex';
  }
  if (name.includes('cursor')) {
    return 'cursor';
  }
  if (name.includes('copilot')) {
    return 'copilot';
  }
  if (name.includes('cline')) {
    return 'cline';
  }
  if (name.includes('continue')) {
    return 'continue';
  }
  if (name.includes('aider')) {
    return 'aider';
  }
  if (name.includes('windsurf')) {
    return 'windsurf';
  }

  // VSCode (could be any MCP client extension)
  if (name.includes('code') || name.includes('vscode')) {
    return 'vscode';
  }

  // Generic node process (fallback to default)
  if (name.includes('node')) {
    return 'default';
  }

  // Unknown process - use sanitized process name
  return name.slice(0, 20); // Max 20 chars
}
