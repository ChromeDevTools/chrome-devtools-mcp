/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  downloadBehaviorFor,
  prepareDownloadsDir,
} from '../../src/utils/downloadsDir.js';
import {createTempDir, createTempFile} from '../utils.js';

describe('downloadsDir', () => {
  it('creates a missing nested directory', () => {
    using dir = createTempDir('downloads-dir-');
    const nested = path.join(dir.path, 'a', 'b');
    prepareDownloadsDir(nested);
    assert.ok(fs.statSync(nested).isDirectory());
  });

  it('accepts an existing directory', () => {
    using dir = createTempDir('downloads-dir-');
    prepareDownloadsDir(dir.path);
    assert.ok(fs.statSync(dir.path).isDirectory());
  });

  it('refuses a path that is a file with the error code', () => {
    using file = createTempFile('not a dir', 'not-a-dir.txt');
    assert.throws(
      () => prepareDownloadsDir(file.path),
      /Invalid downloadsDir .*\. Could not create the directory \(EEXIST\)\./,
    );
  });

  it('returns no download behavior when downloadsDir is unset', () => {
    assert.strictEqual(downloadBehaviorFor(undefined), undefined);
  });

  it('returns an allow download behavior for downloadsDir', () => {
    assert.deepStrictEqual(downloadBehaviorFor('/tmp/downloads'), {
      policy: 'allow',
      downloadPath: '/tmp/downloads',
    });
  });
});
