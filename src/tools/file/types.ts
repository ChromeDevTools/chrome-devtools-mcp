/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {FileSymbol} from '../../client-pipe.js';

/**
 * A detected intent from comparing DocumentSymbol snapshots before/after an edit.
 */
export interface DetectedIntent {
  type: 'rename' | 'delete' | 'add' | 'body_change';
  symbol: string;
  details?: string;
}

/**
 * A rename or import propagation result.
 */
export interface PropagatedChange {
  type: 'rename' | 'import_update';
  filesAffected: string[];
  totalEdits: number;
}

/**
 * An auto-fix applied via Code Actions.
 */
export interface AutoFix {
  file: string;
  fix: string;
}

/**
 * A remaining error after all auto-fixes.
 */
export interface RemainingError {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Result of file_read.
 */
export interface FileReadResult {
  file: string;
  content: string;
  range: {startLine: number; endLine: number};
  totalLines: number;
  symbol?: {
    name: string;
    kind: string;
    children?: string[];
  };
}

/**
 * Result of file_edit.
 */
export interface FileEditResult {
  success: boolean;
  file: string;
  target?: string;
  detectedIntents: DetectedIntent[];
  propagated: PropagatedChange[];
  autoFixed: AutoFix[];
  remainingErrors: RemainingError[];
  summary: string;
}

/**
 * A match in the symbol tree — the symbol and how to reach it.
 */
export interface SymbolMatch {
  symbol: FileSymbol;
  parent?: FileSymbol;
  path: string[];
}
