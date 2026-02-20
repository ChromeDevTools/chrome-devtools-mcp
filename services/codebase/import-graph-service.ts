// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure Node.js — no VS Code API dependency.
import * as path from 'path';
import type { SourceFile } from 'ts-morph';
import type {
  ImportGraphParams,
  ImportGraphResult,
  ImportGraphModule,
  CircularChain,
} from './types';
import { getWorkspaceProject } from './ts-project';
import { parseIgnoreRules, applyIgnoreRules, globToRegex } from './ignore-rules';

type FileFilter = (absoluteFilePath: string) => boolean;

function buildFileFilter(
  rootDir: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): FileFilter {
  const ignoreRules = parseIgnoreRules(rootDir);

  const includeRegexps = includePatterns?.map(p => globToRegex(p));
  const excludeRegexps = excludePatterns?.map(p => globToRegex(p));

  return (absoluteFilePath: string) => {
    const relativePath = path.relative(rootDir, absoluteFilePath).replace(/\\/g, '/');

    if (includeRegexps && includeRegexps.length > 0) {
      const matches = includeRegexps.some(r => r.test(relativePath));
      if (!matches) return false;
    }

    if (!applyIgnoreRules(relativePath, ignoreRules)) return false;

    if (excludeRegexps && excludeRegexps.length > 0) {
      const excluded = excludeRegexps.some(r => r.test(relativePath));
      if (excluded) return false;
    }

    return true;
  };
}

/**
 * Build the module import graph for a TypeScript/JavaScript project.
 * Uses ts-morph to extract import declarations and resolve module paths.
 */
export async function getImportGraph(params: ImportGraphParams): Promise<ImportGraphResult> {
  const rootDir = params.rootDir;
  if (!rootDir) {
    return {
      modules: {},
      circular: [],
      orphans: [],
      stats: { totalModules: 0, totalEdges: 0, circularCount: 0, orphanCount: 0 },
    };
  }

  const project = getWorkspaceProject(rootDir);
  const fileFilter = buildFileFilter(rootDir, params.includePatterns, params.excludePatterns);

  // Build adjacency list from source files
  const importMap = new Map<string, Set<string>>();
  const sourceFiles = project.getSourceFiles();

  for (const sf of sourceFiles) {
    const absPath = sf.getFilePath();
    if (!fileFilter(absPath)) continue;

    const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/');
    if (!importMap.has(relPath)) {
      importMap.set(relPath, new Set());
    }

    const imports = extractImports(sf, rootDir, project);
    for (const imp of imports) {
      if (fileFilter(path.resolve(rootDir, imp))) {
        importMap.get(relPath)!.add(imp);
        // Ensure the imported module exists in the map
        if (!importMap.has(imp)) {
          importMap.set(imp, new Set());
        }
      }
    }
  }

  // Build reverse index (importedBy)
  const importedByMap = new Map<string, Set<string>>();
  for (const [mod] of importMap) {
    importedByMap.set(mod, new Set());
  }
  for (const [mod, imports] of importMap) {
    for (const imp of imports) {
      importedByMap.get(imp)?.add(mod);
    }
  }

  // Build modules record
  const modules: Record<string, ImportGraphModule> = {};
  let totalEdges = 0;

  for (const [mod, imports] of importMap) {
    const importsArr = [...imports];
    const importedByArr = [...(importedByMap.get(mod) ?? [])];
    modules[mod] = {
      path: mod,
      imports: importsArr,
      importedBy: importedByArr,
    };
    totalEdges += importsArr.length;
  }

  // Detect circular dependencies using DFS
  const circular = detectCircularDependencies(importMap);

  // Find orphans (modules with no importers that aren't entry-point-like)
  const orphans: string[] = [];
  for (const [mod] of importMap) {
    const importers = importedByMap.get(mod);
    if (!importers || importers.size === 0) {
      // Don't flag typical entry points as orphans
      if (!isEntryPoint(mod)) {
        orphans.push(mod);
      }
    }
  }

  return {
    modules,
    circular,
    orphans: orphans.sort(),
    stats: {
      totalModules: importMap.size,
      totalEdges,
      circularCount: circular.length,
      orphanCount: orphans.length,
    },
  };
}

/**
 * Extract import paths from a source file and resolve to relative paths.
 */
function extractImports(
  sf: SourceFile,
  rootDir: string,
  project: ReturnType<typeof getWorkspaceProject>,
): string[] {
  const imports: string[] = [];

  // Import declarations: import X from './foo'
  for (const decl of sf.getImportDeclarations()) {
    const moduleSpecifier = decl.getModuleSpecifierValue();
    const resolved = resolveModulePath(sf, moduleSpecifier, rootDir, project);
    if (resolved) {
      imports.push(resolved);
    }
  }

  // Export declarations with module specifier: export { X } from './foo'
  for (const decl of sf.getExportDeclarations()) {
    const moduleSpecifier = decl.getModuleSpecifierValue();
    if (moduleSpecifier) {
      const resolved = resolveModulePath(sf, moduleSpecifier, rootDir, project);
      if (resolved) {
        imports.push(resolved);
      }
    }
  }

  return [...new Set(imports)];
}

/**
 * Resolve a module specifier to a relative path within the project.
 * Only resolves relative imports (not bare specifiers like 'lodash').
 */
function resolveModulePath(
  sf: SourceFile,
  moduleSpecifier: string,
  rootDir: string,
  project: ReturnType<typeof getWorkspaceProject>,
): string | undefined {
  // Skip bare specifiers (external packages)
  if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
    return undefined;
  }

  // Try to resolve via ts-morph's module resolution
  const sfDir = path.dirname(sf.getFilePath());
  const resolved = tryResolveFile(sfDir, moduleSpecifier, rootDir, project);
  return resolved;
}

/**
 * Try to resolve a relative module specifier to an actual file path.
 */
function tryResolveFile(
  fromDir: string,
  specifier: string,
  rootDir: string,
  project: ReturnType<typeof getWorkspaceProject>,
): string | undefined {
  const absoluteBase = path.resolve(fromDir, specifier);

  // Common extensions to try
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];
  const indexFiles = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

  // Try direct match and with extensions
  for (const ext of extensions) {
    const candidate = absoluteBase + ext;
    const sf = project.getSourceFile(candidate);
    if (sf) {
      return path.relative(rootDir, candidate).replace(/\\/g, '/');
    }
  }

  // Try as directory with index file
  for (const indexFile of indexFiles) {
    const candidate = absoluteBase + indexFile;
    const sf = project.getSourceFile(candidate);
    if (sf) {
      return path.relative(rootDir, candidate).replace(/\\/g, '/');
    }
  }

  return undefined;
}

/**
 * Detect circular dependencies using iterative DFS with path tracking.
 */
function detectCircularDependencies(
  importMap: Map<string, Set<string>>,
): CircularChain[] {
  const cycles: CircularChain[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const seenCycles = new Set<string>();

  for (const [startNode] of importMap) {
    if (visited.has(startNode)) continue;

    // Iterative DFS with explicit stack
    const stack: Array<{ node: string; path: string[]; importIterator: Iterator<string> }> = [];
    const imports = importMap.get(startNode);
    if (!imports) continue;

    stack.push({
      node: startNode,
      path: [startNode],
      importIterator: imports[Symbol.iterator](),
    });
    inStack.add(startNode);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const next = frame.importIterator.next();

      if (next.done) {
        // Backtrack
        stack.pop();
        inStack.delete(frame.node);
        visited.add(frame.node);
        continue;
      }

      const neighbor = next.value;

      if (inStack.has(neighbor)) {
        // Found cycle — extract the cycle path
        const cycleStart = frame.path.indexOf(neighbor);
        if (cycleStart >= 0) {
          const chain = [...frame.path.slice(cycleStart), neighbor];
          const normalized = normalizeCycle(chain);
          const key = normalized.join(' → ');
          if (!seenCycles.has(key)) {
            seenCycles.add(key);
            cycles.push({ chain: normalized });
          }
        }
      } else if (!visited.has(neighbor)) {
        const neighborImports = importMap.get(neighbor);
        if (neighborImports) {
          stack.push({
            node: neighbor,
            path: [...frame.path, neighbor],
            importIterator: neighborImports[Symbol.iterator](),
          });
          inStack.add(neighbor);
        }
      }
    }
  }

  return cycles;
}

/**
 * Normalize a cycle so the smallest module name comes first.
 * This ensures cycles like A→B→C→A and B→C→A→B are treated as the same.
 */
function normalizeCycle(chain: string[]): string[] {
  // Remove the trailing duplicate (cycle closer)
  const path = chain.slice(0, -1);
  if (path.length === 0) return chain;

  // Rotate so the lexicographically smallest element is first
  let minIdx = 0;
  for (let i = 1; i < path.length; i++) {
    if (path[i] < path[minIdx]) {
      minIdx = i;
    }
  }

  const rotated = [...path.slice(minIdx), ...path.slice(0, minIdx)];
  // Add the cycle closer
  rotated.push(rotated[0]);
  return rotated;
}

/**
 * Check if a module path looks like an entry point.
 * Entry points are expected to have no importers.
 */
function isEntryPoint(modulePath: string): boolean {
  const name = path.basename(modulePath, path.extname(modulePath));
  const entryNames = new Set([
    'index', 'main', 'app', 'server', 'cli', 'entry',
    'extension', 'bootstrap', 'startup', 'init',
  ]);
  return entryNames.has(name.toLowerCase());
}
