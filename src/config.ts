/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global configuration for chrome-ai-bridge
 */

/**
 * ChatGPT configuration
 */
export const CHATGPT_CONFIG = {
  /**
   * Default ChatGPT URL with gpt-5-thinking model
   */
  DEFAULT_URL: 'https://chatgpt.com/?model=gpt-5-thinking',

  /**
   * Base URL for ChatGPT (without query params)
   */
  BASE_URL: 'https://chatgpt.com/',

  /**
   * Default model parameter
   */
  DEFAULT_MODEL: 'gpt-5-thinking',
} as const;

/**
 * Gemini configuration
 */
export const GEMINI_CONFIG = {
  /**
   * Default Gemini URL
   */
  DEFAULT_URL: 'https://gemini.google.com/',

  /**
   * Base URL for Gemini
   */
  BASE_URL: 'https://gemini.google.com/',
} as const;

/**
 * IPC configuration for multi-client MCP support.
 * The Primary instance exposes an HTTP endpoint on this port;
 * Secondary instances connect as stdio-to-HTTP proxies.
 */
export const IPC_CONFIG = {
  port: Number(process.env.CAI_IPC_PORT) || 9321,
  host: '127.0.0.1',
  healthPath: '/health',
  mcpPath: '/mcp',
} as const;

/**
 * Session configuration for Agent Teams support
 */
export interface SessionConfig {
  /** Session TTL in minutes (default: 30) */
  sessionTtlMinutes: number;
  /** Maximum number of concurrent agents (default: 10) */
  maxAgents: number;
  /** Cleanup interval in minutes (default: 5) */
  cleanupIntervalMinutes: number;
}

/**
 * Get session configuration from environment variables or defaults.
 */
export function getSessionConfig(): SessionConfig {
  const raw = {
    ttl: Number(process.env.CAI_SESSION_TTL_MINUTES),
    max: Number(process.env.CAI_MAX_AGENTS),
    interval: Number(process.env.CAI_CLEANUP_INTERVAL_MINUTES),
  };
  return {
    sessionTtlMinutes: raw.ttl > 0 ? raw.ttl : 30,
    maxAgents: raw.max > 0 ? Math.floor(raw.max) : 10,
    cleanupIntervalMinutes: raw.interval > 0 ? raw.interval : 5,
  };
}
