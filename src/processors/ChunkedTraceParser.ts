/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {DevTools} from '../third_party/index.js';

export interface ParsedTraceBuffer {
  events: DevTools.TraceEngine.Types.Events.Event[];
  metadata?: DevTools.TraceEngine.Types.File.MetaData;
}

export interface ParseTraceBufferOptions {
  eventsPerBatch?: number;
}

const BYTE_QUOTE = 0x22;
const BYTE_BACKSLASH = 0x5c;
const BYTE_OPEN_BRACE = 0x7b;
const BYTE_CLOSE_BRACE = 0x7d;
const BYTE_OPEN_BRACKET = 0x5b;
const BYTE_CLOSE_BRACKET = 0x5d;
const BYTE_COLON = 0x3a;
const BYTE_COMMA = 0x2c;

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
    pos++;
    while (pos < buffer.length) {
      const byte = buffer[pos];
      if (byte === BYTE_BACKSLASH) {
        pos += 2;
        continue;
      }
      if (byte === BYTE_QUOTE) {
        pos++;
        break;
      }
      pos++;
    }
    return pos;
  }
  if (firstByte === BYTE_OPEN_BRACE || firstByte === BYTE_OPEN_BRACKET) {
    let depth = 0;
    let inString = false;
    while (pos < buffer.length) {
      const byte = buffer[pos];
      if (inString) {
        if (byte === BYTE_BACKSLASH) {
          pos += 2;
          continue;
        }
        if (byte === BYTE_QUOTE) {
          inString = false;
        }
        pos++;
        continue;
      }
      if (byte === BYTE_QUOTE) {
        inString = true;
      } else if (byte === BYTE_OPEN_BRACE || byte === BYTE_OPEN_BRACKET) {
        depth++;
      } else if (byte === BYTE_CLOSE_BRACE || byte === BYTE_CLOSE_BRACKET) {
        depth--;
        if (depth === 0) {
          pos++;
          break;
        }
      }
      pos++;
    }
    return pos;
  }
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
  return pos;
}

function parseEventsArray(
  buffer: Uint8Array<ArrayBufferLike>,
  startPos: number,
  eventsPerBatch: number,
  decoder: TextDecoder,
): {events: DevTools.TraceEngine.Types.Events.Event[]; endPos: number} {
  const events: DevTools.TraceEngine.Types.Events.Event[] = [];
  let batchStart = -1;
  let lastEventEnd = -1;
  let batchCount = 0;
  let inString = false;
  let depth = 0;
  let i = startPos;

  const flushBatch = (): void => {
    if (batchStart !== -1 && lastEventEnd > batchStart) {
      const slice = buffer.subarray(batchStart, lastEventEnd);
      const chunkText = decoder.decode(slice);
      const parsed: DevTools.TraceEngine.Types.Events.Event[] = JSON.parse(
        `[${chunkText}]`,
      );
      events.push(...parsed);
      batchStart = -1;
      batchCount = 0;
    }
  };

  while (i < buffer.length) {
    const byte = buffer[i];

    if (inString) {
      if (byte === BYTE_BACKSLASH) {
        i += 2;
        continue;
      }
      if (byte === BYTE_QUOTE) {
        inString = false;
      }
      i++;
      continue;
    }

    if (byte === BYTE_QUOTE) {
      inString = true;
      i++;
      continue;
    }

    if (byte === BYTE_OPEN_BRACE) {
      if (depth === 0 && batchStart === -1) {
        batchStart = i;
      }
      depth++;
      i++;
      continue;
    }

    if (byte === BYTE_CLOSE_BRACE) {
      depth--;
      if (depth === 0) {
        lastEventEnd = i + 1;
        batchCount++;
        if (batchCount >= eventsPerBatch) {
          flushBatch();
        }
      }
      i++;
      continue;
    }

    if (byte === BYTE_CLOSE_BRACKET && depth === 0) {
      i++;
      break;
    }

    i++;
  }

  flushBatch();
  return {events, endPos: i};
}

export function parseTraceEventsFromBuffer(
  buffer: Uint8Array<ArrayBufferLike>,
  options: ParseTraceBufferOptions = {},
): ParsedTraceBuffer {
  const eventsPerBatch = options.eventsPerBatch ?? 10_000;
  const decoder = new TextDecoder();

  let pos = skipWhitespace(buffer, 0);
  if (pos >= buffer.length) {
    return {events: []};
  }

  const firstByte = buffer[pos];

  if (firstByte === BYTE_OPEN_BRACKET) {
    const {events} = parseEventsArray(buffer, pos + 1, eventsPerBatch, decoder);
    return {events};
  }

  if (firstByte === BYTE_OPEN_BRACE) {
    pos++;
    let events: DevTools.TraceEngine.Types.Events.Event[] = [];
    let metadata: DevTools.TraceEngine.Types.File.MetaData | undefined;

    while (pos < buffer.length) {
      pos = skipWhitespace(buffer, pos);
      if (pos >= buffer.length) {
        break;
      }

      if (buffer[pos] === BYTE_CLOSE_BRACE) {
        pos++;
        break;
      }

      if (buffer[pos] === BYTE_COMMA) {
        pos++;
        continue;
      }

      if (buffer[pos] !== BYTE_QUOTE) {
        pos++;
        continue;
      }

      pos++;
      const keyStart = pos;
      while (pos < buffer.length) {
        const byte = buffer[pos];
        if (byte === BYTE_BACKSLASH) {
          pos += 2;
          continue;
        }
        if (byte === BYTE_QUOTE) {
          break;
        }
        pos++;
      }
      const keyEnd = pos;
      const key = decoder.decode(buffer.subarray(keyStart, keyEnd));
      pos++;

      pos = skipWhitespace(buffer, pos);
      if (pos < buffer.length && buffer[pos] === BYTE_COLON) {
        pos++;
      }
      pos = skipWhitespace(buffer, pos);

      if (
        key === 'traceEvents' &&
        pos < buffer.length &&
        buffer[pos] === BYTE_OPEN_BRACKET
      ) {
        const arrayResult = parseEventsArray(
          buffer,
          pos + 1,
          eventsPerBatch,
          decoder,
        );
        events = arrayResult.events;
        pos = arrayResult.endPos;
      } else if (
        key === 'metadata' &&
        pos < buffer.length &&
        buffer[pos] === BYTE_OPEN_BRACE
      ) {
        const metaStart = pos;
        let metaDepth = 0;
        let inMetaString = false;
        while (pos < buffer.length) {
          const byte = buffer[pos];
          if (inMetaString) {
            if (byte === BYTE_BACKSLASH) {
              pos += 2;
              continue;
            }
            if (byte === BYTE_QUOTE) {
              inMetaString = false;
            }
            pos++;
            continue;
          }
          if (byte === BYTE_QUOTE) {
            inMetaString = true;
          } else if (byte === BYTE_OPEN_BRACE) {
            metaDepth++;
          } else if (byte === BYTE_CLOSE_BRACE) {
            metaDepth--;
            if (metaDepth === 0) {
              pos++;
              break;
            }
          }
          pos++;
        }
        const metaSlice = buffer.subarray(metaStart, pos);
        const metaText = decoder.decode(metaSlice);
        const parsedMetadata: DevTools.TraceEngine.Types.File.MetaData =
          JSON.parse(metaText);
        metadata = parsedMetadata;
      } else {
        pos = skipValue(buffer, pos);
      }
    }

    return {events, metadata};
  }

  throw new Error('Invalid trace buffer: expected JSON object or array.');
}
