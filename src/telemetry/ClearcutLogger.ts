/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {DAEMON_CLIENT_NAME} from '../daemon/utils.js';
import {logger} from '../logger.js';

import type {LocalState, Persistence} from './persistence.js';
import {FilePersistence} from './persistence.js';
import {
  McpClient,
  type FlagUsage,
  WatchdogMessageType,
  OsType,
} from './types.js';
import {WatchdogClient} from './WatchdogClient.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function detectOsType(): OsType {
  switch (process.platform) {
    case 'win32':
      return OsType.OS_TYPE_WINDOWS;
    case 'darwin':
      return OsType.OS_TYPE_MACOS;
    case 'linux':
      return OsType.OS_TYPE_LINUX;
    default:
      return OsType.OS_TYPE_UNSPECIFIED;
  }
}

export class ClearcutLogger {
  #persistence: Persistence;
  #watchdog: WatchdogClient;
  #mcpClient: McpClient;

  constructor(options: {
    appVersion: string;
    logFile?: string;
    persistence?: Persistence;
    watchdogClient?: WatchdogClient;
    clearcutEndpoint?: string;
    clearcutForceFlushIntervalMs?: number;
    clearcutIncludePidHeader?: boolean;
  }) {
    this.#persistence = options.persistence ?? new FilePersistence();
    this.#watchdog =
      options.watchdogClient ??
      new WatchdogClient({
        parentPid: process.pid,
        appVersion: options.appVersion,
        osType: detectOsType(),
        logFile: options.logFile,
        clearcutEndpoint: options.clearcutEndpoint,
        clearcutForceFlushIntervalMs: options.clearcutForceFlushIntervalMs,
        clearcutIncludePidHeader: options.clearcutIncludePidHeader,
      });
    this.#mcpClient = McpClient.MCP_CLIENT_UNSPECIFIED;
  }

  setClientName(clientName: string): void {
    const lowerName = clientName.toLowerCase();
    if (lowerName.includes('claude')) {
      this.#mcpClient = McpClient.MCP_CLIENT_CLAUDE_CODE;
    } else if (lowerName.includes('gemini')) {
      this.#mcpClient = McpClient.MCP_CLIENT_GEMINI_CLI;
    } else if (clientName === DAEMON_CLIENT_NAME) {
      this.#mcpClient = McpClient.MCP_CLIENT_DT_MCP_CLI;
    } else if (lowerName.includes('openclaw')) {
      this.#mcpClient = McpClient.MCP_CLIENT_OPENCLAW;
    } else if (lowerName.includes('codex')) {
      this.#mcpClient = McpClient.MCP_CLIENT_CODEX;
    } else if (lowerName.includes('antigravity')) {
      this.#mcpClient = McpClient.MCP_CLIENT_ANTIGRAVITY;
    } else {
      this.#mcpClient = McpClient.MCP_CLIENT_OTHER;
    }
  }

  async logToolInvocation(args: {
    toolName: string;
    success: boolean;
    latencyMs: number;
  }): Promise<void> {
    this.#watchdog.send({
      type: WatchdogMessageType.LOG_EVENT,
      payload: {
        mcp_client: this.#mcpClient,
        tool_invocation: {
          tool_name: args.toolName,
          success: args.success,
          latency_ms: args.latencyMs,
        },
      },
    });
  }

  async logServerStart(flagUsage: FlagUsage): Promise<void> {
    this.#watchdog.send({
      type: WatchdogMessageType.LOG_EVENT,
      payload: {
        mcp_client: this.#mcpClient,
        server_start: {
          flag_usage: flagUsage,
        },
      },
    });
  }

  async logDailyActiveIfNeeded(): Promise<void> {
    try {
      const state = await this.#persistence.loadState();

      if (this.#shouldLogDailyActive(state)) {
        let daysSince = -1;
        if (state.lastActive) {
          const lastActiveDate = new Date(state.lastActive);
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - lastActiveDate.getTime());
          daysSince = Math.ceil(diffTime / MS_PER_DAY);
        }

        this.#watchdog.send({
          type: WatchdogMessageType.LOG_EVENT,
          payload: {
            mcp_client: this.#mcpClient,
            daily_active: {
              days_since_last_active: daysSince,
            },
          },
        });

        state.lastActive = new Date().toISOString();
        await this.#persistence.saveState(state);
      }
    } catch (err) {
      logger('Error in logDailyActiveIfNeeded:', err);
    }
  }

  #shouldLogDailyActive(state: LocalState): boolean {
    if (!state.lastActive) {
      return true;
    }
    const lastActiveDate = new Date(state.lastActive);
    const now = new Date();

    // Compare UTC dates
    const isSameDay =
      lastActiveDate.getUTCFullYear() === now.getUTCFullYear() &&
      lastActiveDate.getUTCMonth() === now.getUTCMonth() &&
      lastActiveDate.getUTCDate() === now.getUTCDate();

    return !isSameDay;
  }
}
