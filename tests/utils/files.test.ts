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
import {pathToFileURL} from 'node:url';

import {
  resolveCanonicalPath,
  resolveFileUriPath,
} from '../../src/utils/files.js';
import {createTempDir} from '../utils.js';

async function createSymlinkOrSkip(
  t: it.TestContext,
  target: string,
  symlinkPath: string,
  type?: 'dir' | 'file' | 'junction',
): Promise<boolean> {
  try {
    await fs.symlink(target, symlinkPath, type);
    return true;
  } catch (error) {
    if (
      os.platform() === 'win32' &&
      error instanceof Error &&
      'code' in error &&
      (error.code === 'EPERM' || error.code === 'EACCES')
    ) {
      t.skip('creating symlinks requires additional privileges on Windows');
      return false;
    }
    throw error;
  }
}

describe('resolveCanonicalPath', () => {
  it('should resolve an existing standard file path', async () => {
    using tmpDir = createTempDir('resolve-canonical-test-');
    const canonicalTmpDir = await fs.realpath(tmpDir.path);
    const filePath = path.join(tmpDir.path, 'test.txt');
    await fs.writeFile(filePath, 'hello');

    const resolved = await resolveCanonicalPath(filePath);
    assert.strictEqual(resolved, path.join(canonicalTmpDir, 'test.txt'));
  });

  it('should resolve a non-existent file whose parent directory exists', async () => {
    using tmpDir = createTempDir('resolve-canonical-test-');
    const canonicalTmpDir = await fs.realpath(tmpDir.path);
    const filePath = path.join(tmpDir.path, 'non-existent.txt');

    const resolved = await resolveCanonicalPath(filePath);
    assert.strictEqual(
      resolved,
      path.join(canonicalTmpDir, 'non-existent.txt'),
    );
  });

  it('should resolve a non-existent deeply nested file whose parent directories do not exist', async () => {
    using tmpDir = createTempDir('resolve-canonical-test-');
    const canonicalTmpDir = await fs.realpath(tmpDir.path);
    const filePath = path.join(
      tmpDir.path,
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

  it('should resolve existing files with symlinks in path', async t => {
    using tmpDir = createTempDir('resolve-canonical-test-');
    const targetDir = path.join(tmpDir.path, 'target');
    await fs.mkdir(targetDir);
    const targetFile = path.join(targetDir, 'file.txt');
    await fs.writeFile(targetFile, 'hello');

    const symlinkDir = path.join(tmpDir.path, 'symlink_dir');
    const created = await createSymlinkOrSkip(t, targetDir, symlinkDir, 'dir');
    if (!created) {
      return;
    }

    const filePathWithSymlink = path.join(symlinkDir, 'file.txt');

    const resolved = await resolveCanonicalPath(filePathWithSymlink);
    const canonicalTargetDir = await fs.realpath(targetDir);
    assert.strictEqual(resolved, path.join(canonicalTargetDir, 'file.txt'));
  });

  it('should resolve non-existent files with symlinks in path', async t => {
    using tmpDir = createTempDir('resolve-canonical-test-');
    const targetDir = path.join(tmpDir.path, 'target');
    await fs.mkdir(targetDir);

    const symlinkDir = path.join(tmpDir.path, 'symlink_dir');
    const created = await createSymlinkOrSkip(t, targetDir, symlinkDir, 'dir');
    if (!created) {
      return;
    }

    const filePathWithSymlink = path.join(symlinkDir, 'non-existent.txt');

    const resolved = await resolveCanonicalPath(filePathWithSymlink);
    const canonicalTargetDir = await fs.realpath(targetDir);
    assert.strictEqual(
      resolved,
      path.join(canonicalTargetDir, 'non-existent.txt'),
    );
  });

  it('should resolve dangling symlink at the end of path', async t => {
    using tmpDir = createTempDir('resolve-canonical-test-');
    const canonicalTmpDir = await fs.realpath(tmpDir.path);
    const nonExistentTarget = path.join(tmpDir.path, 'non-existent-target.txt');
    const danglingSymlink = path.join(tmpDir.path, 'dangling-symlink.txt');
    const created = await createSymlinkOrSkip(
      t,
      nonExistentTarget,
      danglingSymlink,
    );
    if (!created) {
      return;
    }

    const resolved = await resolveCanonicalPath(danglingSymlink);
    assert.strictEqual(
      resolved,
      path.join(canonicalTmpDir, 'dangling-symlink.txt'),
    );
  });

  it('should resolve path with a dangling symlink directory in the middle', async t => {
    using tmpDir = createTempDir('resolve-canonical-test-');
    const canonicalTmpDir = await fs.realpath(tmpDir.path);
    const nonExistentTargetDir = path.join(tmpDir.path, 'non-existent-dir');
    const danglingSymlinkDir = path.join(tmpDir.path, 'dangling-dir');
    const created = await createSymlinkOrSkip(
      t,
      nonExistentTargetDir,
      danglingSymlinkDir,
      'dir',
    );
    if (!created) {
      return;
    }

    const filePath = path.join(danglingSymlinkDir, 'file.txt');
    const resolved = await resolveCanonicalPath(filePath);
    assert.strictEqual(
      resolved,
      path.join(canonicalTmpDir, 'dangling-dir', 'file.txt'),
    );
  });
});

describe('resolveFileUriPath', () => {
  const isWindows = os.platform() === 'win32';

  it('should resolve a file URI built from a local path', () => {
    const target = path.resolve(os.tmpdir(), 'project');
    assert.strictEqual(resolveFileUriPath(pathToFileURL(target).href), target);
  });

  it('should keep percent-encoded characters decoded', () => {
    assert.strictEqual(
      resolveFileUriPath('file:///tmp/my%20project'),
      path.resolve('/tmp/my project'),
    );
  });

  // A WSL2 client driving a Windows-side server through WSL interop advertises
  // POSIX roots, which fileURLToPath() rejects on Windows with
  // ERR_INVALID_FILE_URL_PATH and validatePath() then drops.
  it('should resolve a POSIX file URI instead of throwing on Windows', () => {
    const resolved = resolveFileUriPath('file:///home/user/project');

    assert.ok(
      path.isAbsolute(resolved),
      `expected an absolute path, got ${resolved}`,
    );
    assert.ok(
      resolved.endsWith(path.join('home', 'user', 'project')),
      `expected the POSIX segments to be preserved, got ${resolved}`,
    );
  });

  it('should not reinterpret a drive-letter file URI as POSIX', () => {
    const resolved = resolveFileUriPath('file:///C:/src');

    if (isWindows) {
      assert.strictEqual(resolved, path.resolve('C:\\src'));
    } else {
      // A POSIX host has no drive semantics, so this keeps Node's default
      // handling rather than guessing at a drive letter.
      assert.strictEqual(resolved, '/C:/src');
    }
  });

  it('should not reinterpret a UNC file URI as POSIX', () => {
    if (isWindows) {
      assert.strictEqual(
        resolveFileUriPath('file://server/share'),
        path.resolve('\\\\server\\share'),
      );
    } else {
      assert.throws(() => resolveFileUriPath('file://server/share'), {
        code: 'ERR_INVALID_FILE_URL_HOST',
      });
    }
  });
});
