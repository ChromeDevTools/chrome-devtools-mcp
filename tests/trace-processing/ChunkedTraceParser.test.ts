/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {parseTraceEventsFromBuffer} from '../../src/processors/ChunkedTraceParser.js';

import {loadTraceAsBuffer} from './fixtures/load.js';

describe('ChunkedTraceParser', () => {
  const encoder = new TextEncoder();

  it('parses an empty trace array', () => {
    const buffer = encoder.encode('[]');
    const result = parseTraceEventsFromBuffer(buffer);
    assert.strictEqual(result.events.length, 0);
  });

  it('parses an empty traceEvents object', () => {
    const buffer = encoder.encode('{"traceEvents": []}');
    const result = parseTraceEventsFromBuffer(buffer);
    assert.strictEqual(result.events.length, 0);
  });

  it('parses a bare array of events', () => {
    const json = JSON.stringify([
      {name: 'event-1', ph: 'X', ts: 100},
      {name: 'event-2', ph: 'B', ts: 200},
    ]);
    const buffer = encoder.encode(json);
    const result = parseTraceEventsFromBuffer(buffer);

    assert.strictEqual(result.events.length, 2);
    assert.strictEqual(result.events[0]?.name, 'event-1');
    assert.strictEqual(result.events[1]?.name, 'event-2');
  });

  it('parses an object with traceEvents and metadata', () => {
    const json = JSON.stringify({
      traceEvents: [
        {name: 'event-1', ph: 'X', ts: 100},
        {name: 'event-2', ph: 'E', ts: 150},
      ],
      metadata: {
        cpuThrottling: 4,
      },
    });
    const buffer = encoder.encode(json);
    const result = parseTraceEventsFromBuffer(buffer);

    assert.strictEqual(result.events.length, 2);
    assert.strictEqual(result.events[0]?.name, 'event-1');
    assert.strictEqual(result.events[1]?.name, 'event-2');
    assert.strictEqual(result.metadata?.cpuThrottling, 4);
  });

  it('parses metadata when metadata appears before traceEvents', () => {
    const json = JSON.stringify({
      metadata: {
        cpuThrottling: 2,
      },
      traceEvents: [{name: 'event-1', ph: 'X', ts: 50}],
    });
    const buffer = encoder.encode(json);
    const result = parseTraceEventsFromBuffer(buffer);

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]?.name, 'event-1');
    assert.strictEqual(result.metadata?.cpuThrottling, 2);
  });

  it('skips unrelated top-level properties', () => {
    const json = JSON.stringify({
      displayTimeUnit: 'ms',
      traceEvents: [{name: 'event-1', ph: 'X', ts: 10}],
      otherData: {nested: true, count: 42},
    });
    const buffer = encoder.encode(json);
    const result = parseTraceEventsFromBuffer(buffer);

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]?.name, 'event-1');
  });

  it('handles strings containing braces, brackets, and escaped quotes', () => {
    const json = JSON.stringify({
      traceEvents: [
        {
          name: 'event-{with-braces}',
          args: {
            data: {
              url: 'https://example.com/hello?q=} { [bracket] "escaped" \\\\ backslash',
            },
          },
        },
      ],
      metadata: {
        title: 'nested } braces { inside',
      },
    });
    const buffer = encoder.encode(json);
    const result = parseTraceEventsFromBuffer(buffer);

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]?.name, 'event-{with-braces}');
    assert.strictEqual(
      result.events[0]?.args?.data?.url,
      'https://example.com/hello?q=} { [bracket] "escaped" \\\\ backslash',
    );
    assert.strictEqual(result.metadata?.title, 'nested } braces { inside');
  });

  it('handles nested objects in event args data', () => {
    const json = JSON.stringify({
      traceEvents: [
        {
          name: 'deep',
          args: {
            data: {
              url: 'https://example.com',
            },
          },
        },
      ],
    });
    const buffer = encoder.encode(json);
    const result = parseTraceEventsFromBuffer(buffer);

    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0]?.name, 'deep');
    assert.strictEqual(
      result.events[0]?.args?.data?.url,
      'https://example.com',
    );
  });

  it('batches events correctly according to eventsPerBatch', () => {
    const json = JSON.stringify({
      traceEvents: [
        {name: 'e1', ts: 1},
        {name: 'e2', ts: 2},
        {name: 'e3', ts: 3},
        {name: 'e4', ts: 4},
        {name: 'e5', ts: 5},
      ],
    });
    const buffer = encoder.encode(json);
    // Batch size of 2 on 5 items tests full batches and remainder batch.
    const result = parseTraceEventsFromBuffer(buffer, {eventsPerBatch: 2});

    assert.strictEqual(result.events.length, 5);
    assert.strictEqual(result.events[0]?.name, 'e1');
    assert.strictEqual(result.events[1]?.name, 'e2');
    assert.strictEqual(result.events[2]?.name, 'e3');
    assert.strictEqual(result.events[3]?.name, 'e4');
    assert.strictEqual(result.events[4]?.name, 'e5');
  });

  it('parses a real trace fixture matching standard JSON.parse', () => {
    const rawData = loadTraceAsBuffer('basic-trace.json.gz');
    const result = parseTraceEventsFromBuffer(rawData, {eventsPerBatch: 10});

    const standardJsonText = new TextDecoder().decode(rawData);
    const standardParsed:
      | Array<{name: string; ts: number}>
      | {traceEvents: Array<{name: string; ts: number}>} =
      JSON.parse(standardJsonText);
    const expectedEvents = Array.isArray(standardParsed)
      ? standardParsed
      : standardParsed.traceEvents;

    assert.strictEqual(result.events.length, expectedEvents.length);
    assert.strictEqual(result.events[0]?.name, expectedEvents[0]?.name);
    assert.strictEqual(result.events[0]?.ts, expectedEvents[0]?.ts);
    const lastIndex = result.events.length - 1;
    assert.strictEqual(
      result.events[lastIndex]?.name,
      expectedEvents[lastIndex]?.name,
    );
  });

  it('parses a larger trace fixture in multiple batches', () => {
    const rawData = loadTraceAsBuffer('web-dev-with-commit.json.gz');
    const result = parseTraceEventsFromBuffer(rawData, {eventsPerBatch: 5000});

    const standardJsonText = new TextDecoder().decode(rawData);
    const standardParsed:
      | Array<{name: string; ts: number}>
      | {traceEvents: Array<{name: string; ts: number}>} =
      JSON.parse(standardJsonText);
    const expectedEvents = Array.isArray(standardParsed)
      ? standardParsed
      : standardParsed.traceEvents;

    assert.strictEqual(result.events.length, expectedEvents.length);
    assert.strictEqual(result.events.length, 47705);
    assert.strictEqual(result.events[0]?.name, expectedEvents[0]?.name);
    const lastIndex = result.events.length - 1;
    assert.strictEqual(
      result.events[lastIndex]?.name,
      expectedEvents[lastIndex]?.name,
    );
  });

  it('throws SyntaxError when a bare array is truncated before closing bracket', () => {
    const buffer = encoder.encode('[{"name": "e1", "ts": 1}');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });

  it('throws SyntaxError when a string inside an event is unterminated', () => {
    const buffer = encoder.encode('[{"name": "unterminated');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });

  it('throws SyntaxError when an object container is truncated before closing brace', () => {
    const buffer = encoder.encode('{"traceEvents": [{"name": "e1"}]');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });

  it('throws SyntaxError on stray closing braces', () => {
    const buffer = encoder.encode('[{"name": "e1"}}]');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });

  it('handles multibyte UTF-8 characters across batch boundaries', () => {
    const json = JSON.stringify({
      traceEvents: [
        {
          name: '日本語テスト-1',
          args: {data: {url: 'https://example.com/こんにちは世界-🚀'}},
        },
        {
          name: 'emoji-🎉-2',
          args: {data: {url: 'https://example.com/€100-and-50¢'}},
        },
        {
          name: 'umlaut-äöü-3',
          args: {data: {url: 'https://example.com/Deutsch-äöü'}},
        },
      ],
    });
    const buffer = encoder.encode(json);
    const result = parseTraceEventsFromBuffer(buffer, {eventsPerBatch: 1});

    assert.strictEqual(result.events.length, 3);
    assert.strictEqual(result.events[0]?.name, '日本語テスト-1');
    assert.strictEqual(
      result.events[0]?.args?.data?.url,
      'https://example.com/こんにちは世界-🚀',
    );
    assert.strictEqual(result.events[1]?.name, 'emoji-🎉-2');
    assert.strictEqual(
      result.events[1]?.args?.data?.url,
      'https://example.com/€100-and-50¢',
    );
    assert.strictEqual(result.events[2]?.name, 'umlaut-äöü-3');
    assert.strictEqual(
      result.events[2]?.args?.data?.url,
      'https://example.com/Deutsch-äöü',
    );
  });

  it('parses large batches exceeding function argument limits without call stack errors', () => {
    const eventCount = 70_000;
    const items: string[] = [];
    for (let idx = 0; idx < eventCount; idx++) {
      items.push(`{"name":"evt-${idx}","ts":${idx}}`);
    }
    const buffer = encoder.encode(`[${items.join(',')}]`);
    const result = parseTraceEventsFromBuffer(buffer, {
      eventsPerBatch: eventCount,
    });

    assert.strictEqual(result.events.length, eventCount);
    assert.strictEqual(result.events[0]?.name, 'evt-0');
    assert.strictEqual(result.events[69_999]?.name, 'evt-69999');
  });

  it('throws SyntaxError when non-whitespace characters follow a closed array', () => {
    const buffer = encoder.encode('[{"name": "e1"}] extra');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });

  it('throws SyntaxError when non-whitespace characters follow a closed object', () => {
    const buffer = encoder.encode('{"traceEvents": []} extra');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });

  it('throws SyntaxError when a property key is missing a colon in object container', () => {
    const buffer = encoder.encode('{"traceEvents" []}');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });

  it('throws SyntaxError when a comma is missing between object properties', () => {
    const buffer = encoder.encode('{"traceEvents": [] "metadata": {}}');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });

  it('throws SyntaxError when an object key string is unterminated', () => {
    const buffer = encoder.encode('{"traceEvents');
    assert.throws(() => parseTraceEventsFromBuffer(buffer), SyntaxError);
  });
});
