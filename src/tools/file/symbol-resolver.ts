/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimum shape required for symbol tree navigation.
 * FileSymbol from the shared interface satisfies this.
 */
export interface SymbolLikeRange {
  startLine: number;
  endLine: number;
}

export interface SymbolLike {
  name: string;
  kind: string;
  range: SymbolLikeRange;
  children: SymbolLike[];
}

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

export function resolveSymbolTarget<T extends SymbolLike>(
  symbols: T[],
  target: string,
): { symbol: T; parent?: T; path: string[] } | undefined {
  // First, try exact match at top level (handles module names with dots like './augmented')
  const exactMatch = symbols.find(s => nameMatches(s.name, target));
  if (exactMatch) {
    return {symbol: exactMatch, parent: undefined, path: [target]};
  }

  // Then try dot-path resolution for nested symbols
  const segments = target.split('.');

  let currentList: SymbolLike[] = symbols;
  let parent: T | undefined;
  const pathSoFar: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const name = segments[i];
    const found = currentList.find(s => nameMatches(s.name, name));
    if (!found) return undefined;

    pathSoFar.push(name);

    if (i < segments.length - 1) {
      parent = found as T;
      currentList = found.children;
    } else {
      return {symbol: found as T, parent, path: pathSoFar};
    }
  }

  return undefined;
}

/**
 * Collect names of sibling symbols (same level, excluding the matched one).
 */
export function getSiblingNames<T extends SymbolLike>(
  allSymbols: T[],
  match: { symbol: T; parent?: T },
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
  symbol: SymbolLike,
  maxDepth?: number,
): string[] {
  if (maxDepth !== undefined && maxDepth <= 0) return [];
  return symbol.children.map(c => c.name);
}

/**
 * Search all children (recursively) of all top-level symbols for a name match.
 * Returns the qualified dot-path(s) if found, e.g. ["ParentSection.ChildName"].
 * Useful for suggesting the correct qualified path when an unqualified name fails.
 */
export function findQualifiedPaths(
  symbols: SymbolLike[],
  targetName: string,
): string[] {
  const results: string[] = [];

  function searchChildren(children: SymbolLike[], parentPath: string): void {
    for (const child of children) {
      const qualifiedPath = `${parentPath}.${child.name}`;
      if (nameMatches(child.name, targetName)) {
        results.push(qualifiedPath);
      }
      if (child.children.length > 0) {
        searchChildren(child.children, qualifiedPath);
      }
    }
  }

  for (const symbol of symbols) {
    if (symbol.children.length > 0) {
      searchChildren(symbol.children, symbol.name);
    }
  }

  return results;
}

/**
 * Format a symbol's range as 1-indexed "lines X-Y of Z".
 * Takes 0-indexed line numbers (legacy path).
 */
export function formatRange(
  startLine: number,
  endLine: number,
  totalLines: number,
): string {
  return `lines ${startLine + 1}-${endLine + 1} of ${totalLines}`;
}
