/**
 * Manifest Loader
 *
 * Loads and validates the driver manifest file.
 * Provides URL-to-driver resolution based on manifest patterns.
 */

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Driver entry from manifest
 */
export interface ManifestDriver {
  name: string;
  match: string[];
  description?: string;
  enabled?: boolean;
}

/**
 * Full manifest structure
 */
export interface Manifest {
  version: string;
  description?: string;
  drivers: ManifestDriver[];
}

let cachedManifest: Manifest | null = null;

/**
 * Load the manifest file
 * Results are cached after first load
 */
export function loadManifest(): Manifest {
  if (cachedManifest) {
    return cachedManifest;
  }

  const manifestPath = join(__dirname, 'manifest.json');
  try {
    const content = readFileSync(manifestPath, 'utf-8');
    cachedManifest = JSON.parse(content) as Manifest;
    return cachedManifest;
  } catch (error) {
    console.error('[manifest] Failed to load manifest:', error);
    // Return default manifest if file is missing
    return {
      version: '1.0.0',
      drivers: [
        {name: 'chatgpt', match: ['https://chatgpt.com/*', 'https://chat.openai.com/*']},
        {name: 'gemini', match: ['https://gemini.google.com/*']},
      ],
    };
  }
}

/**
 * Find driver name for a given URL
 * @param url - URL to match
 * @returns Driver name or undefined if no match
 */
export function findDriverForUrl(url: string): string | undefined {
  const manifest = loadManifest();

  for (const driver of manifest.drivers) {
    if (driver.enabled === false) continue;

    for (const pattern of driver.match) {
      if (matchUrlPattern(url, pattern)) {
        return driver.name;
      }
    }
  }

  return undefined;
}

/**
 * Get all enabled drivers from manifest
 */
export function getEnabledDrivers(): ManifestDriver[] {
  const manifest = loadManifest();
  return manifest.drivers.filter(d => d.enabled !== false);
}

/**
 * Match a URL against a glob-style pattern
 * Supports * as wildcard
 */
function matchUrlPattern(url: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(url);
}

/**
 * Clear the manifest cache (for testing)
 */
export function clearManifestCache(): void {
  cachedManifest = null;
}
