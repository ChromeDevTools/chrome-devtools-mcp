/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {isLocalhost, validateUrl} from '../../src/utils/url.js';

describe('isLocalhost', () => {
  it('should return true for valid localhost and loopback URLs', () => {
    assert.strictEqual(isLocalhost('http://localhost'), true);
    assert.strictEqual(isLocalhost('http://localhost:9222'), true);
    assert.strictEqual(
      isLocalhost('https://localhost:8080/path?query=1'),
      true,
    );
    assert.strictEqual(isLocalhost('http://subdomain.localhost:3000'), true);
    assert.strictEqual(isLocalhost('https://app.dev.localhost'), true);
    assert.strictEqual(isLocalhost('http://127.0.0.1:9222'), true);
    assert.strictEqual(
      isLocalhost('ws://127.0.0.1:9222/devtools/browser/123'),
      true,
    );
    assert.strictEqual(isLocalhost('wss://127.0.0.2'), true);
    assert.strictEqual(isLocalhost('http://[::1]:8080'), true);
    assert.strictEqual(isLocalhost('ws://[::1]:9222'), true);
  });

  it('should return true for alternative IPv4 representations', () => {
    assert.strictEqual(isLocalhost('http://127.1'), true); // short-form
    assert.strictEqual(isLocalhost('http://2130706433'), true); // decimal integer
    assert.strictEqual(isLocalhost('http://0177.0.0.1'), true); // octal
    assert.strictEqual(isLocalhost('http://0x7f.0.0.1'), true); // hex
  });

  it('should return true for full 127.0.0.0/8 loopback range', () => {
    assert.strictEqual(isLocalhost('http://127.0.0.0'), true);
    assert.strictEqual(isLocalhost('http://127.255.255.255'), true);
  });

  it('should return true for FQDN hostnames with trailing root dot', () => {
    assert.strictEqual(isLocalhost('http://localhost.'), true);
    assert.strictEqual(isLocalhost('http://subdomain.localhost.'), true);
  });

  it('should return true for uncompressed IPv6 loopback', () => {
    assert.strictEqual(isLocalhost('http://[0:0:0:0:0:0:0:1]:8080'), true);
  });

  it('should return true for URLs with user credentials', () => {
    assert.strictEqual(isLocalhost('http://user:pass@localhost:8080'), true);
  });

  it('should return false for non-localhost hostnames and IPs', () => {
    assert.strictEqual(isLocalhost('http://localhost.com'), false);
    assert.strictEqual(isLocalhost('http://localhost.evil.com'), false);
    assert.strictEqual(isLocalhost('http://evillocalhost'), false);
    assert.strictEqual(isLocalhost('http://localhost-evil.com'), false);
    assert.strictEqual(isLocalhost('http://localhost@evil.com'), false);
    assert.strictEqual(isLocalhost('http://128.0.0.1'), false);
    assert.strictEqual(isLocalhost('http://192.168.1.1'), false);
    assert.strictEqual(isLocalhost('http://127.0.0.256'), false); // out of range octet
    assert.strictEqual(isLocalhost('http://127.0.0.1.example.com'), false);
    assert.strictEqual(isLocalhost('http://0.0.0.0:8080'), false);
    assert.strictEqual(isLocalhost('https://example.com'), false);
    assert.strictEqual(isLocalhost('http://[::2]:8080'), false);
    assert.strictEqual(isLocalhost('http://[2001:db8::1]:8080'), false);
  });

  it('should return false for non-network schemes', () => {
    assert.strictEqual(isLocalhost('about:blank'), false);
    assert.strictEqual(isLocalhost('chrome://inspect'), false);
    assert.strictEqual(isLocalhost('chrome://version'), false);
    assert.strictEqual(isLocalhost('file:///etc/hosts'), false);
    assert.strictEqual(isLocalhost('ftp://localhost'), false);
    assert.strictEqual(isLocalhost('data:text/html,localhost'), false);
    assert.strictEqual(isLocalhost('javascript:alert(1)'), false);
  });

  it('should return false for invalid, empty, or undefined URLs', () => {
    assert.strictEqual(isLocalhost(undefined), false);
    assert.strictEqual(isLocalhost(''), false);
    assert.strictEqual(isLocalhost('   '), false);
    assert.strictEqual(isLocalhost('not a url'), false);
  });
});

describe('validateUrl', () => {
  it('should return URL object for valid URLs', () => {
    assert.strictEqual(
      validateUrl('https://example.com').href,
      'https://example.com/',
    );
    assert.strictEqual(
      validateUrl('http://localhost:3000').href,
      'http://localhost:3000/',
    );
    assert.strictEqual(validateUrl('about:blank').href, 'about:blank');
    assert.strictEqual(
      validateUrl('data:text/html,<div>test</div>').href,
      'data:text/html,<div>test</div>',
    );
  });

  it('should reject URLs that do not parse with new URL', () => {
    assert.throws(() => validateUrl('not a url'), /Invalid URL: "not a url"/);
    assert.throws(() => validateUrl(''), /Invalid URL: ""/);
    assert.throws(() => validateUrl('http://'), /Invalid URL: "http:\/\/"/);
    assert.throws(() => validateUrl('://'), /Invalid URL: ":\/\/"/);
  });

  it('should allow javascript, data, and vbscript URLs when javascriptEvaluation is true or omitted', () => {
    assert.strictEqual(
      validateUrl('javascript:alert(1)').protocol,
      'javascript:',
    );
    assert.strictEqual(
      validateUrl('javascript:alert(1)', true).protocol,
      'javascript:',
    );
    assert.strictEqual(
      validateUrl('data:text/html,<div>test</div>').protocol,
      'data:',
    );
    assert.strictEqual(
      validateUrl('data:text/html,<div>test</div>', true).protocol,
      'data:',
    );
    assert.strictEqual(validateUrl('vbscript:msgbox(1)').protocol, 'vbscript:');
    assert.strictEqual(
      validateUrl('vbscript:msgbox(1)', true).protocol,
      'vbscript:',
    );
  });

  it('should reject javascript, data, and vbscript URLs when javascriptEvaluation is false', () => {
    assert.throws(
      () => validateUrl('javascript:alert(1)', false),
      /Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () => validateUrl('JAVASCRIPT:alert(1)', false),
      /Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () => validateUrl('javascript:void(0)', false),
      /Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () => validateUrl('data:text/html,<div>test</div>', false),
      /Navigating to data: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () => validateUrl('DATA:text/html,<div>test</div>', false),
      /Navigating to data: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () => validateUrl('vbscript:msgbox(1)', false),
      /Navigating to vbscript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () => validateUrl('VBSCRIPT:msgbox(1)', false),
      /Navigating to vbscript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
  });
});
