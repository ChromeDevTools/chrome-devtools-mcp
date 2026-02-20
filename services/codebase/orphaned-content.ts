// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
import { SourceFile, Node } from 'ts-morph';
import * as path from 'path';
import type { SymbolNode } from './types';
import { getWorkspaceProject } from './ts-project';

// ── Orphaned Content Types ───────────────────────────────

export interface OrphanedContentResult {
  /** Import declaration nodes with line ranges */
  imports: SymbolNode[];
  /** Export declaration nodes with line ranges */
  exports: SymbolNode[];
  /** Standalone comments (not attached to symbols) */
  orphanComments: SymbolNode[];
  /** Shebangs, prologue directives, and other special constructs */
  directives: SymbolNode[];
  /** Gap ranges (lines not covered by any symbol, import, export, or comment) */
  gaps: Array<{ start: number; end: number; type: 'blank' | 'unknown' }>;
  /** Statistics */
  stats: {
    totalImports: number;
    totalExports: number;
    totalOrphanComments: number;
    totalDirectives: number;
    totalBlankLines: number;
    coveragePercent: number;
  };
}

// ── Main API ─────────────────────────────────────────────

/**
 * Extract orphaned content (imports, exports, comments) from a TypeScript/JavaScript file.
 * This supplements VS Code's DocumentSymbol API which doesn't include these constructs.
 *
 * @param filePath Absolute file path
 * @param symbolRanges Existing symbol ranges from DocumentSymbol (to compute gaps)
 */
export function extractOrphanedContent(
  filePath: string,
  symbolRanges: Array<{ start: number; end: number }> = [],
): OrphanedContentResult {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const supportedExts = ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs'];

  if (!supportedExts.includes(ext)) {
    return emptyResult();
  }

  try {
    const rootDir = findProjectRoot(filePath);
    const project = getWorkspaceProject(rootDir);
    let sourceFile = project.getSourceFile(filePath);

    // If file not in project, try adding it
    if (!sourceFile) {
      sourceFile = project.addSourceFileAtPath(filePath);
    }

    if (!sourceFile) {
      return emptyResult();
    }

    const totalLines = sourceFile.getEndLineNumber();
    const imports = extractImports(sourceFile);
    const exports = extractExports(sourceFile);
    const directives = extractDirectives(sourceFile);
    const orphanComments = extractOrphanComments(sourceFile, symbolRanges, imports, exports, directives);

    // Compute gaps (lines not covered by symbols, imports, exports, directives, or comments)
    const allCoveredRanges = [
      ...symbolRanges,
      ...imports.map(i => i.range),
      ...exports.map(e => e.range),
      ...directives.map(d => d.range),
      ...orphanComments.map(c => c.range),
    ];

    const gaps = computeGaps(sourceFile, totalLines, allCoveredRanges);
    const totalBlankLines = gaps.filter(g => g.type === 'blank').reduce((sum, g) => sum + (g.end - g.start + 1), 0);

    const coveredLines = new Set<number>();
    for (const range of allCoveredRanges) {
      for (let line = range.start; line <= range.end; line++) {
        coveredLines.add(line);
      }
    }
    const coveragePercent = totalLines > 0 ? (coveredLines.size / totalLines) * 100 : 100;

    return {
      imports,
      exports,
      orphanComments,
      directives,
      gaps,
      stats: {
        totalImports: imports.length,
        totalExports: exports.length,
        totalOrphanComments: orphanComments.length,
        totalDirectives: directives.length,
        totalBlankLines,
        coveragePercent: Math.round(coveragePercent * 10) / 10,
      },
    };
  } catch {
    return emptyResult();
  }
}

// ── Import Extraction ────────────────────────────────────

function extractImports(sourceFile: SourceFile): SymbolNode[] {
  const result: SymbolNode[] = [];

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const startLine = importDecl.getStartLineNumber();
    const endLine = importDecl.getEndLineNumber();

    // Determine import type
    let importType = 'import';
    let name = moduleSpecifier;

    if (importDecl.isTypeOnly()) {
      importType = 'type-import';
    }

    const defaultImport = importDecl.getDefaultImport();
    const namespaceImport = importDecl.getNamespaceImport();
    const namedImports = importDecl.getNamedImports();

    if (defaultImport) {
      name = defaultImport.getText();
      importType = 'default-import';
    } else if (namespaceImport) {
      name = `* as ${namespaceImport.getText()}`;
      importType = 'namespace-import';
    } else if (namedImports.length > 0) {
      const names = namedImports.map(n => {
        const alias = n.getAliasNode();
        return alias ? `${n.getName()} as ${alias.getText()}` : n.getName();
      });
      name = `{ ${names.join(', ')} }`;
      importType = importDecl.isTypeOnly() ? 'type-import' : 'named-import';
    }

    // Don't expand import ranges with leading comments — those are detected
    // independently as orphan comments with proper classification
    result.push({
      name,
      kind: importType,
      detail: `from "${moduleSpecifier}"`,
      range: { start: startLine, end: endLine },
    });
  }

  return result;
}

// ── Export Extraction ────────────────────────────────────

function extractExports(sourceFile: SourceFile): SymbolNode[] {
  const result: SymbolNode[] = [];

  // Export declarations (export { ... } or export * from '...')
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const startLine = exportDecl.getStartLineNumber();
    const endLine = exportDecl.getEndLineNumber();
    const moduleSpecifier = exportDecl.getModuleSpecifierValue();

    let name: string;
    let exportType = 'export';

    if (exportDecl.isNamespaceExport()) {
      name = moduleSpecifier ? `* from "${moduleSpecifier}"` : '*';
      exportType = 're-export';
    } else if (exportDecl.hasNamedExports()) {
      const namedExports = exportDecl.getNamedExports();
      const names = namedExports.map(n => {
        const alias = n.getAliasNode();
        return alias ? `${n.getName()} as ${alias.getText()}` : n.getName();
      });
      name = `{ ${names.join(', ')} }`;
      exportType = moduleSpecifier ? 're-export' : 'named-export';
    } else {
      name = 'export';
    }

    result.push({
      name,
      kind: exportType,
      detail: moduleSpecifier ? `from "${moduleSpecifier}"` : undefined,
      range: { start: startLine, end: endLine },
    });
  }

  // Export assignments (export default X or export = X)
  for (const exportAssign of sourceFile.getExportAssignments()) {
    const startLine = exportAssign.getStartLineNumber();
    const endLine = exportAssign.getEndLineNumber();
    const isExportEquals = exportAssign.isExportEquals();

    result.push({
      name: isExportEquals ? 'export =' : 'export default',
      kind: isExportEquals ? 'commonjs-export' : 'default-export',
      range: { start: startLine, end: endLine },
    });
  }

  // Inline exports: export function X, export class Y, export const Z, export interface W, etc.
  for (const statement of sourceFile.getStatements()) {
    // Skip if already handled above
    if (Node.isExportDeclaration(statement) || Node.isExportAssignment(statement)) {
      continue;
    }

    // Check if statement has export modifier
    if (!('hasExportKeyword' in statement) || typeof statement.hasExportKeyword !== 'function') {
      continue;
    }
    if (!statement.hasExportKeyword()) continue;

    const startLine = statement.getStartLineNumber();
    const endLine = statement.getEndLineNumber();
    const isDefault = 'hasDefaultKeyword' in statement &&
      typeof statement.hasDefaultKeyword === 'function' &&
      statement.hasDefaultKeyword();

    let name: string;
    let kind: string;

    if (Node.isFunctionDeclaration(statement)) {
      name = statement.getName() ?? 'anonymous';
      kind = isDefault ? 'default-export' : 'inline-export';
    } else if (Node.isClassDeclaration(statement)) {
      name = statement.getName() ?? 'anonymous';
      kind = isDefault ? 'default-export' : 'inline-export';
    } else if (Node.isVariableStatement(statement)) {
      const decls = statement.getDeclarations();
      name = decls.map(d => d.getName()).join(', ');
      kind = isDefault ? 'default-export' : 'inline-export';
    } else if (Node.isInterfaceDeclaration(statement)) {
      name = statement.getName();
      kind = 'inline-export';
    } else if (Node.isTypeAliasDeclaration(statement)) {
      name = statement.getName();
      kind = 'inline-export';
    } else if (Node.isEnumDeclaration(statement)) {
      name = statement.getName();
      kind = 'inline-export';
    } else {
      name = statement.getKindName();
      kind = isDefault ? 'default-export' : 'inline-export';
    }

    result.push({
      name,
      kind,
      range: { start: startLine, end: endLine },
    });
  }

  return result;
}

// ── Orphan Comment Extraction ────────────────────────────

// ── Directive Extraction ─────────────────────────────────

function extractDirectives(sourceFile: SourceFile): SymbolNode[] {
  const result: SymbolNode[] = [];
  const fullText = sourceFile.getFullText();

  // Shebang detection (always line 1)
  if (fullText.startsWith('#!')) {
    const firstNewline = fullText.indexOf('\n');
    const shebangText = firstNewline >= 0 ? fullText.slice(0, firstNewline).trim() : fullText.trim();
    result.push({
      name: shebangText,
      kind: 'shebang',
      range: { start: 1, end: 1 },
    });
  }

  // Prologue directives ("use strict", "use client", "use server")
  for (const stmt of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) break;
    const expr = stmt.getExpression();
    if (!Node.isStringLiteral(expr)) break;

    const value = expr.getLiteralValue();
    const prologues = ['use strict', 'use client', 'use server'];
    if (prologues.includes(value)) {
      result.push({
        name: `"${value}"`,
        kind: 'prologue-directive',
        range: { start: stmt.getStartLineNumber(), end: stmt.getEndLineNumber() },
      });
    } else {
      break;
    }
  }

  return result;
}

function extractOrphanComments(
  sourceFile: SourceFile,
  symbolRanges: Array<{ start: number; end: number }>,
  imports: SymbolNode[],
  exports: SymbolNode[],
  directives: SymbolNode[],
): SymbolNode[] {
  const result: SymbolNode[] = [];

  // Get all covered lines (from symbols, imports, exports, directives)
  const coveredLines = new Set<number>();
  for (const range of symbolRanges) {
    for (let line = range.start; line <= range.end; line++) {
      coveredLines.add(line);
    }
  }
  for (const imp of imports) {
    for (let line = imp.range.start; line <= imp.range.end; line++) {
      coveredLines.add(line);
    }
  }
  for (const exp of exports) {
    for (let line = exp.range.start; line <= exp.range.end; line++) {
      coveredLines.add(line);
    }
  }
  for (const dir of directives) {
    for (let line = dir.range.start; line <= dir.range.end; line++) {
      coveredLines.add(line);
    }
  }

  // Use getStatementsWithComments to find orphan comments
  try {
    const statementsWithComments = sourceFile.getStatementsWithComments();
    for (const stmt of statementsWithComments) {
      // Check if this is a CommentStatement (orphan comment)
      if (Node.isCommentNode(stmt)) {
        const startLine = stmt.getStartLineNumber();
        const endLine = stmt.getEndLineNumber();
        const text = stmt.getText().trim();

        // Skip if already covered
        let alreadyCovered = false;
        for (let line = startLine; line <= endLine; line++) {
          if (coveredLines.has(line)) {
            alreadyCovered = true;
            break;
          }
        }

        if (!alreadyCovered) {
          const commentType = classifyComment(text);
          result.push({
            name: extractCommentTitle(text),
            kind: commentType,
            range: { start: startLine, end: endLine },
          });

          // Mark these lines as covered
          for (let line = startLine; line <= endLine; line++) {
            coveredLines.add(line);
          }
        }
      }
    }
  } catch {
    // Fall back to manual comment scanning
  }

  // Also check leading comment ranges on the first statement (file header comments)
  const firstStatement = sourceFile.getStatements()[0];
  if (firstStatement) {
    const leadingComments = firstStatement.getLeadingCommentRanges();
    for (const comment of leadingComments) {
      const startLine = getLineFromPos(sourceFile, comment.getPos());
      const endLine = getLineFromPos(sourceFile, comment.getEnd());
      const text = comment.getText().trim();

      // Skip if already covered
      let alreadyCovered = false;
      for (let line = startLine; line <= endLine; line++) {
        if (coveredLines.has(line)) {
          alreadyCovered = true;
          break;
        }
      }

      if (!alreadyCovered) {
        const commentType = classifyComment(text);
        result.push({
          name: extractCommentTitle(text),
          kind: commentType,
          range: { start: startLine, end: endLine },
        });

        for (let line = startLine; line <= endLine; line++) {
          coveredLines.add(line);
        }
      }
    }
  }

  return result;
}

// ── Gap Computation ──────────────────────────────────────

function computeGaps(
  sourceFile: SourceFile,
  totalLines: number,
  coveredRanges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number; type: 'blank' | 'unknown' }> {
  const covered = new Set<number>();
  for (const range of coveredRanges) {
    for (let line = range.start; line <= range.end; line++) {
      covered.add(line);
    }
  }

  const fullText = sourceFile.getFullText();
  const textLines = fullText.split('\n');

  const gaps: Array<{ start: number; end: number; type: 'blank' | 'unknown' }> = [];
  let gapStart: number | null = null;
  let gapType: 'blank' | 'unknown' | null = null;

  for (let line = 1; line <= totalLines; line++) {
    if (!covered.has(line)) {
      // Determine if this line is blank or has unknown content
      const lineText = (textLines[line - 1] ?? '').trim();
      const currentType: 'blank' | 'unknown' = lineText.length === 0 ? 'blank' : 'unknown';

      if (gapStart === null) {
        gapStart = line;
        gapType = currentType;
      } else if (currentType !== gapType) {
        // Type changed, close the previous gap and start a new one
        gaps.push({ start: gapStart, end: line - 1, type: gapType! });
        gapStart = line;
        gapType = currentType;
      }
    } else {
      if (gapStart !== null) {
        gaps.push({ start: gapStart, end: line - 1, type: gapType! });
        gapStart = null;
        gapType = null;
      }
    }
  }

  // Handle trailing gap
  if (gapStart !== null) {
    gaps.push({ start: gapStart, end: totalLines, type: gapType! });
  }

  return gaps;
}

// ── Helper Functions ─────────────────────────────────────

function emptyResult(): OrphanedContentResult {
  return {
    imports: [],
    exports: [],
    orphanComments: [],
    directives: [],
    gaps: [],
    stats: {
      totalImports: 0,
      totalExports: 0,
      totalOrphanComments: 0,
      totalDirectives: 0,
      totalBlankLines: 0,
      coveragePercent: 100,
    },
  };
}

export function findProjectRoot(filePath: string): string {
  let dir = path.dirname(filePath);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidates = ['package.json', 'tsconfig.json', 'jsconfig.json'];
    for (const file of candidates) {
      const p = path.join(dir, file);
      try {
        require('fs').accessSync(p);
        return dir;
      } catch {
        // Continue searching
      }
    }
    dir = path.dirname(dir);
  }

  return path.dirname(filePath);
}

function getLineFromPos(sourceFile: SourceFile, pos: number): number {
  const { line } = sourceFile.getLineAndColumnAtPos(pos);
  return line;
}

function classifyComment(text: string): string {
  // Multi-line comment types
  if (text.startsWith('/**')) return 'jsdoc';
  if (text.startsWith('/*')) {
    // Linter directives in block comments
    if (/\/\*\s*(eslint-disable|eslint-enable|prettier-ignore|istanbul\s+ignore|c8\s+ignore)/i.test(text)) {
      return 'linter-directive';
    }
    return 'block-comment';
  }

  // Section headers (decorative line separators)
  if (/^\/\/\s*[─━═]+/.test(text)) return 'section-header';

  // Region markers
  if (/^\/\/\s*#(region|endregion)/i.test(text)) return 'region-marker';

  // Triple-slash directives
  if (/^\/\/\/\s*<reference\s/.test(text)) return 'triple-slash-directive';

  // Source map directives
  if (/^\/\/#\s*sourceMappingURL=/.test(text)) return 'source-map-directive';

  // Compiler directives
  if (/^\/\/\s*@ts-(nocheck|ignore|expect-error|check)/i.test(text)) return 'compiler-directive';

  // Linter directives in line comments
  if (/^\/\/\s*(eslint-disable|eslint-enable|eslint-disable-next-line|prettier-ignore|istanbul\s+ignore|c8\s+ignore)/i.test(text)) {
    return 'linter-directive';
  }

  // Annotations (TODO, FIXME, etc.)
  if (/^\/\/\s*(TODO|FIXME|HACK|NOTE|WARNING|IMPORTANT|BUG|REFACTOR|DEPRECATED|PERF|SECURITY)/i.test(text)) {
    return 'annotation';
  }

  // Generic line comment
  if (text.startsWith('//')) return 'line-comment';

  return 'comment';
}

function extractCommentTitle(text: string): string {
  // For section headers like "// ── JSON Parser ──────────────────"
  const sectionMatch = text.match(/\/\/\s*[─━═]+\s*(.+?)\s*[─━═]+/);
  if (sectionMatch) return sectionMatch[1].trim();

  // For JSDoc, extract first line
  const jsdocMatch = text.match(/\/\*\*\s*\n?\s*\*?\s*(.+)/);
  if (jsdocMatch) {
    const firstLine = jsdocMatch[1].replace(/\*+\/$/, '').trim();
    return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
  }

  // For block comments
  const blockMatch = text.match(/\/\*\s*(.+)/);
  if (blockMatch) {
    const firstLine = blockMatch[1].replace(/\*+\/$/, '').trim();
    return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine;
  }

  // For line comments
  const lineMatch = text.match(/\/\/\s*(.+)/);
  if (lineMatch) {
    const content = lineMatch[1].trim();
    return content.length > 50 ? content.slice(0, 47) + '...' : content;
  }

  return text.slice(0, 50);
}
