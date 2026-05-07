/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {DAEMON_CLIENT_NAME} from '../daemon/utils.js';
import {logger} from '../logger.js';
import type {zod, ShapeOutput} from '../third_party/index.js';

import type {ErrorCode} from './errors.js';
import type {LocalState, Persistence} from './persistence.js';
import {FilePersistence} from './persistence.js';
import {
  McpClient,
  type FlagUsage,
  WatchdogMessageType,
  OsType,
  type ToolInvocation,
} from './types.js';
import {WatchdogClient} from './WatchdogClient.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const PARAM_BLOCKLIST = new Set(['uid', 'reqid', 'msgid']);

const SUPPORTED_ZOD_TYPES = [
  'ZodString',
  'ZodNumber',
  'ZodBoolean',
  'ZodArray',
  'ZodEnum',
] as const;
type ZodType = (typeof SUPPORTED_ZOD_TYPES)[number];

function isZodType(type: string): type is ZodType {
  return SUPPORTED_ZOD_TYPES.includes(type as ZodType);
}

export function getZodType(zodType: zod.ZodTypeAny): ZodType {
  const def = zodType._def;
  const typeName = def.typeName;

  if (
    typeName === 'ZodOptional' ||
    typeName === 'ZodDefault' ||
    typeName === 'ZodNullable'
  ) {
    return getZodType(def.innerType);
  }
  if (typeName === 'ZodEffects') {
    return getZodType(def.schema);
  }

  if (isZodType(typeName)) {
    return typeName;
  }
  throw new Error(`Unsupported zod type for tool parameter: ${typeName}`);
}

type LoggedToolCallArgValue = string | number | boolean;

export function transformArgName(zodType: ZodType, name: string): string {
  const snakeCaseName = name.replace(
    /[A-Z]/g,
    letter => `_${letter.toLowerCase()}`,
  );
  if (zodType === 'ZodString') {
    return `${snakeCaseName}_length`;
  } else if (zodType === 'ZodArray') {
    return `${snakeCaseName}_count`;
  } else {
    return snakeCaseName;
  }
}

export function transformArgType(zodType: ZodType): string {
  if (zodType === 'ZodString' || zodType === 'ZodArray') {
    return 'number';
  }
  switch (zodType) {
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodEnum':
      return 'enum';
    default:
      throw new Error(`Unsupported zod type for tool parameter: ${zodType}`);
  }
}

const BUCKETS = [
  0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];

function bucketize(value: number): number {
  for (const bucket of BUCKETS) {
    if (bucket >= value) {
      return bucket;
    }
  }
  return BUCKETS[BUCKETS.length - 1];
}

function transformValue(
  zodType: ZodType,
  value: unknown,
): LoggedToolCallArgValue {
  if (zodType === 'ZodString') {
    return bucketize((value as string).length);
  } else if (zodType === 'ZodArray') {
    return (value as unknown[]).length;
  } else {
    return value as LoggedToolCallArgValue;
  }
}

function hasEquivalentType(zodType: ZodType, value: unknown): boolean {
  if (zodType === 'ZodString') {
    return typeof value === 'string';
  } else if (zodType === 'ZodArray') {
    return Array.isArray(value);
  } else if (zodType === 'ZodNumber') {
    return typeof value === 'number';
  } else if (zodType === 'ZodBoolean') {
    return typeof value === 'boolean';
  } else if (zodType === 'ZodEnum') {
    return (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    );
  } else {
    return false;
  }
}

export function sanitizeParams(
  params: ShapeOutput<zod.ZodRawShape>,
  schema: zod.ZodRawShape,
): ShapeOutput<zod.ZodRawShape> {
  const transformed: ShapeOutput<zod.ZodRawShape> = {};
  for (const [name, value] of Object.entries(params)) {
    if (PARAM_BLOCKLIST.has(name)) {
      continue;
    }
    const zodType = getZodType(schema[name]);
    if (!hasEquivalentType(zodType, value)) {
      throw new Error(
        `parameter ${name} has type ${zodType} but value ${value} is not of equivalent type`,
      );
    }
    const transformedName = transformArgName(zodType, name);
    const transformedValue = transformValue(zodType, value);
    transformed[transformedName] = transformedValue;
  }
  return transformed;
}

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

export interface ClearcutLoggerOptions {
  appVersion: string;
  logFile?: string;
  persistence?: Persistence;
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
    params: ShapeOutput<zod.ZodRawShape>;
    schema: zod.ZodRawShape;
    success: boolean;
    latencyMs: number;
  }): Promise<void> {
    const tool_invocation: ToolInvocation = {
      tool_name: args.toolName,
      success: args.success,
      latency_ms: args.latencyMs,
    };
    if (Object.keys(args.params).length > 0) {
      tool_invocation.tool_params = {
        [`${args.toolName}_params`]: sanitizeParams(args.params, args.schema),
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

  async logServerError(args: {
    toolName?: string;
    errorCode: ErrorCode;
  }): Promise<void> {
    this.#watchdog.send({
      type: WatchdogMessageType.LOG_EVENT,
      payload: {
        mcp_client: this.#mcpClient,
        server_error: {
          tool_name: args.toolName ?? '',
          error_code: args.errorCode,
        },
      },
    });
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
