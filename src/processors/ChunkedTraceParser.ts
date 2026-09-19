/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Provides memory-efficient chunked parsing for Chrome DevTools trace files.
 * Large performance traces can exceed V8 string length limits and cause heap exhaustion.
 * This parser scans raw byte buffers, finds event boundaries, and parses events in batches.
 */

import type {DevTools} from '../third_party/index.js';

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
   * @defaultValue 10_000
   */
  eventsPerBatch?: number;
  /**
   * The maximum byte size of raw trace event data to decode in a single batch.
   * Flushes batches before V8 string length limits are approached.
   * Non-positive or non-finite values fall back to the default.
   * @defaultValue 33_554_432 (32 MB)
   */
  maxBatchBytes?: number;
}

interface BatchConfig {
  eventsPerBatch: number;
  maxBatchBytes: number;
  decoder: TextDecoder;
}

const DEFAULT_EVENTS_PER_BATCH = 10_000;
const DEFAULT_MAX_BATCH_BYTES = 32 * 1024 * 1024;

// ASCII character byte constants used by the state machine.
// All values are strictly less than 0x80 (standard ASCII).
// In UTF-8 encoding, multi-byte code units only contain bytes from 0x80 through 0xFF.
// Therefore, scanning for these byte values will never match bytes inside multi-byte characters.
const BYTE_QUOTE = 0x22;
const BYTE_BACKSLASH = 0x5c;
const BYTE_OPEN_BRACE = 0x7b;
const BYTE_CLOSE_BRACE = 0x7d;
const BYTE_OPEN_BRACKET = 0x5b;
const BYTE_CLOSE_BRACKET = 0x5d;
const BYTE_COLON = 0x3a;
const BYTE_COMMA = 0x2c;

/**
 * Advances past any RFC 8259 JSON whitespace bytes.
 *
 * @param buffer - The trace byte buffer to inspect.
 * @param start - The buffer index where scanning begins.
 * @returns The index of the first non-whitespace byte, or the buffer length if the buffer ends.
 */
function skipWhitespace(
  buffer: Uint8Array<ArrayBufferLike>,
  start: number,
): number {
  let i = start;
  while (i < buffer.length) {
    const byte = buffer[i];
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      break;
    }
    i++;
  }
  return i;
}

/**
 * Scans past a JSON string starting at the opening quotation mark.
 *
 * @param buffer - The trace byte buffer to scan.
 * @param startQuotePos - The buffer index of the opening quotation mark.
 * @returns The index immediately following the closing quotation mark.
 * @throws {SyntaxError} If the string is unterminated before the end of the buffer.
 */
function skipString(
  buffer: Uint8Array<ArrayBufferLike>,
  startQuotePos: number,
): number {
  let pos = startQuotePos + 1;
  while (pos < buffer.length) {
    const byte = buffer[pos];
    if (byte === BYTE_BACKSLASH) {
      if (pos + 1 >= buffer.length) {
        throw new SyntaxError('Unterminated string in JSON');
      }
      pos += 2;
      continue;
    }
    if (byte === BYTE_QUOTE) {
      return pos + 1;
    }
    pos++;
  }
  throw new SyntaxError('Unterminated string in JSON');
}

/**
 * Scans past a complete JSON value starting at the specified buffer position.
 * Skips strings, compound objects, arrays, and primitive values without parsing them into memory.
 *
 * @param buffer - The trace byte buffer to scan.
 * @param startPos - The buffer index where the value begins.
 * @returns The index immediately following the skipped JSON value.
 * @throws {SyntaxError} If the value contains unbalanced delimiters, unterminated strings, or empty primitive tokens.
 */
function skipValue(
  buffer: Uint8Array<ArrayBufferLike>,
  startPos: number,
): number {
  let pos = skipWhitespace(buffer, startPos);
  if (pos >= buffer.length) {
    return pos;
  }
  const firstByte = buffer[pos];
  if (firstByte === BYTE_QUOTE) {
    return skipString(buffer, pos);
  }
  if (firstByte === BYTE_OPEN_BRACE || firstByte === BYTE_OPEN_BRACKET) {
    const delimiterStack: number[] = [];
    delimiterStack.push(
      firstByte === BYTE_OPEN_BRACE ? BYTE_CLOSE_BRACE : BYTE_CLOSE_BRACKET,
    );
    pos++;
    while (pos < buffer.length) {
      const byte = buffer[pos];
      if (byte === BYTE_QUOTE) {
        pos = skipString(buffer, pos);
        continue;
      }
      if (byte === BYTE_OPEN_BRACE) {
        delimiterStack.push(BYTE_CLOSE_BRACE);
      } else if (byte === BYTE_OPEN_BRACKET) {
        delimiterStack.push(BYTE_CLOSE_BRACKET);
      } else if (byte === BYTE_CLOSE_BRACE || byte === BYTE_CLOSE_BRACKET) {
        const expected = delimiterStack.pop();
        if (expected !== byte) {
          throw new SyntaxError('Unexpected delimiter in JSON');
        }
        if (delimiterStack.length === 0) {
          pos++;
          return pos;
        }
      }
      pos++;
    }
    throw new SyntaxError('Unexpected end of JSON input');
  }

  const valStart = pos;
  while (pos < buffer.length) {
    const byte = buffer[pos];
    if (
      byte === BYTE_COMMA ||
      byte === BYTE_CLOSE_BRACE ||
      byte === BYTE_CLOSE_BRACKET ||
      byte === 0x20 ||
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d
    ) {
      break;
    }
    pos++;
  }
  if (pos === valStart) {
    throw new SyntaxError('Expected JSON value');
  }
  return pos;
}

/**
 * Scans trace events from a JSON array in bounded batches to limit memory consumption.
 *
 * @param buffer - The raw byte buffer containing the events array.
 * @param startPos - The index immediately after the opening array bracket.
 * @param config - Configuration settings controlling batch sizes and text decoding.
 * @returns An object containing the parsed events and the ending buffer position.
 * @throws {SyntaxError} If the event array contains malformed JSON, unbalanced delimiters, or unexpected tokens.
 */
function parseEventsArray(
  buffer: Uint8Array<ArrayBufferLike>,
  startPos: number,
  config: BatchConfig,
): {events: DevTools.TraceEngine.Types.Events.Event[]; endPos: number} {
  const events: DevTools.TraceEngine.Types.Events.Event[] = [];
  let batchStart = -1;
  let lastEventEnd = -1;
  let batchEventCount = 0;
  let depth = 0;
  let i = startPos;
  let closed = false;
  let state:
    'expect_element_or_end' | 'expect_element' | 'expect_comma_or_end' =
    'expect_element_or_end';

  const flushBatch = (): void => {
    if (batchStart !== -1 && lastEventEnd > batchStart) {
      // Slicing between batchStart and lastEventEnd is safe for UTF-8 decoding.
      // Both boundaries are ASCII structural braces ({ and }) that align with code unit boundaries.
      const slice = buffer.subarray(batchStart, lastEventEnd);
      const chunkText = config.decoder.decode(slice);
      // Wrapping comma-delimited event objects in brackets creates a valid JSON array for the parser.
      const parsed: DevTools.TraceEngine.Types.Events.Event[] = JSON.parse(
        `[${chunkText}]`,
      );
      // Append items iteratively to avoid exceeding V8 call stack size limits on large batches.
      for (const event of parsed) {
        events.push(event);
      }
      batchStart = -1;
      batchEventCount = 0;
    }
  };

  while (i < buffer.length) {
    const byte = buffer[i];

    if (depth > 0) {
      if (byte === BYTE_QUOTE) {
        i = skipString(buffer, i);
        continue;
      }
      if (byte === BYTE_OPEN_BRACE) {
        depth++;
        i++;
        continue;
      }
      if (byte === BYTE_CLOSE_BRACE) {
        depth--;
        if (depth === 0) {
          lastEventEnd = i + 1;
          batchEventCount++;
          state = 'expect_comma_or_end';

          // Check thresholds after recording the completed event.
          // Checking batchEventCount after incrementing ensures batches cap at exactly eventsPerBatch.
          // Individual events are atomic JSON objects and cannot be split mid-event; when an event
          // pushes currentBatchBytes over maxBatchBytes, the completed event is flushed immediately.
          const currentBatchBytes = lastEventEnd - batchStart;
          if (
            batchEventCount >= config.eventsPerBatch ||
            currentBatchBytes >= config.maxBatchBytes
          ) {
            flushBatch();
          }
        }
        i++;
        continue;
      }
      i++;
      continue;
    }

    // When depth is 0, scan top-level array delimiter and separator tokens.
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      i++;
      continue;
    }

    if (byte === BYTE_OPEN_BRACE) {
      if (state !== 'expect_element_or_end' && state !== 'expect_element') {
        throw new SyntaxError('Expected "," or "]" in JSON array');
      }
      depth = 1;
      if (batchStart === -1) {
        batchStart = i;
      }
      i++;
      continue;
    }

    if (byte === BYTE_COMMA) {
      if (state !== 'expect_comma_or_end') {
        throw new SyntaxError('Unexpected token "," in JSON array');
      }
      state = 'expect_element';
      i++;
      continue;
    }

    if (byte === BYTE_CLOSE_BRACKET) {
      if (state === 'expect_element') {
        throw new SyntaxError('Unexpected token "]" in JSON array');
      }
      closed = true;
      i++;
      break;
    }

    if (byte === BYTE_CLOSE_BRACE) {
      throw new SyntaxError('Unexpected token "}" in JSON');
    }

    throw new SyntaxError('Unexpected token in JSON array');
  }

  if (!closed || depth !== 0) {
    throw new SyntaxError('Unexpected end of JSON input');
  }

  flushBatch();
  return {events, endPos: i};
}

/**
 * Parses Chrome DevTools trace events and metadata from a raw byte buffer.
 * Supports both root array format ([...]) and object container format ({"traceEvents": [...]}).
 * Parses events in chunks to prevent V8 string length and memory exhaustion errors.
 *
 * @param buffer - The raw trace buffer to parse.
 * @param options - Optional configuration settings for batch processing.
 * @returns A {@link ParsedTraceBuffer} containing parsed trace events and optional file metadata, or an object with an empty events array if the buffer is empty or contains only whitespace.
 * @throws {Error} If the buffer contains non-whitespace data that does not begin with a valid JSON array or object.
 * @throws {SyntaxError} If the underlying JSON syntax within batches or metadata is invalid.
 */
export function parseTraceEventsFromBuffer(
  buffer: Uint8Array<ArrayBufferLike>,
  options: ParseTraceBufferOptions = {},
): ParsedTraceBuffer {
  const eventsPerBatch =
    typeof options.eventsPerBatch === 'number' &&
    Number.isFinite(options.eventsPerBatch) &&
    options.eventsPerBatch > 0
      ? options.eventsPerBatch
      : DEFAULT_EVENTS_PER_BATCH;

  const maxBatchBytes =
    typeof options.maxBatchBytes === 'number' &&
    Number.isFinite(options.maxBatchBytes) &&
    options.maxBatchBytes > 0
      ? options.maxBatchBytes
      : DEFAULT_MAX_BATCH_BYTES;

  const decoder = new TextDecoder();
  const config: BatchConfig = {
    eventsPerBatch,
    maxBatchBytes,
    decoder,
  };

  let pos = skipWhitespace(buffer, 0);
  if (pos >= buffer.length) {
    return {events: []};
  }

  const firstByte = buffer[pos];

  if (firstByte === BYTE_OPEN_BRACKET) {
    const {events, endPos} = parseEventsArray(buffer, pos + 1, config);
    const trailingPos = skipWhitespace(buffer, endPos);
    if (trailingPos < buffer.length) {
      throw new SyntaxError('Unexpected non-whitespace character after JSON');
    }
    return {events};
  }

  if (firstByte === BYTE_OPEN_BRACE) {
    pos++;
    let events: DevTools.TraceEngine.Types.Events.Event[] = [];
    let metadata: DevTools.TraceEngine.Types.File.MetaData | undefined;
    let closed = false;
    let expectComma = false;

    while (pos < buffer.length) {
      pos = skipWhitespace(buffer, pos);
      if (pos >= buffer.length) {
        break;
      }

      if (buffer[pos] === BYTE_CLOSE_BRACE) {
        closed = true;
        pos++;
        break;
      }

      if (expectComma) {
        if (buffer[pos] !== BYTE_COMMA) {
          throw new SyntaxError(
            'Expected "," or "}" after property value in JSON',
          );
        }
        pos++;
        pos = skipWhitespace(buffer, pos);
      }

      if (pos >= buffer.length) {
        break;
      }

      if (buffer[pos] !== BYTE_QUOTE) {
        throw new SyntaxError('Expected property name or "}" in JSON');
      }

      const keyStart = pos;
      pos = skipString(buffer, pos);
      const keyJson = decoder.decode(buffer.subarray(keyStart, pos));
      const parsedKey: unknown = JSON.parse(keyJson);
      if (typeof parsedKey !== 'string') {
        throw new SyntaxError('Expected property name in JSON');
      }
      const key = parsedKey;

      pos = skipWhitespace(buffer, pos);
      if (pos >= buffer.length || buffer[pos] !== BYTE_COLON) {
        throw new SyntaxError('Expected ":" after property name in JSON');
      }
      pos++;
      pos = skipWhitespace(buffer, pos);

      if (key === 'traceEvents') {
        if (pos >= buffer.length || buffer[pos] !== BYTE_OPEN_BRACKET) {
          throw new SyntaxError('Expected "[" for "traceEvents" in JSON');
        }
        const arrayResult = parseEventsArray(buffer, pos + 1, config);
        events = arrayResult.events;
        pos = arrayResult.endPos;
      } else if (key === 'metadata') {
        if (pos >= buffer.length || buffer[pos] !== BYTE_OPEN_BRACE) {
          throw new SyntaxError('Expected "{" for "metadata" in JSON');
        }
        const metaStart = pos;
        pos = skipValue(buffer, pos);
        const metaSlice = buffer.subarray(metaStart, pos);
        const metaText = decoder.decode(metaSlice);
        const parsedMetadata: DevTools.TraceEngine.Types.File.MetaData =
          JSON.parse(metaText);
        metadata = parsedMetadata;
      } else {
        pos = skipValue(buffer, pos);
      }
      expectComma = true;
    }

    if (!closed) {
      throw new SyntaxError('Unexpected end of JSON input');
    }

    const trailingPos = skipWhitespace(buffer, pos);
    if (trailingPos < buffer.length) {
      throw new SyntaxError('Unexpected non-whitespace character after JSON');
    }

    return {events, metadata};
  }

  throw new Error('Invalid trace buffer: expected JSON object or array.');
}
