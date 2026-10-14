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

  it('tool reference documents evaluate_script with serviceWorkerId and optional pageId', async () => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile('docs/tool-reference.md', 'utf-8');
    const evaluateSection = content.slice(
      content.indexOf('### `evaluate_script`'),
    );
    const nextSection = evaluateSection.slice(
      0,
      evaluateSection.indexOf('---'),
    );
    assert.ok(
      nextSection.includes('serviceWorkerId'),
      'Expected docs/tool-reference.md evaluate_script section to document serviceWorkerId',
    );
    assert.ok(
      nextSection.includes('pageId** (number) _(optional)_'),
      'Expected docs/tool-reference.md evaluate_script section to document pageId as optional',
    );
  });
});
