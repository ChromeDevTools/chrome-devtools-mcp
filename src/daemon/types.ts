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
      method: 'invoke_tool';
      tool: string;
      args?: Record<string, unknown>;
    };

export interface DaemonResponse {
  success: boolean;
  result: unknown;
  error: unknown;
}
