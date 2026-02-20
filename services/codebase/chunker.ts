// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure Node.js — no VS Code API dependency.

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { SymbolNode, Chunk, ChunkFileParams, ChunkFileResult, FileSymbol } from './types';
import { TS_PARSEABLE_EXTS } from './types';
import { getTypeScriptSymbols } from './overview-service';
import { getCustomParser } from './parsers';
import { readFileText } from './file-utils';

const DEFAULT_TOKEN_BUDGET = 512;
const DEFAULT_MAX_DEPTH = Infinity;
const OVERLAP_LINES = 15;
const CHARS_PER_TOKEN = 4;

// ── Public API ───────────────────────────────────────────

export function chunkFile(params: ChunkFileParams): ChunkFileResult {
  const { filePath, rootDir, maxDepth = DEFAULT_MAX_DEPTH, tokenBudget = DEFAULT_TOKEN_BUDGET } = params;

  const { text } = readFileText(filePath);
  const lines = text.split('\n');
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const symbols = parseFileSymbols(text, filePath, ext);

  const chunks: Chunk[] = [];
  let oversizedSplits = 0;
  let observedMaxDepth = 0;

  const ctx: ChunkContext = {
    lines,
    relativePath,
    tokenBudget,
    maxDepth,
    chunks,
  };

  for (const symbol of symbols) {
    const result = processSymbolNode(symbol, ctx, null, [], 1);
    oversizedSplits += result.oversizedSplits;
    if (result.maxDepth > observedMaxDepth) observedMaxDepth = result.maxDepth;
  }

  return {
    chunks,
    symbols,
    stats: {
      totalChunks: chunks.length,
      maxDepth: observedMaxDepth,
      oversizedSplits,
    },
  };
}

/**
 * Chunk pre-parsed FileSymbol[] from any language service.
 * Converts FileSymbol → SymbolNode format and delegates to the core chunking algorithm.
 */
export function chunkSymbols(params: {
  symbols: FileSymbol[];
  content: string;
  filePath: string;
  rootDir: string;
  maxDepth?: number;
  tokenBudget?: number;
}): ChunkFileResult {
  const { symbols, content, filePath, rootDir, maxDepth = DEFAULT_MAX_DEPTH, tokenBudget = DEFAULT_TOKEN_BUDGET } = params;
  const lines = content.split('\n');
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

  const converted = symbols.map(convertFileSymbol);
  const chunks: Chunk[] = [];
  let oversizedSplits = 0;
  let observedMaxDepth = 0;

  const ctx: ChunkContext = { lines, relativePath, tokenBudget, maxDepth, chunks };

  for (const symbol of converted) {
    const result = processSymbolNode(symbol, ctx, null, [], 1);
    oversizedSplits += result.oversizedSplits;
    if (result.maxDepth > observedMaxDepth) observedMaxDepth = result.maxDepth;
  }

  return {
    chunks,
    symbols: converted,
    stats: { totalChunks: chunks.length, maxDepth: observedMaxDepth, oversizedSplits },
  };
}

function convertFileSymbol(sym: FileSymbol): SymbolNode {
  return {
    name: sym.name,
    kind: sym.kind,
    detail: sym.detail,
    range: { start: sym.range.startLine, end: sym.range.endLine },
    children: sym.children.map(convertFileSymbol),
  };
}

// ── Internal Types ───────────────────────────────────────

interface ChunkContext {
  lines: string[];
  relativePath: string;
  tokenBudget: number;
  maxDepth: number;
  chunks: Chunk[];
}

interface ProcessResult {
  chunkId: string;
  oversizedSplits: number;
  maxDepth: number;
}

// ── Symbol Parsing (delegates to canonical parsers) ──────

function parseFileSymbols(text: string, filePath: string, ext: string): SymbolNode[] {
  if (TS_PARSEABLE_EXTS.has(ext)) {
    return getTypeScriptSymbols(text, filePath);
  }

  const parser = getCustomParser(ext);
  if (parser) {
    return parser(text, 100);
  }

  return [];
}

// ── Core Chunking Logic ──────────────────────────────────

function processSymbolNode(
  symbol: SymbolNode,
  ctx: ChunkContext,
  parentChunkId: string | null,
  breadcrumbParts: string[],
  depth: number,
): ProcessResult {
  const currentBreadcrumb = [...breadcrumbParts, symbol.name];
  const breadcrumbStr = currentBreadcrumb.join(' > ');
  const symbolName = currentBreadcrumb.join('.');

  const content = extractContent(ctx.lines, symbol.range.start, symbol.range.end);
  const tokenCount = estimateTokens(content);
  const chunkId = generateChunkId(ctx.relativePath, symbolName, symbol.range);

  let totalOversizedSplits = 0;
  let maxObservedDepth = depth;
  const childChunkIds: string[] = [];

  // Process children first (if within depth budget)
  if (symbol.children && symbol.children.length > 0 && depth < ctx.maxDepth) {
    for (const child of symbol.children) {
      const childResult = processSymbolNode(child, ctx, chunkId, currentBreadcrumb, depth + 1);
      childChunkIds.push(childResult.chunkId);
      totalOversizedSplits += childResult.oversizedSplits;
      if (childResult.maxDepth > maxObservedDepth) maxObservedDepth = childResult.maxDepth;
    }
  }

  // Handle oversized leaf nodes (no children to split into)
  if (tokenCount > ctx.tokenBudget && childChunkIds.length === 0) {
    // Split into overlapping line-based sub-chunks
    const subChunks = splitOversizedChunk(
      ctx.lines, symbol, ctx.relativePath, symbolName, breadcrumbStr,
      depth, chunkId, ctx.tokenBudget,
    );
    const subIds: string[] = [];
    for (const sub of subChunks) {
      ctx.chunks.push(sub);
      subIds.push(sub.id);
    }
    totalOversizedSplits += subChunks.length;

    // Still create the parent chunk with references to sub-chunks
    const parentChunk: Chunk = {
      id: chunkId,
      filePath: ctx.relativePath,
      content,
      symbolName,
      symbolKind: symbol.kind,
      breadcrumb: breadcrumbStr,
      depth,
      range: { start: symbol.range.start, end: symbol.range.end },
      parentChunkId,
      childChunkIds: subIds,
      tokenCount,
    };
    ctx.chunks.push(parentChunk);

    return { chunkId, oversizedSplits: totalOversizedSplits, maxDepth: maxObservedDepth };
  }

  // Normal chunk creation
  const chunk: Chunk = {
    id: chunkId,
    filePath: ctx.relativePath,
    content,
    symbolName,
    symbolKind: symbol.kind,
    breadcrumb: breadcrumbStr,
    depth,
    range: { start: symbol.range.start, end: symbol.range.end },
    parentChunkId,
    childChunkIds,
    tokenCount,
  };
  ctx.chunks.push(chunk);

  return { chunkId, oversizedSplits: totalOversizedSplits, maxDepth: maxObservedDepth };
}

// ── Helpers ──────────────────────────────────────────────

function extractContent(lines: string[], startLine: number, endLine: number): string {
  // Lines are 1-indexed in SymbolNode ranges
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, endLine);
  return lines.slice(start, end).join('\n');
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function generateChunkId(
  filePath: string,
  symbolName: string,
  range: { start: number; end: number },
): string {
  const raw = `${filePath}::${symbolName}:${range.start}-${range.end}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Split an oversized leaf chunk into overlapping sub-chunks.
 * Splits at line boundaries to preserve code structure.
 */
function splitOversizedChunk(
  lines: string[],
  symbol: SymbolNode,
  filePath: string,
  symbolName: string,
  breadcrumb: string,
  depth: number,
  parentId: string,
  tokenBudget: number,
): Chunk[] {
  const startIdx = Math.max(0, symbol.range.start - 1);
  const endIdx = Math.min(lines.length, symbol.range.end);
  const totalLines = endIdx - startIdx;

  // Estimate lines per chunk from token budget
  const avgCharsPerLine = lines.slice(startIdx, endIdx).reduce((sum, l) => sum + l.length, 0) / totalLines;
  const linesPerChunk = Math.max(10, Math.floor((tokenBudget * CHARS_PER_TOKEN) / Math.max(1, avgCharsPerLine)));

  const subChunks: Chunk[] = [];
  let currentStart = startIdx;
  let partIndex = 0;

  while (currentStart < endIdx) {
    const currentEnd = Math.min(currentStart + linesPerChunk, endIdx);
    const subContent = lines.slice(currentStart, currentEnd).join('\n');
    const subRange = { start: currentStart + 1, end: currentEnd };

    const subName = `${symbolName}[part${partIndex}]`;
    const subId = generateChunkId(filePath, subName, subRange);

    subChunks.push({
      id: subId,
      filePath,
      content: subContent,
      symbolName: subName,
      symbolKind: `${symbol.kind}-part`,
      breadcrumb: `${breadcrumb} [part ${partIndex}]`,
      depth: depth + 1,
      range: subRange,
      parentChunkId: parentId,
      childChunkIds: [],
      tokenCount: estimateTokens(subContent),
    });

    // Advance with overlap
    currentStart = currentEnd - OVERLAP_LINES;
    if (currentStart >= endIdx - OVERLAP_LINES && currentEnd >= endIdx) break;
    partIndex++;
  }

  return subChunks;
}
