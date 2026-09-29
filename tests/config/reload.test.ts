/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ConfigParser} from '../../src/config/ConfigParser.js';
import {getRestartRequiredChanges} from '../../src/config/reload.js';

function parseArgs(argv: string[] = []) {
  return new ConfigParser('0.0.0', ['node', 'main.js', ...argv], {}).parse();
}

describe('getRestartRequiredChanges', () => {
  it('returns nothing for options applied to the running server', () => {
    assert.deepStrictEqual(
      getRestartRequiredChanges(
        parseArgs(),
        parseArgs([
          '--memoryDebugging',
          '--no-category-network',
          '--screenshotFormat=jpeg',
        ]),
      ),
      [],
    );
  });

  it('returns changed browser, Puppeteer and process options', () => {
    assert.deepStrictEqual(
      getRestartRequiredChanges(
        parseArgs(),
        parseArgs(['--headless', '--viewport=1280x720', '--slim']),
      ),
      ['headless', 'viewport', 'slim'],
    );
  });

  it('compares array options by value', () => {
    assert.deepStrictEqual(
      getRestartRequiredChanges(
        parseArgs(['--chromeArg=--foo']),
        parseArgs(['--chromeArg=--foo']),
      ),
      [],
    );
  });
});
