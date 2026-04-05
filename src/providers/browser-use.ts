/**
 * Boss Ghost MCP — Browser Use cloud browser provider.
 *
 * Creates and manages browser sessions via the Browser Use API.
 * Ported from Hermes's browser_providers/browser_use.py.
 */

import type {CloudBrowserProvider, ProviderSession} from './base.js';
import {logger} from '../logger.js';

const BROWSER_USE_API = 'https://api.browser-use.com/api/v2';

interface BrowserUseConfig {
  apiKey?: string;
}

export class BrowserUseProvider implements CloudBrowserProvider {
  readonly providerName = 'browser-use';
  private apiKey: string;

  constructor(config?: BrowserUseConfig) {
    this.apiKey = config?.apiKey ?? process.env['BROWSER_USE_API_KEY'] ?? '';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async createSession(taskId?: string): Promise<ProviderSession> {
    if (!this.isConfigured()) {
      throw new Error(
        'Browser Use not configured — set BROWSER_USE_API_KEY, ' +
          'or configure it in ~/.boss-ghost/config.json under providers.browser-use',
      );
    }

    const response = await fetch(`${BROWSER_USE_API}/browsers`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Browser Use API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {id: string; cdpUrl: string};
    const sessionName = taskId ? `boss-ghost-${taskId}` : `boss-ghost-${Date.now()}`;

    logger('Browser Use session created: %s (id=%s)', sessionName, data.id);

    return {
      sessionId: data.id,
      sessionName,
      cdpUrl: data.cdpUrl,
      features: {browserUse: true},
    };
  }

  async closeSession(sessionId: string): Promise<boolean> {
    const response = await fetch(`${BROWSER_USE_API}/browsers/${sessionId}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({action: 'stop'}),
    });

    if (!response.ok) {
      logger('Browser Use closeSession failed: %s %s', response.status, response.statusText);
      return false;
    }

    logger('Browser Use session %s stopped', sessionId);
    return true;
  }

  async emergencyCleanup(sessionId: string): Promise<void> {
    try {
      await this.closeSession(sessionId);
    } catch {
      // Best-effort — swallow all errors in exit handlers
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Browser-Use-API-Key': this.apiKey,
    };
  }
}
