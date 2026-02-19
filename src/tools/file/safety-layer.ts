/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  fileGetSymbols,
  fileApplyEdit,
  fileReadContent,
  fileGetDiagnostics,
  fileExecuteRename,
  fileFindReferences,
  fileGetCodeActions,
  fileApplyCodeAction,
  fileShowEditDiff,
  type NativeDocumentSymbol,
} from '../../client-pipe.js';
import {diffSymbols, type EditInfo} from './symbol-diff.js';
import type {
  DetectedIntent,
  PropagatedChange,
  AutoFix,
  RemainingError,
  FileEditResult,
} from './types.js';

const DIAGNOSTIC_SETTLE_DELAY_MS = 800;
const MAX_AUTO_FIX_ATTEMPTS = 5;

/**
 * Spelling-related Code Action titles that can corrupt semantics after deletions.
 * These "fix" missing references by renaming to similarly-named symbols,
 * which changes program behavior rather than fixing an actual typo.
 */
const HARMFUL_FIX_PATTERNS = [
  /change spelling/i,
  /did you mean/i,
];

/**
 * Check whether a Code Action is potentially harmful given the edit context.
 * Spelling corrections after deliberate deletions can silently corrupt semantics —
 * e.g. renaming `level15()` to `level5()` after the user deleted `level15`.
 */
function isHarmfulAutoFix(title: string, hasDeleteIntents: boolean): boolean {
  if (!hasDeleteIntents) return false;
  return HARMFUL_FIX_PATTERNS.some(pattern => pattern.test(title));
}

/**
 * Find a symbol by qualified name (e.g. `ParentName.childName`).
 * For top-level symbols, the name is matched directly.
 * For child symbols, splits on `.` and walks the hierarchy.
 */
function findSymbolByQualifiedName(
  symbols: NativeDocumentSymbol[],
  qualifiedName: string,
): NativeDocumentSymbol | undefined {
  const parts = qualifiedName.split('.');
  if (parts.length === 1) {
    return symbols.find(s => s.name === qualifiedName);
  }
  const parent = symbols.find(s => s.name === parts[0]);
  if (!parent?.children) return undefined;
  const childName = parts.slice(1).join('.');
  return findSymbolByQualifiedName(parent.children, childName);
}

/**
 * Normalize file paths for comparison (forward slashes, lowercase on Windows).
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

/**
 * Execute a file edit with the full safety layer.
 *
 * All symbol detection uses VS Code's DocumentSymbol provider — zero regex.
 *
 * Flow:
 *   Phase 0: Snapshot old symbols + old content
 *   Phase 1: Tentatively apply the edit
 *   Phase 2: Semantic intent detection via diffSymbols (DocumentSymbol diff)
 *   Phase 3: If deletes with external refs → revert and block
 *   Phase 4: If renames → revert, execute VS Code rename provider, re-apply body
 *   Phase 5: Auto-fix via Code Actions, final diagnostics
 */
export async function executeEditWithSafetyLayer(
  filePath: string,
  startLine: number,
  endLine: number,
  newContent: string,
): Promise<FileEditResult> {
  const detectedIntents: DetectedIntent[] = [];
  const propagated: PropagatedChange[] = [];
  const autoFixed: AutoFix[] = [];

  // ── Phase 0: Snapshot ───────────────────────────────────────────
  let oldSymbols: NativeDocumentSymbol[] = [];
  try {
    const beforeResult = await fileGetSymbols(filePath);
    oldSymbols = beforeResult.symbols;
  } catch {
    // No symbol provider — proceed without safety checks
  }

  // Read old content of the edit range for potential revert
  let oldContent: string | undefined;
  try {
    const contentResult = await fileReadContent(filePath, startLine, endLine);
    oldContent = contentResult.content;
  } catch {
    // Best-effort — revert won't be possible
  }

  // ── Phase 1: Tentatively apply the edit ─────────────────────────
  try {
    await fileApplyEdit(filePath, startLine, endLine, newContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      file: filePath,
      detectedIntents: [],
      propagated: [],
      autoFixed: [],
      remainingErrors: [],
      summary: `Edit failed: ${msg}`,
    };
  }

  // ── Phase 2: Semantic intent detection ──────────────────────────
  // Get new symbols via VS Code's DocumentSymbol provider — the only source of truth.
  let allIntents: DetectedIntent[] = [];

  if (oldSymbols.length > 0) {
    try {
      const afterResult = await fileGetSymbols(filePath);
      const newLineCount = newContent.split('\n').length;
      const oldLineCount = endLine - startLine + 1;
      const editInfoForDiff: EditInfo = {
        newContentEndLine: startLine + newLineCount - 1,
        linesDelta: newLineCount - oldLineCount,
      };

      allIntents = diffSymbols(oldSymbols, afterResult.symbols, editInfoForDiff);
    } catch {
      // Proceed without intent detection
    }
  }

  const renames = allIntents.filter(i => i.type === 'rename' && i.newName);
  const deletes = allIntents.filter(i => i.type === 'delete');

  // ── Phase 3: Revert + delete protection + rename propagation ────
  if ((renames.length > 0 || deletes.length > 0) && oldContent !== undefined) {
    // Revert to original state so we can check refs / execute renames
    const tentativeEndLine = startLine + newContent.split('\n').length - 1;
    try {
      await fileApplyEdit(filePath, startLine, tentativeEndLine, oldContent);
    } catch {
      // Can't revert — skip protection and propagation, edit stays applied
      detectedIntents.push(...allIntents);
      return finalize(filePath, detectedIntents, propagated, autoFixed, startLine);
    }

    // Check deletes for external references
    for (const del of deletes) {
      const oldSym = oldSymbols.find(s => s.name === del.symbol);
      if (!oldSym) continue;

      try {
        const refs = await fileFindReferences(
          filePath,
          oldSym.selectionRange.startLine,
          oldSym.selectionRange.startChar,
        );
        const normalizedFilePath = normalizePath(filePath);
        const externalRefs = refs.references.filter(r => {
          const refPath = normalizePath(r.file);
          return (
            refPath !== normalizedFilePath &&
            !refPath.endsWith(normalizedFilePath) &&
            !normalizedFilePath.endsWith(refPath)
          );
        });

        if (externalRefs.length > 0) {
          const refFiles = [...new Set(externalRefs.map(r => r.file))];
          return {
            success: false,
            file: filePath,
            detectedIntents: [{type: 'delete', symbol: del.symbol}],
            propagated: [],
            autoFixed: [],
            remainingErrors: [],
            summary:
              `Blocked: Cannot delete '${del.symbol}' — it has ${externalRefs.length} ` +
              `reference(s) in ${refFiles.length} other file(s): ` +
              `${refFiles.slice(0, 5).join(', ')}` +
              `${refFiles.length > 5 ? ` and ${refFiles.length - 5} more` : ''}. ` +
              `Resolve or remove these references first.`,
          };
        }
      } catch {
        // Can't check references — allow
      }
    }

    // Execute VS Code rename provider for each rename.
    // File is in ORIGINAL state — old names exist, so the provider can resolve all refs.
    for (const renameIntent of renames) {
      if (!renameIntent.newName) continue;

      // Find the old symbol — supports both top-level and child renames.
      // Child renames use `ParentName.childName` notation.
      const oldSym = findSymbolByQualifiedName(oldSymbols, renameIntent.symbol);
      if (!oldSym) continue;

      try {
        const renameResult = await fileExecuteRename(
          filePath,
          oldSym.selectionRange.startLine,
          oldSym.selectionRange.startChar,
          renameIntent.newName,
        );
        if (renameResult.success) {
          propagated.push({
            type: 'rename',
            filesAffected: renameResult.filesAffected,
            totalEdits: renameResult.totalEdits,
          });
        }
      } catch {
        // Rename provider failed — body edit will still be applied
      }

      detectedIntents.push(renameIntent);
    }

    // After renames, re-resolve the edit range (rename may have changed positions)
    let editStartLine = startLine;
    let editEndLine = endLine;

    if (propagated.length > 0) {
      try {
        const refreshed = await fileGetSymbols(filePath);
        for (const renameIntent of renames) {
          if (!renameIntent.newName) continue;
          const renamedSym = refreshed.symbols.find(s => s.name === renameIntent.newName);
          if (renamedSym) {
            editStartLine = renamedSym.range.startLine;
            editEndLine = renamedSym.range.endLine;
          }
        }
        // Update oldSymbols so post-hoc diff sees the renamed state
        oldSymbols = refreshed.symbols;
      } catch {
        // Fall back to original range
      }
    }

    // Re-apply the body edit (newContent already contains the new name + new body)
    try {
      await fileApplyEdit(filePath, editStartLine, editEndLine, newContent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        file: filePath,
        detectedIntents,
        propagated,
        autoFixed: [],
        remainingErrors: [],
        summary: `Edit failed on re-apply after rename: ${msg}`,
      };
    }
  }

  // Add non-rename/non-delete intents (body_change, add)
  for (const intent of allIntents) {
    if (intent.type !== 'rename' && intent.type !== 'delete') {
      detectedIntents.push(intent);
    }
  }
  // Add delete intents that weren't blocked (no external refs)
  for (const del of deletes) {
    detectedIntents.push(del);
  }

  return finalize(filePath, detectedIntents, propagated, autoFixed, startLine);
}

/**
 * Post-edit finalization: show diff, run auto-fix, collect diagnostics.
 */
async function finalize(
  filePath: string,
  detectedIntents: DetectedIntent[],
  propagated: PropagatedChange[],
  autoFixed: AutoFix[],
  editStartLine: number,
): Promise<FileEditResult> {
  // Show inline diff editor (fire-and-forget)
  fileShowEditDiff(filePath, editStartLine);

  // ── Auto-fix via Code Actions ──────────────────────────────────
  await delay(DIAGNOSTIC_SETTLE_DELAY_MS);

  const hasDeletes = detectedIntents.some(i => i.type === 'delete');

  try {
    const postDiags = await fileGetDiagnostics(filePath);
    const newErrors = postDiags.diagnostics.filter(d => d.severity.toLowerCase() === 'error');

    let fixAttempts = 0;
    for (const error of newErrors) {
      if (fixAttempts >= MAX_AUTO_FIX_ATTEMPTS) break;

      try {
        const actions = await fileGetCodeActions(filePath, error.line - 1, error.endLine - 1);
        const preferred = actions.actions.find(a => a.isPreferred);
        if (preferred && !isHarmfulAutoFix(preferred.title, hasDeletes)) {
          const applyResult = await fileApplyCodeAction(
            filePath,
            error.line - 1,
            error.endLine - 1,
            preferred.index,
          );
          if (applyResult.success) {
            autoFixed.push({file: filePath, fix: applyResult.title ?? preferred.title});
            fixAttempts++;
          }
        }
      } catch {
        // Individual fix failure is non-fatal
      }
    }
  } catch {
    // Diagnostic check failure is non-fatal
  }

  // ── Final diagnostic check ─────────────────────────────────────
  const remainingErrors: RemainingError[] = [];
  try {
    await delay(300);
    const finalDiags = await fileGetDiagnostics(filePath);
    for (const d of finalDiags.diagnostics) {
      remainingErrors.push({
        file: filePath,
        line: d.line,
        message: d.message,
        severity: d.severity.toLowerCase() === 'error' ? 'error' : 'warning',
      });
    }
  } catch {
    // Best-effort
  }

  const summary = buildSummary(detectedIntents, propagated, autoFixed, remainingErrors);

  return {
    success: true,
    file: filePath,
    detectedIntents,
    propagated,
    autoFixed,
    remainingErrors,
    summary,
  };
}

function buildSummary(
  intents: DetectedIntent[],
  propagated: PropagatedChange[],
  autoFixed: AutoFix[],
  remaining: RemainingError[],
): string {
  const parts: string[] = [];

  if (intents.length > 0) {
    const intentSummaries = intents.map(i => {
      if (i.type === 'rename') return `Rename: ${i.symbol} ${i.details ?? ''}`;
      if (i.type === 'delete') return `Delete: ${i.symbol}`;
      if (i.type === 'add') return `Add: ${i.symbol}`;
      return `Body change: ${i.symbol}`;
    });
    parts.push(`Detected: ${intentSummaries.join(', ')}`);
  }

  if (propagated.length > 0) {
    const totalFiles = propagated.reduce((sum, p) => sum + p.filesAffected.length, 0);
    const totalEdits = propagated.reduce((sum, p) => sum + p.totalEdits, 0);
    parts.push(`Propagated: ${totalEdits} edits across ${totalFiles} files`);
  }

  if (autoFixed.length > 0) {
    parts.push(`Auto-fixed: ${autoFixed.length} issue(s)`);
  }

  const errors = remaining.filter(r => r.severity === 'error');
  const warnings = remaining.filter(r => r.severity === 'warning');

  if (errors.length > 0) {
    parts.push(`${errors.length} error(s) remain`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s) remain`);
  }

  if (parts.length === 0) {
    return 'Edit applied successfully, no issues detected';
  }

  return parts.join('. ') + '.';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
