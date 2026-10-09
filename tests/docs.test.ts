/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, it} from 'node:test';

describe('tool reference', () => {
  it('documents service worker targeting for evaluate_script', () => {
    const reference = readFileSync(resolve('docs/tool-reference.md'), 'utf8');
    const toolSection = reference.match(
      /### `evaluate_script`([\s\S]*?)(?=\n---\n)/,
    )?.[1];

    assert.ok(toolSection);
    assert.match(toolSection, /\*\*pageId\*\* \(number\) _\(optional\)_/);
    assert.match(
      toolSection,
      /Required when not evaluating in a service worker\./,
    );
    assert.match(
      toolSection,
      /\*\*serviceWorkerId\*\* \(string\) _\(optional\)_/,
    );
    assert.match(
      toolSection,
      /Only available when --categoryExtensions is enabled\./,
    );
  });
});
