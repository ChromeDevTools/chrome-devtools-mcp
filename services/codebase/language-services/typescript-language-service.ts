// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Wraps the existing ts-morph file-structure-extractor in the LanguageService interface.

import type { LanguageService } from '../language-service-registry';
import type { FileStructure, FileSymbol, FileSymbolRange, OrphanedItem, OrphanedCategory } from '../types';
import { extractFileStructure as extractTsMorphStructure } from '../file-structure-extractor';
import type { ExtractedSymbol, ExtractedSymbolRange } from '../file-structure-extractor';
import type { SymbolNode } from '../types';

const TS_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs'] as const;

function convertRange(range: ExtractedSymbolRange): FileSymbolRange {
  return {
    startLine: range.startLine,
    endLine: range.endLine,
    startChar: range.startChar,
    endChar: range.endChar,
  };
}

function convertSymbol(sym: ExtractedSymbol): FileSymbol {
  return {
    name: sym.name,
    kind: sym.kind,
    detail: sym.detail,
    range: convertRange(sym.range),
    children: sym.children.map(convertSymbol),
    exported: sym.exported,
    modifiers: sym.modifiers,
  };
}

function convertOrphaned(node: SymbolNode, category: OrphanedCategory): OrphanedItem {
  return {
    name: node.name,
    kind: node.kind,
    detail: node.detail,
    range: { start: node.range.start, end: node.range.end },
    children: node.children?.map(c => convertOrphaned(c, category)),
    category,
  };
}

export class TypeScriptLanguageService implements LanguageService {
  readonly id = 'typescript';
  readonly name = 'TypeScript / JavaScript';
  readonly extensions = TS_EXTENSIONS;

  async extractStructure(filePath: string): Promise<FileStructure> {
    const result = extractTsMorphStructure(filePath);

    const orphanedItems: OrphanedItem[] = [
      ...result.imports.map(n => convertOrphaned(n, 'import')),
      ...result.exports.map(n => convertOrphaned(n, 'export')),
      ...result.orphanComments.map(n => convertOrphaned(n, 'comment')),
      ...result.directives.map(n => convertOrphaned(n, 'directive')),
    ];

    return {
      symbols: result.symbols.map(convertSymbol),
      content: result.content,
      totalLines: result.totalLines,
      fileType: 'typescript',
      orphaned: { items: orphanedItems },
      gaps: result.gaps,
      stats: {
        totalSymbols: countSymbols(result.symbols),
        totalOrphaned: orphanedItems.length,
        totalBlankLines: result.stats.totalBlankLines,
        coveragePercent: result.stats.coveragePercent,
      },
    };
  }
}

function countSymbols(symbols: ExtractedSymbol[]): number {
  let count = 0;
  for (const sym of symbols) {
    count += 1;
    if (sym.children.length > 0) {
      count += countSymbols(sym.children);
    }
  }
  return count;
}
