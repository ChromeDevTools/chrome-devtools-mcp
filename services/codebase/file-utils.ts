// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure Node.js file utilities — no VS Code API dependency.
import * as fs from 'fs';
import * as path from 'path';
import { parseIgnoreRules, applyIgnoreRules, globToRegex } from './ignore-rules';

export interface DiscoverFilesOptions {
  rootDir: string;
  includeGlob?: string;
  excludeGlob?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxResults?: number;
  respectIgnoreRules?: boolean;
  /** Directory to load .devtoolsignore from (defaults to rootDir). */
  ignoreRulesRoot?: string;
  /** Maximum directory depth to walk. 1 = immediate children only. undefined = unlimited. */
  maxDepth?: number;
  /** File extensions to include (e.g., Set(['.ts', '.md'])). undefined = all extensions. */
  fileExtensions?: Set<string>;
  /** Tool scope for per-tool .devtoolsignore sections (e.g. 'codebase_map'). */
  toolScope?: string;
}

/**
 * Walk the filesystem and collect files matching the given criteria.
 * Returns a Map of relative path → absolute path (forward-slash normalized).
 */
export function discoverFiles(options: DiscoverFilesOptions): Map<string, string> {
  const {
    rootDir,
    includeGlob,
    excludeGlob,
    includePatterns,
    excludePatterns,
    maxResults = 5000,
    respectIgnoreRules = true,
    ignoreRulesRoot,
    maxDepth,
    fileExtensions,
    toolScope,
  } = options;

  const rulesRoot = ignoreRulesRoot ?? rootDir;
  const ignoreRules = respectIgnoreRules ? parseIgnoreRules(rulesRoot) : [];
  const includeMatcher = includeGlob ? globToRegex(includeGlob) : null;
  const excludeMatcher = excludeGlob ? globToRegex(excludeGlob) : null;
  const callerIncludes = (includePatterns ?? []).map(p => globToRegex(p));
  const callerExcludes = (excludePatterns ?? []).map(p => globToRegex(p));

  const normalizedRoot = rootDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const fileMap = new Map<string, string>();

  walkDirectory(rootDir, normalizedRoot, fileMap, {
    ignoreRules,
    includeMatcher,
    excludeMatcher,
    callerIncludes,
    callerExcludes,
    maxResults,
    maxDepth,
    fileExtensions,
    toolScope,
  });

  return fileMap;
}

interface WalkContext {
  ignoreRules: ReturnType<typeof parseIgnoreRules>;
  includeMatcher: RegExp | null;
  excludeMatcher: RegExp | null;
  callerIncludes: RegExp[];
  callerExcludes: RegExp[];
  maxResults: number;
  maxDepth?: number;
  fileExtensions?: Set<string>;
  toolScope?: string;
}

function walkDirectory(
  dir: string,
  normalizedRoot: string,
  fileMap: Map<string, string>,
  ctx: WalkContext,
  visitedInodes?: Set<string>,
  currentDepth: number = 0,
): void {
  if (fileMap.size >= ctx.maxResults) return;

  // Symlink cycle detection — track visited directory inodes
  const visited = visitedInodes ?? new Set<string>();
  try {
    const dirStat = fs.statSync(dir);
    const inodeKey = `${dirStat.dev}:${dirStat.ino}`;
    if (visited.has(inodeKey)) return;
    visited.add(inodeKey);
  } catch {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (fileMap.size >= ctx.maxResults) return;

    const fullPath = path.join(dir, entry.name);
    const normalizedFull = fullPath.replace(/\\/g, '/');
    const relative = normalizedFull.startsWith(normalizedRoot + '/')
      ? normalizedFull.slice(normalizedRoot.length + 1)
      : normalizedFull.startsWith(normalizedRoot)
        ? normalizedFull.slice(normalizedRoot.length).replace(/^\//, '')
        : normalizedFull;

    if (entry.isDirectory()) {
      if (ctx.ignoreRules.length > 0 && applyIgnoreRules(relative, ctx.ignoreRules, ctx.toolScope)) continue;

      // Depth limiting: skip subdirectories when at max depth
      if (ctx.maxDepth !== undefined && currentDepth >= ctx.maxDepth) continue;

      walkDirectory(fullPath, normalizedRoot, fileMap, ctx, visited, currentDepth + 1);
      continue;
    }

    if (!entry.isFile()) continue;

    if (ctx.ignoreRules.length > 0 && applyIgnoreRules(relative, ctx.ignoreRules, ctx.toolScope)) continue;
    if (ctx.includeMatcher && !ctx.includeMatcher.test(relative)) continue;
    if (ctx.excludeMatcher && ctx.excludeMatcher.test(relative)) continue;
    if (ctx.callerIncludes.length > 0 && !ctx.callerIncludes.some(rx => rx.test(relative))) continue;
    if (ctx.callerExcludes.length > 0 && ctx.callerExcludes.some(rx => rx.test(relative))) continue;

    // Extension filtering
    if (ctx.fileExtensions) {
      const dotIdx = entry.name.lastIndexOf('.');
      const ext = dotIdx >= 0 ? entry.name.slice(dotIdx).toLowerCase() : '';
      if (!ctx.fileExtensions.has(ext)) continue;
    }

    fileMap.set(relative, fullPath);
  }
}

/**
 * Read a file as UTF-8 text. Returns the text and line count.
 */
export function readFileText(filePath: string): { text: string; lineCount: number } {
  const text = fs.readFileSync(filePath, 'utf-8');
  let lineCount = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineCount++;
  }
  return { text, lineCount };
}

/**
 * Determine whether a path is a file or directory.
 */
export function getPathType(filePath: string): 'file' | 'directory' {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return 'directory';
  return 'file';
}
