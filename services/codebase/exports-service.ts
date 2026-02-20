// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure Node.js — no VS Code API dependency.
import * as path from 'path';
import {
  SyntaxKind,
  type SourceFile,
  type ExportedDeclarations,
} from 'ts-morph';
import type { ExportsParams, ExportsResult, ExportInfo } from './types';
import { TS_PARSEABLE_EXTS } from './types';
import { getTsProject } from './ts-project';
import { getCustomParser } from './parsers';
import { discoverFiles, readFileText, getPathType } from './file-utils';
import type { SymbolNode } from './types';

// ── Public API ─────────────────────────────────────────

export function getExports(params: ExportsParams): ExportsResult {
  const rootDir = params.rootDir;

  const targetPath = path.isAbsolute(params.path)
    ? params.path
    : path.join(rootDir, params.path);

  const pathType = getPathType(targetPath);

  if (pathType === 'directory') {
    return getDirectoryExports(targetPath, rootDir, params);
  }

  return getFileExports(targetPath, rootDir, params);
}

// ── File Exports ───────────────────────────────────────

function getFileExports(
  filePath: string,
  rootDir: string,
  params: ExportsParams,
): ExportsResult {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

  if (!TS_PARSEABLE_EXTS.has(ext)) {
    return getNonTsExports(filePath, relativePath, ext, params);
  }

  const { text } = readFileText(filePath);

  const project = getTsProject();
  const tempName = `__exports_${Date.now()}.${ext}`;
  let sourceFile: SourceFile;
  try {
    sourceFile = project.createSourceFile(tempName, text, { overwrite: true });
  } catch {
    return { module: relativePath, exports: [], reExports: [], summary: '0 exports (parse error)' };
  }

  try {
    const exports: ExportInfo[] = [];
    const reExports: Array<{ name: string; from: string }> = [];

    const exportMap = sourceFile.getExportedDeclarations();

    for (const [name, declarations] of exportMap) {
      for (const decl of declarations) {
        const kind = getExportKind(decl);

        if (params.kind && params.kind !== 'all' && !matchesKindFilter(kind, params.kind)) {
          continue;
        }

        const declSourceFile = decl.getSourceFile();
        const isReExport = declSourceFile.getFilePath() !== sourceFile.getFilePath();

        const info: ExportInfo = {
          name,
          kind,
          line: decl.getStartLineNumber(),
          isDefault: name === 'default',
          isReExport,
        };

        if (isReExport) {
          const reExportRelative = path.relative(rootDir, declSourceFile.getFilePath()).replace(/\\/g, '/');
          info.reExportSource = reExportRelative;
          reExports.push({ name, from: reExportRelative });
        }

        if (params.includeTypes !== false) {
          try {
            info.signature = getExportSignature(decl, kind);
          } catch {
            // Type extraction can fail for complex generics
          }
        }

        if (params.includeJSDoc !== false) {
          const jsdoc = getJSDocText(decl);
          if (jsdoc) {
            info.jsdoc = jsdoc;
          }
        }

        exports.push(info);
      }
    }

    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();
      if (moduleSpecifier && exportDecl.isNamespaceExport()) {
        reExports.push({ name: '*', from: moduleSpecifier });
      }
    }

    exports.sort((a, b) => a.name.localeCompare(b.name));

    const summary = buildExportsSummary(exports);

    return { module: relativePath, exports, reExports, summary };
  } finally {
    project.removeSourceFile(sourceFile);
  }
}

// ── Directory Exports ──────────────────────────────────

function getDirectoryExports(
  dirPath: string,
  rootDir: string,
  params: ExportsParams,
): ExportsResult {
  const tsExtGlob = '**/*.{ts,tsx,js,jsx,mts,mjs,cts,cjs}';

  const fileMap = discoverFiles({
    rootDir: dirPath,
    includeGlob: tsExtGlob,
    includePatterns: params.includePatterns,
    excludePatterns: params.excludePatterns,
    maxResults: 500,
  });

  const allExports: ExportInfo[] = [];
  const allReExports: Array<{ name: string; from: string }> = [];

  for (const [, absPath] of fileMap) {
    const result = getFileExports(absPath, rootDir, params);
    for (const exp of result.exports) {
      allExports.push({ ...exp, name: `${result.module}:${exp.name}` });
    }
    allReExports.push(...result.reExports);
  }

  allExports.sort((a, b) => a.name.localeCompare(b.name));

  const relativePath = path.relative(rootDir, dirPath).replace(/\\/g, '/');
  const summary = buildExportsSummary(allExports);

  return { module: relativePath || '.', exports: allExports, reExports: allReExports, summary };
}

// ── Non-TS/JS Fallback (Custom AST Parsers) ─────────

function getNonTsExports(
  filePath: string,
  relativePath: string,
  ext: string,
  params: ExportsParams,
): ExportsResult {
  const parser = getCustomParser(ext);
  if (!parser) {
    return { module: relativePath, exports: [], reExports: [], summary: '0 exports (unsupported file type)' };
  }

  try {
    const { text } = readFileText(filePath);
    const symbols: SymbolNode[] = parser(text, 2);

    if (symbols.length === 0) {
      return { module: relativePath, exports: [], reExports: [], summary: '0 exports (no symbols)' };
    }

    const exports: ExportInfo[] = [];
    for (const sym of symbols) {
      const kind = sym.kind;
      if (params.kind && params.kind !== 'all' && !matchesKindFilter(kind, params.kind)) {
        continue;
      }
      exports.push({
        name: sym.name,
        kind,
        line: sym.range.start,
        isDefault: false,
        isReExport: false,
        signature: sym.detail,
      });
    }

    exports.sort((a, b) => a.name.localeCompare(b.name));
    return { module: relativePath, exports, reExports: [], summary: buildExportsSummary(exports) };
  } catch {
    return { module: relativePath, exports: [], reExports: [], summary: '0 exports (parse error)' };
  }
}

// ── Helpers ────────────────────────────────────────────

function getExportKind(decl: ExportedDeclarations): string {
  const kindValue = decl.getKind();
  switch (kindValue) {
    case SyntaxKind.FunctionDeclaration:
      return 'function';
    case SyntaxKind.ClassDeclaration:
      return 'class';
    case SyntaxKind.InterfaceDeclaration:
      return 'interface';
    case SyntaxKind.TypeAliasDeclaration:
      return 'type';
    case SyntaxKind.EnumDeclaration:
      return 'enum';
    case SyntaxKind.VariableDeclaration: {
      const parent = decl.getParent();
      if (parent) {
        const parentText = parent.getText();
        if (parentText.startsWith('const ') || parentText.includes('const {') || parentText.includes('const [')) {
          return 'constant';
        }
      }
      return 'variable';
    }
    case SyntaxKind.ModuleDeclaration:
      return 'namespace';
    default:
      return 'unknown';
  }
}

function getExportSignature(decl: ExportedDeclarations, kind: string): string | undefined {
  switch (kind) {
    case 'function': {
      if ('getReturnType' in decl && 'getParameters' in decl) {
        const fn = decl as unknown as { getParameters(): Array<{ getName(): string; getType(): { getText(): string } }>; getReturnType(): { getText(): string } };
        const paramTexts: string[] = [];
        for (const p of fn.getParameters()) {
          paramTexts.push(`${p.getName()}: ${p.getType().getText()}`);
        }
        return `(${paramTexts.join(', ')}) => ${fn.getReturnType().getText()}`;
      }
      return undefined;
    }
    case 'class': {
      if ('getHeritageClauses' in decl) {
        const cls = decl as unknown as { getHeritageClauses(): Array<{ getText(): string }> };
        const heritage = cls.getHeritageClauses();
        if (heritage.length > 0) {
          return heritage.map(h => h.getText()).join(' ');
        }
      }
      return undefined;
    }
    case 'interface': {
      if ('getExtends' in decl) {
        const iface = decl as unknown as { getExtends(): Array<{ getText(): string }> };
        const ext = iface.getExtends();
        if (ext.length > 0) {
          return `extends ${ext.map(e => e.getText()).join(', ')}`;
        }
      }
      return undefined;
    }
    case 'type': {
      if ('getType' in decl) {
        const alias = decl as unknown as { getType(): { getText(): string } };
        return alias.getType().getText();
      }
      return undefined;
    }
    case 'constant':
    case 'variable': {
      if ('getType' in decl) {
        const v = decl as unknown as { getType(): { getText(): string } };
        return v.getType().getText();
      }
      return undefined;
    }
    case 'enum': {
      if ('getMembers' in decl) {
        const en = decl as unknown as { getMembers(): Array<{ getName(): string }> };
        const members = en.getMembers();
        if (members.length <= 6) {
          return members.map(m => m.getName()).join(' | ');
        }
        return `${members.slice(0, 5).map(m => m.getName()).join(' | ')} | ... (${members.length} members)`;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function getJSDocText(decl: ExportedDeclarations): string | undefined {
  if (!('getJsDocs' in decl)) return undefined;
  const jsDocs = (decl as unknown as { getJsDocs(): Array<{ getDescription(): string }> }).getJsDocs();
  if (jsDocs.length === 0) return undefined;
  const description = jsDocs[0].getDescription().trim();
  return description || undefined;
}

function matchesKindFilter(kind: string, filter: string): boolean {
  switch (filter) {
    case 'functions': return kind === 'function';
    case 'classes': return kind === 'class';
    case 'interfaces': return kind === 'interface';
    case 'types': return kind === 'type';
    case 'constants': return kind === 'constant' || kind === 'variable';
    case 'enums': return kind === 'enum';
    default: return true;
  }
}

function buildExportsSummary(exports: ExportInfo[]): string {
  if (exports.length === 0) return '0 exports';

  const counts = new Map<string, number>();
  for (const exp of exports) {
    counts.set(exp.kind, (counts.get(exp.kind) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [kind, count] of counts) {
    parts.push(`${count} ${kind}${count > 1 ? 's' : ''}`);
  }

  return `${exports.length} exports (${parts.join(', ')})`;
}
