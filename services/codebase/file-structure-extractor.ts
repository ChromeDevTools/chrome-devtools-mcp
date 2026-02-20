// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// This module extracts symbols from TypeScript/JavaScript files using ts-morph.
// It has ZERO VS Code API dependencies and is fully testable with Vitest.

import { SourceFile, Node, Scope } from 'ts-morph';
import * as path from 'path';
import type {
  FunctionDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  VariableStatement,
  ModuleDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  ConstructorDeclaration,
  GetAccessorDeclaration,
  SetAccessorDeclaration,
  PropertySignature,
} from 'ts-morph';
import type { SymbolNode } from './types';
import { TS_PARSEABLE_EXTS } from './types';
import { extractOrphanedContent, findProjectRoot } from './orphaned-content';
import { getWorkspaceProject } from './ts-project';

// ── Types (compatible with FileSymbol in mcp-server/src/client-pipe.ts) ──

export interface ExtractedSymbolRange {
  startLine: number;   // 1-indexed
  startChar: number;   // 0-indexed (column)
  endLine: number;     // 1-indexed
  endChar: number;     // 0-indexed (column)
}

export interface ExtractedSymbol {
  name: string;
  kind: string;
  detail?: string;
  range: ExtractedSymbolRange;
  children: ExtractedSymbol[];
  exported?: boolean;
  modifiers?: string[];
}

// ── Range Helper ──

function getRange(node: Node): ExtractedSymbolRange {
  const sf = node.getSourceFile();
  const fileEnd = sf.getEnd();
  const startPos = Math.max(0, Math.min(node.getStart(), fileEnd));
  const endPos = Math.max(startPos, Math.min(node.getEnd(), fileEnd));
  const startLc = sf.compilerNode.getLineAndCharacterOfPosition(startPos);
  const endLc = sf.compilerNode.getLineAndCharacterOfPosition(endPos);
  return {
    startLine: startLc.line + 1,
    startChar: startLc.character,
    endLine: endLc.line + 1,
    endChar: endLc.character,
  };
}

// ── Modifier Extraction ──

function collectFunctionModifiers(node: FunctionDeclaration | MethodDeclaration): string[] {
  const mods: string[] = [];
  if (node.isAsync()) mods.push('async');

  if (Node.isMethodDeclaration(node)) {
    if (node.isAbstract()) mods.push('abstract');
    if (node.isStatic()) mods.push('static');
    const scope = node.getScope();
    if (scope === Scope.Private) mods.push('private');
    if (scope === Scope.Protected) mods.push('protected');
  }

  if (node.isGenerator()) mods.push('generator');
  return mods;
}

function collectClassModifiers(node: ClassDeclaration): string[] {
  const mods: string[] = [];
  if (node.isAbstract()) mods.push('abstract');
  return mods;
}

function collectPropertyModifiers(node: PropertyDeclaration): string[] {
  const mods: string[] = [];
  if (node.isStatic()) mods.push('static');
  if (node.isReadonly()) mods.push('readonly');
  if (node.isAbstract()) mods.push('abstract');
  const scope = node.getScope();
  if (scope === Scope.Private) mods.push('private');
  if (scope === Scope.Protected) mods.push('protected');
  return mods;
}

function collectAccessorModifiers(node: GetAccessorDeclaration | SetAccessorDeclaration): string[] {
  const mods: string[] = [];
  if (node.isStatic()) mods.push('static');
  if (node.isAbstract()) mods.push('abstract');
  const scope = node.getScope();
  if (scope === Scope.Private) mods.push('private');
  if (scope === Scope.Protected) mods.push('protected');
  return mods;
}

function collectConstructorModifiers(node: ConstructorDeclaration): string[] {
  const mods: string[] = [];
  const scope = node.getScope();
  if (scope === Scope.Private) mods.push('private');
  if (scope === Scope.Protected) mods.push('protected');
  return mods;
}

function collectPropertySignatureModifiers(node: PropertySignature): string[] {
  const mods: string[] = [];
  if (node.isReadonly()) mods.push('readonly');
  return mods;
}

// ── Exported Check ──

function isNodeExported(node: Node): boolean {
  // Check for export keyword on the node itself
  if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node) ||
      Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) ||
      Node.isEnumDeclaration(node) || Node.isModuleDeclaration(node)) {
    return node.isExported();
  }

  if (Node.isVariableStatement(node)) {
    return node.isExported();
  }

  return false;
}

// ── Individual Extractors ──

function extractFunction(node: FunctionDeclaration): ExtractedSymbol {
  const name = node.getName() ?? '(anonymous)';
  const mods = collectFunctionModifiers(node);
  const isDefault = node.isDefaultExport();

  return {
    name: isDefault && name === '(anonymous)' ? '(default)' : name,
    kind: 'function',
    range: getRange(node),
    children: [],
    exported: node.isExported() || undefined,
    modifiers: mods.length > 0 ? mods : undefined,
  };
}

function extractClassChildren(node: ClassDeclaration): ExtractedSymbol[] {
  const children: ExtractedSymbol[] = [];

  for (const ctor of node.getConstructors()) {
    const ctorMods = collectConstructorModifiers(ctor);
    children.push({
      name: 'constructor',
      kind: 'constructor',
      range: getRange(ctor),
      children: [],
      modifiers: ctorMods.length > 0 ? ctorMods : undefined,
    });
  }

  for (const method of node.getMethods()) {
    const mods = collectFunctionModifiers(method);
    children.push({
      name: method.getName() || '(anonymous)',
      kind: 'method',
      range: getRange(method),
      children: [],
      modifiers: mods.length > 0 ? mods : undefined,
    });
  }

  for (const prop of node.getProperties()) {
    const mods = collectPropertyModifiers(prop);
    children.push({
      name: prop.getName() || '(anonymous)',
      kind: 'property',
      range: getRange(prop),
      children: [],
      modifiers: mods.length > 0 ? mods : undefined,
    });
  }

  for (const getter of node.getGetAccessors()) {
    const mods = collectAccessorModifiers(getter);
    children.push({
      name: getter.getName() || '(anonymous)',
      kind: 'getter',
      range: getRange(getter),
      children: [],
      modifiers: mods.length > 0 ? mods : undefined,
    });
  }

  for (const setter of node.getSetAccessors()) {
    const mods = collectAccessorModifiers(setter);
    children.push({
      name: setter.getName() || '(anonymous)',
      kind: 'setter',
      range: getRange(setter),
      children: [],
      modifiers: mods.length > 0 ? mods : undefined,
    });
  }

  // Sort children by start line
  children.sort((a, b) => a.range.startLine - b.range.startLine);
  return children;
}

function extractClass(node: ClassDeclaration): ExtractedSymbol {
  const name = node.getName() ?? '(anonymous)';
  const mods = collectClassModifiers(node);
  const isDefault = node.isDefaultExport();

  return {
    name: isDefault && name === '(anonymous)' ? '(default)' : name,
    kind: 'class',
    range: getRange(node),
    children: extractClassChildren(node),
    exported: node.isExported() || undefined,
    modifiers: mods.length > 0 ? mods : undefined,
  };
}

function extractInterfaceChildren(node: InterfaceDeclaration): ExtractedSymbol[] {
  const children: ExtractedSymbol[] = [];

  for (const prop of node.getProperties()) {
    const mods = collectPropertySignatureModifiers(prop);
    children.push({
      name: prop.getName() || '(anonymous)',
      kind: 'property',
      range: getRange(prop),
      children: [],
      modifiers: mods.length > 0 ? mods : undefined,
    });
  }

  for (const method of node.getMethods()) {
    children.push({
      name: method.getName() || '(anonymous)',
      kind: 'method',
      range: getRange(method),
      children: [],
    });
  }

  // Call signatures: unnamed, use index as identifier
  let callSigIndex = 0;
  for (const sig of node.getCallSignatures()) {
    children.push({
      name: `(call-signature-${callSigIndex++})`,
      kind: 'method',
      range: getRange(sig),
      children: [],
    });
  }

  // Construct signatures
  let ctorSigIndex = 0;
  for (const sig of node.getConstructSignatures()) {
    children.push({
      name: `(construct-signature-${ctorSigIndex++})`,
      kind: 'constructor',
      range: getRange(sig),
      children: [],
    });
  }

  // Index signatures
  let indexSigIndex = 0;
  for (const sig of node.getIndexSignatures()) {
    children.push({
      name: `(index-signature-${indexSigIndex++})`,
      kind: 'property',
      range: getRange(sig),
      children: [],
    });
  }

  children.sort((a, b) => a.range.startLine - b.range.startLine);
  return children;
}

function extractInterface(node: InterfaceDeclaration): ExtractedSymbol {
  return {
    name: node.getName() || '(anonymous)',
    kind: 'interface',
    range: getRange(node),
    children: extractInterfaceChildren(node),
    exported: node.isExported() || undefined,
  };
}

function extractTypeAlias(node: TypeAliasDeclaration): ExtractedSymbol {
  return {
    name: node.getName() || '(anonymous)',
    kind: 'type',
    range: getRange(node),
    children: [],
    exported: node.isExported() || undefined,
  };
}

function extractEnumChildren(node: EnumDeclaration): ExtractedSymbol[] {
  const children: ExtractedSymbol[] = [];
  for (const member of node.getMembers()) {
    children.push({
      name: member.getName() || '(anonymous)',
      kind: 'enumMember',
      range: getRange(member),
      children: [],
    });
  }
  return children;
}

function extractEnum(node: EnumDeclaration): ExtractedSymbol {
  return {
    name: node.getName() || '(anonymous)',
    kind: 'enum',
    range: getRange(node),
    children: extractEnumChildren(node),
    exported: node.isExported() || undefined,
  };
}

function extractObjectLiteralChildren(node: Node): ExtractedSymbol[] {
  if (!Node.isObjectLiteralExpression(node)) return [];

  const children: ExtractedSymbol[] = [];
  for (const prop of node.getProperties()) {
    if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
      children.push({
        name: prop.getName() || '(anonymous)',
        kind: 'property',
        range: getRange(prop),
        children: [],
      });
    } else if (Node.isMethodDeclaration(prop)) {
      children.push({
        name: prop.getName() || '(anonymous)',
        kind: 'method',
        range: getRange(prop),
        children: [],
      });
    } else if (Node.isGetAccessorDeclaration(prop)) {
      children.push({
        name: prop.getName() || '(anonymous)',
        kind: 'getter',
        range: getRange(prop),
        children: [],
      });
    } else if (Node.isSetAccessorDeclaration(prop)) {
      children.push({
        name: prop.getName() || '(anonymous)',
        kind: 'setter',
        range: getRange(prop),
        children: [],
      });
    }
  }
  return children;
}

function extractVariableStatement(node: VariableStatement): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const isExported = node.isExported();
  const declKind = node.getDeclarationKind();
  const kind = declKind === 'const' ? 'constant' : 'variable';
  const declarations = node.getDeclarations();
  const isSingleDecl = declarations.length === 1;
  // For single declarations, use the full statement range (includes const/let/var keyword)
  const stmtRange = getRange(node);

  for (const decl of declarations) {
    // Handle destructured declarations (binding patterns)
    const nameNode = decl.getNameNode();
    if (Node.isArrayBindingPattern(nameNode) || Node.isObjectBindingPattern(nameNode)) {
      const patternText = nameNode.getText();
      symbols.push({
        name: patternText.length > 40 ? patternText.substring(0, 40) + '...' : patternText,
        kind,
        range: isSingleDecl ? stmtRange : getRange(decl),
        children: [],
        exported: isExported || undefined,
      });
      continue;
    }

    const name = decl.getName() || '(anonymous)';
    const initializer = decl.getInitializer();
    const children = initializer ? extractObjectLiteralChildren(initializer) : [];

    symbols.push({
      name,
      kind,
      range: isSingleDecl ? stmtRange : getRange(decl),
      children,
      exported: isExported || undefined,
    });
  }

  return symbols;
}

function extractModuleChildren(node: ModuleDeclaration, sourceFile: SourceFile): ExtractedSymbol[] {
  const body = node.getBody();
  if (!body) return [];

  // Module body can be a ModuleBlock (has statements) or another ModuleDeclaration (nested)
  if (Node.isModuleBlock(body)) {
    return extractStatementsAsSymbols(body.getStatements(), sourceFile);
  }
  if (Node.isModuleDeclaration(body)) {
    return [extractModule(body, sourceFile)];
  }
  return [];
}

function extractModule(node: ModuleDeclaration, sourceFile: SourceFile): ExtractedSymbol {
  const name = node.getName() || '(anonymous)';
  // Determine if it's a namespace or module keyword
  const isNamespace = node.hasNamespaceKeyword();

  return {
    name,
    kind: isNamespace ? 'namespace' : 'module',
    range: getRange(node),
    children: extractModuleChildren(node, sourceFile),
    exported: node.isExported() || undefined,
  };
}

// ── CJS Pattern Detection ──

function extractCjsPatterns(statements: readonly Node[]): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];

  for (const stmt of statements) {
    if (!Node.isExpressionStatement(stmt)) continue;

    const expr = stmt.getExpression();
    if (!Node.isBinaryExpression(expr)) continue;

    const left = expr.getLeft();
    const right = expr.getRight();

    // module.exports = ...
    if (Node.isPropertyAccessExpression(left)) {
      const obj = left.getExpression();
      const prop = left.getName();

      if (Node.isIdentifier(obj) && obj.getText() === 'module' && prop === 'exports') {
        // module.exports = { ... } or module.exports = value
        const children: ExtractedSymbol[] = [];

        if (Node.isObjectLiteralExpression(right)) {
        for (const p of right.getProperties()) {
          if (Node.isPropertyAssignment(p) || Node.isShorthandPropertyAssignment(p)) {
            children.push({
              name: p.getName() || '(anonymous)',
              kind: 'property',
              range: getRange(p),
              children: [],
            });
          } else if (Node.isMethodDeclaration(p)) {
            children.push({
              name: p.getName() || '(anonymous)',
              kind: 'method',
              range: getRange(p),
              children: [],
            });
          }
        }
      }

        symbols.push({
          name: 'module.exports',
          kind: 'variable',
          range: getRange(stmt),
          children,
          exported: true,
        });
        continue;
      }

      // module.exports.foo = ... or exports.foo = ...
      if (Node.isPropertyAccessExpression(obj)) {
        const outerObj = obj.getExpression();
        const outerProp = obj.getName();
        if (Node.isIdentifier(outerObj) && outerObj.getText() === 'module' && outerProp === 'exports') {
          symbols.push({
            name: prop || '(anonymous)',
            kind: 'variable',
            range: getRange(stmt),
            children: [],
            exported: true,
          });
          continue;
        }
      }

      // exports.foo = ...
      if (Node.isIdentifier(obj) && obj.getText() === 'exports') {
        symbols.push({
          name: prop || '(anonymous)',
          kind: 'variable',
          range: getRange(stmt),
          children: [],
          exported: true,
        });
        continue;
      }
    }
  }

  return symbols;
}

// ── Statement-Level Extraction ──

function extractStatementsAsSymbols(
  statements: readonly Node[],
  sourceFile: SourceFile,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];

  for (const stmt of statements) {
    if (Node.isFunctionDeclaration(stmt)) {
      // Skip unnamed non-default functions (forward declarations without implementation)
      if (stmt.getName() || stmt.isDefaultExport()) {
        symbols.push(extractFunction(stmt));
      }
    } else if (Node.isClassDeclaration(stmt)) {
      symbols.push(extractClass(stmt));
    } else if (Node.isInterfaceDeclaration(stmt)) {
      symbols.push(extractInterface(stmt));
    } else if (Node.isTypeAliasDeclaration(stmt)) {
      symbols.push(extractTypeAlias(stmt));
    } else if (Node.isEnumDeclaration(stmt)) {
      symbols.push(extractEnum(stmt));
    } else if (Node.isVariableStatement(stmt)) {
      symbols.push(...extractVariableStatement(stmt));
    } else if (Node.isModuleDeclaration(stmt)) {
      symbols.push(extractModule(stmt, sourceFile));
    } else if (Node.isExportAssignment(stmt)) {
      // export default <expression> or export = <expression>
      const expr = stmt.getExpression();
      const children = extractObjectLiteralChildren(expr);
      symbols.push({
        name: '(default)',
        kind: 'variable',
        range: getRange(stmt),
        children,
        exported: true,
      });
    }
  }

  // CJS patterns (module.exports = ..., exports.foo = ...)
  const cjsSymbols = extractCjsPatterns(statements);
  symbols.push(...cjsSymbols);

  // Sort all symbols by start line to maintain source order
  symbols.sort((a, b) => a.range.startLine - b.range.startLine);

  return symbols;
}

// ── Main Public API ──

/**
 * Extract all symbols from a ts-morph SourceFile.
 * Returns a tree of ExtractedSymbol nodes with 1-indexed line numbers.
 * This function has ZERO VS Code API dependencies.
 */
export function extractSymbols(sourceFile: SourceFile): ExtractedSymbol[] {
  return extractStatementsAsSymbols(sourceFile.getStatements(), sourceFile);
}

// ── Unified File Structure ──

export interface UnifiedFileResult {
  symbols: ExtractedSymbol[];
  content: string;
  totalLines: number;
  hasSyntaxErrors: boolean;
  imports: SymbolNode[];
  exports: SymbolNode[];
  orphanComments: SymbolNode[];
  directives: SymbolNode[];
  gaps: Array<{ start: number; end: number; type: 'blank' | 'unknown' }>;
  stats: {
    totalImports: number;
    totalExports: number;
    totalOrphanComments: number;
    totalDirectives: number;
    totalBlankLines: number;
    coveragePercent: number;
  };
}

/**
 * Flatten the symbol tree into a flat list of { start, end } ranges (1-indexed).
 * Used as input for orphaned content detection and gap computation.
 */
function flattenSymbolRanges(symbols: ExtractedSymbol[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const sym of symbols) {
    ranges.push({ start: sym.range.startLine, end: sym.range.endLine });
    if (sym.children.length > 0) {
      ranges.push(...flattenSymbolRanges(sym.children));
    }
  }
  return ranges;
}

/**
 * Extract the complete file structure in a single call using ts-morph.
 * Combines symbol extraction + orphaned content analysis.
 * Returns symbols, content, imports, exports, comments, directives, gaps, and stats.
 *
 * Only supports TS/JS family files (.ts, .tsx, .js, .jsx, .mts, .mjs, .cts, .cjs).
 * Returns an empty result for unsupported file types.
 */
export function extractFileStructure(filePath: string): UnifiedFileResult {
  const ext = path.extname(filePath).slice(1).toLowerCase();

  if (!TS_PARSEABLE_EXTS.has(ext)) {
    return emptyUnifiedResult();
  }

  try {
    const rootDir = findProjectRoot(filePath);
    const project = getWorkspaceProject(rootDir);
    let sourceFile = project.getSourceFile(filePath);

    if (!sourceFile) {
      sourceFile = project.addSourceFileAtPath(filePath);
    } else {
      // Re-read from disk to pick up any external modifications (e.g., file_edit)
      sourceFile.refreshFromFileSystemSync();
    }

    if (!sourceFile) {
      return emptyUnifiedResult();
    }

    // Extract symbols using our ts-morph extractor
    const symbols = extractSymbols(sourceFile);

    // Convert symbol ranges to flat list for orphaned content detection
    const symbolRanges = flattenSymbolRanges(symbols);

    // Extract orphaned content (imports, exports, comments, directives, gaps)
    const orphaned = extractOrphanedContent(filePath, symbolRanges);

    // Get file content and total lines (use same line-counting method as getRange for consistency)
    const content = sourceFile.getFullText();
    const totalLines = sourceFile.compilerNode.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1;

    // Detect parse-level syntax errors (not type errors) for downstream consumers
    const parseDiags = Reflect.get(sourceFile.compilerNode, 'parseDiagnostics');
    const hasSyntaxErrors = Array.isArray(parseDiags) && parseDiags.length > 0;

    return {
      symbols,
      content,
      totalLines,
      hasSyntaxErrors,
      imports: orphaned.imports,
      exports: orphaned.exports,
      orphanComments: orphaned.orphanComments,
      directives: orphaned.directives,
      gaps: orphaned.gaps,
      stats: orphaned.stats,
    };
  } catch {
    return emptyUnifiedResult();
  }
}

function emptyUnifiedResult(): UnifiedFileResult {
  return {
    symbols: [],
    content: '',
    totalLines: 0,
    hasSyntaxErrors: false,
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
      coveragePercent: 0,
    },
  };
}
