/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {loadBrowser} from '../src/third_party/index.js';

import {BUILD_SRC, findImportPath} from './importGraph.js';

const BROWSER_BUNDLE = path.join(BUILD_SRC, 'third_party', 'browser.js');

const LIGHT_ENTRIES = [
  'config/ConfigWatcher.js',
  'telemetry/flagUtils.js',
  'tools/emulation.js',
  'tools/input.js',
  'tools/lighthouse.js',
  'tools/logpoints.js',
  'tools/performance.js',
  'tools/snapshot.js',
  'utils/text.js',
];

describe('browser bundle imports', () => {
  for (const entry of LIGHT_ENTRIES) {
    it(`${entry} does not statically import third_party/browser.js`, () => {
      const chain = findImportPath(
        path.join(BUILD_SRC, entry),
        BROWSER_BUNDLE,
        {includeDynamicImports: false},
      );
      assert.strictEqual(
        chain,
        undefined,
        `This module must not load third_party/browser.js when imported. Import chain:\n  ${chain?.join('\n  -> ')}`,
      );
    });
  }

  it('loadBrowser returns the third_party/browser.js module', async () => {
    assert.strictEqual(
      await loadBrowser(),
      await import('../src/third_party/browser.js'),
    );
  });
});
