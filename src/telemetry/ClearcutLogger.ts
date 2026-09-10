/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {DAEMON_CLIENT_NAME} from '../daemon/utils.js';
import type {zod, ShapeOutput} from '../third_party/index.js';
import {logger} from '../utils/logger.js';

import type {ErrorCode} from './errors.js';
import type {LocalState, Persistence} from './persistence.js';
import {
  bucketizeDaysSince,
  bucketizeLatency,
  buildContext,
  sanitizeParams,
  stripUnderscoreBeforeNumber,
} from './transformation.js';
import {
  McpClient,
  type FlagUsage,
  WatchdogMessageType,
  OsType,
  type ToolInvocation,
} from './types.js';
import {WatchdogClient} from './WatchdogClient.js';
import type {DevToolsData} from '../tools/ToolDefinition.js';

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

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

function shouldLogDailyActive(state: LocalState): boolean {
  if (!state.lastActive) {
    return true;
  }
  return !isSameDay(new Date(state.lastActive), new Date());
}

function calculateDaysSince(
  lastDateString?: string,
  now: Date = new Date(),
): number {
  if (!lastDateString) {
    return -1;
  }
  const lastDate = new Date(lastDateString);
  const diffTime = Math.abs(now.getTime() - lastDate.getTime());
  return Math.ceil(diffTime / MS_PER_DAY);
}

export interface ClearcutLoggerOptions {
  appVersion: string;
  persistence: Persistence;
  logFile?: string;
  watchdogClient?: WatchdogClient;
  clearcutEndpoint?: string;
  clearcutForceFlushIntervalMs?: number;
  clearcutIncludePidHeader?: boolean;
}

// Not const to allow resetting the instance for testing purposes.
let _clearcut_logger_instance: ClearcutLogger | undefined;

export class ClearcutLogger {
  #persistence: Persistence;
  #watchdog: WatchdogClient;
  #mcpClient: McpClient;
  #state?: LocalState;

  static initialize(options: ClearcutLoggerOptions): ClearcutLogger {
    if (_clearcut_logger_instance) {
      throw new Error('ClearcutLogger is already initialized');
    }
    _clearcut_logger_instance = new ClearcutLogger(options);
    return _clearcut_logger_instance;
  }

  static get(): ClearcutLogger | undefined {
    return _clearcut_logger_instance;
  }

  static resetForTesting(): void {
    _clearcut_logger_instance = undefined;
  }

  private constructor(options: ClearcutLoggerOptions) {
    this.#persistence = options.persistence;
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
    void this.#persistence
      .loadState()
      .then(state => {
        this.#state = state;
      })
      .catch(error => {
        this.#state = undefined;
        logger?.('Failed to load telemetry state:', error);
      });
  }

  setClientName(clientName: string): void {
    const lowerName = clientName.toLowerCase();
    if (lowerName.includes('claude-desktop')) {
      this.#mcpClient = McpClient.MCP_CLIENT_CLAUDE_DESKTOP;
    } else if (lowerName.includes('claude')) {
      this.#mcpClient = McpClient.MCP_CLIENT_CLAUDE_CODE;
    } else if (lowerName.includes('gemini')) {
      this.#mcpClient = McpClient.MCP_CLIENT_GEMINI_CLI;
    } else if (clientName === DAEMON_CLIENT_NAME) {
      this.#mcpClient = McpClient.MCP_CLIENT_DT_MCP_CLI;
    } else if (lowerName.includes('openclaw')) {
      this.#mcpClient = McpClient.MCP_CLIENT_OPENCLAW;
    } else if (lowerName.includes('opencode')) {
      this.#mcpClient = McpClient.MCP_CLIENT_OPENCODE;
    } else if (lowerName.includes('codex')) {
      this.#mcpClient = McpClient.MCP_CLIENT_CODEX;
    } else if (lowerName.includes('antigravity')) {
      this.#mcpClient = McpClient.MCP_CLIENT_ANTIGRAVITY;
    } else if (lowerName.includes('grok') || lowerName.includes('xai')) {
      this.#mcpClient = McpClient.MCP_CLIENT_GROK;
    } else if (lowerName.includes('copilot')) {
      this.#mcpClient = McpClient.MCP_CLIENT_GITHUB_COPILOT;
    } else if (lowerName.includes('hermes-agent')) {
      this.#mcpClient = McpClient.MCP_CLIENT_HERMES;
    } else {
      this.#mcpClient = McpClient.MCP_CLIENT_OTHER;
    }
  }

  async logToolInvocation(args: {
    toolName: string;
    params: ShapeOutput<zod.ZodRawShape>;
    schema: zod.ZodRawShape;
    success: boolean;
    latencyMs: number;
    devToolsData?: DevToolsData;
    pageUrl?: string;
  }): Promise<void> {
    void this.#logToolActiveIfNeeded().catch(error => {
      logger?.('Error in logToolActiveIfNeeded:', error);
    });

    const context = buildContext(args.devToolsData, args.pageUrl);
    const sanitizedToolName = stripUnderscoreBeforeNumber(args.toolName);
    const tool_invocation: ToolInvocation = {
      tool_name: sanitizedToolName,
      success: args.success,
      latency_ms: bucketizeLatency(args.latencyMs),
    };
    if (Object.keys(context).length > 0) {
      tool_invocation.context = context;
    }
    if (Object.keys(args.params).length > 0) {
      tool_invocation.tool_params = {
        [`${sanitizedToolName}_params`]: sanitizeParams(
          args.params,
          args.schema,
        ),
      };
    }

    this.#watchdog.send({
      type: WatchdogMessageType.LOG_EVENT,
      payload: {
        mcp_client: this.#mcpClient,
        tool_invocation: tool_invocation,
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
      this.#state = await this.#persistence.loadState();

      if (shouldLogDailyActive(this.#state)) {
        const daysSince = calculateDaysSince(this.#state.lastActive);

        this.#watchdog.send({
          type: WatchdogMessageType.LOG_EVENT,
          payload: {
            mcp_client: this.#mcpClient,
            daily_active: {
              days_since_last_active: bucketizeDaysSince(daysSince),
            },
          },
        });

        this.#state.lastActive = new Date().toISOString();
        await this.#persistence.saveState(this.#state);
      }
    } catch (err) {
      logger?.('Error in logDailyActiveIfNeeded:', err);
    }
  }

  async logServerError(args: {
    toolName?: string;
    errorCode: ErrorCode;
  }): Promise<void> {
    this.#watchdog.send({
      type: WatchdogMessageType.LOG_EVENT,
      payload: {
        mcp_client: this.#mcpClient,
        server_error: {
          tool_name: args.toolName
            ? stripUnderscoreBeforeNumber(args.toolName)
            : '',
          error_code: args.errorCode,
        },
      },
    });
  }

  async #logToolActiveIfNeeded(): Promise<void> {
    // Expect state loaded at first tool call, if not, just skip logging.
    if (!this.#state) {
      return;
    }

    // Don't log tool active if it has already been logged today.
    const now = new Date();
    if (
      this.#state.lastToolCall &&
      isSameDay(now, new Date(this.#state.lastToolCall))
    ) {
      return;
    }

    // Refresh state in case it now contains more recent value, and test again.
    const state = await this.#persistence.loadState();
    this.#state = state;
    if (state.lastToolCall && isSameDay(now, new Date(state.lastToolCall))) {
      return;
    }

    const daysSinceToolCall = calculateDaysSince(state.lastToolCall, now);

    this.#watchdog.send({
      type: WatchdogMessageType.LOG_EVENT,
      payload: {
        mcp_client: this.#mcpClient,
        tool_active: {
          days_since_last_tool_call: bucketizeDaysSince(daysSinceToolCall),
        },
      },
    });

    this.#state.lastToolCall = now.toISOString();
    await this.#persistence.saveState(this.#state);
  }
}
