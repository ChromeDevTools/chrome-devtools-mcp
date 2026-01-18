/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// src/project-detector.ts
// Phase 1 (v0.15.0)
// - detectProjectRoot: git root → nearest package.json → cwd
// - detectProjectName: package.json "name" → dirname
// - Use spawnSync with 500ms timeout to avoid blocking long
// - Realpath normalization

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function detectProjectRoot(cwd: string): string {
  const realCwd = realpathSafe(cwd);

  // 1) Try 'git rev-parse --show-toplevel' with 500ms timeout
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: realCwd,
    timeout: 500,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });

  if (git.status === 0 && git.stdout) {
    const out = git.stdout.toString().trim();
    if (out) return realpathSafe(out);
  }
  // If git is not available or command failed/timed out → fall through

  // 2) Walk up to nearest package.json
  let cur = realCwd;
  while (true) {
    if (fs.existsSync(path.join(cur, 'package.json'))) return cur;
    const next = path.dirname(cur);
    if (next === cur) break; // reached filesystem root
    cur = next;
  }

  // 3) Fallback to cwd
  return realCwd;
}

export function detectProjectName(root: string): string {
  const realRoot = realpathSafe(root);
  const pj = path.join(realRoot, 'package.json');
  if (fs.existsSync(pj)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
      if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) {
        return String(pkg.name).trim();
      }
    } catch {
      // ignore parse errors and fall back to directory name
    }
  }
  return path.basename(realRoot);
}

// --- helpers ---

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
