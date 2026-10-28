/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import {beforeEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {getDefaultUserDataDir} from '../../src/config/browser-options.js';

describe('getDefaultUserDataDir', () => {
  beforeEach(() => {
    sinon.stub(os, 'homedir').returns('/home/user');
  });

  it('uses chrome-profile for the stable channel', () => {
    assert.strictEqual(
      getDefaultUserDataDir({channel: 'stable', viaCli: false}),
      path.join(
        '/home/user',
        '.cache',
        'chrome-devtools-mcp',
        'chrome-profile',
      ),
    );
  });

  it('suffixes the profile with a non-stable channel', () => {
    assert.strictEqual(
      getDefaultUserDataDir({channel: 'canary', viaCli: false}),
      path.join(
        '/home/user',
        '.cache',
        'chrome-devtools-mcp',
        'chrome-profile-canary',
      ),
    );
  });

  it('uses a separate cache directory for the CLI', () => {
    assert.strictEqual(
      getDefaultUserDataDir({channel: 'stable', viaCli: true}),
      path.join(
        '/home/user',
        '.cache',
        'chrome-devtools-mcp-cli',
        'chrome-profile',
      ),
    );
  });
});
