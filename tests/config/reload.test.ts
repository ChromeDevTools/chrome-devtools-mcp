/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ConfigParser} from '../../src/config/ConfigParser.js';
import {mcpOptions} from '../../src/config/mcp-options.js';
import {
  mergeReloadableOptions,
  RELOADABLE_OPTIONS,
  RESTART_REQUIRED_OPTIONS,
} from '../../src/config/reload.js';

function parseArgs(argv: string[] = []) {
  return new ConfigParser('0.0.0', ['node', 'main.js', ...argv], {}).parse();
}

describe('mergeReloadableOptions', () => {
  it('partitions all mcpOptions between RELOADABLE_OPTIONS and RESTART_REQUIRED_OPTIONS without overlap', () => {
    const reloadable = new Set<string>(RELOADABLE_OPTIONS);
    const restartRequired = new Set<string>(RESTART_REQUIRED_OPTIONS);

    for (const key of reloadable) {
      assert.strictEqual(
        restartRequired.has(key),
        false,
        `Option ${key} is listed in both RELOADABLE_OPTIONS and RESTART_REQUIRED_OPTIONS`,
      );
    }

    const classified = new Set<string>([...reloadable, ...restartRequired]);
    assert.deepStrictEqual(
      [...classified].sort(),
      Object.keys(mcpOptions).sort(),
    );
  });

  it('applies reloadable options', () => {
    const merged = mergeReloadableOptions(
      parseArgs(),
      parseArgs([
        '--memoryDebugging',
        '--no-category-network',
        '--no-file-navigations',
      ]),
    );

    assert.strictEqual(merged.memoryDebugging, true);
    assert.strictEqual(merged.categoryNetwork, false);
    assert.strictEqual(merged.fileNavigations, false);
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

  it('rejects reloadable options that conflict with startup restart-required options', () => {
    const previous = parseArgs(['--browserUrl=http://127.0.0.1:9222']);
    const next = parseArgs(['--categoryPwa']);

    assert.throws(
      () => mergeReloadableOptions(previous, next),
      /Arguments categoryPwa and browserUrl are mutually exclusive/,
    );
  });
});
