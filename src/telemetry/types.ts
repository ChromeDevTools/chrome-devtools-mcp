/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Protobuf message interfaces
export interface ChromeDevToolsMcpExtension {
  os_type?: OsType;
  mcp_client?: McpClient;
  app_version?: string;
  session_id?: string;
  tool_invocation?: ToolInvocation;
  server_start?: ServerStart;
  daily_active?: DailyActive;
  server_shutdown?: ServerShutdown;
}

export type ServerShutdown = Record<string, never>;

export interface ToolInvocation {
  tool_name: string;
  success: boolean;
  latency_ms: number;
}

export interface ServerStart {
  flag_usage?: FlagUsage;
}

export interface DailyActive {
  days_since_last_active: number;
}

export type FlagUsage = Record<string, boolean | string | number | undefined>;

// Clearcut API interfaces
export interface LogRequest {
  log_source: number;
  request_time_ms: string;
  client_info: {
    client_type: number;
  };
  log_event: Array<{
    event_time_ms: string;
    source_extension_json: string;
  }>;
}

export interface LogResponse {
  /**
   * If present, the client must wait this many milliseconds before
   * issuing the next HTTP request.
   */
  next_request_wait_millis?: number;
}

// Enums
export enum OsType {
  OS_TYPE_UNSPECIFIED = 0,
  OS_TYPE_WINDOWS = 1,
  OS_TYPE_MACOS = 2,
  OS_TYPE_LINUX = 3,
}

export enum ChromeChannel {
  CHROME_CHANNEL_UNSPECIFIED = 0,
  CHROME_CHANNEL_CANARY = 1,
  CHROME_CHANNEL_DEV = 2,
  CHROME_CHANNEL_BETA = 3,
  CHROME_CHANNEL_STABLE = 4,
}

export enum McpClient {
  MCP_CLIENT_UNSPECIFIED = 0,
  MCP_CLIENT_CLAUDE_CODE = 1,
  MCP_CLIENT_GEMINI_CLI = 2,
}

// IPC types for messages between the main process and the
// telemetry watchdog process.
export enum WatchdogMessageType {
  LOG_EVENT = 'log-event',
}

export interface WatchdogMessage {
  type: WatchdogMessageType.LOG_EVENT;
  payload: ChromeDevToolsMcpExtension;
}
