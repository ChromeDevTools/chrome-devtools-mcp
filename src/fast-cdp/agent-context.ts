/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent Context Management for Agent Teams support.
 *
 * Each MCP client (process) gets a unique agent ID, enabling:
 * - Isolated browser sessions per agent
 * - Tab management per agent
 * - TTL-based cleanup of stale sessions
 */

import {CdpClient} from './cdp-client.js';
import {RelayServer} from '../extension/relay-server.js';

/**
 * Connection state for a single agent
 */
export interface AgentConnection {
  chatgptClient: CdpClient | null;
  geminiClient: CdpClient | null;
  chatgptRelay: RelayServer | null;
  geminiRelay: RelayServer | null;
  lastAccess: Date;
}

/**
 * Map of agent ID to connection state
 */
const agentConnections = new Map<string, AgentConnection>();

/**
 * Current agent ID for this process
 */
let currentAgentId: string | null = null;

/**
 * Generate a unique agent ID.
 *
 * Strategy (hybrid):
 * 1. If CAI_AGENT_ID environment variable is set, use it + PID
 * 2. Otherwise, generate from PID + timestamp
 *
 * @param clientName Optional client name from MCP initialize (e.g., "claude-code")
 * @returns Unique agent ID
 */
export function generateAgentId(clientName?: string): string {
  const envAgentId = process.env.CAI_AGENT_ID;

  if (envAgentId) {
    // Environment variable takes precedence (allows explicit control)
    return `${envAgentId}-${process.pid}`;
  }

  if (clientName) {
    // Use client name if available (from MCP initialize)
    return `${clientName}-${process.pid}`;
  }

  // Fallback: generate from PID + timestamp
  return `agent-${process.pid}-${Date.now()}`;
}

/**
 * Set the current agent ID for this process.
 * Should be called once at process startup.
 *
 * @param id Agent ID to set
 */
export function setAgentId(id: string): void {
  if (currentAgentId !== null && currentAgentId !== id) {
    console.error(`[agent-context] Warning: Agent ID changed from ${currentAgentId} to ${id}`);
  }
  currentAgentId = id;
  console.error(`[agent-context] Agent ID set: ${id}`);
}

/**
 * Get the current agent ID.
 *
 * @returns Current agent ID
 * @throws Error if agent ID is not set
 */
export function getAgentId(): string {
  if (!currentAgentId) {
    throw new Error('Agent ID not set. Call setAgentId() first.');
  }
  return currentAgentId;
}

/**
 * Check if agent ID is set.
 *
 * @returns true if agent ID is set
 */
export function hasAgentId(): boolean {
  return currentAgentId !== null;
}

/**
 * Get or create connection state for the current agent.
 *
 * @returns AgentConnection for the current agent
 */
export function getAgentConnection(): AgentConnection {
  const agentId = getAgentId();

  let conn = agentConnections.get(agentId);
  if (!conn) {
    conn = {
      chatgptClient: null,
      geminiClient: null,
      chatgptRelay: null,
      geminiRelay: null,
      lastAccess: new Date(),
    };
    agentConnections.set(agentId, conn);
    console.error(`[agent-context] Created new connection for agent: ${agentId}`);
  }

  // Update last access time
  conn.lastAccess = new Date();
  return conn;
}

/**
 * Get all agent connections (for cleanup purposes).
 *
 * @returns Map of agent ID to AgentConnection
 */
export function getAllAgentConnections(): Map<string, AgentConnection> {
  return agentConnections;
}

/**
 * Remove an agent's connection state.
 *
 * @param agentId Agent ID to remove
 */
export function removeAgentConnection(agentId: string): void {
  agentConnections.delete(agentId);
  console.error(`[agent-context] Removed connection for agent: ${agentId}`);
}

/**
 * Clear all agent connections.
 * Used during shutdown.
 */
export function clearAllAgentConnections(): void {
  agentConnections.clear();
  console.error('[agent-context] Cleared all agent connections');
}
