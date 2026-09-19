/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {zod} from '../../src/third_party/index.js';
import {timeoutSchema} from '../../src/tools/ToolDefinition.js';

const schema = zod.object(timeoutSchema);

describe('timeoutSchema', () => {
  it('treats 0 as "use the default timeout"', () => {
    assert.deepStrictEqual(schema.parse({timeout: 0}), {timeout: undefined});
  });

  it('treats a negative timeout as "use the default timeout"', () => {
    assert.deepStrictEqual(schema.parse({timeout: -1}), {timeout: undefined});
  });

  it('keeps a positive timeout in milliseconds', () => {
    assert.deepStrictEqual(schema.parse({timeout: 500}), {timeout: 500});
  });

  it('leaves an omitted timeout undefined', () => {
    assert.deepStrictEqual(schema.parse({}), {});
  });
});
