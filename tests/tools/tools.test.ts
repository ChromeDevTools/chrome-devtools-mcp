/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ConfigParser} from '../../src/config/ConfigParser.js';
import {isAvailableInMode} from '../../src/tools/ToolDefinition.js';
import {createTools} from '../../src/tools/tools.js';

describe('createTools', () => {
  for (const extraArgs of [[], ['--slim']]) {
    it(`has unique tool names with [${extraArgs.join(' ')}]`, () => {
      const serverArgs = new ConfigParser(
        '0.0.0',
        ['node', 'script.js', ...extraArgs],
        {},
      ).parse();

      const names = createTools(serverArgs)
        .filter(tool => isAvailableInMode(tool, serverArgs))
        .map(tool => tool.name);

      assert.strictEqual(new Set(names).size, names.length);
    });
  }
});
