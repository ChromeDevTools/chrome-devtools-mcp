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
import type {Server} from '@modelcontextprotocol/sdk/server/index.js';

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
 */
export function generateProfileKey(
  rootsUris: string[],
  clientName: string,
  clientVersion: string,
  projectName?: string,
): string {
  // Sort URIs for consistent hashing across multi-root workspaces
  const sortedUris = [...rootsUris].sort();

  // Note: clientVersion is intentionally excluded from hash
  // to keep profiles stable across client updates
  const keyMaterial = JSON.stringify({
    roots: sortedUris,
    client: clientName,
  });

  // Use first 8 chars of SHA-256 for stable, collision-resistant key
  const hash = createHash('sha256').update(keyMaterial).digest('hex').slice(0, 8);

  // Include project name for clarity (if available)
  if (projectName) {
    const sanitized = projectName.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    return `${sanitized}_${hash}`;
  }

  return hash;
}

/**
 * Extract project name from roots URIs
 */
export function extractProjectName(
  roots: Array<{uri: string; name?: string}>,
): string {
  if (roots.length === 0) {
    return 'unknown';
  }

  // Prefer explicit name if provided
  const firstRoot = roots[0];
  if (firstRoot.name) {
    return sanitizeProjectName(firstRoot.name);
  }

  // Extract from file:// URI
  try {
    const url = new URL(firstRoot.uri);
    if (url.protocol === 'file:') {
      const pathParts = url.pathname.split('/').filter(Boolean);
      const dirName = pathParts[pathParts.length - 1] || 'root';
      return sanitizeProjectName(dirName);
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
    const profileKey = generateProfileKey(rootsUris, clientName, clientVersion, projectName);

    console.error(
      `[roots] Resolved via roots/list: key=${profileKey}, project=${projectName}, client=${clientName}`,
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
    const profileKey = generateProfileKey([uri], clientName, clientVersion, projectName);

    console.error(
      `[roots] Resolved via --project-root: key=${profileKey}, project=${projectName}`,
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
    const profileKey = generateProfileKey([uri], clientName, clientVersion, projectName);

    console.error(
      `[roots] Resolved via MCP_PROJECT_ROOT: key=${profileKey}, project=${projectName}`,
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
    const profileKey = generateProfileKey([uri], clientName, clientVersion, projectName);

    console.error(
      `[roots] Resolved via AUTO (cwd): key=${profileKey}, project=${projectName}`,
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
