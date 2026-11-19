/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {readCookiesFile} from '../../src/utils/cookies.js';
import {createTempDir, createTempFile} from '../utils.js';

describe('readCookiesFile', () => {
  it('accepts browser cookie exports with a UTF-8 BOM and read-only metadata', async () => {
    const cookie = {
      name: 'session',
      value: 'COOKIE_VALUE',
      domain: '.example.test',
      httpOnly: true,
      partitionKey: 'https://example.test',
    };
    using file = createTempFile(
      '\uFEFF' + JSON.stringify([{...cookie, size: 19, session: true}]),
      'cookies.json',
    );

    assert.deepStrictEqual(await readCookiesFile(file.path), [cookie]);
  });

  it('accepts an empty array', async () => {
    using file = createTempFile('[]', 'cookies.json');
    assert.deepStrictEqual(await readCookiesFile(file.path), []);
  });

  it('reports a missing file with its path and filesystem error code', async () => {
    using dir = createTempDir('cookies-test-');
    const filePath = path.join(dir.path, 'missing.json');

    await assert.rejects(readCookiesFile(filePath), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(filePath));
      assert.match(error.message, /Unable to read cookies file.*ENOENT/);
      return true;
    });
  });

  for (const [name, contents] of [
    ['malformed JSON', 'COOKIE_VALUE invalid JSON'],
    ['an object', JSON.stringify({name: 'session', value: 'COOKIE_VALUE'})],
    [
      'a missing domain',
      JSON.stringify([{name: 'session', value: 'COOKIE_VALUE'}]),
    ],
    [
      'a non-boolean attribute',
      JSON.stringify([
        {
          name: 'session',
          value: 'COOKIE_VALUE',
          domain: 'example.test',
          secure: 1,
        },
      ]),
    ],
    [
      'an invalid SameSite value',
      JSON.stringify([
        {
          name: 'session',
          value: 'COOKIE_VALUE',
          domain: 'example.test',
          sameSite: 'COOKIE_VALUE',
        },
      ]),
    ],
    [
      'an invalid partition key',
      JSON.stringify([
        {
          name: 'session',
          value: 'COOKIE_VALUE',
          domain: 'example.test',
          partitionKey: {sourceOrigin: 123},
        },
      ]),
    ],
  ]) {
    it(`rejects ${name} without exposing cookie values`, async () => {
      using file = createTempFile(contents, 'cookies.json');

      await assert.rejects(readCookiesFile(file.path), error => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes(file.path));
        assert.match(error.message, /must contain/);
        assert.doesNotMatch(error.stack ?? error.message, /COOKIE_VALUE/);
        assert.strictEqual(error.cause, undefined);
        return true;
      });
    });
  }

  it('names the entry and field of an invalid cookie without its value', async () => {
    using file = createTempFile(
      JSON.stringify([
        {name: 'first', value: 'COOKIE_VALUE', domain: 'example.test'},
        {
          name: 'second',
          value: 'COOKIE_VALUE',
          domain: 'example.test',
          partitionKey: {sourceOrigin: 123},
        },
      ]),
      'cookies.json',
    );

    await assert.rejects(readCookiesFile(file.path), error => {
      assert.ok(error instanceof Error);
      assert.strictEqual(
        error.message,
        `Cookies file "${file.path}" must contain a Puppeteer CookieData array. Invalid value at [1].partitionKey.`,
      );
      return true;
    });
  });
});
