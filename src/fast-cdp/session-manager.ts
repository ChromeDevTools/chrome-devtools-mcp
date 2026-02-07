/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session Manager for Agent Teams support.
 *
 * Manages per-agent sessions with:
 * - V2 session format with agent isolation
 * - Automatic migration from V1 format
 * - TTL-based cleanup of stale sessions
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {getSessionConfig} from '../config.js';
import {getAgentId, hasAgentId} from './agent-context.js';

/**
 * Session entry for a single AI provider
 */
export interface SessionEntry {
  url: string;
  tabId?: number;
  lastUsed?: string;
}

/**
 * Per-agent session data
 */
export interface AgentSession {
  lastAccess: string;  // ISO timestamp
  chatgpt: SessionEntry | null;
  gemini: SessionEntry | null;
}

/**
 * V2 session store format (agent-isolated)
 */
export interface SessionStoreV2 {
  version: 2;
  agents: Record<string, AgentSession>;
  config: {
    sessionTtlMinutes: number;
    maxAgents: number;
  };
}

/**
 * V1 session store format (legacy, per-project)
 */
interface SessionStoreV1 {
  projects: Record<string, {
    chatgpt?: SessionEntry;
    gemini?: SessionEntry;
  }>;
}

/**
 * Get the session file path.
 * Uses project-local .local/ directory.
 */
function getSessionPath(): string {
  return path.join(process.cwd(), '.local', 'chrome-ai-bridge', 'sessions.json');
}

/**
 * Load raw sessions from file (any version).
 */
async function loadRawSessions(): Promise<SessionStoreV1 | SessionStoreV2> {
  const sessionPath = getSessionPath();
  try {
    const data = await fs.readFile(sessionPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      // File exists but is corrupted or unreadable
      console.error(`[session-manager] Failed to load ${sessionPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return {projects: {}};
  }
}

/**
 * Save sessions to file.
 */
async function saveRawSessions(sessions: SessionStoreV2): Promise<void> {
  const targetPath = getSessionPath();
  await fs.mkdir(path.dirname(targetPath), {recursive: true});
  await fs.writeFile(targetPath, JSON.stringify(sessions, null, 2), 'utf-8');
}

/**
 * Check if sessions are V2 format.
 */
function isV2Format(sessions: SessionStoreV1 | SessionStoreV2): sessions is SessionStoreV2 {
  return 'version' in sessions && sessions.version === 2;
}

/**
 * Migrate V1 sessions to V2 format.
 * Creates a "legacy-default" agent from V1 project data.
 */
async function migrateToV2(v1: SessionStoreV1): Promise<SessionStoreV2> {
  const config = getSessionConfig();

  const v2: SessionStoreV2 = {
    version: 2,
    agents: {},
    config: {
      sessionTtlMinutes: config.sessionTtlMinutes,
      maxAgents: config.maxAgents,
    },
  };

  // Migrate each project as a legacy agent
  for (const [projectName, projectSessions] of Object.entries(v1.projects)) {
    // Sanitize project name for use as agent ID key
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const agentId = `legacy-${safeName}`;
    v2.agents[agentId] = {
      lastAccess: new Date().toISOString(),
      chatgpt: projectSessions.chatgpt || null,
      gemini: projectSessions.gemini || null,
    };
  }

  console.error(`[session-manager] Migrated ${Object.keys(v1.projects).length} projects to V2 format`);
  return v2;
}

/**
 * Load sessions, auto-migrating if needed.
 */
export async function loadSessions(): Promise<SessionStoreV2> {
  const raw = await loadRawSessions();

  if (isV2Format(raw)) {
    return raw;
  }

  // Migrate V1 to V2
  const v2 = await migrateToV2(raw as SessionStoreV1);
  await saveRawSessions(v2);
  return v2;
}

/**
 * Get or create session for the current agent.
 * Always updates lastAccess to keep session alive for TTL.
 */
export async function getAgentSession(): Promise<AgentSession> {
  const agentId = hasAgentId() ? getAgentId() : 'default';
  const sessions = await loadSessions();
  let needsSave = false;

  if (!sessions.agents[agentId]) {
    sessions.agents[agentId] = {
      lastAccess: new Date().toISOString(),
      chatgpt: null,
      gemini: null,
    };
    needsSave = true;
  } else {
    // Update lastAccess for existing sessions (keeps TTL alive)
    sessions.agents[agentId].lastAccess = new Date().toISOString();
    needsSave = true;
  }

  if (needsSave) {
    await saveRawSessions(sessions);
  }

  return sessions.agents[agentId];
}

/**
 * Save session for the current agent.
 */
export async function saveAgentSession(
  kind: 'chatgpt' | 'gemini',
  url: string,
  tabId?: number,
): Promise<void> {
  const agentId = hasAgentId() ? getAgentId() : 'default';
  const sessions = await loadSessions();

  if (!sessions.agents[agentId]) {
    sessions.agents[agentId] = {
      lastAccess: new Date().toISOString(),
      chatgpt: null,
      gemini: null,
    };
  }

  const session = sessions.agents[agentId];
  session.lastAccess = new Date().toISOString();
  session[kind] = {
    url,
    tabId,
    lastUsed: new Date().toISOString(),
  };

  await saveRawSessions(sessions);
}

/**
 * Clear session for the current agent.
 */
export async function clearAgentSession(kind: 'chatgpt' | 'gemini'): Promise<void> {
  const agentId = hasAgentId() ? getAgentId() : 'default';
  const sessions = await loadSessions();

  if (sessions.agents[agentId]) {
    sessions.agents[agentId][kind] = null;
    await saveRawSessions(sessions);
    console.error(`[session-manager] Cleared ${kind} session for agent: ${agentId}`);
  }
}

/**
 * Remove stale sessions that exceed TTL.
 *
 * @returns Number of agents removed
 */
export async function cleanupStaleSessions(): Promise<number> {
  const config = getSessionConfig();
  const sessions = await loadSessions();

  const now = Date.now();
  const ttlMs = config.sessionTtlMinutes * 60 * 1000;
  let removedCount = 0;

  for (const [agentId, session] of Object.entries(sessions.agents)) {
    const lastAccess = new Date(session.lastAccess).getTime();
    const age = now - lastAccess;

    if (age > ttlMs) {
      delete sessions.agents[agentId];
      removedCount++;
      console.error(`[session-manager] Removed stale agent: ${agentId} (${Math.round(age / 60000)}min old)`);
    }
  }

  // Enforce maxAgents limit
  const agentIds = Object.keys(sessions.agents);
  if (agentIds.length > config.maxAgents) {
    // Sort by lastAccess (oldest first)
    const sorted = agentIds.sort((a, b) => {
      const aTime = new Date(sessions.agents[a].lastAccess).getTime();
      const bTime = new Date(sessions.agents[b].lastAccess).getTime();
      return aTime - bTime;
    });

    // Remove oldest until under limit
    const toRemove = sorted.slice(0, agentIds.length - config.maxAgents);
    for (const agentId of toRemove) {
      delete sessions.agents[agentId];
      removedCount++;
      console.error(`[session-manager] Removed agent (over limit): ${agentId}`);
    }
  }

  if (removedCount > 0) {
    await saveRawSessions(sessions);
  }

  return removedCount;
}

/**
 * Get preferred session (URL and tabId) for the current agent.
 * Used by fast-chat.ts for connection reuse.
 */
export async function getPreferredSessionV2(
  kind: 'chatgpt' | 'gemini',
): Promise<{url: string | null; tabId?: number}> {
  const session = await getAgentSession();
  const entry = session[kind];

  if (entry && typeof entry.url === 'string' && entry.url.length > 0) {
    return {
      url: entry.url,
      tabId: typeof entry.tabId === 'number' ? entry.tabId : undefined,
    };
  }

  return {url: null};
}
