/**
 * Driver Registry
 *
 * Manages registration and lookup of site drivers.
 * URL patterns are matched to find the appropriate driver.
 */

import type {SiteDriver, DriverMeta} from './types.js';

interface RegisteredDriver {
  meta: DriverMeta;
  factory: () => SiteDriver;
}

const drivers = new Map<string, RegisteredDriver>();

/**
 * Register a driver with the registry
 * @param meta - Driver metadata including URL patterns
 * @param factory - Factory function to create driver instances
 */
export function registerDriver(meta: DriverMeta, factory: () => SiteDriver): void {
  if (drivers.has(meta.name)) {
    console.warn(`[registry] Driver ${meta.name} already registered, overwriting`);
  }
  drivers.set(meta.name, {meta, factory});
}

/**
 * Get a driver by name
 * @param name - Driver name (e.g., 'chatgpt', 'gemini')
 * @returns Driver instance or undefined
 */
export function getDriver(name: string): SiteDriver | undefined {
  const registered = drivers.get(name);
  return registered?.factory();
}

/**
 * Find a driver that matches the given URL
 * @param url - URL to match against driver patterns
 * @returns Driver instance or undefined
 */
export function getDriverForUrl(url: string): SiteDriver | undefined {
  for (const [, registered] of drivers) {
    for (const pattern of registered.meta.urlPatterns) {
      if (matchUrlPattern(url, pattern)) {
        return registered.factory();
      }
    }
  }
  return undefined;
}

/**
 * Get all registered driver names
 */
export function getDriverNames(): string[] {
  return Array.from(drivers.keys());
}

/**
 * Get metadata for all registered drivers
 */
export function getAllDriverMeta(): DriverMeta[] {
  return Array.from(drivers.values()).map(d => d.meta);
}

/**
 * Match a URL against a pattern (simple glob-style matching)
 * Supports * as wildcard
 */
function matchUrlPattern(url: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*/g, '.*'); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(url);
}
