/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  getFileVerificationOption,
  getZodMeta,
  zod,
} from '../../src/third_party/index.js';

describe('zod meta and getZodMeta', () => {
  it('sets and gets metadata directly on a schema', () => {
    const schema = zod.string().meta({verifyFile: true});
    assert.deepStrictEqual(schema.meta(), {verifyFile: true});
    assert.strictEqual(getZodMeta(schema, 'verifyFile'), true);
    assert.deepStrictEqual(getZodMeta(schema), {verifyFile: true});
  });

  it('unwraps optional schemas to retrieve metadata', () => {
    const schema = zod.string().meta({verifyFile: true}).optional();
    assert.strictEqual(getZodMeta(schema, 'verifyFile'), true);
    assert.deepStrictEqual(getZodMeta(schema), {verifyFile: true});
  });

  it('unwraps default schemas to retrieve metadata', () => {
    const schema = zod.string().meta({verifyFile: true}).default('test');
    assert.strictEqual(getZodMeta(schema, 'verifyFile'), true);
    assert.deepStrictEqual(getZodMeta(schema), {verifyFile: true});
  });

  it('unwraps array schemas to retrieve metadata', () => {
    const schema = zod
      .array(zod.string())
      .meta({verifyFile: {local: true, remote: false}});
    assert.deepStrictEqual(getZodMeta(schema, 'verifyFile'), {
      local: true,
      remote: false,
    });
  });

  it('unwraps transform effects to retrieve metadata', () => {
    const schema = zod
      .string()
      .meta({verifyFile: true})
      .transform(val => val.trim());
    assert.strictEqual(getZodMeta(schema, 'verifyFile'), true);
  });

  it('returns undefined when no metadata is set', () => {
    const schema = zod.string().optional();
    assert.strictEqual(getZodMeta(schema, 'verifyFile'), undefined);
    assert.strictEqual(getZodMeta(schema), undefined);
  });

  it('getFileVerificationOption helper delegates to getZodMeta', () => {
    const schema = zod.string().meta({verifyFile: true});
    assert.strictEqual(getFileVerificationOption(schema), true);

    const noMetaSchema = zod.string();
    assert.strictEqual(getFileVerificationOption(noMetaSchema), undefined);
  });

  it('merges metadata across wrapper levels when querying all meta', () => {
    const inner = zod.string().meta({verifyFile: true});
    const outer = inner.optional().meta({
      verifyFile: {local: false, remote: true},
    });
    // Outer overrides inner for the same key
    assert.deepStrictEqual(getZodMeta(outer, 'verifyFile'), {
      local: false,
      remote: true,
    });
  });
});
