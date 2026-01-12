
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// tests/stable-identity.test.ts
// Tests for stable project identity resolution

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { normalizeGitUrl } from '../src/stable-identity.js';

describe('normalizeGitUrl', () => {
  it('should normalize SSH URLs', () => {
    assert.strictEqual(
      normalizeGitUrl('git@github.com:user/repo.git'),
      'github.com/user/repo',
    );
  });

  it('should normalize HTTPS URLs', () => {
    assert.strictEqual(
      normalizeGitUrl('https://github.com/user/repo.git'),
      'github.com/user/repo',
    );
  });

  it('should normalize HTTP URLs', () => {
    assert.strictEqual(
      normalizeGitUrl('http://github.com/user/repo.git'),
      'github.com/user/repo',
    );
  });

  it('should handle URLs without .git suffix', () => {
    assert.strictEqual(
      normalizeGitUrl('https://github.com/user/repo'),
      'github.com/user/repo',
    );
  });

  it('should handle SSH prefix with ssh://', () => {
    assert.strictEqual(
      normalizeGitUrl('ssh://git@github.com/user/repo.git'),
      'github.com/user/repo',
    );
  });

  it('should be case insensitive', () => {
    assert.strictEqual(
      normalizeGitUrl('https://GitHub.com/User/Repo.git'),
      'github.com/user/repo',
    );
  });

  it('should handle GitLab URLs', () => {
    assert.strictEqual(
      normalizeGitUrl('git@gitlab.com:user/repo.git'),
      'gitlab.com/user/repo',
    );
  });

  it('should handle Bitbucket URLs', () => {
    assert.strictEqual(
      normalizeGitUrl('git@bitbucket.org:user/repo.git'),
      'bitbucket.org/user/repo',
    );
  });

  it('should handle nested paths', () => {
    assert.strictEqual(
      normalizeGitUrl('https://github.com/org/group/repo.git'),
      'github.com/org/group/repo',
    );
  });

  it('should trim whitespace', () => {
    assert.strictEqual(
      normalizeGitUrl('  https://github.com/user/repo.git  '),
      'github.com/user/repo',
    );
  });
});
