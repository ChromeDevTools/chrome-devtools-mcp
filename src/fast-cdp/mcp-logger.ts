/**
 * MCP Debug Logger
 * Outputs logs to stderr and appends to .local/mcp-debug.log
 */

import fs from 'node:fs';
import path from 'node:path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

// Default log level (can be changed via setLogLevel)
let currentLogLevel: LogLevel = LogLevel.DEBUG;

// Log file path
function getLogFilePath(): string {
  return path.join(process.cwd(), '.local', 'mcp-debug.log');
}

// Max log file size (5MB)
const MAX_LOG_SIZE = 5 * 1024 * 1024;

/**
 * Set the minimum log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Rotate log file if it exceeds MAX_LOG_SIZE
 */
function rotateLogIfNeeded(logPath: string): void {
  try {
    const stats = fs.statSync(logPath);
    if (stats.size > MAX_LOG_SIZE) {
      const backupPath = `${logPath}.old`;
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      fs.renameSync(logPath, backupPath);
    }
  } catch {
    // File doesn't exist or other error, ignore
  }
}

/**
 * Main logging function
 */
export function mcpLog(
  level: LogLevel,
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (level < currentLogLevel) return;

  const timestamp = new Date().toISOString();
  const levelName = LOG_LEVEL_NAMES[level];
  const prefix = `[${timestamp}] [${levelName}] [${category}]`;

  // Format data for output
  const dataStr = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';

  // Output to stderr
  console.error(`${prefix} ${message}${dataStr}`);

  // Append to log file
  try {
    const logPath = getLogFilePath();
    fs.mkdirSync(path.dirname(logPath), {recursive: true});
    rotateLogIfNeeded(logPath);

    const logEntry = {timestamp, level: levelName, category, message, ...data};
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  } catch {
    // Ignore file write errors
  }
}

// Convenience methods
export function logDebug(category: string, message: string, data?: Record<string, unknown>): void {
  mcpLog(LogLevel.DEBUG, category, message, data);
}

export function logInfo(category: string, message: string, data?: Record<string, unknown>): void {
  mcpLog(LogLevel.INFO, category, message, data);
}

export function logWarn(category: string, message: string, data?: Record<string, unknown>): void {
  mcpLog(LogLevel.WARN, category, message, data);
}

export function logError(category: string, message: string, data?: Record<string, unknown>): void {
  mcpLog(LogLevel.ERROR, category, message, data);
}

/**
 * Log connection state changes
 */
export function logConnectionState(
  kind: 'chatgpt' | 'gemini',
  state: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'healthy' | 'unhealthy',
  details?: Record<string, unknown>,
): void {
  const level = state === 'disconnected' || state === 'unhealthy' ? LogLevel.WARN : LogLevel.INFO;
  mcpLog(level, 'connection', `${kind} ${state}`, details);
}

/**
 * Log relay server events
 */
export function logRelay(
  event: 'starting' | 'started' | 'stopped' | 'timeout' | 'error',
  details?: Record<string, unknown>,
): void {
  const level = event === 'error' || event === 'timeout' ? LogLevel.ERROR : LogLevel.INFO;
  mcpLog(level, 'relay', event, details);
}

/**
 * Log extension communication
 */
export function logExtension(
  event: 'waiting' | 'connected' | 'disconnected' | 'timeout',
  details?: Record<string, unknown>,
): void {
  const level = event === 'timeout' ? LogLevel.ERROR : LogLevel.INFO;
  mcpLog(level, 'extension', event, details);
}
