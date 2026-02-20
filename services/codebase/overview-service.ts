// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure Node.js — no VS Code API dependency.
import * as fs from 'fs';
import * as path from 'path';
import {
  type SourceFile,
  type ClassDeclaration,
  type InterfaceDeclaration,
  type EnumDeclaration,
  type Node,
  type FunctionDeclaration,
  type MethodDeclaration,
  type ConstructorDeclaration,
  type GetAccessorDeclaration,
  type SetAccessorDeclaration,
  type ArrowFunction,
  type FunctionExpression,
  SyntaxKind,
} from 'ts-morph';
import type { OverviewParams, OverviewResult, TreeNode, SymbolNode } from './types';
import { TS_PARSEABLE_EXTS } from './types';
import { getTsProject } from './ts-project';
import { getCustomParser } from './parsers';
import { discoverFiles, readFileText } from './file-utils';
import { parseIgnoreRules, applyIgnoreRules } from './ignore-rules';

// ── Public API ─────────────────────────────────────────

export function getOverview(params: OverviewParams): OverviewResult {
  const { rootDir, dir, recursive, symbols, metadata, toolScope } = params;

  // Resolve dir against rootDir
  const resolvedFolder = path.isAbsolute(dir)
    ? dir
    : path.resolve(rootDir, dir);

  // maxDepth: undefined = unlimited (recursive), 0 = immediate files only
  const maxDepth = recursive ? undefined : 0;

  const fileMap = discoverFiles({
      rootDir: resolvedFolder,
      ignoreRulesRoot: rootDir,
      maxResults: 5000,
      maxDepth,
      toolScope,
    });

  const tree = buildTree(fileMap, resolvedFolder, recursive);

  // Inject ignored entries so they appear in the tree as [Ignored] placeholders
  const ignoreRules = parseIgnoreRules(rootDir);
  injectIgnoredEntries(tree, resolvedFolder, resolvedFolder, ignoreRules, recursive, toolScope);

  let totalSymbols = 0;
  if (symbols) {
    totalSymbols = populateSymbols(tree, '', fileMap, true);
  } else if (metadata) {
    populateLineCounts(tree, '', fileMap);
  }

  return {
    projectRoot: resolvedFolder,
    tree,
    summary: {
      totalFiles: fileMap.size,
      totalDirectories: countDirectories(tree),
      totalSymbols,
    },
  };
}

// ── Tree Builder ─────────────────────────────────────

function buildTree(
  fileMap: Map<string, string>,
  scanRoot: string,
  recursive: boolean,
): TreeNode[] {
  const dirChildren = new Map<string, Map<string, TreeNode>>();

  const getOrCreateDir = (parentKey: string, name: string): void => {
    if (!dirChildren.has(parentKey)) {
      dirChildren.set(parentKey, new Map());
    }
    const parent = dirChildren.get(parentKey)!;
    if (!parent.has(name)) {
      const node: TreeNode = { name, type: 'directory', children: [] };
      parent.set(name, node);
    }
  };

  for (const relativePath of fileMap.keys()) {
    const parts = relativePath.split('/');
    let currentKey = '';

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      getOrCreateDir(currentKey, dirName);
      currentKey = currentKey ? `${currentKey}/${dirName}` : dirName;
    }

    const fileName = parts[parts.length - 1];
    if (!dirChildren.has(currentKey)) {
      dirChildren.set(currentKey, new Map());
    }
    dirChildren.get(currentKey)!.set(fileName, { name: fileName, type: 'file' });
  }

  // Non-recursive mode: add subdirectory stubs from the scan root
  if (!recursive) {
    try {
      const entries = fs.readdirSync(scanRoot, { withFileTypes: true });
      if (!dirChildren.has('')) {
        dirChildren.set('', new Map());
      }
      const rootMap = dirChildren.get('')!;
      for (const entry of entries) {
        if (entry.isDirectory() && !rootMap.has(entry.name)) {
          rootMap.set(entry.name, { name: entry.name, type: 'directory' });
        }
      }
    } catch {
      // Directory listing failed — just use what we have from fileMap
    }
  }

  const assemble = (key: string): TreeNode[] => {
    const children = dirChildren.get(key);
    if (!children) return [];

    const nodes = [...children.values()];
    for (const node of nodes) {
      if (node.type === 'directory') {
        const childKey = key ? `${key}/${node.name}` : node.name;
        node.children = assemble(childKey);
      }
    }
    return sortNodes(nodes);
  };

  return assemble('');
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Walk the filesystem alongside the built tree and add ignored entries as placeholders.
 * Only items excluded by .devtoolsignore rules are injected (not fileType-filtered items).
 */
function injectIgnoredEntries(
  tree: TreeNode[],
  dirPath: string,
  scanRoot: string,
  ignoreRules: ReturnType<typeof parseIgnoreRules>,
  recursive: boolean,
  toolScope?: string,
): void {
  if (ignoreRules.length === 0) return;

  const existingNames = new Set(tree.map(n => n.name));
  const normalizedScanRoot = scanRoot.replace(/\\/g, '/').replace(/\/+$/, '');

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (existingNames.has(entry.name)) continue;
    if (!entry.isFile() && !entry.isDirectory()) continue;

    const fullPath = path.join(dirPath, entry.name).replace(/\\/g, '/');
    const relative = fullPath.startsWith(normalizedScanRoot + '/')
      ? fullPath.slice(normalizedScanRoot.length + 1)
      : fullPath;

    if (applyIgnoreRules(relative, ignoreRules, toolScope)) {
      tree.push({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        ignored: true,
      });
    }
  }

  if (recursive) {
    for (const node of tree) {
      if (node.type === 'directory' && !node.ignored && node.children) {
        injectIgnoredEntries(
          node.children,
          path.join(dirPath, node.name),
          scanRoot,
          ignoreRules,
          recursive,
          toolScope,
        );
      }
    }
  }

  sortNodes(tree);
}

// ── TypeScript Symbol Extraction (ts-morph) ──────────

export function getTypeScriptSymbols(text: string, fileName: string): SymbolNode[] {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!TS_PARSEABLE_EXTS.has(ext)) return [];

  const project = getTsProject();
  const tempName = `__overview_${Date.now()}.${ext}`;
  let sourceFile: SourceFile;
  try {
    sourceFile = project.createSourceFile(tempName, text, { overwrite: true });
  } catch {
    return [];
  }

  const symbols: SymbolNode[] = [];

  try {
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName() ?? '<anonymous>';
      const node: SymbolNode = {
        name,
        kind: 'function',
        range: { start: fn.getStartLineNumber(), end: fn.getEndLineNumber() },
      };
      const bodyChildren = extractBodyDeclarations(fn);
      if (bodyChildren.length > 0) node.children = bodyChildren;
      symbols.push(node);
    }

    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName() ?? '<anonymous>';
      const node: SymbolNode = {
        name,
        kind: 'class',
        range: { start: cls.getStartLineNumber(), end: cls.getEndLineNumber() },
        children: getClassMembers(cls),
      };
      symbols.push(node);
    }

    for (const iface of sourceFile.getInterfaces()) {
      const node: SymbolNode = {
        name: iface.getName(),
        kind: 'interface',
        range: { start: iface.getStartLineNumber(), end: iface.getEndLineNumber() },
        children: getInterfaceMembers(iface),
      };
      symbols.push(node);
    }

    for (const alias of sourceFile.getTypeAliases()) {
      symbols.push({
        name: alias.getName(),
        kind: 'type',
        range: { start: alias.getStartLineNumber(), end: alias.getEndLineNumber() },
      });
    }

    for (const en of sourceFile.getEnums()) {
      const node: SymbolNode = {
        name: en.getName(),
        kind: 'enum',
        range: { start: en.getStartLineNumber(), end: en.getEndLineNumber() },
        children: getEnumMembers(en),
      };
      symbols.push(node);
    }

    for (const stmt of sourceFile.getVariableStatements()) {
      const isConst = stmt.getDeclarationKind().toString() === 'const';
      for (const decl of stmt.getDeclarations()) {
        const varNode: SymbolNode = {
          name: decl.getName(),
          kind: isConst ? 'constant' : 'variable',
          range: { start: decl.getStartLineNumber(), end: decl.getEndLineNumber() },
        };
        // Check if the initializer is an arrow function or function expression
        const init = decl.getInitializer();
        if (init) {
          const fnNode = extractFunctionFromExpression(init);
          if (fnNode) {
            const bodyChildren = extractBodyDeclarations(fnNode);
            if (bodyChildren.length > 0) varNode.children = bodyChildren;
          }
        }
        symbols.push(varNode);
      }
    }

    for (const mod of sourceFile.getModules()) {
      symbols.push({
        name: mod.getName(),
        kind: 'namespace',
        range: { start: mod.getStartLineNumber(), end: mod.getEndLineNumber() },
      });
    }
  } finally {
    project.removeSourceFile(sourceFile);
  }

  symbols.sort((a, b) => a.range.start - b.range.start);
  return symbols;
}

function getClassMembers(cls: ClassDeclaration): SymbolNode[] {
  const members: SymbolNode[] = [];

  for (const ctor of cls.getConstructors()) {
    const ctorNode: SymbolNode = {
      name: 'constructor',
      kind: 'constructor',
      range: { start: ctor.getStartLineNumber(), end: ctor.getEndLineNumber() },
    };
    const bodyChildren = extractBodyDeclarations(ctor);
    if (bodyChildren.length > 0) ctorNode.children = bodyChildren;
    members.push(ctorNode);
  }

  for (const method of cls.getMethods()) {
    const methodNode: SymbolNode = {
      name: method.getName(),
      kind: 'method',
      range: { start: method.getStartLineNumber(), end: method.getEndLineNumber() },
    };
    const bodyChildren = extractBodyDeclarations(method);
    if (bodyChildren.length > 0) methodNode.children = bodyChildren;
    members.push(methodNode);
  }

  for (const prop of cls.getProperties()) {
    const propNode: SymbolNode = {
      name: prop.getName(),
      kind: 'property',
      range: { start: prop.getStartLineNumber(), end: prop.getEndLineNumber() },
    };
    // Check for arrow function / function expression initializers
    const init = prop.getInitializer();
    if (init) {
      const fnNode = extractFunctionFromExpression(init);
      if (fnNode) {
        const bodyChildren = extractBodyDeclarations(fnNode);
        if (bodyChildren.length > 0) propNode.children = bodyChildren;
      }
    }
    members.push(propNode);
  }

  for (const getter of cls.getGetAccessors()) {
    const getterNode: SymbolNode = {
      name: getter.getName(),
      kind: 'getter',
      range: { start: getter.getStartLineNumber(), end: getter.getEndLineNumber() },
    };
    const bodyChildren = extractBodyDeclarations(getter);
    if (bodyChildren.length > 0) getterNode.children = bodyChildren;
    members.push(getterNode);
  }

  for (const setter of cls.getSetAccessors()) {
    const setterNode: SymbolNode = {
      name: setter.getName(),
      kind: 'setter',
      range: { start: setter.getStartLineNumber(), end: setter.getEndLineNumber() },
    };
    const bodyChildren = extractBodyDeclarations(setter);
    if (bodyChildren.length > 0) setterNode.children = bodyChildren;
    members.push(setterNode);
  }

  members.sort((a, b) => a.range.start - b.range.start);
  return members;
}

// ── Body Declaration Extraction ──────────────────────

type FunctionLikeNode =
  | FunctionDeclaration
  | MethodDeclaration
  | ConstructorDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration
  | ArrowFunction
  | FunctionExpression;

/**
 * Extract named declarations from the body of a function-like node.
 * Only captures variable declarations, inner function declarations,
 * and arrow/function-expression assignments — NOT control flow or expressions.
 */
function extractBodyDeclarations(fnNode: FunctionLikeNode): SymbolNode[] {
  const body = fnNode.getBody();
  if (!body) return [];

  const results: SymbolNode[] = [];
  walkStatements(body, results);
  results.sort((a, b) => a.range.start - b.range.start);
  return results;
}

/**
 * Walk the immediate statements of a block, collecting named declarations.
 * Does not recurse into nested blocks (if/for/while) to keep output focused.
 */
function walkStatements(node: Node, results: SymbolNode[]): void {
  for (const child of node.getChildren()) {
    const kind = child.getKind();

    if (kind === SyntaxKind.VariableStatement) {
      const varStmt = child.asKindOrThrow(SyntaxKind.VariableStatement);
      const declKind = varStmt.getDeclarationKind().toString();
      const isConst = declKind === 'const';
      for (const decl of varStmt.getDeclarations()) {
        const varNode: SymbolNode = {
          name: decl.getName(),
          kind: isConst ? 'constant' : 'variable',
          range: { start: decl.getStartLineNumber(), end: decl.getEndLineNumber() },
        };
        const init = decl.getInitializer();
        if (init) {
          const innerFn = extractFunctionFromExpression(init);
          if (innerFn) {
            const innerBody = extractBodyDeclarations(innerFn);
            if (innerBody.length > 0) varNode.children = innerBody;
          }
        }
        results.push(varNode);
      }
    } else if (kind === SyntaxKind.FunctionDeclaration) {
      const fn = child.asKindOrThrow(SyntaxKind.FunctionDeclaration);
      const name = fn.getName() ?? '<anonymous>';
      const fnSymbol: SymbolNode = {
        name,
        kind: 'function',
        range: { start: fn.getStartLineNumber(), end: fn.getEndLineNumber() },
      };
      const bodyChildren = extractBodyDeclarations(fn);
      if (bodyChildren.length > 0) fnSymbol.children = bodyChildren;
      results.push(fnSymbol);
    } else if (kind === SyntaxKind.ClassDeclaration) {
      const cls = child.asKindOrThrow(SyntaxKind.ClassDeclaration);
      const name = cls.getName() ?? '<anonymous>';
      results.push({
        name,
        kind: 'class',
        range: { start: cls.getStartLineNumber(), end: cls.getEndLineNumber() },
        children: getClassMembers(cls),
      });
    }
  }
}

/**
 * If an expression node is an ArrowFunction or FunctionExpression, return it.
 */
function extractFunctionFromExpression(node: Node): ArrowFunction | FunctionExpression | undefined {
  if (node.getKind() === SyntaxKind.ArrowFunction) {
    return node.asKindOrThrow(SyntaxKind.ArrowFunction);
  }
  if (node.getKind() === SyntaxKind.FunctionExpression) {
    return node.asKindOrThrow(SyntaxKind.FunctionExpression);
  }
  return undefined;
}

function getInterfaceMembers(iface: InterfaceDeclaration): SymbolNode[] {
  const members: SymbolNode[] = [];

  for (const prop of iface.getProperties()) {
    members.push({
      name: prop.getName(),
      kind: 'property',
      range: { start: prop.getStartLineNumber(), end: prop.getEndLineNumber() },
    });
  }

  for (const method of iface.getMethods()) {
    members.push({
      name: method.getName(),
      kind: 'method',
      range: { start: method.getStartLineNumber(), end: method.getEndLineNumber() },
    });
  }

  members.sort((a, b) => a.range.start - b.range.start);
  return members;
}

function getEnumMembers(en: EnumDeclaration): SymbolNode[] {
  const members: SymbolNode[] = [];

  for (const member of en.getMembers()) {
    members.push({
      name: member.getName(),
      kind: 'enumMember',
      range: { start: member.getStartLineNumber(), end: member.getEndLineNumber() },
    });
  }

  return members;
}

// ── Symbol Population ────────────────────────────────

function populateSymbols(
  nodes: TreeNode[],
  pathPrefix: string,
  fileMap: Map<string, string>,
  storeLineCount = false,
): number {
  let totalSymbols = 0;

  for (const node of nodes) {
    if (node.type === 'directory' && node.children) {
      const childPrefix = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
      totalSymbols += populateSymbols(node.children, childPrefix, fileMap, storeLineCount);
      continue;
    }

    if (node.type !== 'file') continue;

    const relativePath = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
    const absPath = fileMap.get(relativePath);
    if (!absPath) continue;

    const ext = node.name.split('.').pop()?.toLowerCase() ?? '';

    try {
      const { text, lineCount } = readFileText(absPath);
      if (storeLineCount) node.lineCount = lineCount;

      if (TS_PARSEABLE_EXTS.has(ext)) {
        const tsSymbols = getTypeScriptSymbols(text, node.name);
        if (tsSymbols.length > 0) {
          node.symbols = tsSymbols;
          totalSymbols += countSymbols(node.symbols);
        }
        continue;
      }

      const parserForExt = getCustomParser(ext);
      if (parserForExt) {
        const parsed = parserForExt(text, 10);
        if (parsed && parsed.length > 0) {
          node.symbols = parsed;
          totalSymbols += countSymbols(node.symbols);
        }
      }
    } catch {
      // Skip binary files or files that can't be read as text
    }
  }

  return totalSymbols;
}

function populateLineCounts(
  nodes: TreeNode[],
  pathPrefix: string,
  fileMap: Map<string, string>,
): void {
  for (const node of nodes) {
    if (node.type === 'directory' && node.children) {
      const childPrefix = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
      populateLineCounts(node.children, childPrefix, fileMap);
      continue;
    }
    if (node.type !== 'file') continue;

    const relativePath = pathPrefix ? `${pathPrefix}/${node.name}` : node.name;
    const absPath = fileMap.get(relativePath);
    if (!absPath) continue;

    try {
      const { lineCount } = readFileText(absPath);
      node.lineCount = lineCount;
    } catch {
      // Skip binary files or files that can't be read as text
    }
  }
}

// ── Counting Helpers ─────────────────────────────────

function countSymbols(symbols: SymbolNode[]): number {
  let count = symbols.length;
  for (const s of symbols) {
    if (s.children) count += countSymbols(s.children);
  }
  return count;
}

function countDirectories(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'directory') {
      count++;
      if (node.children) count += countDirectories(node.children);
    }
  }
  return count;
}
