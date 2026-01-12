/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Roots Manager
 *
 * Manages MCP roots (project directories) and generates stable profile keys.
 * Implements the MCP Roots protocol for project-scoped Chrome profiles.
 */

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {detectProjectName} from './project-detector.js';
import {resolveStableIdentity} from './stable-identity.js';

export interface RootsInfo {
  /** Stable hash key derived from roots URIs + client info */
  profileKey: string;
  /** Human-readable project name (if available) */
  projectName: string;
  /** Raw roots URIs from client */
  rootsUris: string[];
  /** Client name (e.g., "claude-code", "cursor") */
  clientName: string;
  /** Client version */
  clientVersion: string;
  /** How roots were obtained */
  source: 'roots/list' | 'MCP_PROJECT_ROOT' | '--project-root' | 'AUTO';
}

/**
 * Fetch roots from MCP client using roots/list protocol
 */
export async function fetchRootsFromClient(
  server: Server,
): Promise<{roots: Array<{uri: string; name?: string}>} | null> {
  const clientCaps = server.getClientCapabilities();
  if (!clientCaps?.roots) {
    console.error('[roots] Client does not support roots capability');
    return null;
  }

  try {
    console.error('[roots] Requesting roots/list from client...');
    const result = await server.listRoots({}, {timeout: 5000});
    console.error(`[roots] Received ${result.roots.length} roots from client`);
    return result;
  } catch (error) {
    console.error(
      `[roots] Failed to fetch roots from client: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Generate stable profile key from roots and client info
 * Format: projectName_hash (e.g., "my-app_2ca5dbf5")
 *
 * @param rootsUris - Array of root URIs (used for fallback hash if stableIdentityHash not provided)
 * @param clientName - Client name (e.g., "claude-code")
 * @param clientVersion - Client version (not used in hash for stability)
 * @param projectName - Human-readable project name
 * @param stableIdentityHash - Optional stable identity hash (from git remote, etc.)
 */
export function generateProfileKey(
  rootsUris: string[],
  clientName: string,
  clientVersion: string,
  projectName?: string,
  stableIdentityHash?: string,
): string {
  let hash: string;

  if (stableIdentityHash) {
    // Use stable identity hash (preferred - survives directory moves)
    hash = stableIdentityHash;
  } else {
    // Fallback: URI-based hash
    const sortedUris = [...rootsUris].sort();
    const keyMaterial = JSON.stringify({
      roots: sortedUris,
      client: clientName,
    });
    hash = createHash('sha256').update(keyMaterial).digest('hex').slice(0, 8);
  }

  // Include project name for clarity (if available)
  if (projectName) {
    const sanitized = projectName.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    return `${sanitized}_${hash}`;
  }

  return hash;
}

/**
 * Extract project name from roots URIs
 * Uses detectProjectName() to read package.json name (preferred)
 * Falls back to directory name if package.json not found
 */
export function extractProjectName(
  roots: Array<{uri: string; name?: string}>,
): string {
  if (roots.length === 0) {
    return 'unknown';
  }

  // Prefer explicit name if provided by MCP client
  const firstRoot = roots[0];
  if (firstRoot.name) {
    return sanitizeProjectName(firstRoot.name);
  }

  // Extract from file:// URI using detectProjectName (reads package.json)
  try {
    const url = new URL(firstRoot.uri);
    if (url.protocol === 'file:') {
      // Convert URI to file path
      const rootPath = fileURLToPath(url);

      // Resolve realpath for symlink handling
      let realPath: string;
      try {
        realPath = fs.realpathSync(rootPath);
      } catch {
        realPath = rootPath; // Use original if realpath fails
      }

      // Use detectProjectName to read package.json name
      const name = detectProjectName(realPath);
      return sanitizeProjectName(name);
    }
  } catch {
    // Fall through to default
  }

  return 'unknown';
}

/**
 * Sanitize project name for use in file paths
 */
function sanitizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

/**
 * Get stable identity hash from a root path
 * Returns undefined if stable identity cannot be resolved
 */
function getStableIdentityHash(rootPath: string): string | undefined {
  try {
    const identity = resolveStableIdentity(rootPath);
    // Only use stable identity for high-confidence sources (git-based)
    if (identity.confidence === 'high' || identity.source === 'MCP_PROFILE_ID') {
      return identity.id;
    }
  } catch {
    // Fall through to URI-based hash
  }
  return undefined;
}

/**
 * Get root path from URI
 */
function getRootPathFromUri(uri: string): string | undefined {
  try {
    const url = new URL(uri);
    if (url.protocol === 'file:') {
      const rootPath = fileURLToPath(url);
      try {
        return fs.realpathSync(rootPath);
      } catch {
        return rootPath;
      }
    }
  } catch {
    // Ignore
  }
  return undefined;
}

/**
 * Resolve roots information from MCP client or fallbacks
 */
export async function resolveRoots(
  server: Server,
  fallbackOptions: {
    cliProjectRoot?: string;
    envProjectRoot?: string;
    autoCwd?: string;
  },
): Promise<RootsInfo> {
  const clientInfo = server.getClientVersion();
  const clientName = clientInfo?.name || 'unknown-client';
  const clientVersion = clientInfo?.version || '0.0.0';

  // 1) Try roots/list from client (preferred)
  const rootsResult = await fetchRootsFromClient(server);
  if (rootsResult && rootsResult.roots.length > 0) {
    const rootsUris = rootsResult.roots.map(r => r.uri);
    const projectName = extractProjectName(rootsResult.roots);

    // Get stable identity hash from first root
    const rootPath = getRootPathFromUri(rootsUris[0]);
    const stableHash = rootPath ? getStableIdentityHash(rootPath) : undefined;
    const profileKey = generateProfileKey(rootsUris, clientName, clientVersion, projectName, stableHash);

    console.error(
      `[roots] Resolved via roots/list: key=${profileKey}, project=${projectName}, client=${clientName}, stableId=${stableHash || 'none'}`,
    );

    return {
      profileKey,
      projectName,
      rootsUris,
      clientName,
      clientVersion,
      source: 'roots/list',
    };
  }

  // 2) Fallback: CLI argument --project-root
  if (fallbackOptions.cliProjectRoot) {
    const uri = pathToFileUri(fallbackOptions.cliProjectRoot);
    const projectName = extractProjectName([{uri}]);

    // Get stable identity hash
    const stableHash = getStableIdentityHash(fallbackOptions.cliProjectRoot);
    const profileKey = generateProfileKey([uri], clientName, clientVersion, projectName, stableHash);

    console.error(
      `[roots] Resolved via --project-root: key=${profileKey}, project=${projectName}, stableId=${stableHash || 'none'}`,
    );

    return {
      profileKey,
      projectName,
      rootsUris: [uri],
      clientName,
      clientVersion,
      source: '--project-root',
    };
  }

  // 3) Fallback: Environment variable MCP_PROJECT_ROOT
  if (fallbackOptions.envProjectRoot) {
    const uri = pathToFileUri(fallbackOptions.envProjectRoot);
    const projectName = extractProjectName([{uri}]);

    // Get stable identity hash
    const stableHash = getStableIdentityHash(fallbackOptions.envProjectRoot);
    const profileKey = generateProfileKey([uri], clientName, clientVersion, projectName, stableHash);

    console.error(
      `[roots] Resolved via MCP_PROJECT_ROOT: key=${profileKey}, project=${projectName}, stableId=${stableHash || 'none'}`,
    );

    return {
      profileKey,
      projectName,
      rootsUris: [uri],
      clientName,
      clientVersion,
      source: 'MCP_PROJECT_ROOT',
    };
  }

  // 4) Fallback: AUTO (cwd-based, last resort)
  if (fallbackOptions.autoCwd) {
    const uri = pathToFileUri(fallbackOptions.autoCwd);
    const projectName = extractProjectName([{uri}]);

    // Get stable identity hash
    const stableHash = getStableIdentityHash(fallbackOptions.autoCwd);
    const profileKey = generateProfileKey([uri], clientName, clientVersion, projectName, stableHash);

    console.error(
      `[roots] Resolved via AUTO (cwd): key=${profileKey}, project=${projectName}, stableId=${stableHash || 'none'}`,
    );

    return {
      profileKey,
      projectName,
      rootsUris: [uri],
      clientName,
      clientVersion,
      source: 'AUTO',
    };
  }

  // Absolute fallback
  const fallbackUri = 'file:///unknown';
  const fallbackProjectName = 'unknown';
  const profileKey = generateProfileKey([fallbackUri], clientName, clientVersion, fallbackProjectName);

  console.error('[roots] WARNING: No roots available, using fallback');

  return {
    profileKey,
    projectName: fallbackProjectName,
    rootsUris: [fallbackUri],
    clientName,
    clientVersion,
    source: 'AUTO',
  };
}

/**
 * Convert absolute file path to file:// URI
 */
function pathToFileUri(absPath: string): string {
  // Normalize path and convert to file:// URI
  const normalized = absPath.replace(/\\/g, '/');
  const withoutLeadingSlash = normalized.startsWith('/')
    ? normalized
    : '/' + normalized;
  return `file://${withoutLeadingSlash}`;
}
