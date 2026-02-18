/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {FileSymbol} from '../../client-pipe.js';
import type {SymbolMatch} from './types.js';

/**
 * Resolve a dot-path target (e.g. "UserService.findById") to a symbol in the tree.
 *
 * Supports:
 * - "UserService" → top-level symbol named "UserService"
 * - "UserService.findById" → child "findById" of "UserService"
 * - "findById" → first top-level symbol named "findById"
 */
/**
 * Strip surrounding quotes from a string (single or double).
 * E.g., "'./augmented'" → "./augmented", "\"foo\"" → "foo"
 */
function stripQuotes(s: string): string {
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Match a symbol name against a target, handling quoted module names.
 */
function nameMatches(symbolName: string, targetName: string): boolean {
  if (symbolName === targetName) return true;
  return stripQuotes(symbolName) === stripQuotes(targetName);
}

export function resolveSymbolTarget(
  symbols: FileSymbol[],
  target: string,
): SymbolMatch | undefined {
  // First, try exact match at top level (handles module names with dots like './augmented')
  const exactMatch = symbols.find(s => nameMatches(s.name, target));
  if (exactMatch) {
    return {symbol: exactMatch, parent: undefined, path: [target]};
  }

  // Then try dot-path resolution for nested symbols
  const segments = target.split('.');

  let currentList = symbols;
  let parent: FileSymbol | undefined;
  const pathSoFar: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const name = segments[i];
    const found = currentList.find(s => nameMatches(s.name, name));
    if (!found) return undefined;

    pathSoFar.push(name);

    if (i < segments.length - 1) {
      parent = found;
      currentList = found.children;
    } else {
      return {symbol: found, parent, path: pathSoFar};
    }
  }

  return undefined;
}

/**
 * Collect names of sibling symbols (same level, excluding the matched one).
 */
export function getSiblingNames(
  allSymbols: FileSymbol[],
  match: SymbolMatch,
): string[] {
  const siblingSource = match.parent ? match.parent.children : allSymbols;
  return siblingSource
    .filter(s => s.name !== match.symbol.name)
    .map(s => s.name);
}

/**
 * Collect child names of a symbol, up to maxDepth.
 */
export function getChildNames(
  symbol: FileSymbol,
  maxDepth?: number,
): string[] {
  if (maxDepth !== undefined && maxDepth <= 0) return [];
  return symbol.children.map(c => c.name);
}

/**
 * Format a symbol's range as 1-indexed "lines X-Y of Z".
 */
export function formatRange(
  startLine: number,
  endLine: number,
  totalLines: number,
): string {
  return `lines ${startLine + 1}-${endLine + 1} of ${totalLines}`;
}
