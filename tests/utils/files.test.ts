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

import {resolveCanonicalPath} from '../../src/utils/files.js';

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
