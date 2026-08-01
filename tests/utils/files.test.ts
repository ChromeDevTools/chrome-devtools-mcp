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

  it('should resolve a dangling symlink to its target, not to the link', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const inside = path.join(tmpDir, 'inside');
      const outside = path.join(tmpDir, 'outside');
      await fs.mkdir(inside);
      await fs.mkdir(outside);

      // The target does not exist, so realpath() reports ENOENT for the link
      // just as it would for a missing file.
      const target = path.join(outside, 'not-created-yet.txt');
      const link = path.join(inside, 'link.txt');
      await fs.symlink(target, link);

      const resolved = await resolveCanonicalPath(link);
      const canonicalOutside = await fs.realpath(outside);
      assert.strictEqual(
        resolved,
        path.join(canonicalOutside, 'not-created-yet.txt'),
      );
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });

  it('should resolve through a dangling symlink used as a parent directory', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const inside = path.join(tmpDir, 'inside');
      const outside = path.join(tmpDir, 'outside');
      await fs.mkdir(inside);
      await fs.mkdir(outside);

      const targetDir = path.join(outside, 'not-created-yet');
      const linkDir = path.join(inside, 'link_dir');
      await fs.symlink(targetDir, linkDir, 'dir');

      const resolved = await resolveCanonicalPath(
        path.join(linkDir, 'file.txt'),
      );
      const canonicalOutside = await fs.realpath(outside);
      assert.strictEqual(
        resolved,
        path.join(canonicalOutside, 'not-created-yet', 'file.txt'),
      );
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });

  it('should not loop forever on a self-referential dangling symlink', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const a = path.join(tmpDir, 'a');
      const b = path.join(tmpDir, 'b');
      await fs.symlink(b, a);
      await fs.symlink(a, b);

      await assert.rejects(async () => {
        await resolveCanonicalPath(a);
      });
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });
});
