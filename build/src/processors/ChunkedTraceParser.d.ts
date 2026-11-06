/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @file Provides memory-efficient chunked parsing for Chrome DevTools trace files.
 * Large performance traces can exceed V8 string length limits and cause heap exhaustion.
 * This parser scans raw byte buffers, finds event boundaries, and parses events in batches.
 */
import type { DevTools } from '../third_party/index.js';
/**
 * Represents the output of a parsed trace buffer.
 */
export interface ParsedTraceBuffer {
    /** The collection of parsed trace events extracted from the buffer. */
    events: DevTools.TraceEngine.Types.Events.Event[];
    /** Optional file metadata extracted from the trace object container. */
    metadata?: DevTools.TraceEngine.Types.File.MetaData;
}
/**
 * Configuration options for trace buffer parsing.
 */
export interface ParseTraceBufferOptions {
    /**
     * The maximum number of trace events to decode and parse in a single batch.
     * Lower values reduce memory spikes during string decoding.
     * Higher values decrease the total number of JSON.parse calls.
     * Non-positive or non-finite values fall back to the default.
     * @default 10_000
     */
    eventsPerBatch?: number;
    /**
     * The maximum byte size of raw trace event data to decode in a single batch.
     * Flushes batches before V8 string length limits are approached.
     * Non-positive or non-finite values fall back to the default.
     * @default 33_554_432 (32 MB)
     */
    maxBatchBytes?: number;
}
/**
 * Parses Chrome DevTools trace events and metadata from a raw byte buffer.
 * Supports both root array format ([...]) and object container format ({"traceEvents": [...]}).
 * Parses events in chunks to prevent V8 string length and memory exhaustion errors.
 *
 * @param buffer The raw trace buffer to parse.
 * @param options Optional configuration settings for batch processing.
 * @returns A {@link ParsedTraceBuffer} containing parsed trace events and optional file metadata, or an object with an empty events array if the buffer is empty or contains only whitespace.
 * @throws {Error} If the buffer contains non-whitespace data that does not begin with a valid JSON array or object.
 * @throws {SyntaxError} If the underlying JSON syntax within batches or metadata is invalid.
 */
export declare function parseTraceEventsFromBuffer(buffer: Uint8Array<ArrayBufferLike>, options?: ParseTraceBufferOptions): ParsedTraceBuffer;
