
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// src/profile-migration.ts
// Legacy profile migration utilities
// Creates symlinks from new stable paths to existing legacy paths

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { StableIdentity } from './stable-identity.js';
import { getLegacyIdentityHash } from './stable-identity.js';

const CACHE_ROOT = path.join(os.homedir(), '.cache', 'chrome-devtools-mcp');

export interface MigrationResult {
  migrated: boolean;
  from?: string; // Legacy profile path
  to?: string; // New profile path
  method?: 'symlink' | 'none';
  reason?: string;
}

/**
 * Check if legacy profile exists and create symlink for migration.
 * This preserves login sessions when upgrading to stable identity.
 *
 * @param projectRoot - The project root directory
 * @param newIdentity - The new stable identity
 * @param projectName - The sanitized project name
 * @param clientId - The MCP client ID
 * @param channel - The Chrome channel
 */
export function checkAndMigrateLegacyProfile(
  projectRoot: string,
  newIdentity: StableIdentity,
  projectName: string,
  clientId: string,
  channel: string,
): MigrationResult {
  // Skip migration if disabled
  if (process.env.MCP_DISABLE_MIGRATION === 'true') {
    return { migrated: false, method: 'none', reason: 'MCP_DISABLE_MIGRATION' };
  }

  // Skip migration if using directory-fallback (same as legacy)
  if (newIdentity.source === 'directory-fallback') {
    return { migrated: false, method: 'none', reason: 'same-as-legacy' };
  }

  // Calculate legacy path (realpath-based)
  const legacyHash = getLegacyIdentityHash(projectRoot);
  const legacyKey = `${projectName}_${legacyHash}`;
  const legacyPath = path.join(CACHE_ROOT, 'profiles', legacyKey, clientId, channel);

  // Calculate new path (stable identity)
  const newKey = `${projectName}_${newIdentity.id}`;
  const newPath = path.join(CACHE_ROOT, 'profiles', newKey, clientId, channel);

  // If paths are the same, no migration needed
  if (legacyPath === newPath) {
    return { migrated: false, method: 'none', reason: 'paths-identical' };
  }

  // If new path already exists, no migration needed
  if (fs.existsSync(newPath)) {
    return { migrated: false, method: 'none', reason: 'new-path-exists' };
  }

  // If legacy path doesn't exist, no migration needed
  if (!fs.existsSync(legacyPath)) {
    return { migrated: false, method: 'none', reason: 'no-legacy-profile' };
  }

  // Legacy exists, new doesn't - create symlink
  try {
    console.error(`[migration] Legacy profile detected: ${legacyPath}`);
    console.error(`[migration] Creating symlink for stable identity: ${newPath}`);

    // Create parent directories
    fs.mkdirSync(path.dirname(newPath), { recursive: true });

    // Create symlink (new -> legacy)
    fs.symlinkSync(legacyPath, newPath, 'dir');

    console.error(`[migration] ✅ Migration complete: ${newPath} -> ${legacyPath}`);

    return {
      migrated: true,
      from: legacyPath,
      to: newPath,
      method: 'symlink',
    };
  } catch (err) {
    console.error(`[migration] ⚠️ Migration failed: ${(err as Error).message}`);
    return {
      migrated: false,
      method: 'none',
      reason: `symlink-failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Get profile path for a given project key.
 */
export function getProfilePath(
  projectKey: string,
  clientId: string,
  channel: string,
): string {
  return path.join(CACHE_ROOT, 'profiles', projectKey, clientId, channel);
}
