
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// src/stable-identity.ts
// Stable project identity detection for profile persistence across directory moves
// Priority: MCP_PROFILE_ID > git remote origin > git first commit > package.json name > directory fallback

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type StableIdentitySource =
  | 'MCP_PROFILE_ID' // Explicit env var (highest priority)
  | 'git-remote-origin' // git remote get-url origin
  | 'git-first-commit' // git rev-list --max-parents=0 HEAD
  | 'package-name' // package.json name field
  | 'directory-fallback'; // Legacy behavior (realpath hash)

export interface StableIdentity {
  id: string; // Stable identifier (8 chars for hash-based, or sanitized for explicit)
  source: StableIdentitySource;
  raw: string; // Raw value before hashing
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Resolve stable project identity in priority order.
 * This identity remains stable even when the project directory is moved.
 */
export function resolveStableIdentity(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): StableIdentity {
  // 1. Check explicit env var (highest priority)
  const explicitId = env.MCP_PROFILE_ID?.trim();
  if (explicitId) {
    return {
      id: sanitizeIdentity(explicitId),
      source: 'MCP_PROFILE_ID',
      raw: explicitId,
      confidence: 'high',
    };
  }

  // 2. Try git remote origin URL (stable across moves)
  const remoteName = env.MCP_GIT_REMOTE || 'origin';
  const remoteUrl = getGitRemoteOrigin(projectRoot, remoteName);
  if (remoteUrl) {
    const normalized = normalizeGitUrl(remoteUrl);
    return {
      id: shortHash(normalized),
      source: 'git-remote-origin',
      raw: remoteUrl,
      confidence: 'high',
    };
  }

  // 3. Try git first commit hash (stable, works offline)
  const firstCommit = getGitFirstCommit(projectRoot);
  if (firstCommit) {
    return {
      id: firstCommit.slice(0, 8), // Use first 8 chars of commit hash directly
      source: 'git-first-commit',
      raw: firstCommit,
      confidence: 'high',
    };
  }

  // 4. Try package.json name (semi-stable, may conflict)
  const packageName = getPackageName(projectRoot);
  if (packageName) {
    return {
      id: shortHash(packageName),
      source: 'package-name',
      raw: packageName,
      confidence: 'medium', // May conflict if same name in different projects
    };
  }

  // 5. Fallback to directory-based (legacy behavior)
  const realPath = realpathSafe(projectRoot);
  return {
    id: shortHash(realPath),
    source: 'directory-fallback',
    raw: realPath,
    confidence: 'low',
  };
}

/**
 * Get legacy identity hash (realpath-based) for migration detection.
 */
export function getLegacyIdentityHash(projectRoot: string): string {
  const realPath = realpathSafe(projectRoot);
  return shortHash(realPath);
}

// --- Git Utilities ---

/**
 * Get git remote origin URL.
 * Returns null if not a git repo or no remote configured.
 */
function getGitRemoteOrigin(cwd: string, remoteName = 'origin'): string | null {
  try {
    const result = spawnSync('git', ['remote', 'get-url', remoteName], {
      cwd,
      timeout: 500,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    if (result.status === 0 && result.stdout) {
      const url = result.stdout.trim();
      return url || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Get hash of the first commit in git history.
 * This is stable even when project is moved.
 */
function getGitFirstCommit(cwd: string): string | null {
  try {
    const result = spawnSync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      cwd,
      timeout: 500,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    if (result.status === 0 && result.stdout) {
      // May have multiple roots for merged repos, use first
      const commits = result.stdout.trim().split('\n');
      return commits[0] || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Normalize git URL for consistent hashing.
 * Handles: SSH, HTTPS, with/without .git suffix
 *
 * Examples:
 *   git@github.com:user/repo.git -> github.com/user/repo
 *   https://github.com/user/repo.git -> github.com/user/repo
 *   ssh://git@github.com/user/repo -> github.com/user/repo
 */
export function normalizeGitUrl(url: string): string {
  let normalized = url.trim();

  // Remove ssh:// prefix
  normalized = normalized.replace(/^ssh:\/\//, '');

  // Remove git@ prefix
  normalized = normalized.replace(/^git@/, '');

  // Remove https:// or http:// prefix
  normalized = normalized.replace(/^https?:\/\//, '');

  // Replace : with / (SSH style urls like github.com:user/repo)
  normalized = normalized.replace(/:(?!\/)/, '/');

  // Remove .git suffix
  normalized = normalized.replace(/\.git$/, '');

  // Lowercase for consistency
  normalized = normalized.toLowerCase();

  return normalized;
}

// --- Package.json Utilities ---

/**
 * Get package name from package.json.
 */
function getPackageName(projectRoot: string): string | null {
  const pjPath = path.join(projectRoot, 'package.json');
  try {
    if (fs.existsSync(pjPath)) {
      const pkg = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
      if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) {
        return pkg.name.trim();
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

// --- Hash Utilities ---

function shortHash(s: string): string {
  try {
    return crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
  } catch {
    return '00000000';
  }
}

function sanitizeIdentity(s: string): string {
  // Allow alphanumeric, dash, underscore only
  const sanitized = s.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  // Truncate to reasonable length (32 chars max)
  return sanitized.slice(0, 32) || 'profile';
}

function realpathSafe(p: string): string {
  try {
    const rp = (fs.realpathSync as any).native
      ? (fs.realpathSync as any).native(p)
      : fs.realpathSync(p);
    return rp;
  } catch {
    return path.normalize(p);
  }
}
