/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {NativeDocumentSymbol} from '../../client-pipe.js';
import type {DetectedIntent} from './types.js';

/**
 * Compare old vs new DocumentSymbol snapshots to detect intents.
 *
 * Algorithm:
 * 1. Index old/new symbols by name
 * 2. Pass 1: Match by name → BODY_CHANGE
 * 3. Pass 2: Match by overlapping range → RENAME
 * 4. Pass 3: Unmatched old → DELETE, unmatched new → ADD
 */
export function diffSymbols(
  oldSymbols: NativeDocumentSymbol[],
  newSymbols: NativeDocumentSymbol[],
): DetectedIntent[] {
  const intents: DetectedIntent[] = [];

  // Guard: all old symbols gone with no replacements → bulk deletion
  if (oldSymbols.length > 0 && newSymbols.length === 0) {
    for (const s of oldSymbols) {
      intents.push({type: 'delete', symbol: s.name});
    }
    return intents;
  }

  const oldByName = new Map<string, NativeDocumentSymbol>();
  for (const s of oldSymbols) oldByName.set(s.name, s);

  const newByName = new Map<string, NativeDocumentSymbol>();
  for (const s of newSymbols) newByName.set(s.name, s);

  const matchedOld = new Set<string>();
  const matchedNew = new Set<string>();

  // Pass 1: Match by name → BODY_CHANGE
  for (const [name, newSym] of newByName) {
    if (oldByName.has(name)) {
      const oldSym = oldByName.get(name);
      if (oldSym && !rangesEqual(oldSym.range, newSym.range)) {
        intents.push({type: 'body_change', symbol: name});
      }
      matchedOld.add(name);
      matchedNew.add(name);
    }
  }

  // Collect unmatched for position-based matching
  const unmatchedOld = oldSymbols.filter(s => !matchedOld.has(s.name));
  const unmatchedNew = newSymbols.filter(s => !matchedNew.has(s.name));

  // Pass 2: Match by overlapping range → RENAME
  const renamedOld = new Set<string>();
  const renamedNew = new Set<string>();

  for (const oldSym of unmatchedOld) {
    for (const newSym of unmatchedNew) {
      if (renamedNew.has(newSym.name)) continue;
      if (oldSym.kind === newSym.kind && rangesOverlap(oldSym.range, newSym.range)) {
        intents.push({
          type: 'rename',
          symbol: oldSym.name,
          details: `renamed to ${newSym.name}`,
        });
        renamedOld.add(oldSym.name);
        renamedNew.add(newSym.name);
        break;
      }
    }
  }

  // Pass 3: Unmatched → DELETE / ADD
  for (const oldSym of unmatchedOld) {
    if (!renamedOld.has(oldSym.name)) {
      intents.push({type: 'delete', symbol: oldSym.name});
    }
  }
  for (const newSym of unmatchedNew) {
    if (!renamedNew.has(newSym.name)) {
      intents.push({type: 'add', symbol: newSym.name});
    }
  }

  return intents;
}

interface Range {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.startLine === b.startLine &&
    a.startChar === b.startChar &&
    a.endLine === b.endLine &&
    a.endChar === b.endChar
  );
}

function rangesOverlap(a: Range, b: Range): boolean {
  if (a.endLine < b.startLine || b.endLine < a.startLine) return false;
  if (a.endLine === b.startLine && a.endChar <= b.startChar) return false;
  if (b.endLine === a.startLine && b.endChar <= a.startChar) return false;
  return true;
}

/**
 * Extract the new name from a rename intent.
 */
export function extractNewName(intent: DetectedIntent): string | undefined {
  if (intent.type !== 'rename' || !intent.details) return undefined;
  const match = intent.details.match(/^renamed to (.+)$/);
  return match?.[1];
}
