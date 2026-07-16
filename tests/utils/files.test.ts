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

  it('should resolve a dangling symlink to its target rather than its own path', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const insideDir = path.join(tmpDir, 'inside');
      const outsideDir = path.join(tmpDir, 'outside');
      await fs.mkdir(insideDir);
      await fs.mkdir(outsideDir);

      // A symlink that lives inside `insideDir` but points at a not-yet-created
      // file under `outsideDir`. fs.realpath() reports ENOENT for such a link,
      // so it must be resolved explicitly to its target.
      const danglingLink = path.join(insideDir, 'report.txt');
      const linkTarget = path.join(outsideDir, 'pwned.txt');
      await fs.symlink(linkTarget, danglingLink);

      const resolved = await resolveCanonicalPath(danglingLink);
      assert.strictEqual(
        resolved,
        path.join(await fs.realpath(outsideDir), 'pwned.txt'),
      );
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });

  it('should resolve a not-yet-existing file through a dangling directory symlink', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'resolve-canonical-test-'),
    );
    try {
      const insideDir = path.join(tmpDir, 'inside');
      await fs.mkdir(insideDir);

      // `escape` is a directory symlink inside `insideDir` whose target does
      // not exist yet. Both the target directory and the final file are
      // missing, so the walk must still resolve the intermediate symlink.
      const escapeLink = path.join(insideDir, 'escape');
      const escapeTarget = path.join(tmpDir, 'outside-dir');
      await fs.symlink(escapeTarget, escapeLink, 'dir');

      const filePath = path.join(escapeLink, 'out.txt');

      const resolved = await resolveCanonicalPath(filePath);
      assert.strictEqual(
        resolved,
        path.join(await fs.realpath(tmpDir), 'outside-dir', 'out.txt'),
      );
    } finally {
      await fs.rm(tmpDir, {recursive: true, force: true});
    }
  });
});
