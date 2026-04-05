/**
 * Boss Ghost MCP — JSON config file loader.
 *
 * Loads configuration from ~/.boss-ghost/config.json, merges with CLI args
 * (CLI takes precedence), and exposes a singleton via getConfig().
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {logger} from '../logger.js';
import type {BossGhostConfig} from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.boss-ghost');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const EMPTY_CONFIG: BossGhostConfig = {};

let currentConfig: BossGhostConfig = EMPTY_CONFIG;
let configLoaded = false;

/**
 * Validate that a parsed JSON value looks like a BossGhostConfig.
 * Performs basic structural checks without a schema library.
 */
function validateConfig(value: unknown): BossGhostConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Config must be a JSON object');
  }

  const obj = value as Record<string, unknown>;

  if (obj.defaultProfile !== undefined && typeof obj.defaultProfile !== 'string') {
    throw new Error('defaultProfile must be a string');
  }

  if (obj.profiles !== undefined) {
    if (typeof obj.profiles !== 'object' || obj.profiles === null || Array.isArray(obj.profiles)) {
      throw new Error('profiles must be an object');
    }
  }

  if (obj.security !== undefined) {
    if (typeof obj.security !== 'object' || obj.security === null || Array.isArray(obj.security)) {
      throw new Error('security must be an object');
    }
  }

  if (obj.ghostMode !== undefined) {
    if (typeof obj.ghostMode !== 'object' || obj.ghostMode === null || Array.isArray(obj.ghostMode)) {
      throw new Error('ghostMode must be an object');
    }
    const gm = obj.ghostMode as Record<string, unknown>;
    if (gm.stealthLevel !== undefined) {
      const allowed = ['maximum', 'high', 'medium', 'low'];
      if (!allowed.includes(gm.stealthLevel as string)) {
        throw new Error(`ghostMode.stealthLevel must be one of: ${allowed.join(', ')}`);
      }
    }
  }

  if (obj.providers !== undefined) {
    if (typeof obj.providers !== 'object' || obj.providers === null || Array.isArray(obj.providers)) {
      throw new Error('providers must be an object');
    }
  }

  return value as BossGhostConfig;
}

/**
 * Load configuration from ~/.boss-ghost/config.json.
 * Returns empty defaults if the file does not exist.
 * Throws on malformed JSON or validation errors.
 */
function loadConfigFromDisk(): BossGhostConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    logger('No config file found at %s — using defaults', CONFIG_PATH);
    return {...EMPTY_CONFIG};
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    const config = validateConfig(parsed);
    logger('Loaded config from %s', CONFIG_PATH);
    return config;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger('Failed to load config from %s: %s', CONFIG_PATH, message);
    throw new Error(`Invalid boss-ghost config at ${CONFIG_PATH}: ${message}`);
  }
}

/**
 * Deep-merge source into target. Arrays are replaced, not concatenated.
 * CLI overrides (source) take precedence over config file values (target).
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result = {...target} as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];

    if (srcVal === undefined) {
      continue;
    }

    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }

  return result as T;
}

/**
 * Return the current configuration singleton.
 * Automatically loads from disk on first call.
 */
export function getConfig(): BossGhostConfig {
  if (!configLoaded) {
    currentConfig = loadConfigFromDisk();
    configLoaded = true;
  }
  return currentConfig;
}

/**
 * Reload configuration from disk, discarding any in-memory state.
 * Useful for hot-reload scenarios.
 */
export function reloadConfig(): BossGhostConfig {
  configLoaded = false;
  currentConfig = EMPTY_CONFIG;
  return getConfig();
}

/**
 * Merge CLI argument overrides on top of the file-based config.
 * Call this after parsing CLI args to ensure CLI takes precedence.
 */
export function mergeCliOverrides(cliOverrides: Record<string, unknown>): BossGhostConfig {
  const base = getConfig();
  currentConfig = deepMerge(base as Record<string, unknown>, cliOverrides) as BossGhostConfig;
  logger('Merged CLI overrides into config');
  return currentConfig;
}

/**
 * Save the current configuration to ~/.boss-ghost/config.json.
 * Auto-creates the ~/.boss-ghost/ directory if it doesn't exist.
 */
export function saveConfig(config?: BossGhostConfig): void {
  const toSave = config ?? currentConfig;

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, {recursive: true});
    logger('Created config directory: %s', CONFIG_DIR);
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
  logger('Saved config to %s', CONFIG_PATH);

  // Update in-memory state to match what was saved
  currentConfig = toSave;
  configLoaded = true;
}

/**
 * Return the resolved path to the config file.
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}
