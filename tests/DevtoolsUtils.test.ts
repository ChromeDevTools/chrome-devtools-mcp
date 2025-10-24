/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  extractUrlLikeFromDevToolsTitle,
  urlsEqual,
} from '../src/DevtoolsUtils.js';

describe('extractUrlFromDevToolsTitle', () => {
  it('deals with no trailing /', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - example.com'),
      'example.com',
    );
  });
  it('deals with a trailing /', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - example.com/'),
      'example.com/',
    );
  });
  it('deals with www', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle('DevTools - www.example.com/'),
      'www.example.com/',
    );
  });
  it('deals with complex url', () => {
    assert.strictEqual(
      extractUrlLikeFromDevToolsTitle(
        'DevTools - www.example.com/path.html?a=b#3',
      ),
      'www.example.com/path.html?a=b#3',
    );
  });
});

describe('urlsEqual', () => {
  it('ignores trailing slashes', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://google.com'),
      true,
    );
  });

  it('ignores www', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://www.google.com'),
      true,
    );
  });

  it('ignores protocols', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'http://www.google.com'),
      true,
    );
  });

  it('does not ignore other subdomains', () => {
    assert.strictEqual(
      urlsEqual('https://google.com/', 'https://photos.google.com'),
      false,
    );
  });
});
