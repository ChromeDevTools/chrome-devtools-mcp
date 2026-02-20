// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
import * as jsoncParser from 'jsonc-parser';
import type { SymbolNode, FileSymbol } from './types';
import { parseMarkdown } from './markdown';

// ── Custom Parser Dispatch ─────────────────────────────

/**
 * Returns the custom parser function for a given file extension, or undefined
 * if the extension should use VS Code's built-in language service instead.
 */
export function getCustomParser(ext: string): ((text: string, maxDepth: number) => SymbolNode[]) | undefined {
  switch (ext) {
    case 'json':
    case 'webmanifest':
    case 'geojson':
      return (text, depth) => parseJsonSymbols(text, depth, false);

    case 'jsonc':
    case 'json5':
      return (text, depth) => parseJsonSymbols(text, depth, true);

    case 'jsonl':
      return (text, depth) => parseJsonlSymbols(text, depth);

    case 'md':
    case 'markdown':
      return (text, _depth) => convertFileSymbolsToNodes(parseMarkdown(text));

    default:
      return undefined;
  }
}

// ── JSON Parser ──────────────────────────────────────────

/**
 * Build a line-offset index: lineOffsets[i] = character offset where line i starts (0-indexed).
 */
function buildLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/**
 * Convert a character offset to a 1-indexed line number.
 */
function offsetToLine(offset: number, lineOffsets: number[]): number {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineOffsets[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1; // 1-indexed
}

function parseJsonSymbols(text: string, maxDepth: number, isJsonc = false): SymbolNode[] {
  const lineOffsets = buildLineOffsets(text);

  if (isJsonc) {
    // Use parseTree for JSONC — it handles comments and trailing commas
    const tree = jsoncParser.parseTree(text, undefined, { allowTrailingComma: true });
    if (!tree) return [];
    return jsonNodeToSymbols(tree, text, lineOffsets, maxDepth, 0);
  }

  // For strict JSON, also use parseTree — it gives us position data
  const tree = jsoncParser.parseTree(text);
  if (!tree) return [];
  return jsonNodeToSymbols(tree, text, lineOffsets, maxDepth, 0);
}

/**
 * Convert a jsonc-parser AST node to SymbolNode[] with accurate line positions.
 */
function jsonNodeToSymbols(
  node: jsoncParser.Node,
  text: string,
  lineOffsets: number[],
  maxDepth: number,
  currentDepth: number,
): SymbolNode[] {
  if (node.type === 'object' && node.children) {
    const results: SymbolNode[] = [];
    for (const prop of node.children) {
      if (prop.type !== 'property' || !prop.children || prop.children.length < 2) continue;
      const keyNode = prop.children[0];
      const valueNode = prop.children[1];
      const key = jsoncParser.getNodeValue(keyNode) as string;

      const startLine = offsetToLine(prop.offset, lineOffsets);
      const endLine = offsetToLine(prop.offset + prop.length - 1, lineOffsets);

      const kind = jsonNodeTypeLabel(valueNode);
      const symbol: SymbolNode = {
        name: key,
        kind,
        range: { start: startLine, end: endLine },
      };

      if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'null') {
        const val = jsoncParser.getNodeValue(valueNode);
        const strVal = String(val);
        symbol.detail = strVal.length > 60 ? strVal.slice(0, 57) + '...' : strVal;
      } else if (kind === 'array') {
        const itemCount = valueNode.children?.length ?? 0;
        symbol.detail = `${itemCount} items`;
      }

      if (currentDepth < maxDepth && (valueNode.type === 'object' || valueNode.type === 'array') && valueNode.children) {
        const children = jsonNodeToSymbols(valueNode, text, lineOffsets, maxDepth, currentDepth + 1);
        if (children.length > 0) symbol.children = children;
      }

      results.push(symbol);
    }
    return results;
  }

  if (node.type === 'array' && node.children) {
    const results: SymbolNode[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const item = node.children[i];
      const startLine = offsetToLine(item.offset, lineOffsets);
      const endLine = offsetToLine(item.offset + item.length - 1, lineOffsets);
      const kind = jsonNodeTypeLabel(item);

      const symbol: SymbolNode = {
        name: `[${i}]`,
        kind,
        range: { start: startLine, end: endLine },
      };

      if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'null') {
        symbol.detail = String(jsoncParser.getNodeValue(item));
      }

      if (currentDepth < maxDepth && (item.type === 'object' || item.type === 'array') && item.children) {
        const children = jsonNodeToSymbols(item, text, lineOffsets, maxDepth, currentDepth + 1);
        if (children.length > 0) symbol.children = children;
      }

      results.push(symbol);
    }
    return results;
  }

  return [];
}

function jsonNodeTypeLabel(node: jsoncParser.Node): string {
  if (node.type === 'null') return 'null';
  if (node.type === 'array') return 'array';
  if (node.type === 'object') return 'object';
  if (node.type === 'string') return 'string';
  if (node.type === 'number') return 'number';
  if (node.type === 'boolean') return 'boolean';
  return 'unknown';
}

// ── JSONL Parser ─────────────────────────────────────────

function parseJsonlSymbols(text: string, maxDepth: number): SymbolNode[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const result: SymbolNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const tree = jsoncParser.parseTree(lineText);
    if (!tree) {
      result.push({
        name: `[${i}]`,
        kind: 'error',
        detail: 'parse error',
        range: { start: i + 1, end: i + 1 },
      });
      continue;
    }

    const kind = jsonNodeTypeLabel(tree);
    const lineNode: SymbolNode = {
      name: `[${i}]`,
      kind,
      range: { start: i + 1, end: i + 1 },
    };

    if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'null') {
      lineNode.detail = String(jsoncParser.getNodeValue(tree));
    } else if (kind === 'array') {
      lineNode.detail = `${tree.children?.length ?? 0} items`;
    }

    if (maxDepth > 1 && (tree.type === 'object' || tree.type === 'array') && tree.children) {
      // Single line — line offsets are trivial
      const lineOffsets = buildLineOffsets(lineText);
      const children = jsonNodeToSymbols(tree, lineText, lineOffsets, maxDepth, 2);
      if (children.length > 0) lineNode.children = children;
    }

    result.push(lineNode);
  }

  return result;
}

// ── FileSymbol → SymbolNode Converter ────────────────────

function convertFileSymbolsToNodes(symbols: FileSymbol[]): SymbolNode[] {
  // Filter out HTML comments — they are orphaned content, not structural symbols
  const filtered = symbols.filter(sym => !(sym.kind === 'html' && sym.detail === 'comment'));

  return filtered.map(sym => {
    const node: SymbolNode = {
      name: sym.name,
      kind: sym.kind,
      detail: sym.detail,
      range: { start: sym.range.startLine, end: sym.range.endLine },
    };
    if (sym.children.length > 0) {
      node.children = convertFileSymbolsToNodes(sym.children);
    }
    return node;
  });
}
