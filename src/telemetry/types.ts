/**
 * @license
 * Copyright 2025 Google LLC
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
  first_time_installation?: FirstTimeInstallation;
}

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

export interface FirstTimeInstallation {}

export interface FlagUsage {
  browser_url_present?: boolean;
  headless?: boolean;
  executable_path_present?: boolean;
  isolated?: boolean;
  channel?: ChromeChannel;
  log_file_present?: boolean;
}

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
