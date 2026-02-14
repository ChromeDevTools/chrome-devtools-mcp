/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Log Consolidation Engine — powered by LogPare
 *
 * Wraps LogPare's Drain algorithm to compress repetitive log output,
 * dramatically reducing context window usage for AI models while
 * preserving diagnostic information.
 *
 * LogPare uses the research-proven Drain algorithm for semantic log
 * template extraction, with built-in support for:
 * - Pattern masking (IPs, UUIDs, timestamps, hex IDs, file paths, URLs)
 * - Severity detection (error/warn/info + stack frame detection)
 * - Diagnostic metadata extraction (URLs, status codes, correlation IDs, durations)
 *
 * Three output formats controlled via `logFormat` parameter:
 * - 'summary' (default): Compact overview with top templates + rare events
 * - 'detailed': Full template list with sample variables and metadata
 * - 'json': Machine-readable format with version field and complete metadata
 *
 * Usage:
 *   const result = consolidateOutput(rawText);
 *   // result.formatted = compressed output text
 *   // result.stats = compression statistics
 *   // result.hasCompression = whether any compression was achieved
 */

import {compress, compressText} from 'logpare';
import type {CompressionResult, CompressOptions} from 'logpare';

export type LogFormat = 'summary' | 'detailed' | 'json';

export interface ConsolidationOptions {
  /** Output format for compressed logs. Default: 'summary'. */
  format?: LogFormat;
  /** Label for the output (used in headers). Default: 'Log'. */
  label?: string;
}

export interface ConsolidationStats {
  inputLines: number;
  uniqueTemplates: number;
  compressionRatio: number;
  estimatedTokenReduction: number;
  processingTimeMs?: number;
}

export interface ConsolidationResult {
  /** Formatted output string from LogPare. */
  formatted: string;
  /** Compression and content statistics. */
  stats: ConsolidationStats;
  /** True if meaningful compression was achieved. */
  hasCompression: boolean;
  /** The raw CompressionResult from LogPare for JSON mode. */
  raw: CompressionResult;
}

const MIN_LINES_FOR_COMPRESSION = 5;
const MIN_COMPRESSION_RATIO = 0.1;

function buildLogpareOptions(format: LogFormat): CompressOptions {
  return {
    format: format === 'json' ? 'json' : format,
    maxTemplates: 50,
  };
}

/**
 * Consolidate a raw text string (e.g., terminal or task output).
 * Returns LogPare's compressed format when meaningful compression is achievable.
 */
export function consolidateOutput(
  text: string,
  options?: ConsolidationOptions,
): ConsolidationResult {
  const format = options?.format ?? 'summary';

  const lineCount = text.split('\n').length;
  if (lineCount < MIN_LINES_FOR_COMPRESSION) {
    return noCompression(text, lineCount);
  }

  const result = compressText(text, buildLogpareOptions(format));
  return wrapResult(result, lineCount);
}

/**
 * Consolidate an array of text lines.
 * Returns LogPare's compressed format when meaningful compression is achievable.
 */
export function consolidateLines(
  lines: string[],
  options?: ConsolidationOptions,
): ConsolidationResult {
  const format = options?.format ?? 'summary';

  if (lines.length < MIN_LINES_FOR_COMPRESSION) {
    return noCompression(lines.join('\n'), lines.length);
  }

  const result = compress(lines, buildLogpareOptions(format));
  return wrapResult(result, lines.length);
}

function wrapResult(
  result: CompressionResult,
  inputLines: number,
): ConsolidationResult {
  const hasCompression =
    result.stats.compressionRatio >= MIN_COMPRESSION_RATIO &&
    result.stats.uniqueTemplates < inputLines;

  return {
    formatted: result.formatted,
    stats: {
      inputLines: result.stats.inputLines,
      uniqueTemplates: result.stats.uniqueTemplates,
      compressionRatio: result.stats.compressionRatio,
      estimatedTokenReduction: result.stats.estimatedTokenReduction,
      processingTimeMs: result.stats.processingTimeMs,
    },
    hasCompression,
    raw: result,
  };
}

function noCompression(text: string, lineCount: number): ConsolidationResult {
  const emptyResult: CompressionResult = {
    templates: [],
    stats: {
      inputLines: lineCount,
      uniqueTemplates: lineCount,
      compressionRatio: 0,
      estimatedTokenReduction: 0,
    },
    formatted: text,
  };

  return {
    formatted: text,
    stats: {
      inputLines: lineCount,
      uniqueTemplates: lineCount,
      compressionRatio: 0,
      estimatedTokenReduction: 0,
    },
    hasCompression: false,
    raw: emptyResult,
  };
}

/**
 * Convert a ConsolidationResult to a JSON-safe object for API responses.
 */
export function toConsolidatedJson(
  result: ConsolidationResult,
): Record<string, unknown> {
  return {
    compression: {
      inputLines: result.stats.inputLines,
      uniqueTemplates: result.stats.uniqueTemplates,
      compressionRatio: Math.round(result.stats.compressionRatio * 100),
      estimatedTokenReduction: Math.round(result.stats.estimatedTokenReduction * 100),
      processingTimeMs: result.stats.processingTimeMs,
    },
    templates: result.raw.templates.map(t => ({
      id: t.id,
      pattern: t.pattern,
      occurrences: t.occurrences,
      severity: t.severity,
      firstSeen: t.firstSeen,
      lastSeen: t.lastSeen,
      isStackFrame: t.isStackFrame,
      ...(t.sampleVariables.length > 0 ? {sampleVariables: t.sampleVariables} : {}),
      ...(t.urlSamples.length > 0 ? {urls: t.urlSamples} : {}),
      ...(t.statusCodeSamples.length > 0 ? {statusCodes: t.statusCodeSamples} : {}),
      ...(t.correlationIdSamples.length > 0 ? {correlationIds: t.correlationIdSamples} : {}),
      ...(t.durationSamples.length > 0 ? {durations: t.durationSamples} : {}),
    })),
  };
}
