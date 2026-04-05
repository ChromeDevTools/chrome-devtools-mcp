/**
 * Boss Ghost MCP — Cloud browser provider abstraction.
 *
 * Defines the interface contract that all cloud browser providers must implement.
 * Inspired by Hermes's browser_providers/base.py pattern.
 */

/** Represents an active cloud browser session. */
export interface ProviderSession {
  /** Provider's unique session identifier. */
  sessionId: string;
  /** Human-readable session name for logging. */
  sessionName: string;
  /** WebSocket URL for Chrome DevTools Protocol connection. */
  cdpUrl: string;
  /** Runtime feature flags indicating which capabilities are active. */
  features: Record<string, boolean>;
}

/** Contract for cloud browser providers (Browserbase, Browser-Use, etc.). */
export interface CloudBrowserProvider {
  /** Provider identifier (e.g. 'browserbase', 'browser-use'). */
  readonly providerName: string;

  /**
   * Check if this provider is configured with valid credentials.
   * Must be cheap — no network calls.
   */
  isConfigured(): boolean;

  /** Create a new cloud browser session. */
  createSession(taskId?: string): Promise<ProviderSession>;

  /** Close a session gracefully. Returns true if the session was stopped. */
  closeSession(sessionId: string): Promise<boolean>;

  /**
   * Best-effort cleanup for use in exit handlers.
   * Must never throw — all errors are swallowed.
   */
  emergencyCleanup(sessionId: string): Promise<void>;
}
