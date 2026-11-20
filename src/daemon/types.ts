/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type DaemonMessage =
  | {
      method: 'stop';
    }
  | {
      method: 'status';
    }
  | {
      method: 'invoke_tool';
      tool: string;
      args?: Record<string, unknown>;
    };

export interface DaemonResponse {
  success: boolean;
  // Stringified CallToolResult.
  result: string;
  error: unknown;
}

export interface DaemonStatusResult {
  pid: number | null;
  socketPath: string;
  startDate: string;
  version: string;
  // Redacted with `redactDaemonArgsForLogging`, so this is safe to print but
  // is not the daemon's literal argv.
  args: string[];
}
