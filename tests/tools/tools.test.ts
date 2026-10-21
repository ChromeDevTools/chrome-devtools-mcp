/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {createTools} from '../../src/tools/tools.js';
import {createMockParsedArguments} from '../mocks.js';

describe('createTools', () => {
  it('has unique tool names', () => {
    const serverArgs = createMockParsedArguments();

    const names = createTools(serverArgs).map(tool => tool.name);

    assert.strictEqual(new Set(names).size, names.length);
  });
});
