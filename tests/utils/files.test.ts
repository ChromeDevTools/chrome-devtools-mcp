/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
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

  it('should resolve a dangling symlink to its actual (non-existent) target, not its own location', async () => {
    // Regression test: previously, a dangling symlink (one whose target
    // does not exist) was indistinguishable from a plain non-existent
    // path, and resolveCanonicalPath would incorrectly return the
    // symlink's *own* location instead of following it to where it
    // actually points. This meant a dangling symlink placed inside an
    // allowed root, pointing outside of it, would be treated by
    // validatePath as if it were safely inside the root - allowing a
    // subsequent write (e.g. a heap snapshot or screencast, whose actual
    // file I/O is performed by third-party code that follows symlinks)
    // to escape the sandboxed root entirely.
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    const outsideTarget = path.join(
      os.tmpdir(),
      `dangling-target-${crypto.randomUUID()}.txt`,
    );
    try {
      await fs.rm(outsideTarget, {force: true});
      const linkPath = path.join(tmpDir, 'dangling-link.txt');
      await fs.symlink(outsideTarget, linkPath);

      const resolved = await resolveCanonicalPath(linkPath);
      assert.strictEqual(resolved, outsideTarget);
      assert.ok(
        !resolved.startsWith(tmpDir),
        `expected resolved path to be outside ${tmpDir}, got ${resolved}`,
      );
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
      await fs.rm(outsideTarget, {force: true});
    }
  });

  it('should resolve a chained dangling symlink to its ultimate target', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    const outsideTarget = path.join(
      os.tmpdir(),
      `chain-target-${crypto.randomUUID()}.txt`,
    );
    try {
      await fs.rm(outsideTarget, {force: true});
      const linkB = path.join(tmpDir, 'chain-b');
      await fs.symlink(outsideTarget, linkB);
      const linkA = path.join(tmpDir, 'chain-a');
      await fs.symlink(linkB, linkA);

      const resolved = await resolveCanonicalPath(linkA);
      assert.strictEqual(resolved, outsideTarget);
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
      await fs.rm(outsideTarget, {force: true});
    }
  });

  it('should throw on a symlink cycle instead of looping forever', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const a = path.join(tmpDir, 'cycle-a');
      const b = path.join(tmpDir, 'cycle-b');
      await fs.symlink(b, a);
      await fs.symlink(a, b);

      await assert.rejects(resolveCanonicalPath(a));
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });
});
