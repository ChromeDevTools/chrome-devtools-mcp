/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {NativeDocumentSymbol} from '../../client-pipe.js';
import type {DetectedIntent} from './types.js';

/**
 * Edit metadata used to compensate for line shifts when comparing symbol ranges.
 * Symbols entirely below the new content in the post-edit document shift by
 * `linesDelta` lines — this is a position shift, not a content change.
 */
export interface EditInfo {
  /** Last line of new content in the post-edit document (0-based).
   *  Symbols starting after this line are in the "shifted zone". */
  newContentEndLine: number;
  linesDelta: number;
}

/**
 * Compare old vs new DocumentSymbol snapshots to detect intents.
 *
 * Algorithm:
 * 1. Index old/new symbols by name
 * 2. Pass 1: Match by name → BODY_CHANGE (compensate for line delta);
 *    also recurse into children to detect child renames.
 * 3. Pass 2: Match by overlapping range → RENAME
 * 4. Pass 3: Unmatched old → DELETE, unmatched new → ADD
 * 5. Pass 4: Re-check deletes — if old range overlaps any new symbol of
 *    matching kind, reclassify as rename (handles rename-to-existing-name conflicts).
 */
export function diffSymbols(
  oldSymbols: NativeDocumentSymbol[],
  newSymbols: NativeDocumentSymbol[],
  editInfo?: EditInfo,
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

  // Pass 1: Match by name → BODY_CHANGE (compensate for line shifts)
  for (const [name, newSym] of newByName) {
    if (oldByName.has(name)) {
      const oldSym = oldByName.get(name);
      if (oldSym) {
        const adjustedNewRange = editInfo && newSym.range.startLine > editInfo.newContentEndLine
          ? shiftRange(newSym.range, -editInfo.linesDelta)
          : newSym.range;
        if (!rangesEqual(oldSym.range, adjustedNewRange)) {
          intents.push({type: 'body_change', symbol: name});
        }

        // Recurse into children to detect child renames (e.g. method renames)
        const oldChildren = oldSym.children ?? [];
        const newChildren = newSym.children ?? [];
        if (oldChildren.length > 0 || newChildren.length > 0) {
          const childIntents = diffChildren(oldChildren, newChildren, name);
          intents.push(...childIntents);
        }
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
          newName: newSym.name,
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

  // Pass 4: Re-check "delete" intents — if old symbol's range overlaps a new
  // symbol of the same kind, it was actually renamed to a conflicting name.
  for (const intent of intents) {
    if (intent.type !== 'delete') continue;
    const oldSym = oldByName.get(intent.symbol);
    if (!oldSym) continue;
    for (const newSym of newSymbols) {
      if (oldSym.kind === newSym.kind && rangesOverlap(oldSym.range, newSym.range)) {
        intent.type = 'rename';
        intent.newName = newSym.name;
        intent.details = `renamed to ${newSym.name}`;
        break;
      }
    }
  }

  return intents;
}

/**
 * Diff children of a matched parent to detect method/property renames.
 * Returns intents scoped with `parentName.childName` notation.
 */
function diffChildren(
  oldChildren: NativeDocumentSymbol[],
  newChildren: NativeDocumentSymbol[],
  parentName: string,
): DetectedIntent[] {
  const childIntents: DetectedIntent[] = [];

  const oldChildByName = new Map<string, NativeDocumentSymbol>();
  for (const c of oldChildren) oldChildByName.set(c.name, c);
  const newChildByName = new Map<string, NativeDocumentSymbol>();
  for (const c of newChildren) newChildByName.set(c.name, c);

  const matchedOldChildren = new Set<string>();
  const matchedNewChildren = new Set<string>();

  // Name match
  for (const [name] of newChildByName) {
    if (oldChildByName.has(name)) {
      matchedOldChildren.add(name);
      matchedNewChildren.add(name);
    }
  }

  const unmatchedOldC = oldChildren.filter(c => !matchedOldChildren.has(c.name));
  const unmatchedNewC = newChildren.filter(c => !matchedNewChildren.has(c.name));

  // Range-based rename detection for children
  const renamedOldC = new Set<string>();
  const renamedNewC = new Set<string>();

  for (const oldChild of unmatchedOldC) {
    for (const newChild of unmatchedNewC) {
      if (renamedNewC.has(newChild.name)) continue;
      if (oldChild.kind === newChild.kind && rangesOverlap(oldChild.range, newChild.range)) {
        childIntents.push({
          type: 'rename',
          symbol: `${parentName}.${oldChild.name}`,
          newName: newChild.name,
          details: `renamed to ${parentName}.${newChild.name}`,
        });
        renamedOldC.add(oldChild.name);
        renamedNewC.add(newChild.name);
        break;
      }
    }
  }

  return childIntents;
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

function shiftRange(range: Range, linesDelta: number): Range {
  return {
    startLine: range.startLine + linesDelta,
    startChar: range.startChar,
    endLine: range.endLine + linesDelta,
    endChar: range.endChar,
  };
}

function rangesOverlap(a: Range, b: Range): boolean {
  if (a.endLine < b.startLine || b.endLine < a.startLine) return false;
  if (a.endLine === b.startLine && a.endChar <= b.startChar) return false;
  if (b.endLine === a.startLine && b.endChar <= a.startChar) return false;
  return true;
}


