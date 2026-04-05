/**
 * Boss Ghost MCP — Browserbase cloud browser provider.
 *
 * Creates and manages browser sessions via the Browserbase API.
 * Implements graceful feature fallback on 402 (payment required) errors,
 * ported from Hermes's browserbase.py pattern.
 */

import type {CloudBrowserProvider, ProviderSession} from './base.js';
import {logger} from '../logger.js';

const BROWSERBASE_API = 'https://api.browserbase.com/v1';

interface BrowserbaseConfig {
  apiKey?: string;
  projectId?: string;
  proxies?: boolean;
  advancedStealth?: boolean;
  keepAlive?: boolean;
}

interface SessionCreateResponse {
  id: string;
  connectUrl?: string;
}

/**
 * Feature set used when creating a Browserbase session.
 * The fallback chain progressively disables features on 402 errors.
 */
interface FeatureSet {
  keepAlive: boolean;
  proxies: boolean;
  advancedStealth: boolean;
}

export class BrowserbaseProvider implements CloudBrowserProvider {
  readonly providerName = 'browserbase';

  private apiKey: string;
  private projectId: string;
  private enableProxies: boolean;
  private enableAdvancedStealth: boolean;
  private enableKeepAlive: boolean;

  constructor(config?: BrowserbaseConfig) {
    this.apiKey = config?.apiKey ?? process.env['BROWSERBASE_API_KEY'] ?? '';
    this.projectId = config?.projectId ?? process.env['BROWSERBASE_PROJECT_ID'] ?? '';
    this.enableProxies = config?.proxies ?? true;
    this.enableAdvancedStealth = config?.advancedStealth ?? true;
    this.enableKeepAlive = config?.keepAlive ?? true;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0 && this.projectId.length > 0;
  }

  async createSession(taskId?: string): Promise<ProviderSession> {
    if (!this.isConfigured()) {
      throw new Error(
        'Browserbase not configured — set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID, ' +
          'or configure them in ~/.boss-ghost/config.json under providers.browserbase',
      );
    }

    // Graceful fallback chain: try full features, then progressively disable on 402
    const fallbackChain: FeatureSet[] = [
      {keepAlive: this.enableKeepAlive, proxies: this.enableProxies, advancedStealth: this.enableAdvancedStealth},
      {keepAlive: false, proxies: this.enableProxies, advancedStealth: this.enableAdvancedStealth},
      {keepAlive: false, proxies: false, advancedStealth: this.enableAdvancedStealth},
      {keepAlive: false, proxies: false, advancedStealth: false},
    ];

    let lastError: Error | undefined;

    for (const features of fallbackChain) {
      try {
        const session = await this.tryCreateSession(features, taskId);
        return session;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (lastError.message.includes('402')) {
          logger(
            'Browserbase 402 — retrying with reduced features (keepAlive=%s, proxies=%s, stealth=%s)',
            features.keepAlive,
            features.proxies,
            features.advancedStealth,
          );
          continue;
        }

        // Non-402 errors are not retryable
        throw lastError;
      }
    }

    throw lastError ?? new Error('Failed to create Browserbase session after all fallback attempts');
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const url = `${BROWSERBASE_API}/sessions/${sessionId}/stop`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-bb-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger('Browserbase closeSession failed: %s %s', response.status, response.statusText);
      return false;
    }

    logger('Browserbase session %s stopped', sessionId);
    return true;
  }

  async emergencyCleanup(sessionId: string): Promise<void> {
    try {
      await this.closeSession(sessionId);
    } catch {
      // Best-effort — swallow all errors in exit handlers
    }
  }

  /**
   * Attempt to create a session with a specific feature set.
   * Throws on HTTP errors (including 402 for feature downgrades).
   */
  private async tryCreateSession(features: FeatureSet, taskId?: string): Promise<ProviderSession> {
    const body: Record<string, unknown> = {
      projectId: this.projectId,
    };

    if (features.keepAlive) {
      body.keepAlive = true;
    }

    if (features.proxies) {
      body.proxies = true;
    }

    if (features.advancedStealth) {
      body.browserSettings = {advancedStealth: true};
    }

    const sessionName = taskId ? `boss-ghost-${taskId}` : `boss-ghost-${Date.now()}`;

    logger(
      'Creating Browserbase session "%s" (keepAlive=%s, proxies=%s, stealth=%s)',
      sessionName,
      features.keepAlive,
      features.proxies,
      features.advancedStealth,
    );

    const response = await fetch(`${BROWSERBASE_API}/sessions`, {
      method: 'POST',
      headers: {
        'x-bb-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Browserbase API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as SessionCreateResponse;

    const cdpUrl =
      data.connectUrl ??
      `wss://connect.browserbase.com?apiKey=${encodeURIComponent(this.apiKey)}&sessionId=${data.id}`;

    logger('Browserbase session created: %s (id=%s)', sessionName, data.id);

    return {
      sessionId: data.id,
      sessionName,
      cdpUrl,
      features: {
        keepAlive: features.keepAlive,
        proxies: features.proxies,
        advancedStealth: features.advancedStealth,
      },
    };
  }
}
