/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, it} from 'node:test';

import {resolveCanonicalPath} from '../../src/utils/files.js';

describe('resolveCanonicalPath', () => {
  let tmpDir: string;
  let canonicalTmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    canonicalTmpDir = await fs.realpath(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('should resolve an existing standard file path', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await fs.writeFile(filePath, 'hello');

    const resolved = await resolveCanonicalPath(filePath);
    assert.strictEqual(resolved, path.join(canonicalTmpDir, 'test.txt'));
  });

  it('should resolve a non-existent file whose parent directory exists', async () => {
    const filePath = path.join(tmpDir, 'non-existent.txt');

    const resolved = await resolveCanonicalPath(filePath);
    assert.strictEqual(
      resolved,
      path.join(canonicalTmpDir, 'non-existent.txt'),
    );
  });

  it('should resolve a non-existent deeply nested file whose parent directories do not exist', async () => {
    const filePath = path.join(
      tmpDir,
      'nested1',
      'nested2',
      'non-existent.txt',
    );

    const resolved = await resolveCanonicalPath(filePath);
    assert.strictEqual(
      resolved,
      path.join(canonicalTmpDir, 'nested1', 'nested2', 'non-existent.txt'),
    );
  });

  it('should resolve existing files with symlinks in path', async () => {
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
  });

  it('should resolve non-existent files with symlinks in path', async () => {
    const targetDir = path.join(tmpDir, 'target');
    await fs.mkdir(targetDir);

    const symlinkDir = path.join(tmpDir, 'symlink_dir');
    await fs.symlink(targetDir, symlinkDir, 'dir');

    const filePathWithSymlink = path.join(symlinkDir, 'non-existent.txt');

    const resolved = await resolveCanonicalPath(filePathWithSymlink);
    const canonicalTargetDir = await fs.realpath(targetDir);
    assert.strictEqual(
      resolved,
      path.join(canonicalTargetDir, 'non-existent.txt'),
    );
  });

  it('should resolve dangling symlink at the end of path', async () => {
    const nonExistentTarget = path.join(tmpDir, 'non-existent-target.txt');
    const danglingSymlink = path.join(tmpDir, 'dangling-symlink.txt');
    await fs.symlink(nonExistentTarget, danglingSymlink);

    const resolved = await resolveCanonicalPath(danglingSymlink);
    assert.strictEqual(
      resolved,
      path.join(canonicalTmpDir, 'dangling-symlink.txt'),
    );
  });

  it('should resolve path with a dangling symlink directory in the middle', async () => {
    const nonExistentTargetDir = path.join(tmpDir, 'non-existent-dir');
    const danglingSymlinkDir = path.join(tmpDir, 'dangling-dir');
    await fs.symlink(nonExistentTargetDir, danglingSymlinkDir, 'dir');

    const filePath = path.join(danglingSymlinkDir, 'file.txt');
    const resolved = await resolveCanonicalPath(filePath);
    assert.strictEqual(
      resolved,
      path.join(canonicalTmpDir, 'dangling-dir', 'file.txt'),
    );
  });
});
