/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {ensureExtension} from '../../src/utils/files.js';

describe('ensureExtension', () => {
  it('should add an extension to a filename without one', () => {
    assert.strictEqual(ensureExtension('filename', '.txt'), 'filename.txt');
  });

  it('should replace an existing extension', () => {
    assert.strictEqual(ensureExtension('filename.jpg', '.txt'), 'filename.txt');
  });

  it('should handle extension without a leading dot', () => {
    assert.strictEqual(ensureExtension('filename', '.txt'), 'filename.txt');
  });

  it('should not add a second dot if already present', () => {
    assert.strictEqual(ensureExtension('filename.txt', '.txt'), 'filename.txt');
  });

  it('should handle paths with directories', () => {
    assert.strictEqual(
      ensureExtension('/path/to/file.jpg', '.png'),
      '/path/to/file.png',
    );
  });

  it('should handle hidden files (starting with dot)', () => {
    assert.strictEqual(ensureExtension('.bashrc', '.txt'), '.bashrc.txt');
  });

  it('should handle complex extensions (like .tar.gz) - path.extname only gets the last one', () => {
    assert.strictEqual(ensureExtension('file.tar.gz', '.zip'), 'file.tar.zip');
  });
});
