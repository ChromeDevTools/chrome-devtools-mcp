/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  fileGetSymbols,
  fileApplyEdit,
  fileGetDiagnostics,
  fileExecuteRename,
  fileFindReferences,
  fileGetCodeActions,
  fileApplyCodeAction,
  type FileSymbol,
} from '../../client-pipe.js';
import {diffSymbols, extractNewName} from './symbol-diff.js';
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
 * Execute a file edit with the full safety layer:
 *
 * Phase 1: Virtual pre-check — compare old vs new DocumentSymbols to detect intents
 * Phase 2: Atomic apply — apply the edit + propagate renames
 * Phase 3: Auto-fix — apply Code Actions for new errors
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

  // ── Phase 1: Pre-check — Get symbols before edit ────────────────
  let oldSymbols: FileSymbol[] = [];
  try {
    const beforeResult = await fileGetSymbols(filePath);
    oldSymbols = beforeResult.symbols;
  } catch {
    // No symbol provider available — proceed without intent detection
  }

  // Get pre-existing diagnostics to compare after edit
  let preExistingErrors = 0;
  try {
    const preDiags = await fileGetDiagnostics(filePath);
    preExistingErrors = preDiags.diagnostics.filter(d => d.severity === 'Error').length;
  } catch {
    // Best-effort
  }

  // ── Phase 2: Apply the edit ─────────────────────────────────────
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

  // ── Phase 1b: Post-apply intent detection ───────────────────────
  // Get symbols after apply for comparison
  let newSymbols: FileSymbol[] = [];
  if (oldSymbols.length > 0) {
    try {
      const afterResult = await fileGetSymbols(filePath);
      newSymbols = afterResult.symbols;
      const intents = diffSymbols(oldSymbols, newSymbols);
      detectedIntents.push(...intents);
    } catch {
      // Proceed without intent detection
    }
  }

  // ── Phase 2b: Rename propagation ───────────────────────────────
  const renames = detectedIntents.filter(i => i.type === 'rename');
  for (const renameIntent of renames) {
    const newName = extractNewName(renameIntent);
    if (!newName) continue;

    try {
      // Find a reference to the OLD name in another file to trigger rename
      const refs = await fileFindReferences(filePath, 0, 0);
      // Search for a reference in a DIFFERENT file to propagate cross-file
      const externalRef = refs.references.find(r => !r.file.endsWith(filePath.replace(/\\/g, '/')));

      if (externalRef) {
        const renameResult = await fileExecuteRename(
          externalRef.file,
          externalRef.line - 1,
          externalRef.character,
          newName,
        );
        if (renameResult.success) {
          propagated.push({
            type: 'rename',
            filesAffected: renameResult.filesAffected,
            totalEdits: renameResult.totalEdits,
          });
        }
      }
    } catch {
      // Rename propagation is best-effort
    }
  }

  // ── Phase 3: Auto-fix via Code Actions ─────────────────────────
  await delay(DIAGNOSTIC_SETTLE_DELAY_MS);

  try {
    const postDiags = await fileGetDiagnostics(filePath);
    const newErrors = postDiags.diagnostics.filter(d => d.severity === 'Error');

    let fixAttempts = 0;
    for (const error of newErrors) {
      if (fixAttempts >= MAX_AUTO_FIX_ATTEMPTS) break;

      try {
        const actions = await fileGetCodeActions(filePath, error.line - 1, error.endLine - 1);
        const preferred = actions.actions.find(a => a.isPreferred);
        if (preferred) {
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
        severity: d.severity === 'Error' ? 'error' : 'warning',
      });
    }
  } catch {
    // Best-effort
  }

  // ── Build summary ──────────────────────────────────────────────
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
