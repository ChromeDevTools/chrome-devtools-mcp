/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';

import {logger} from '../logger.js';
import {
  LocalState,
  FilePersistence,
  Persistence,
} from './persistence.js';

// Protobuf message interfaces
export interface ChromeDevToolsMcpExtension {
  os_type?: OsType;
  mcp_client?: McpClient;
  app_version?: string;
  session_id?: string;
  tool_invocation?: ToolInvocation;
  server_start?: ServerStart;
  server_shutdown?: ServerShutdown;
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

export interface ServerShutdown {}

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

export const CLEARCUT_ENDPOINT = 'https://play.googleapis.com/staging/log?format=json_proto';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SESSION_ROTATION_MS = MS_PER_DAY; // 24 hours

export class ClearcutLogger {
  #sessionId: string;
  #sessionIdGeneratedTime: number;
  #persistence: Persistence;

  constructor(options?: {persistence?: Persistence}) {
    this.#sessionId = crypto.randomUUID();
    this.#sessionIdGeneratedTime = Date.now();
    this.#persistence = options?.persistence ?? new FilePersistence();
  }

  static channelToChromeChannel(channel: string): ChromeChannel {
    switch (channel) {
      case 'stable':
        return ChromeChannel.CHROME_CHANNEL_STABLE;
      case 'canary':
        return ChromeChannel.CHROME_CHANNEL_CANARY;
      case 'beta':
        return ChromeChannel.CHROME_CHANNEL_BETA;
      case 'dev':
        return ChromeChannel.CHROME_CHANNEL_DEV;
    }

    return ChromeChannel.CHROME_CHANNEL_UNSPECIFIED;
  }

  async logToolInvocation(args: {
    toolName: string;
    success: boolean;
    latencyMs: number;
  }): Promise<void> {
    await this.#log({
      tool_invocation: {
        tool_name: args.toolName,
        success: args.success,
        latency_ms: args.latencyMs,
      },
    });
  }

  async logServerStart(flagUsage: FlagUsage): Promise<void> {
    await this.logDailyActiveIfNeeded();
    await this.#log({
      server_start: {
        flag_usage: flagUsage,
      },
    });
  }

  async logServerShutdown(): Promise<void> {
    await this.#log({
      server_shutdown: {},
    });
  }

  async logDailyActiveIfNeeded(): Promise<void> {
    try {
      const state = await this.#persistence.loadState();

      if (!state.firstTimeSent) {
        await this.#log({first_time_installation: {}});
        state.firstTimeSent = true;
        await this.#persistence.saveState(state);
      }

      if (this.#shouldLogDailyActive(state)) {
        let daysSince = -1;
        if (state.lastActive) {
          const lastActiveDate = new Date(state.lastActive);
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - lastActiveDate.getTime());
          daysSince = Math.ceil(diffTime / MS_PER_DAY); 
        }

        await this.#log({
          daily_active: {
            days_since_last_active: daysSince,
          },
        });

        // Update persistence
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

  #rotateSessionIfNeeded(): void {
    if (Date.now() - this.#sessionIdGeneratedTime > SESSION_ROTATION_MS) {
      this.#sessionId = crypto.randomUUID();
      this.#sessionIdGeneratedTime = Date.now();
    }
  }

  async #log(extension: ChromeDevToolsMcpExtension): Promise<void> {
    this.#rotateSessionIfNeeded();

    // Populate common fields
    extension.session_id = this.#sessionId;
    // extension.app_version = ... (TODO: Add in future milestone)
    // extension.os_type = ... (TODO: Populate os_type)
    // extension.mcp_client = ... (TODO: Populate mcp_client)

    // TODO: Implement batching & retries
    const eventTimeMs = Date.now();
    const request: LogRequest = {
      log_source: 2839,
      request_time_ms: String(eventTimeMs),
      client_info: {
        client_type: 47,
      },
      log_event: [
        {
          event_time_ms: String(eventTimeMs),
          source_extension_json: JSON.stringify(extension),
        },
      ],
    };

    try {
      const response = await fetch(CLEARCUT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        logger(`Clearcut request failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      logger('Failed to send log to Clearcut:', err);
    }
  }
}
