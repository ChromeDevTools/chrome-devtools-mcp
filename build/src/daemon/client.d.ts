/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CallToolResult } from '../third_party/index.js';
import type { DaemonMessage, DaemonResponse } from './types.js';
export declare function startDaemon(mcpArgs: string[] | undefined, sessionId: string): Promise<void>;
/**
 * `sendCommand` opens a socket connection sends a single command and disconnects.
 */
export declare function sendCommand(command: DaemonMessage, sessionId: string, timeout?: number): Promise<DaemonResponse>;
export declare function stopDaemon(sessionId: string): Promise<void>;
export declare function verifyDaemonVersion(sessionId: string, cliVersion: string): Promise<string | undefined>;
export declare function handleResponse(response: CallToolResult, format: 'json' | 'md'): Promise<string>;
