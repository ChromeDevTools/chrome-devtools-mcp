// src/profile-resolver.ts
// Phase 1 (v0.15.0) + v0.15.1 (MCP_CLIENT_ID support) + v0.17.0 (Hierarchical profiles)
// - Hybrid priority (CLI > MCP_USER_DATA_DIR > MCP_PROJECT_ID > AUTO > DEFAULT)
// - Auto-detection (git root -> nearest package.json -> cwd)
// - Realpath normalization
// - Tilde (~) expansion
// - Short SHA-256 hash (8 chars)
// - CI detection => ephemeral session profile (unless MCP_PERSIST_PROFILES)
// - Client ID isolation (MCP_CLIENT_ID environment variable)
// - Hierarchical structure: {project}/{client}/{channel} (v0.17.0)
// - Minimal console.error() logging of decision

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { detectProjectName, detectProjectRoot } from './project-detector.js';
import { detectClientType } from './client-detector.js';
import type { RootsInfo } from './roots-manager.js';
import { getProjectRoot } from './project-root-state.js';

export interface ResolvedProfile {
  path: string;
  reason: 'CLI' | 'MCP_USER_DATA_DIR' | 'MCP_PROJECT_ID' | 'AUTO' | 'DEFAULT' | 'roots/list' | 'MCP_PROJECT_ROOT' | '--project-root';
  projectKey: string; // e.g., "my-ext-app_1a2b3c4d" (v0.17.0: clientId removed)
  projectName: string; // e.g., "my-ext-app"
  hash: string; // e.g., "1a2b3c4d"
  clientId: string; // e.g., "claude-code" | "codex" | "default"
  channel: string; // "stable" | "canary" | "beta" | "dev"
}

type ResolveOpts = {
  cliUserDataDir?: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  channel: 'stable' | 'canary' | 'beta' | 'dev';
  rootsInfo?: RootsInfo; // v0.18.0: Roots-based profile resolution
};

const CACHE_ROOT = path.join(os.homedir(), '.cache', 'chrome-devtools-mcp');

// --- Public API ---

export function resolveUserDataDir(opts: ResolveOpts): ResolvedProfile {
  const channel = opts.channel || 'stable';

  // v0.18.0: PRIORITY 0 - Use Roots info if available
  if (opts.rootsInfo) {
    const profilePath = path.join(
      CACHE_ROOT,
      'profiles',
      opts.rootsInfo.profileKey,
      opts.rootsInfo.clientName,
      channel,
    );
    const normalized = pathNormalize(profilePath);
    const result: ResolvedProfile = {
      path: normalized,
      reason: opts.rootsInfo.source as ResolvedProfile['reason'],
      projectKey: opts.rootsInfo.profileKey,
      projectName: opts.rootsInfo.projectName,
      hash: opts.rootsInfo.profileKey.slice(0, 8), // Use first 8 chars as hash
      clientId: opts.rootsInfo.clientName,
      channel,
    };
    console.error(
      `[profiles] Resolved via Roots (${opts.rootsInfo.source}): ${result.path}`,
    );
    console.error(
      `[profiles]   project=${opts.rootsInfo.projectName}, client=${opts.rootsInfo.clientName}, key=${opts.rootsInfo.profileKey}`,
    );
    return result;
  }

  // Auto-detect client type from parent process if MCP_CLIENT_ID not set
  let clientId: string;
  if (opts.env.MCP_CLIENT_ID) {
    clientId = sanitize(opts.env.MCP_CLIENT_ID);
    console.error(`[profiles] Using explicit MCP_CLIENT_ID: ${clientId}`);
  } else {
    const detected = detectClientType();
    clientId = sanitize(detected);
    console.error(`[profiles] Auto-detected client from parent process: ${clientId}`);
  }

  // 0a) MCP_SHARED_PROFILE → shared profile across all projects
  //     - Uses a single profile for all projects to avoid re-login
  if (opts.env.MCP_SHARED_PROFILE === 'true') {
    const key = 'shared';
    const p = projectProfilePath(key, clientId, channel);
    const result: ResolvedProfile = {
      path: p,
      reason: 'MCP_USER_DATA_DIR', // Treat as explicit user choice
      projectKey: key,
      projectName: 'shared',
      hash: '00000000',
      clientId,
      channel,
    };
    console.error(
      `[profiles] resolved(MCP_SHARED_PROFILE): ${result.path} (client=${clientId})`,
    );
    console.error(
      `[profiles] ℹ️  Using shared profile - login state persists across all projects`,
    );
    return result;
  }

  // 0b) CI detection → ephemeral session directory (unless MCP_PERSIST_PROFILES)
  //    - This happens before other priorities to keep CI clean by default.
  if (isCI(opts.env) && !opts.env.MCP_PERSIST_PROFILES) {
    const sessionId = `${process.pid}-${Date.now()}`;
    const tempPath = realpathSafe(
      path.join(CACHE_ROOT, 'sessions', sessionId, channel),
    );

    // best-effort cleanup on exit
    process.on('exit', () => {
      try {
        fs.rmSync(tempPath, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    const result: ResolvedProfile = {
      path: tempPath,
      reason: 'AUTO', // keep enum as specified (no EPHEMERAL type in Phase 1)
      projectKey: `session-${sessionId}_${clientId}`,
      projectName: 'ci-session',
      hash: sessionId,
      clientId,
      channel,
    };

    // concise decision log (resolver-side)
    console.error(
      `[profiles] resolved(AUTO, ci-ephemeral): ${result.path} (session=${sessionId}, client=${clientId})`,
    );
    return result;
  }

  // 1) CLI explicit userDataDir
  if (opts.cliUserDataDir && opts.cliUserDataDir.trim().length > 0) {
    const p = realpathOrExpand(opts.cliUserDataDir);
    const result: ResolvedProfile = {
      path: p,
      reason: 'CLI',
      projectKey: `${stripHomeForKey(p)}_${clientId}`,
      projectName: 'cli',
      hash: shortHash(p),
      clientId,
      channel,
    };
    console.error(`[profiles] resolved(CLI): ${result.path} (client=${clientId})`);
    return result;
  }

  // 2) ENV: MCP_USER_DATA_DIR (full path)
  const envUserData = opts.env.MCP_USER_DATA_DIR?.trim();
  if (envUserData) {
    const p = realpathOrExpand(envUserData);
    const result: ResolvedProfile = {
      path: p,
      reason: 'MCP_USER_DATA_DIR',
      projectKey: `${stripHomeForKey(p)}_${clientId}`,
      projectName: 'env',
      hash: shortHash(p),
      clientId,
      channel,
    };
    console.error(`[profiles] resolved(MCP_USER_DATA_DIR): ${result.path} (client=${clientId})`);
    return result;
  }

  // 3) ENV: MCP_PROJECT_ID (project-scoped persistent profile)
  const projectId = sanitize(opts.env.MCP_PROJECT_ID || '');
  if (projectId) {
    const key = projectId; // v0.17.0: clientId removed from projectKey
    const p = projectProfilePath(key, clientId, channel);
    const result: ResolvedProfile = {
      path: p,
      reason: 'MCP_PROJECT_ID',
      projectKey: key,
      projectName: projectId,
      hash: shortHash(projectId),
      clientId,
      channel,
    };
    console.error(
      `[profiles] resolved(MCP_PROJECT_ID): ${result.path} (projectId=${projectId}, client=${clientId})`,
    );
    return result;
  }

  // 3.5) ENV: MCP_PROJECT_ROOT (MCP Roots protocol - actual project directory)
  const projectRoot = opts.env.MCP_PROJECT_ROOT;
  if (projectRoot) {
    console.error(`[profiles] MCP_PROJECT_ROOT detected: "${projectRoot}"`);
    try {
      const name = detectProjectName(projectRoot);
      console.error(`[profiles] MCP_PROJECT_ROOT name="${name}"`);
      const realRoot = realpathSafe(projectRoot);
      const hash = shortHash(realRoot);
      const key = `${sanitize(name)}_${hash}`;
      const p = projectProfilePath(key, clientId, channel);

      const result: ResolvedProfile = {
        path: p,
        reason: 'MCP_PROJECT_ROOT',
        projectKey: key,
        projectName: sanitize(name),
        hash,
        clientId,
        channel,
      };
      console.error(
        `[profiles] resolved(MCP_PROJECT_ROOT): ${result.path} (root=${projectRoot}, name=${name}, hash=${hash}, client=${clientId})`,
      );
      return result;
    } catch (e) {
      console.error(`[profiles] MCP_PROJECT_ROOT resolution failed: ${e}`);
      // Fall through to AUTO detection
    }
  }

  // 4) INITIALIZED_PROJECT_ROOT: Use globally initialized project root (highest priority for AUTO mode)
  const initializedRoot = getProjectRoot();
  if (initializedRoot) {
    console.error(`[profiles] Using initialized project root: "${initializedRoot}"`);
    try {
      const name = detectProjectName(initializedRoot);
      console.error(`[profiles] Initialized root name="${name}"`);
      const realRoot = realpathSafe(initializedRoot);
      const hash = shortHash(realRoot);
      const key = `${sanitize(name)}_${hash}`;
      const p = projectProfilePath(key, clientId, channel);

      const result: ResolvedProfile = {
        path: p,
        reason: 'AUTO',
        projectKey: key,
        projectName: sanitize(name),
        hash,
        clientId,
        channel,
      };
      console.error(
        `[profiles] resolved(INITIALIZED_ROOT): ${result.path} (root=${initializedRoot}, name=${name}, hash=${hash}, client=${clientId})`,
      );
      return result;
    } catch (e) {
      console.error(`[profiles] Initialized root resolution failed: ${e}`);
      // Fall through to cwd-based AUTO detection
    }
  }

  // 5) AUTO: detect by root -> name -> hash (fallback if no initialized root)
  try {
    console.error(`[profiles] AUTO detection (cwd fallback): cwd="${opts.cwd}"`);
    const root = detectProjectRoot(opts.cwd);
    console.error(`[profiles] AUTO detection: root="${root}"`);
    const name = detectProjectName(root);
    console.error(`[profiles] AUTO detection: name="${name}"`);
    const realRoot = realpathSafe(root);
    const hash = shortHash(realRoot);
    const key = `${sanitize(name)}_${hash}`; // v0.17.0: clientId removed from projectKey
    const p = projectProfilePath(key, clientId, channel);

    const result: ResolvedProfile = {
      path: p,
      reason: 'AUTO',
      projectKey: key,
      projectName: sanitize(name),
      hash,
      clientId,
      channel,
    };
    console.error(
      `[profiles] resolved(AUTO): ${result.path} (root=${root}, name=${name}, hash=${hash}, client=${clientId})`,
    );
    return result;
  } catch (e) {
    console.error(`[profiles] AUTO detection FAILED: ${e}`);
    // 5) DEFAULT fallback
    const key = 'project-default'; // v0.17.0: clientId removed from projectKey
    const p = projectProfilePath(key, clientId, channel);
    const result: ResolvedProfile = {
      path: p,
      reason: 'DEFAULT',
      projectKey: key,
      projectName: 'project-default',
      hash: '00000000',
      clientId,
      channel,
    };
    console.error(
      `[profiles] resolved(DEFAULT): ${result.path} (reason=${(e as Error)?.message || 'fallback'}, client=${clientId})`,
    );
    return result;
  }
}

// --- Helpers ---

function isCI(env: NodeJS.ProcessEnv): boolean {
  // Common CI signals
  return env.CI === 'true' || env.GITHUB_ACTIONS === 'true';
}

function projectProfilePath(projectKey: string, clientId: string, channel: string): string {
  // v0.17.0: Hierarchical structure - {project}/{client}/{channel}
  const base = path.join(CACHE_ROOT, 'profiles', projectKey, clientId, channel);
  return pathNormalize(base);
}

function shortHash(s: string): string {
  try {
    return crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
  } catch {
    // Extremely unlikely; fallback for robustness
    return '00000000';
  }
}

function sanitize(s: string): string {
  const base = (s || 'project').toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  // Avoid empty string after sanitize
  return base.length ? base : 'project';
}

function expandTilde(p: string): string {
  if (!p) return p;
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function realpathSafe(p: string): string {
  try {
    // Use native realpath if available for speed/behavior
    // (Node 18+ has fs.realpathSync.native)
    const rp = (fs.realpathSync as any).native
      ? (fs.realpathSync as any).native(p)
      : fs.realpathSync(p);
    return rp;
  } catch {
    // The path may not exist yet; normalize current form
    return pathNormalize(p);
  }
}

function realpathOrExpand(p: string): string {
  const expanded = expandTilde(p);
  return realpathSafe(expanded);
}

function pathNormalize(p: string): string {
  // Normalize but do not resolve symlinks here
  // (realpathSafe is used where resolution is desired)
  return path.normalize(p);
}

/**
 * Best-effort readable key when user supplied an absolute path.
 * We do not want slashes in the key, so hash + tail dir name.
 */
function stripHomeForKey(absPath: string): string {
  try {
    const name = path.basename(absPath);
    return `${sanitize(name)}_${shortHash(absPath)}`;
  } catch {
    return `abs_${shortHash(absPath)}`;
  }
}
