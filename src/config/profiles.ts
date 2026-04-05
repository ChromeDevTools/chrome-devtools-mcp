/**
 * Boss Ghost MCP — Multi-profile management with CDP port allocation.
 *
 * Profiles define browser instances with isolated user data dirs,
 * CDP ports, and launch configurations. Inspired by OpenClaw's profile system.
 */

import {getConfig} from './config.js';
import type {ProfileConfig} from './types.js';
import {logger} from '../logger.js';

// CDP port range: 18800-18899 (same as OpenClaw)
const CDP_PORT_RANGE_START = 18800;
const CDP_PORT_RANGE_END = 18899;

export interface ResolvedProfile {
  name: string;
  cdpPort: number;
  cdpUrl?: string;
  userDataDir?: string;
  driver: 'managed' | 'existing-session';
  headless: boolean;
  channel: 'stable' | 'canary' | 'beta' | 'dev';
  executablePath?: string;
  extraArgs: string[];
  attachOnly: boolean;
}

/**
 * Build a ResolvedProfile from a ProfileConfig and its name.
 * Fills in defaults for any missing fields.
 */
function resolveFromConfig(
  name: string,
  config: ProfileConfig,
  portIndex: number,
): ResolvedProfile {
  const cdpPort = config.cdpPort ?? CDP_PORT_RANGE_START + portIndex;

  if (cdpPort < CDP_PORT_RANGE_START || cdpPort > CDP_PORT_RANGE_END) {
    logger(
      'Profile "%s" CDP port %d is outside range %d-%d',
      name,
      cdpPort,
      CDP_PORT_RANGE_START,
      CDP_PORT_RANGE_END,
    );
  }

  return {
    name,
    cdpPort,
    cdpUrl: config.cdpUrl,
    userDataDir: config.userDataDir,
    driver: config.driver ?? 'managed',
    headless: config.headless ?? false,
    channel: config.channel ?? 'stable',
    executablePath: config.executablePath,
    extraArgs: config.extraArgs ?? [],
    attachOnly: config.attachOnly ?? false,
  };
}

/**
 * Create a default profile with sensible defaults.
 * Used when no profiles are configured at all.
 */
function createDefaultProfile(): ResolvedProfile {
  return {
    name: 'default',
    cdpPort: CDP_PORT_RANGE_START,
    driver: 'managed',
    headless: false,
    channel: 'stable',
    extraArgs: [],
    attachOnly: false,
  };
}

/**
 * Get the default profile name from config, falling back to "default".
 */
function getDefaultProfileName(): string {
  const config = getConfig();
  return config.defaultProfile ?? 'default';
}

/**
 * Get or create the default profile.
 * If the default profile is configured, resolves it. Otherwise creates
 * a minimal managed profile automatically.
 */
export function getDefaultProfile(): ResolvedProfile {
  const config = getConfig();
  const defaultName = getDefaultProfileName();
  const profiles = config.profiles;

  if (profiles && profiles[defaultName]) {
    const keys = Object.keys(profiles);
    const portIndex = keys.indexOf(defaultName);
    return resolveFromConfig(defaultName, profiles[defaultName], portIndex);
  }

  logger('No profile "%s" found in config — using auto-generated default', defaultName);
  return createDefaultProfile();
}

/**
 * Resolve a named profile from config.
 * Returns null if the profile does not exist.
 */
export function resolveProfile(name: string): ResolvedProfile | null {
  const config = getConfig();
  const profiles = config.profiles;

  if (!profiles || !profiles[name]) {
    logger('Profile "%s" not found in config', name);
    return null;
  }

  const keys = Object.keys(profiles);
  const portIndex = keys.indexOf(name);
  return resolveFromConfig(name, profiles[name], portIndex);
}

/**
 * List all configured profiles with their resolved settings.
 * If no profiles are configured, returns a single auto-generated default.
 */
export function listProfiles(): ResolvedProfile[] {
  const config = getConfig();
  const profiles = config.profiles;

  if (!profiles || Object.keys(profiles).length === 0) {
    return [createDefaultProfile()];
  }

  const keys = Object.keys(profiles);
  return keys.map((name, idx) => resolveFromConfig(name, profiles[name], idx));
}

/**
 * Allocate the next available CDP port in the 18800-18899 range.
 * Skips any ports already in the usedPorts set.
 * Throws if no ports are available.
 */
export function allocateCdpPort(usedPorts: Set<number>): number {
  for (let port = CDP_PORT_RANGE_START; port <= CDP_PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }
  throw new Error(
    `No available CDP ports in range ${CDP_PORT_RANGE_START}-${CDP_PORT_RANGE_END}. ` +
      `All ${CDP_PORT_RANGE_END - CDP_PORT_RANGE_START + 1} ports are in use.`,
  );
}

/**
 * Ensure the default profile exists.
 * Returns the resolved default profile, auto-creating one if no profiles
 * are configured.
 */
export function ensureDefaultProfile(): ResolvedProfile {
  return getDefaultProfile();
}
