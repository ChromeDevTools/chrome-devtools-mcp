// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure Node.js — no VS Code API dependency.
import * as path from 'path';
import * as crypto from 'crypto';
import {
  SyntaxKind,
  Node,
} from 'ts-morph';
import type {
  DuplicateDetectionParams,
  DuplicateDetectionResult,
  DuplicateGroup,
  DuplicateInstance,
} from './types';
import { getWorkspaceProject } from './ts-project';
import { parseIgnoreRules, applyIgnoreRules, globToRegex } from './ignore-rules';

type FileFilter = (absoluteFilePath: string) => boolean;

const TEST_FILE_PATTERN = /[./](test|spec|__tests__)[./]/i;

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
      if (!includeRegexps.some(r => r.test(relativePath))) return false;
    }

    if (!applyIgnoreRules(relativePath, ignoreRules)) return false;

    if (excludeRegexps && excludeRegexps.length > 0) {
      if (excludeRegexps.some(r => r.test(relativePath))) return false;
    }

    return true;
  };
}

// Kinds of AST nodes we want to detect duplicates for
const DETECTABLE_KINDS = new Map<string, SyntaxKind[]>([
  ['function', [SyntaxKind.FunctionDeclaration, SyntaxKind.ArrowFunction]],
  ['class', [SyntaxKind.ClassDeclaration]],
  ['interface', [SyntaxKind.InterfaceDeclaration]],
  ['type', [SyntaxKind.TypeAliasDeclaration]],
  ['enum', [SyntaxKind.EnumDeclaration]],
]);

const MIN_LINES_FOR_DUPLICATE = 3;

/**
 * Find structurally duplicate code in the codebase using AST hashing.
 * Two code blocks are considered duplicates when their normalized AST structure
 * is identical (ignoring identifiers, whitespace, and comments).
 */
export async function findDuplicates(params: DuplicateDetectionParams): Promise<DuplicateDetectionResult> {
  const startTime = Date.now();
  const rootDir = params.rootDir;
  const limit = params.limit ?? 50;
  const requestedKinds = new Set(params.kinds ?? [...DETECTABLE_KINDS.keys()]);
  const timeoutMs = 55_000;
  const isTimedOut = (): boolean => (Date.now() - startTime) >= timeoutMs;

  if (!rootDir) {
    return {
      groups: [],
      summary: { totalGroups: 0, totalDuplicateInstances: 0, filesWithDuplicates: 0, scanDurationMs: 0 },
      errorMessage: 'No workspace folder found. Open a folder or specify rootDir.',
    };
  }

  try {
    const project = getWorkspaceProject(rootDir);
    const fileFilter = buildFileFilter(rootDir, params.includePatterns, params.excludePatterns);

    // Map from structural hash → list of instances
    const hashMap = new Map<string, { kind: string; lineCount: number; instances: DuplicateInstance[] }>();

    for (const sourceFile of project.getSourceFiles()) {
      if (isTimedOut()) break;

      const absPath = sourceFile.getFilePath();
      if (!fileFilter(absPath)) continue;

      const relativePath = path.relative(rootDir, absPath).replace(/\\/g, '/');
      if (TEST_FILE_PATTERN.test(relativePath)) continue;

      for (const [kindName, syntaxKinds] of DETECTABLE_KINDS) {
        if (!requestedKinds.has(kindName)) continue;

        const declarations = collectDeclarations(sourceFile, syntaxKinds);

        for (const decl of declarations) {
          if (isTimedOut()) break;

          const lineCount = decl.getEndLineNumber() - decl.getStartLineNumber() + 1;
          if (lineCount < MIN_LINES_FOR_DUPLICATE) continue;

          const structuralHash = computeStructuralHash(decl, kindName);
          if (!structuralHash) continue;

          const name = getDeclarationName(decl) ?? '<anonymous>';
          const instance: DuplicateInstance = {
            file: relativePath,
            name,
            line: decl.getStartLineNumber(),
            endLine: decl.getEndLineNumber(),
          };

          const existing = hashMap.get(structuralHash);
          if (existing) {
            existing.instances.push(instance);
          } else {
            hashMap.set(structuralHash, {
              kind: kindName,
              lineCount,
              instances: [instance],
            });
          }
        }
      }
    }

    // Collect groups that have more than one instance (actual duplicates)
    const groups: DuplicateGroup[] = [];
    const filesWithDuplicates = new Set<string>();

    for (const [hash, entry] of hashMap) {
      if (entry.instances.length < 2) continue;
      if (groups.length >= limit) break;

      groups.push({
        hash,
        kind: entry.kind,
        lineCount: entry.lineCount,
        instances: entry.instances,
      });

      for (const inst of entry.instances) {
        filesWithDuplicates.add(inst.file);
      }
    }

    // Sort: largest groups first, then by line count
    groups.sort((a, b) => {
      const sizeDiff = b.instances.length - a.instances.length;
      if (sizeDiff !== 0) return sizeDiff;
      return b.lineCount - a.lineCount;
    });

    let totalInstances = 0;
    for (const g of groups) {
      totalInstances += g.instances.length;
    }

    return {
      groups,
      summary: {
        totalGroups: groups.length,
        totalDuplicateInstances: totalInstances,
        filesWithDuplicates: filesWithDuplicates.size,
        scanDurationMs: Date.now() - startTime,
      },
      resolvedRootDir: rootDir,
    };
  } catch (err: unknown) {
    console.warn('[findDuplicates] Error:', err);
    return {
      groups: [],
      summary: { totalGroups: 0, totalDuplicateInstances: 0, filesWithDuplicates: 0, scanDurationMs: Date.now() - startTime },
      errorMessage: err instanceof Error ? err.message : String(err),
      resolvedRootDir: rootDir,
    };
  }
}

function collectDeclarations(sourceFile: Node, syntaxKinds: SyntaxKind[]): Node[] {
  const results: Node[] = [];
  for (const kind of syntaxKinds) {
    results.push(...sourceFile.getDescendantsOfKind(kind));
  }
  return results;
}

function getDeclarationName(node: Node): string | undefined {
  if (Node.isFunctionDeclaration(node)) return node.getName();
  if (Node.isClassDeclaration(node)) return node.getName();
  if (Node.isInterfaceDeclaration(node)) return node.getName();
  if (Node.isTypeAliasDeclaration(node)) return node.getName();
  if (Node.isEnumDeclaration(node)) return node.getName();
  if (Node.isVariableDeclaration(node)) return node.getName();
  return undefined;
}

/**
 * Compute a structural hash of an AST node, normalizing away identifiers
 * so that structurally identical code with different names is detected.
 *
 * The hash captures:
 * - Node kind hierarchy (tree shape)
 * - Number of children at each level
 * - Literal types and operator tokens
 * - BUT NOT identifier names, whitespace, or comments
 */
function computeStructuralHash(node: Node, kind: string): string | undefined {
  try {
    const parts: string[] = [kind];
    buildStructuralParts(node, parts, 0, 6);

    // Need enough structural complexity to avoid false positives
    if (parts.length < 4) return undefined;

    const raw = parts.join('|');
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  } catch {
    return undefined;
  }
}

function buildStructuralParts(node: Node, parts: string[], depth: number, maxDepth: number): void {
  if (depth > maxDepth) return;

  const syntaxKind = node.getKind();

  // Skip identifiers — we want structural similarity, not name matching
  if (syntaxKind === SyntaxKind.Identifier) return;

  // Include the node kind to capture tree shape
  parts.push(`${depth}:${syntaxKind}`);

  // For literals, include the literal type (not value) to distinguish number vs string
  if (syntaxKind === SyntaxKind.StringLiteral || syntaxKind === SyntaxKind.NumericLiteral ||
      syntaxKind === SyntaxKind.TrueKeyword || syntaxKind === SyntaxKind.FalseKeyword ||
      syntaxKind === SyntaxKind.NullKeyword) {
    parts.push(`lit:${syntaxKind}`);
  }

  // For binary expressions, include the operator
  if (Node.isBinaryExpression(node)) {
    parts.push(`op:${node.getOperatorToken().getKind()}`);
  }

  // Include child count to capture structure breadth
  const children = node.getChildren();
  parts.push(`c:${children.length}`);

  for (const child of children) {
    buildStructuralParts(child, parts, depth + 1, maxDepth);
  }
}
