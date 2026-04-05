/**
 * Boss Ghost MCP — Per-agent session tab tracking.
 *
 * Tracks which browser tabs belong to which agent session,
 * enabling clean teardown when an agent disconnects.
 * Inspired by OpenClaw's session-tab-registry.ts.
 */

import {logger} from '../logger.js';

export interface TrackedTab {
  profileName: string;
  pageIdx: number;
  url: string;
  createdAt: number;
}

// Session registry — tracks which tabs belong to which agent session.
// Outer key: sessionKey (agent identifier), inner key: pageIdx.
const sessions = new Map<string, Map<number, TrackedTab>>();

/**
 * Register a tab for a session.
 * If the session doesn't exist yet, it is created automatically.
 */
export function trackTab(
  sessionKey: string,
  pageIdx: number,
  profileName: string,
  url: string,
): void {
  let tabs = sessions.get(sessionKey);
  if (!tabs) {
    tabs = new Map<number, TrackedTab>();
    sessions.set(sessionKey, tabs);
    logger('Created session tracking for "%s"', sessionKey);
  }

  const tab: TrackedTab = {
    profileName,
    pageIdx,
    url,
    createdAt: Date.now(),
  };

  tabs.set(pageIdx, tab);
  logger(
    'Tracked tab %d for session "%s" (profile: %s, url: %s)',
    pageIdx,
    sessionKey,
    profileName,
    url,
  );
}

/**
 * Untrack a tab from a session.
 * No-op if the session or tab doesn't exist.
 */
export function untrackTab(sessionKey: string, pageIdx: number): void {
  const tabs = sessions.get(sessionKey);
  if (!tabs) {
    return;
  }

  const deleted = tabs.delete(pageIdx);
  if (deleted) {
    logger('Untracked tab %d from session "%s"', pageIdx, sessionKey);
  }

  // Clean up empty sessions automatically
  if (tabs.size === 0) {
    sessions.delete(sessionKey);
    logger('Session "%s" has no more tabs — removed', sessionKey);
  }
}

/**
 * Get all tracked tabs for a session.
 * Returns an empty array if the session doesn't exist.
 */
export function getSessionTabs(sessionKey: string): TrackedTab[] {
  const tabs = sessions.get(sessionKey);
  if (!tabs) {
    return [];
  }
  return Array.from(tabs.values());
}

/**
 * Get all page indices that should be closed for a session teardown.
 * Returns indices in descending order so closing them won't shift
 * the indices of remaining tabs.
 */
export function getTabsToClose(sessionKey: string): number[] {
  const tabs = sessions.get(sessionKey);
  if (!tabs) {
    return [];
  }
  return Array.from(tabs.keys()).sort((a, b) => b - a);
}

/**
 * Clean up all tracking data for a session.
 */
export function clearSession(sessionKey: string): void {
  const tabs = sessions.get(sessionKey);
  const count = tabs?.size ?? 0;
  sessions.delete(sessionKey);
  logger('Cleared session "%s" (%d tabs)', sessionKey, count);
}

/**
 * List all active sessions with their tab counts.
 */
export function listSessions(): {sessionKey: string; tabCount: number}[] {
  const result: {sessionKey: string; tabCount: number}[] = [];
  for (const [sessionKey, tabs] of sessions) {
    result.push({sessionKey, tabCount: tabs.size});
  }
  return result;
}
