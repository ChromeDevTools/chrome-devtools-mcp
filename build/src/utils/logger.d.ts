/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import type { Logger } from '../types.js';
export declare function saveLogsToFile(fileName: string): fs.WriteStream;
export declare function flushLogs(logFile: fs.WriteStream, timeoutMs?: number): Promise<void>;
/**
 * Encodes a value for interpolation into a one-line log or error message. The
 * result is a JSON string literal that also escapes DEL, C1 controls and
 * U+2028/U+2029, which JSON.stringify leaves raw but terminals and line
 * readers act on.
 */
export declare function escapeForLog(value: string): string;
/**
 * Redact credentials from URLs used in connection and diagnostic logs.
 * The URL passed to Puppeteer is never modified.
 */
export declare function redactUrlForLogging(value: string): string;
/**
 * Return a redacted copy of the Puppeteer connection options for logging.
 * Keep the actual headers and connection URLs intact for Puppeteer.
 */
export declare function redactConnectOptionsForLogging<T extends {
    headers?: Record<string, string>;
    browserWSEndpoint?: string;
    browserURL?: string;
}>(options: T): T;
/**
 * Filter sensitive CLI arguments in the daemon startup log only.
 * Spawn still receives the original arguments unchanged.
 */
export declare function redactDaemonArgsForLogging(args: readonly string[]): string[];
export declare const logger: Logger;
export declare const puppeteerLogger: (prefix: string) => Logger | undefined;
