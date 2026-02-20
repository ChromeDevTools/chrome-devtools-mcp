/**
 * File Structure Extractor — Structural Invariant Tests
 *
 * These 16 invariants are universal truths about the extractFileStructure() output.
 * They hold for ANY valid TS/JS file. Industry test suites provide breadth;
 * the invariants provide depth.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  extractFileStructure,
  type ExtractedSymbol,
  type UnifiedFileResult,
} from '../../extension/services/codebase/file-structure-extractor';

// ── Known valid values ──

const KNOWN_SYMBOL_KINDS = new Set([
  'function', 'class', 'interface', 'type', 'enum', 'variable', 'constant',
  'method', 'property', 'constructor', 'getter', 'setter',
  'enum-member', 'enumMember',
  'module', 'namespace', 'object-literal',
]);

const KNOWN_COMMENT_KINDS = new Set([
  'jsdoc', 'block-comment', 'line-comment', 'region', 'region-marker',
  'section-header', 'annotation', 'directive', 'todo',
  'separator', 'license', 'eslint-directive', 'linter-directive',
  'triple-slash-directive', 'compiler-directive',
]);

const KNOWN_IMPORT_KINDS = new Set([
  'default-import', 'named-import', 'namespace-import',
  'side-effect-import', 'type-import', 'dynamic-import',
  'require', 'cjs-require',
]);

const KNOWN_EXPORT_KINDS = new Set([
  'inline-export', 'named-export', 're-export',
  'default-export', 'type-export', 'cjs-export',
  'export-assignment', 'barrel-export',
]);

// ── Invariant assertion functions ──

function assertRangesWithinBounds(result: UnifiedFileResult, filePath: string): void {
  const walk = (symbols: ExtractedSymbol[], context: string) => {
    for (const sym of symbols) {
      expect(sym.range.startLine, `${context} > ${sym.name}: startLine >= 1`).toBeGreaterThanOrEqual(1);
      expect(sym.range.startLine, `${context} > ${sym.name}: startLine <= endLine`).toBeLessThanOrEqual(sym.range.endLine);
      expect(sym.range.endLine, `${context} > ${sym.name}: endLine <= totalLines (${result.totalLines})`).toBeLessThanOrEqual(result.totalLines);
      if (sym.children.length > 0) {
        walk(sym.children, `${context} > ${sym.name}`);
      }
    }
  };
  walk(result.symbols, filePath);
}

function assertChildrenWithinParents(result: UnifiedFileResult, filePath: string): void {
  const walk = (symbols: ExtractedSymbol[], parent: ExtractedSymbol | undefined, context: string) => {
    for (const sym of symbols) {
      if (parent) {
        expect(
          sym.range.startLine,
          `${context} > ${sym.name}: child startLine >= parent startLine`,
        ).toBeGreaterThanOrEqual(parent.range.startLine);
        expect(
          sym.range.endLine,
          `${context} > ${sym.name}: child endLine <= parent endLine`,
        ).toBeLessThanOrEqual(parent.range.endLine);
      }
      if (sym.children.length > 0) {
        walk(sym.children, sym, `${context} > ${sym.name}`);
      }
    }
  };
  walk(result.symbols, undefined, filePath);
}

function assertNoOverlappingSiblings(result: UnifiedFileResult, filePath: string): void {
  const checkSiblings = (symbols: ExtractedSymbol[], context: string) => {
    for (let i = 0; i < symbols.length - 1; i++) {
      const a = symbols[i];
      const b = symbols[i + 1];
      expect(
        a.range.endLine,
        `${context}: sibling "${a.name}" endLine (${a.range.endLine}) <= "${b.name}" startLine (${b.range.startLine})`,
      ).toBeLessThanOrEqual(b.range.startLine);
    }
    for (const sym of symbols) {
      if (sym.children.length > 0) {
        checkSiblings(sym.children, `${context} > ${sym.name}`);
      }
    }
  };
  checkSiblings(result.symbols, filePath);
}

function assertImportRangesValid(result: UnifiedFileResult): void {
  for (const imp of result.imports) {
    expect(imp.range.start, `import "${imp.name}": start >= 1`).toBeGreaterThanOrEqual(1);
    expect(imp.range.start, `import "${imp.name}": start <= end`).toBeLessThanOrEqual(imp.range.end);
    expect(imp.range.end, `import "${imp.name}": end <= totalLines`).toBeLessThanOrEqual(result.totalLines);
  }
}

function assertExportRangesValid(result: UnifiedFileResult): void {
  for (const exp of result.exports) {
    expect(exp.range.start, `export "${exp.name}": start >= 1`).toBeGreaterThanOrEqual(1);
    expect(exp.range.start, `export "${exp.name}": start <= end`).toBeLessThanOrEqual(exp.range.end);
    expect(exp.range.end, `export "${exp.name}": end <= totalLines`).toBeLessThanOrEqual(result.totalLines);
  }
}

function assertCommentRangesValid(result: UnifiedFileResult): void {
  for (const comment of result.orphanComments) {
    expect(comment.range.start, `comment "${comment.name}": start >= 1`).toBeGreaterThanOrEqual(1);
    expect(comment.range.start, `comment "${comment.name}": start <= end`).toBeLessThanOrEqual(comment.range.end);
    expect(comment.range.end, `comment "${comment.name}": end <= totalLines`).toBeLessThanOrEqual(result.totalLines);
  }
}

function assertSymbolNamesNonEmpty(result: UnifiedFileResult): void {
  const walk = (symbols: ExtractedSymbol[], context: string) => {
    for (const sym of symbols) {
      expect(sym.name.length, `${context}: symbol name must be non-empty`).toBeGreaterThan(0);
      if (sym.children.length > 0) {
        walk(sym.children, `${context} > ${sym.name}`);
      }
    }
  };
  walk(result.symbols, 'root');
}

function assertSymbolKindsValid(result: UnifiedFileResult): void {
  const walk = (symbols: ExtractedSymbol[], context: string) => {
    for (const sym of symbols) {
      expect(
        KNOWN_SYMBOL_KINDS.has(sym.kind),
        `${context} > "${sym.name}": unknown kind "${sym.kind}"`,
      ).toBe(true);
      if (sym.children.length > 0) {
        walk(sym.children, `${context} > ${sym.name}`);
      }
    }
  };
  walk(result.symbols, 'root');
}

function assertCommentKindsValid(result: UnifiedFileResult): void {
  for (const comment of result.orphanComments) {
    expect(
      KNOWN_COMMENT_KINDS.has(comment.kind),
      `comment "${comment.name}": unknown kind "${comment.kind}"`,
    ).toBe(true);
  }
}

function assertStatsConsistency(result: UnifiedFileResult): void {
  expect(result.stats.totalImports, 'stats.totalImports === imports.length').toBe(result.imports.length);
  expect(result.stats.totalExports, 'stats.totalExports === exports.length').toBe(result.exports.length);
  expect(result.stats.totalOrphanComments, 'stats.totalOrphanComments === orphanComments.length').toBe(result.orphanComments.length);
  expect(result.stats.totalDirectives, 'stats.totalDirectives === directives.length').toBe(result.directives.length);
}

function assertCoveragePercent(result: UnifiedFileResult): void {
  expect(result.stats.coveragePercent, 'coverage >= 0').toBeGreaterThanOrEqual(0);
  expect(result.stats.coveragePercent, 'coverage <= 100').toBeLessThanOrEqual(100);
}

function assertNoSymbolGapOverlap(result: UnifiedFileResult): void {
  // Build a set of all lines covered by symbols
  const symbolLines = new Set<number>();
  const collectLines = (symbols: ExtractedSymbol[]) => {
    for (const sym of symbols) {
      for (let line = sym.range.startLine; line <= sym.range.endLine; line++) {
        symbolLines.add(line);
      }
      // Don't recurse into children — they overlap with parent by definition
    }
  };
  collectLines(result.symbols);

  // Check gap ranges don't overlap with top-level symbol ranges
  for (const gap of result.gaps) {
    for (let line = gap.start; line <= gap.end; line++) {
      expect(
        symbolLines.has(line),
        `line ${line} appears in both a symbol and a gap`,
      ).toBe(false);
    }
  }
}

// ── All invariants combined ──

function assertAllInvariants(result: UnifiedFileResult, filePath: string): void {
  assertRangesWithinBounds(result, filePath);           // #1
  assertChildrenWithinParents(result, filePath);         // #2
  if (!result.hasSyntaxErrors) {
    assertNoOverlappingSiblings(result, filePath);       // #3 (skip for files with parse errors — parser error recovery can produce overlapping AST nodes)
  }
  assertImportRangesValid(result);                       // #4
  assertExportRangesValid(result);                       // #5
  assertCommentRangesValid(result);                      // #6
  assertSymbolNamesNonEmpty(result);                     // #7
  assertSymbolKindsValid(result);                        // #8
  assertCommentKindsValid(result);                       // #9
  assertStatsConsistency(result);                        // #10-13
  assertCoveragePercent(result);                         // #14
  assertNoSymbolGapOverlap(result);                      // #15
  // #16 (crash invariant) is implicit — if we get here without throwing, it passes
}

// ── Test suite ──

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const TEST_WORKSPACE = path.resolve(WORKSPACE_ROOT, 'test-workspace');
const EXTENSION_DIR = path.resolve(WORKSPACE_ROOT, 'extension');

const TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs']);

function collectTsFiles(dir: string, maxDepth = 20): string[] {
  const files: string[] = [];
  if (maxDepth <= 0) return files;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        files.push(...collectTsFiles(fullPath, maxDepth - 1));
      } else if (entry.isFile() && TS_EXTS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore read errors
  }

  return files;
}

// ── Test-workspace files ──

describe('Invariants: test-workspace files', () => {
  const testFiles = collectTsFiles(TEST_WORKSPACE);

  it('should find test-workspace TS/JS files', () => {
    expect(testFiles.length, 'should find at least 1 test file').toBeGreaterThan(0);
  });

  for (const filePath of testFiles) {
    const relPath = path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');

    it(`[${relPath}] all 16 invariants hold`, () => {
      const result = extractFileStructure(filePath);
      assertAllInvariants(result, relPath);
    });
  }
});

// ── Extension source files (self-test) ──

describe('Invariants: extension source files', () => {
  const extFiles = collectTsFiles(EXTENSION_DIR);

  it('should find extension TS files', () => {
    expect(extFiles.length, 'should find at least 1 extension file').toBeGreaterThan(0);
  });

  for (const filePath of extFiles) {
    const relPath = path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');

    it(`[${relPath}] all 16 invariants hold`, () => {
      const result = extractFileStructure(filePath);
      assertAllInvariants(result, relPath);
    });
  }
});

// ── Industry test suites (if downloaded) ──

const TEST262_DIR = path.resolve(__dirname, '..', 'fixtures', 'test262', 'pass');
const TS_CONFORMANCE_DIR = path.resolve(__dirname, '..', 'fixtures', 'ts-conformance');

describe('Invariants: Test262 pass files', () => {
  const exists = fs.existsSync(TEST262_DIR);

  it.skipIf(!exists)('should find test262/pass directory', () => {
    expect(fs.existsSync(TEST262_DIR)).toBe(true);
  });

  if (exists) {
    const t262Files = collectTsFiles(TEST262_DIR);
    it(`should have test262 files (found ${t262Files.length})`, () => {
      expect(t262Files.length).toBeGreaterThan(0);
    });

    for (const filePath of t262Files) {
      const relPath = path.relative(TEST262_DIR, filePath).replace(/\\/g, '/');

      it(`[test262/${relPath}] invariants hold`, () => {
        const result = extractFileStructure(filePath);
        assertAllInvariants(result, relPath);
      });
    }
  }
});

describe('Invariants: TypeScript conformance files', () => {
  const exists = fs.existsSync(TS_CONFORMANCE_DIR);

  it.skipIf(!exists)('should find ts-conformance directory', () => {
    expect(fs.existsSync(TS_CONFORMANCE_DIR)).toBe(true);
  });

  if (exists) {
    const tsConformanceFiles = collectTsFiles(TS_CONFORMANCE_DIR);
    it(`should have TS conformance files (found ${tsConformanceFiles.length})`, () => {
      expect(tsConformanceFiles.length).toBeGreaterThan(0);
    });

    for (const filePath of tsConformanceFiles) {
      const relPath = path.relative(TS_CONFORMANCE_DIR, filePath).replace(/\\/g, '/');

      it(`[ts-conformance/${relPath}] invariants hold`, () => {
        const result = extractFileStructure(filePath);
        assertAllInvariants(result, relPath);
      });
    }
  }
});
