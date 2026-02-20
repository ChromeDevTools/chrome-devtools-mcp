/**
 * User Action Tracker
 *
 * Detects user actions that may affect Copilot's working context:
 * - File saves on files Copilot recently accessed (within 5 minutes)
 * - Terminal closures for terminals managed by Copilot
 *
 * Actions are accumulated and injected into the next tool response
 * so Copilot becomes aware of user interventions without needing
 * a dedicated tool call.
 */

import * as vscode from 'vscode';

// Time window: only track files accessed in the last 5 minutes
const WATCH_WINDOW_MS = 5 * 60 * 1000;

// Maximum buffered actions before oldest are dropped
const MAX_ACTIONS = 25;

// ============================================================================
// Types
// ============================================================================

interface UserAction {
  id: number;
  type: 'file-saved' | 'terminal-closed';
  timestamp: number;
  summary: string;
  details?: string;
}

interface WatchedFile {
  filePath: string;
  watchedSince: number;
}

// ============================================================================
// Singleton
// ============================================================================

let instance: UserActionTracker | undefined;

export function getUserActionTracker(): UserActionTracker {
  if (!instance) {
    instance = new UserActionTracker();
  }
  return instance;
}

export function disposeUserActionTracker(): void {
  if (instance) {
    instance.dispose();
    instance = undefined;
  }
}

// ============================================================================
// Tracker Implementation
// ============================================================================

export class UserActionTracker {
  private watchedFiles = new Map<string, WatchedFile>();
  private actions: UserAction[] = [];
  private nextId = 1;
  private lastReportedId = 0;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        this.onFileSaved(doc);
      }),
    );

    console.log('[UserActionTracker] Initialized — tracking file saves and terminal closures');
  }

  /**
   * Mark a file as "recently accessed by a tool."
   * Saves to this file within 5 minutes will generate a user action alert.
   */
  trackFileAccess(filePath: string): void {
    const key = this.normalizePath(filePath);
    this.watchedFiles.set(key, {
      filePath,
      watchedSince: Date.now(),
    });
    this.pruneExpiredWatches();
  }

  /**
   * Record that a managed terminal was closed externally (by the user or VS Code).
   * Called by the terminal controller when it detects a tracked terminal closing.
   */
  onManagedTerminalClosed(terminalName: string): void {
    this.addAction({
      type: 'terminal-closed',
      summary: `User closed terminal "${terminalName}"`,
      details: 'Any running processes have been terminated. This terminal is no longer available.',
    });
  }

  /**
   * Get all unreported actions and mark them as reported.
   * Returns empty array if nothing new happened.
   */
  getUnreportedActions(): UserAction[] {
    const unreported = this.actions.filter(a => a.id > this.lastReportedId);
    if (unreported.length > 0) {
      this.lastReportedId = unreported[unreported.length - 1].id;
    }
    // Prune old actions
    this.actions = this.actions.slice(-MAX_ACTIONS);
    return unreported;
  }

  /**
   * Format unreported actions as a markdown block for injection into tool responses.
   * Returns empty string if no unreported actions exist.
   */
  formatForInjection(): string {
    const actions = this.getUnreportedActions();
    if (actions.length === 0) return '';

    const lines = [
      '⚠️ **USER ACTIONS DETECTED** since your last tool call:',
      '',
    ];

    for (const action of actions) {
      const ago = this.timeAgo(action.timestamp);
      lines.push(`- **${action.type}** (${ago}): ${action.summary}`);
      if (action.details) {
        lines.push(`  ${action.details}`);
      }
    }

    lines.push('');
    lines.push('---');
    lines.push('');

    return lines.join('\n');
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.watchedFiles.clear();
    this.actions = [];
    console.log('[UserActionTracker] Disposed');
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private onFileSaved(doc: vscode.TextDocument): void {
    const key = this.normalizePath(doc.uri.fsPath);
    const watched = this.watchedFiles.get(key);

    if (!watched) return;

    // Check if within the 5-minute watch window
    if (Date.now() - watched.watchedSince > WATCH_WINDOW_MS) {
      this.watchedFiles.delete(key);
      return;
    }

    this.addAction({
      type: 'file-saved',
      summary: `User saved changes to: ${doc.uri.fsPath}`,
      details: 'This file was recently accessed by a tool. The user may have made manual changes. Consider re-reading the file to get the latest content.',
    });

    // Refresh the watch timer so subsequent saves are also caught
    watched.watchedSince = Date.now();
  }

  private addAction(action: Omit<UserAction, 'id' | 'timestamp'>): void {
    this.actions.push({
      ...action,
      id: this.nextId++,
      timestamp: Date.now(),
    });

    if (this.actions.length > MAX_ACTIONS * 2) {
      this.actions = this.actions.slice(-MAX_ACTIONS);
    }

    console.log(`[UserActionTracker] Action #${this.nextId - 1}: ${action.summary}`);
  }

  private normalizePath(p: string): string {
    return p.toLowerCase().replace(/\\/g, '/');
  }

  private timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  private pruneExpiredWatches(): void {
    const now = Date.now();
    for (const [key, watch] of this.watchedFiles) {
      if (now - watch.watchedSince > WATCH_WINDOW_MS) {
        this.watchedFiles.delete(key);
      }
    }
  }
}
