/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ConfigParser} from '../../src/config/ConfigParser.js';
import {createTools} from '../../src/tools/tools.js';

describe('createTools', () => {
  it('has unique tool names', () => {
    const serverArgs = new ConfigParser(
      '0.0.0',
      ['node', 'script.js'],
      {},
    ).parse();

    const names = createTools(serverArgs).map(tool => tool.name);

    assert.strictEqual(new Set(names).size, names.length);
  });
});
