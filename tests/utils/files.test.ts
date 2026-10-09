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
  // The Windows semantics are exercised on every host via the `windows`
  // parameter, so this whole matrix runs on Linux CI too.
  const cases: Array<{uri: string; windows: boolean; expected: string}> = [
    {
      uri: 'file:///home/user/project',
      windows: true,
      expected: path.win32.resolve('/home/user/project'),
    },
    {uri: 'file:///C:/src', windows: true, expected: 'C:\\src'},
    // Percent-encoded drive letter: read as POSIX this comes back as
    // `/c:/Users/user/project` instead of `c:\\Users\\user\\project`.
    {
      uri: 'file:///c%3A/Users/user/project',
      windows: true,
      expected: 'c:\\Users\\user\\project',
    },
    // URL parsing already normalizes the historical `C|` form to `C:`, so this
    // is the same pathname as the plain drive letter above.
    {uri: 'file:///C|/src', windows: true, expected: 'C:\\src'},
    {
      uri: 'file://server/share/project',
      windows: true,
      expected: '\\\\server\\share\\project',
    },
    {
      uri: 'file://wsl.localhost/Ubuntu-24.04/home/user/project',
      windows: true,
      expected: '\\\\wsl.localhost\\Ubuntu-24.04\\home\\user\\project',
    },
    {
      uri: 'file:///home/user/project',
      windows: false,
      expected: '/home/user/project',
    },
    {uri: 'file:///C:/src', windows: false, expected: '/C:/src'},
  ];

  for (const {uri, windows, expected} of cases) {
    it(`should resolve ${uri} as ${windows ? 'windows' : 'posix'} to ${expected}`, () => {
      assert.strictEqual(resolveFileUriPath(uri, windows), expected);
    });
  }

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

  // A POSIX host has no UNC host semantics, so this shape stays an error
  // there rather than being silently reinterpreted as a POSIX path.
  it('should reject a UNC file URI on a posix host', () => {
    assert.throws(() => resolveFileUriPath('file://server/share', false), {
      code: 'ERR_INVALID_FILE_URL_HOST',
    });
  });

  // ToolHandler and loadResource already hold a parsed URL, so the helper has
  // to accept one. A URI must not decode differently depending on whether the
  // caller reached it by string or by object.
  it('should resolve a URL object the same way as the equivalent string', () => {
    for (const {uri, windows} of cases) {
      assert.strictEqual(
        resolveFileUriPath(new URL(uri), windows),
        resolveFileUriPath(uri, windows),
        `${uri} decoded differently as a URL object`,
      );
    }
  });

  // The defect was a mismatch between the two sides of the containment check:
  // the requested path resolved against the UNC working directory while the
  // root did not. Whichever URI spelling the client uses, it has to land on
  // the same path the equivalent plain path resolves to.
  it('should resolve a POSIX file URI to the same path as the plain path', () => {
    for (const windows of [true, false]) {
      const pathModule = windows ? path.win32 : path.posix;
      const plainPath = pathModule.resolve('/home/user/project/shot.png');

      assert.strictEqual(
        resolveFileUriPath('file:///home/user/project/shot.png', windows),
        plainPath,
        `URI and plain path disagreed with windows=${windows}`,
      );
    }
  });
});
