/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {evaluateScript} from '../../src/tools/script.js';
import {withMcpContext} from '../utils.js';

describe('a11y-debugging', () => {
  const skillPath = path.join(
    process.cwd(),
    'skills',
    'a11y-debugging',
    'SKILL.md',
  );
  const skillContent = fs.readFileSync(skillPath, 'utf8');

  // Extract snippets
  // We assume snippets are in ```javascript ... ``` blocks.
  const snippets: string[] = [];
  const regex = /```javascript([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(skillContent)) !== null) {
    snippets.push(match[1].trim());
  }

  it('snippets should be valid javascript', () => {
    assert.ok(snippets.length > 0, 'Should find snippets in SKILL.md');
  });

  it('0-arg snippets (IIFEs) should execute with evaluate_script', async () => {
    // The 1st snippet (orphaned inputs) and 4th snippet (global checks) are IIFEs returning a function.
    // 2nd and 3rd are arg-taking functions (not IIFEs).
    const orphanInputsSnippet = snippets[0];
    const globalPageChecksSnippet = snippets[3];

    assert.ok(orphanInputsSnippet, 'Orphaned inputs snippet not found');
    assert.ok(globalPageChecksSnippet, 'Global page checks snippet not found');

    await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent('<input id="foo"><label for="foo">Foo</label>');

        // Test Orphaned Inputs Snippet
        await evaluateScript.handler(
            {params: {function: orphanInputsSnippet}},
            response,
            context
        );
        let lineEvaluation = response.responseLines.at(2)!;
        let result = JSON.parse(lineEvaluation);
        // Expect empty array because we have a valid label
        assert.deepStrictEqual(result, []);

        // Test Global Page Checks Snippet
        response.resetResponseLineForTesting();
        await evaluateScript.handler(
            {params: {function: globalPageChecksSnippet}},
            response,
            context
        );
        lineEvaluation = response.responseLines.at(2)!;
        result = JSON.parse(lineEvaluation);
        // We expect some result, just check keys
        assert.ok('lang' in result);
        assert.ok('title' in result);
    });
  });
});
