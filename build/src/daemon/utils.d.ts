/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { YargsOptions } from '../third_party/index.js';
export declare const DAEMON_SCRIPT_PATH: string;
export declare const DAEMON_CLIENT_NAME = "chrome-devtools-cli-daemon";
export declare function assertValidSessionId(sessionId: string): void;
export declare function getSocketPath(sessionId: string): string;
export declare function getRuntimeHome(sessionId: string): string;
export declare const IS_WINDOWS: boolean;
export declare function getPidFilePath(sessionId: string): string;
export declare function getDaemonPid(sessionId: string): number | null;
export declare function isDaemonRunning(sessionId: string): boolean;
export declare function serializeArgs(options: Record<string, YargsOptions>, argv: Record<string, unknown>): string[];
