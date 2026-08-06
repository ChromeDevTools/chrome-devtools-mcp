/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import {describe, it} from 'node:test';

import {VERSION} from '../src/version.js';

describe('VERSION constant', () => {
  it('matches package.json version', async () => {
    const pkgJson = JSON.parse(
      await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    assert.strictEqual(VERSION, pkgJson.version);
  });
});
