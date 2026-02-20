// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
import * as fs from 'fs';
import * as path from 'path';
import { Project, ts } from 'ts-morph';

// ── In-Memory Project (for import extraction, exports scanning) ──

let tsProject: Project | undefined;

export function getTsProject(): Project {
  if (!tsProject) {
    tsProject = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  }
  return tsProject;
}

// ── Workspace Project Cache (for traceSymbol — real filesystem + TypeChecker) ──

interface WorkspaceProjectEntry {
  project: Project;
  lastAccess: number;
}

const workspaceProjects = new Map<string, WorkspaceProjectEntry>();
const WORKSPACE_PROJECT_TTL_MS = 5 * 60 * 1000;

/**
 * Force-invalidate the cached workspace project for a given rootDir.
 * Useful after config changes or when source file patterns change.
 */
export function invalidateWorkspaceProject(rootDir?: string): void {
  if (rootDir) {
    workspaceProjects.delete(rootDir);
  } else {
    workspaceProjects.clear();
  }
}

/**
 * Get or create a ts-morph Project that loads real workspace files with tsconfig.
 * This enables compiler-level accuracy for symbol lookup, references, and type checking.
 */
export function getWorkspaceProject(rootDir: string): Project {
  const cached = workspaceProjects.get(rootDir);
  if (cached) {
    cached.lastAccess = Date.now();
    return cached.project;
  }

  const now = Date.now();
  for (const [key, entry] of workspaceProjects) {
    if (now - entry.lastAccess > WORKSPACE_PROJECT_TTL_MS) {
      workspaceProjects.delete(key);
    }
  }

  let tsConfigPath: string | undefined;
  const configCandidates = ['tsconfig.json', 'jsconfig.json'];
  for (const candidate of configCandidates) {
    const candidatePath = path.join(rootDir, candidate);
    if (fs.existsSync(candidatePath)) {
      tsConfigPath = candidatePath;
      break;
    }
  }

  let project: Project;

  if (tsConfigPath) {
    // Check for solution-style tsconfig (monorepo with references but no direct source files)
    const solutionProject = tryCreateSolutionProject(rootDir, tsConfigPath);
    project = solutionProject ?? new Project({
      tsConfigFilePath: tsConfigPath,
      skipAddingFilesFromTsConfig: false,
    });
  } else {
    project = new Project({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        esModuleInterop: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        resolveJsonModule: true,
        baseUrl: rootDir,
      },
    });

    const sourceGlobs = [
      path.join(rootDir, '**/*.ts'),
      path.join(rootDir, '**/*.tsx'),
      path.join(rootDir, '**/*.js'),
      path.join(rootDir, '**/*.jsx'),
      path.join(rootDir, '**/*.mts'),
      path.join(rootDir, '**/*.mjs'),
    ];
    try {
      project.addSourceFilesAtPaths(sourceGlobs);
    } catch {
      // Ignore glob errors
    }
  }

  workspaceProjects.set(rootDir, { project, lastAccess: now });
  return project;
}

// ── Solution-Style Tsconfig Handling ──────────────────────────────

/**
 * Detect and handle solution-style tsconfigs (monorepos with project references).
 * These have `"files": []` and `"references": [...]` — they delegate to sub-projects.
 *
 * Strategy: find the base tsconfig that referenced projects extend, and use it as
 * the tsConfigFilePath. This gives ts-morph's underlying TypeScript compiler full
 * knowledge of the project's physical location on disk — enabling:
 * - node_modules resolution for bare package imports
 * - package.json conditional exports (with NodeNext moduleResolution)
 * - @types package discovery
 * - path alias resolution (from the base tsconfig's "paths")
 * Then add source files from all referenced packages to build a unified project.
 */
function tryCreateSolutionProject(rootDir: string, tsConfigPath: string): Project | undefined {
  try {
    const raw = fs.readFileSync(tsConfigPath, 'utf-8');
    const config = JSON.parse(raw);
    const references: Array<{ path: string }> = config.references;

    if (!Array.isArray(references) || references.length === 0) return undefined;

    const hasEmptyFiles = Array.isArray(config.files) && config.files.length === 0;
    const hasNoInclude = !config.include;
    if (!hasEmptyFiles || !hasNoInclude) return undefined;

    const baseTsConfigPath = findBaseTsConfig(rootDir, references);

    let project: Project;

    if (baseTsConfigPath) {
      project = new Project({
        tsConfigFilePath: baseTsConfigPath,
        skipAddingFilesFromTsConfig: true,
        compilerOptions: {
          composite: false,
          declaration: false,
          declarationMap: false,
          incremental: false,
        },
      });
    } else {
      project = new Project({
        compilerOptions: {
          allowJs: true,
          checkJs: false,
          esModuleInterop: true,
          skipLibCheck: true,
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          resolveJsonModule: true,
          baseUrl: rootDir,
          rootDir,
        },
      });
    }

    for (const ref of references) {
      addReferencedProjectFiles(project, rootDir, ref.path);
    }

    return project;
  } catch {
    return undefined;
  }
}

/**
 * Find the shared base tsconfig that referenced projects extend.
 */
function findBaseTsConfig(rootDir: string, references: Array<{ path: string }>): string | undefined {
  for (const ref of references) {
    const refConfigPath = path.join(path.resolve(rootDir, ref.path), 'tsconfig.json');
    if (!fs.existsSync(refConfigPath)) continue;

    try {
      const refConfig = JSON.parse(fs.readFileSync(refConfigPath, 'utf-8'));
      if (!refConfig.extends) continue;

      const basePath = path.resolve(path.dirname(refConfigPath), refConfig.extends);
      if (fs.existsSync(basePath)) {
        return basePath;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

/**
 * Add source files from a referenced project to the unified project.
 * Reads the referenced tsconfig's `include` patterns, falls back to `src/**\/*.ts`.
 */
function addReferencedProjectFiles(project: Project, rootDir: string, refPath: string): void {
  const refDir = path.resolve(rootDir, refPath);
  const refConfigPath = path.join(refDir, 'tsconfig.json');
  const includePatterns: string[] = ['src/**/*.ts'];

  if (fs.existsSync(refConfigPath)) {
    try {
      const refConfig = JSON.parse(fs.readFileSync(refConfigPath, 'utf-8'));
      if (Array.isArray(refConfig.include) && refConfig.include.length > 0) {
        includePatterns.length = 0;
        for (const pattern of refConfig.include) {
          if (typeof pattern === 'string') {
            includePatterns.push(pattern);
          }
        }
      }

      // Resolve extends chain to check for allowJs/checkJs
      const effectiveOptions = resolveExtendedCompilerOption(refConfigPath, refConfig);
      if (effectiveOptions.allowJs) {
        const hasJsPatterns = includePatterns.some(p => p.includes('.js'));
        if (!hasJsPatterns) {
          const jsPatterns = includePatterns
            .filter(p => p.includes('.ts'))
            .map(p => p.replace(/\.ts$/g, '.js').replace(/\*\.ts/g, '*.js'));
          for (const jp of jsPatterns) {
            includePatterns.push(jp);
          }
        }
      }
    } catch {
      // Use default pattern
    }
  }

  for (const pattern of includePatterns) {
    try {
      project.addSourceFilesAtPaths(path.join(refDir, pattern));
    } catch {
      // Ignore glob errors for individual patterns
    }
  }
}

/**
 * Resolve compilerOptions through the extends chain to get effective settings.
 * Returns the merged allowJs/checkJs values from the config and any base configs it extends.
 */
function resolveExtendedCompilerOption(
  configPath: string,
  config: Record<string, unknown>,
): { allowJs: boolean; checkJs: boolean } {
  const result = { allowJs: false, checkJs: false };
  const options = config.compilerOptions as Record<string, unknown> | undefined;

  if (options) {
    if (typeof options.allowJs === 'boolean') result.allowJs = options.allowJs;
    if (typeof options.checkJs === 'boolean') result.checkJs = options.checkJs;
  }

  // If already found allowJs, no need to check parent
  if (result.allowJs) return result;

  const extendsValue = config.extends;
  if (typeof extendsValue !== 'string') return result;

  try {
    const basePath = path.resolve(path.dirname(configPath), extendsValue);
    if (!fs.existsSync(basePath)) return result;

    const baseConfig = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
    const baseResult = resolveExtendedCompilerOption(basePath, baseConfig);

    if (!result.allowJs) result.allowJs = baseResult.allowJs;
    if (!result.checkJs) result.checkJs = baseResult.checkJs;
  } catch {
    // Ignore parse errors in base config
  }

  return result;
}
