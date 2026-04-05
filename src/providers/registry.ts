/**
 * Boss Ghost MCP — Provider registry and selection.
 *
 * Manages available cloud browser providers and resolves the active one
 * based on configuration and environment. Inspired by Hermes's
 * _PROVIDER_REGISTRY pattern.
 */

import type {CloudBrowserProvider} from './base.js';
import {BrowserbaseProvider} from './browserbase.js';
import {BrowserUseProvider} from './browser-use.js';
import {logger} from '../logger.js';
import {getConfig} from '../config/config.js';

type ProviderConstructor = new (config?: Record<string, unknown>) => CloudBrowserProvider;

/** Registry of known provider constructors, keyed by name. */
const PROVIDER_REGISTRY = new Map<string, ProviderConstructor>([
  ['browserbase', BrowserbaseProvider as unknown as ProviderConstructor],
  ['browser-use', BrowserUseProvider as unknown as ProviderConstructor],
]);

/** Cached provider instance (resolved once per process). */
let cachedProvider: CloudBrowserProvider | null | undefined;

/**
 * Get the configured cloud browser provider.
 *
 * Resolution order:
 * 1. config.providers.cloudProvider — explicit provider name or "local"
 * 2. Auto-detect: check if Browserbase env vars are present
 * 3. Fall back to null (local-only mode)
 *
 * Result is cached for the lifetime of the process.
 */
export function getCloudProvider(): CloudBrowserProvider | null {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  const config = getConfig();
  const providerName = config.providers?.cloudProvider;

  // Explicit local mode
  if (providerName === 'local') {
    logger('Cloud provider: local mode (explicit)');
    cachedProvider = null;
    return null;
  }

  // Explicit provider selection
  if (providerName) {
    const Ctor = PROVIDER_REGISTRY.get(providerName);
    if (!Ctor) {
      logger('Unknown cloud provider "%s" — falling back to local mode', providerName);
      cachedProvider = null;
      return null;
    }

    const providerConfig = (config.providers as Record<string, unknown>)?.[providerName];
    const instance = new Ctor(
      typeof providerConfig === 'object' && providerConfig !== null
        ? (providerConfig as Record<string, unknown>)
        : undefined,
    );

    if (!instance.isConfigured()) {
      logger('Cloud provider "%s" selected but not configured — falling back to local mode', providerName);
      cachedProvider = null;
      return null;
    }

    logger('Cloud provider: %s', providerName);
    cachedProvider = instance;
    return instance;
  }

  // Auto-detect: try Browserbase env vars
  const browserbase = new BrowserbaseProvider();
  if (browserbase.isConfigured()) {
    logger('Cloud provider: browserbase (auto-detected from env vars)');
    cachedProvider = browserbase;
    return browserbase;
  }

  // Auto-detect: try Browser Use env vars
  const browserUse = new BrowserUseProvider();
  if (browserUse.isConfigured()) {
    logger('Cloud provider: browser-use (auto-detected from env vars)');
    cachedProvider = browserUse;
    return browserUse;
  }

  logger('Cloud provider: local mode (no provider configured)');
  cachedProvider = null;
  return null;
}

/** Check if we're operating in local-only mode (no cloud provider). */
export function isLocalMode(): boolean {
  return getCloudProvider() === null;
}

/**
 * Register a new provider constructor at runtime.
 * Clears the cached provider so the next getCloudProvider() call re-evaluates.
 */
export function registerProvider(name: string, ctor: new (config?: Record<string, unknown>) => CloudBrowserProvider): void {
  PROVIDER_REGISTRY.set(name, ctor);
  cachedProvider = undefined;
  logger('Registered cloud provider: %s', name);
}

/** List all known providers and whether they are currently configured. */
export function listProviders(): {name: string; configured: boolean}[] {
  return Array.from(PROVIDER_REGISTRY.entries()).map(([name, Ctor]) => {
    try {
      const instance = new Ctor();
      return {name, configured: instance.isConfigured()};
    } catch {
      return {name, configured: false};
    }
  });
}
