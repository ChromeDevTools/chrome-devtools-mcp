// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure Node.js — orchestrates markdown parsing into FileStructure.

import type { FileStructure, FileSymbol, OrphanedItem, OrphanedCategory } from '../types';
import { parseMarkdown } from './markdown-parser';
import { MD_KINDS } from './markdown-types';
import { readFileText } from '../file-utils';

// ── Public API ───────────────────────────────────────────

/**
 * Extract a full FileStructure from a Markdown file.
 * Produces symbols, orphaned content, gaps, and stats.
 */
export function extractMarkdownStructure(filePath: string): FileStructure {
  const { text } = readFileText(filePath);
  return extractMarkdownStructureFromText(text);
}

/**
 * Extract FileStructure from Markdown text (for testing or in-memory usage).
 */
export function extractMarkdownStructureFromText(text: string): FileStructure {
  const allSymbols = parseMarkdown(text);
  const lines = text.split('\n');
  const totalLines = lines.length;

  // Root-level HTML comments become orphaned content (targetable via #comments)
  const { symbols, commentOrphans } = extractRootHtmlComments(allSymbols);

  const orphaned = [
    ...commentOrphans,
    ...detectOrphanedContent(symbols, commentOrphans, lines, totalLines),
  ];
  const gaps = computeGaps(symbols, orphaned, totalLines);
  const stats = computeStats(symbols, orphaned, lines);

  return {
    symbols,
    content: text,
    totalLines,
    fileType: 'markdown',
    orphaned: { items: orphaned },
    gaps,
    stats,
  };
}

// ── Orphaned Content Detection ───────────────────────────

/**
 * Extract root-level HTML comments from the symbol list.
 * These become orphaned content (targetable via `#comments`),
 * keeping them consistent with how TS/JS handles orphan comments.
 */
function extractRootHtmlComments(allSymbols: FileSymbol[]): {
  symbols: FileSymbol[];
  commentOrphans: OrphanedItem[];
} {
  const symbols: FileSymbol[] = [];
  const commentOrphans: OrphanedItem[] = [];

  for (const sym of allSymbols) {
    if (sym.kind === MD_KINDS.html && sym.name === 'comment') {
      commentOrphans.push({
        name: sym.name,
        kind: 'comment',
        range: { start: sym.range.startLine, end: sym.range.endLine },
        category: 'comment',
      });
    } else {
      symbols.push(sym);
    }
  }

  return { symbols, commentOrphans };
}

function detectOrphanedContent(
  symbols: FileSymbol[],
  existingOrphans: OrphanedItem[],
  lines: string[],
  totalLines: number,
): OrphanedItem[] {
  const orphaned: OrphanedItem[] = [];

  // Build a set of all lines covered by top-level symbols and existing orphans
  const coveredLines = new Set<number>();
  for (const sym of symbols) {
    for (let i = sym.range.startLine; i <= sym.range.endLine; i++) {
      coveredLines.add(i);
    }
  }
  for (const item of existingOrphans) {
    for (let i = item.range.start; i <= item.range.end; i++) {
      coveredLines.add(i);
    }
  }

  // Scan uncovered lines for orphaned content (HTML comments handled by extractRootHtmlComments)
  let i = 1;
  while (i <= totalLines) {
    if (coveredLines.has(i)) {
      i++;
      continue;
    }

    const line = lines[i - 1];

    // Footnote definitions: [^id]: text
    const footnoteMatch = /^\[\^([^\]]+)\]:\s*(.*)/.exec(line);
    if (footnoteMatch) {
      orphaned.push({
        name: `[^${footnoteMatch[1]}]`,
        kind: 'footnote',
        range: { start: i, end: i },
        category: 'footnote',
      });
      i++;
      continue;
    }

    // Reference link definitions: [id]: url
    const linkDefMatch = /^\[([^\]^][^\]]*)\]:\s+\S+/.exec(line);
    if (linkDefMatch) {
      orphaned.push({
        name: `[${linkDefMatch[1]}]`,
        kind: 'linkdef',
        range: { start: i, end: i },
        category: 'linkdef',
      });
      i++;
      continue;
    }

    i++;
  }

  return orphaned;
}

// ── Gap Computation ──────────────────────────────────────

function computeGaps(
  symbols: FileSymbol[],
  orphaned: OrphanedItem[],
  totalLines: number,
): Array<{ start: number; end: number; type: 'blank' | 'unknown' }> {
  const covered = new Set<number>();

  // Mark lines covered by symbols (recursively)
  const markSymbol = (sym: FileSymbol): void => {
    for (let i = sym.range.startLine; i <= sym.range.endLine; i++) {
      covered.add(i);
    }
    for (const child of sym.children) {
      markSymbol(child);
    }
  };
  for (const sym of symbols) markSymbol(sym);

  // Mark lines covered by orphaned items
  for (const item of orphaned) {
    for (let i = item.range.start; i <= item.range.end; i++) {
      covered.add(i);
    }
  }

  // Collect gaps
  const gaps: Array<{ start: number; end: number; type: 'blank' | 'unknown' }> = [];
  let gapStart: number | undefined;

  for (let line = 1; line <= totalLines; line++) {
    if (!covered.has(line)) {
      if (gapStart === undefined) gapStart = line;
    } else {
      if (gapStart !== undefined) {
        gaps.push({ start: gapStart, end: line - 1, type: 'blank' });
        gapStart = undefined;
      }
    }
  }
  if (gapStart !== undefined) {
    gaps.push({ start: gapStart, end: totalLines, type: 'blank' });
  }

  return gaps;
}

// ── Stats ────────────────────────────────────────────────

function computeStats(
  symbols: FileSymbol[],
  orphaned: OrphanedItem[],
  lines: string[],
): { totalSymbols: number; totalOrphaned: number; totalBlankLines: number; coveragePercent: number } {
  const totalLines = lines.length;
  let totalSymbols = 0;

  const countSymbols = (syms: FileSymbol[]): void => {
    for (const sym of syms) {
      totalSymbols++;
      countSymbols(sym.children);
    }
  };
  countSymbols(symbols);

  let blankLines = 0;
  for (const line of lines) {
    if (line.trim() === '') blankLines++;
  }

  // Coverage: lines covered by symbols + orphaned vs total
  const covered = new Set<number>();
  const markSymbol = (sym: FileSymbol): void => {
    for (let i = sym.range.startLine; i <= sym.range.endLine; i++) {
      covered.add(i);
    }
    for (const child of sym.children) {
      markSymbol(child);
    }
  };
  for (const sym of symbols) markSymbol(sym);
  for (const item of orphaned) {
    for (let i = item.range.start; i <= item.range.end; i++) {
      covered.add(i);
    }
  }

  const coveragePercent = totalLines > 0 ? Math.round((covered.size / totalLines) * 100) : 100;

  return {
    totalSymbols,
    totalOrphaned: orphaned.length,
    totalBlankLines: blankLines,
    coveragePercent,
  };
}
