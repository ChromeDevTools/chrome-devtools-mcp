/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ConfigParser} from '../../src/config/ConfigParser.js';
import {mergeReloadableOptions} from '../../src/config/reload.js';

function parseArgs(argv: string[] = []) {
  return new ConfigParser('0.0.0', ['node', 'main.js', ...argv], {}).parse();
}

describe('mergeReloadableOptions', () => {
  it('applies reloadable options', () => {
    const merged = mergeReloadableOptions(
      parseArgs(),
      parseArgs(['--memoryDebugging', '--no-category-network']),
    );

    assert.strictEqual(merged.memoryDebugging, true);
    assert.strictEqual(merged.categoryNetwork, false);
  });

  it('keeps restart-required options', () => {
    const merged = mergeReloadableOptions(
      parseArgs(),
      parseArgs([
        '--slim',
        '--categoryExtensions',
        '--blockedUrlPattern=https://example.com/*',
      ]),
    );

    assert.strictEqual(merged.slim, false);
    assert.strictEqual(merged.categoryExtensions, undefined);
    assert.strictEqual(merged.blockedUrlPattern, undefined);
  });

  it('keeps options derived from restart-required options', () => {
    const previous = new ConfigParser(
      '0.0.0',
      ['node', 'main.js', '--viaCli'],
      {},
    ).parse();
    const next = new ConfigParser(
      '0.0.0',
      ['node', 'main.js', '--viaCli', '--browserUrl=http://127.0.0.1:9222'],
      {},
    ).parse();

    const merged = mergeReloadableOptions(previous, next);

    assert.strictEqual(merged.categoryExtensions, true);
    assert.strictEqual(merged.browserUrl, undefined);
  });
});
