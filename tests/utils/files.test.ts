/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {ensureExtension, resolveCanonicalPath} from '../../src/utils/files.js';

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

describe('resolveCanonicalPath', () => {
  it('should resolve an existing standard file path', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.writeFile(filePath, 'hello');

      const resolved = await resolveCanonicalPath(filePath);
      const canonicalTmpDir = await fs.realpath(tmpDir);
      assert.strictEqual(resolved, path.join(canonicalTmpDir, 'test.txt'));
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });

  it('should resolve a non-existent file whose parent directory exists', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const filePath = path.join(tmpDir, 'non-existent.txt');

      const resolved = await resolveCanonicalPath(filePath);
      const canonicalTmpDir = await fs.realpath(tmpDir);
      assert.strictEqual(
        resolved,
        path.join(canonicalTmpDir, 'non-existent.txt'),
      );
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });

  it('should resolve a non-existent deeply nested file whose parent directories do not exist', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const filePath = path.join(
        tmpDir,
        'nested1',
        'nested2',
        'non-existent.txt',
      );

      const resolved = await resolveCanonicalPath(filePath);
      const canonicalTmpDir = await fs.realpath(tmpDir);
      assert.strictEqual(
        resolved,
        path.join(canonicalTmpDir, 'nested1', 'nested2', 'non-existent.txt'),
      );
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });

  it('should resolve existing files with symlinks in path', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir);
      const targetFile = path.join(targetDir, 'file.txt');
      await fs.writeFile(targetFile, 'hello');

      const symlinkDir = path.join(tmpDir, 'symlink_dir');
      await fs.symlink(targetDir, symlinkDir, 'dir');

      const filePathWithSymlink = path.join(symlinkDir, 'file.txt');

      const resolved = await resolveCanonicalPath(filePathWithSymlink);
      const canonicalTargetDir = await fs.realpath(targetDir);
      assert.strictEqual(resolved, path.join(canonicalTargetDir, 'file.txt'));
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });
});
