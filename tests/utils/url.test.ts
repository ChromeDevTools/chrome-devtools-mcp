/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {isAllowedUrl, isLocalhost, validateUrl} from '../../src/utils/url.js';

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

const defaultOptions = {
  javascriptEvaluation: undefined,
  categoryExtensions: undefined,
};

describe('validateUrl', () => {
  it('should return URL object for valid URLs', () => {
    assert.strictEqual(
      validateUrl('https://example.com', defaultOptions).href,
      'https://example.com/',
    );
    assert.strictEqual(
      validateUrl('http://localhost:3000', defaultOptions).href,
      'http://localhost:3000/',
    );
    assert.strictEqual(
      validateUrl('about:blank', defaultOptions).href,
      'about:blank',
    );
    assert.strictEqual(
      validateUrl('data:text/html,<div>test</div>', defaultOptions).href,
      'data:text/html,<div>test</div>',
    );
  });

  it('should reject URLs that do not parse with new URL', () => {
    assert.throws(
      () => validateUrl('not a url', defaultOptions),
      /Invalid URL: "not a url"/,
    );
    assert.throws(() => validateUrl('', defaultOptions), /Invalid URL: ""/);
    assert.throws(
      () => validateUrl('http://', defaultOptions),
      /Invalid URL: "http:\/\/"/,
    );
    assert.throws(
      () => validateUrl('://', defaultOptions),
      /Invalid URL: ":\/\/"/,
    );
  });

  it('should allow javascript, data, and vbscript URLs when javascriptEvaluation is true or omitted', () => {
    assert.strictEqual(
      validateUrl('javascript:alert(1)', defaultOptions).protocol,
      'javascript:',
    );
    assert.strictEqual(
      validateUrl('javascript:alert(1)', {
        javascriptEvaluation: true,
        categoryExtensions: undefined,
      }).protocol,
      'javascript:',
    );
    assert.strictEqual(
      validateUrl('data:text/html,<div>test</div>', defaultOptions).protocol,
      'data:',
    );
    assert.strictEqual(
      validateUrl('data:text/html,<div>test</div>', {
        javascriptEvaluation: true,
        categoryExtensions: undefined,
      }).protocol,
      'data:',
    );
    assert.strictEqual(
      validateUrl('vbscript:msgbox(1)', defaultOptions).protocol,
      'vbscript:',
    );
    assert.strictEqual(
      validateUrl('vbscript:msgbox(1)', {
        javascriptEvaluation: true,
        categoryExtensions: undefined,
      }).protocol,
      'vbscript:',
    );
  });

  it('should reject javascript, data, and vbscript URLs when javascriptEvaluation is false', () => {
    assert.throws(
      () =>
        validateUrl('javascript:alert(1)', {
          javascriptEvaluation: false,
          categoryExtensions: undefined,
        }),
      /Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () =>
        validateUrl('JAVASCRIPT:alert(1)', {
          javascriptEvaluation: false,
          categoryExtensions: undefined,
        }),
      /Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () =>
        validateUrl('javascript:void(0)', {
          javascriptEvaluation: false,
          categoryExtensions: undefined,
        }),
      /Navigating to javascript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () =>
        validateUrl('data:text/html,<div>test</div>', {
          javascriptEvaluation: false,
          categoryExtensions: undefined,
        }),
      /Navigating to data: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () =>
        validateUrl('DATA:text/html,<div>test</div>', {
          javascriptEvaluation: false,
          categoryExtensions: undefined,
        }),
      /Navigating to data: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () =>
        validateUrl('vbscript:msgbox(1)', {
          javascriptEvaluation: false,
          categoryExtensions: undefined,
        }),
      /Navigating to vbscript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
    assert.throws(
      () =>
        validateUrl('VBSCRIPT:msgbox(1)', {
          javascriptEvaluation: false,
          categoryExtensions: undefined,
        }),
      /Navigating to vbscript: URLs is not allowed when JavaScript evaluation is disabled\./,
    );
  });

  it('should allow chrome://newtab/ and chrome://inspect', () => {
    assert.strictEqual(
      validateUrl('chrome://newtab/', defaultOptions).href,
      'chrome://newtab/',
    );
    assert.strictEqual(
      validateUrl('chrome://newtab', defaultOptions).href,
      'chrome://newtab',
    );
    assert.strictEqual(
      validateUrl('chrome://inspect', defaultOptions).href,
      'chrome://inspect',
    );
    assert.strictEqual(
      validateUrl('chrome://inspect/#devices', defaultOptions).href,
      'chrome://inspect/#devices',
    );
  });

  it('should reject chrome: and chrome-untrusted: URLs', () => {
    assert.throws(
      () => validateUrl('chrome://settings', defaultOptions),
      /Navigating to chrome: URLs is not allowed\./,
    );
    assert.throws(
      () => validateUrl('chrome://version', defaultOptions),
      /Navigating to chrome: URLs is not allowed\./,
    );
    assert.throws(
      () => validateUrl('chrome:version', defaultOptions),
      /Navigating to chrome: URLs is not allowed\./,
    );
    assert.throws(
      () => validateUrl('CHROME://version', defaultOptions),
      /Navigating to chrome: URLs is not allowed\./,
    );
    assert.throws(
      () => validateUrl('chrome-untrusted://terminal', defaultOptions),
      /Navigating to chrome-untrusted: URLs is not allowed\./,
    );
    assert.throws(
      () => validateUrl('chrome-untrusted:terminal', defaultOptions),
      /Navigating to chrome-untrusted: URLs is not allowed\./,
    );
  });

  it('should reject chrome-extension: URLs unless categoryExtensions is enabled', () => {
    assert.throws(
      () => validateUrl('chrome-extension://abcdef/popup.html', defaultOptions),
      /Navigating to chrome-extension: URLs is not allowed without --categoryExtensions\./,
    );
    assert.throws(
      () =>
        validateUrl('chrome-extension://abcdef/popup.html', {
          javascriptEvaluation: undefined,
          categoryExtensions: false,
        }),
      /Navigating to chrome-extension: URLs is not allowed without --categoryExtensions\./,
    );
    assert.strictEqual(
      validateUrl('chrome-extension://abcdef/popup.html', {
        javascriptEvaluation: undefined,
        categoryExtensions: true,
      }).href,
      'chrome-extension://abcdef/popup.html',
    );
  });
});

describe('isAllowedUrl', () => {
  it('should allow chrome://newtab/ and chrome://inspect', () => {
    assert.strictEqual(
      isAllowedUrl('chrome://newtab/', {categoryExtensions: undefined}),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('chrome://newtab', {categoryExtensions: undefined}),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('CHROME://newtab/', {categoryExtensions: undefined}),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('chrome://inspect', {categoryExtensions: undefined}),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('chrome://inspect/', {categoryExtensions: undefined}),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('chrome://inspect/#devices', {
        categoryExtensions: undefined,
      }),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('CHROME://inspect', {categoryExtensions: undefined}),
      true,
    );
  });

  it('should disallow internal chrome: and chrome-untrusted: URLs', () => {
    assert.strictEqual(
      isAllowedUrl('chrome://settings', {categoryExtensions: undefined}),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('chrome://version', {categoryExtensions: undefined}),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('chrome:version', {categoryExtensions: undefined}),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('CHROME://settings', {categoryExtensions: undefined}),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('chrome-untrusted://terminal', {
        categoryExtensions: undefined,
      }),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('chrome-untrusted:terminal', {
        categoryExtensions: undefined,
      }),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('CHROME-UNTRUSTED://terminal', {
        categoryExtensions: undefined,
      }),
      false,
    );
  });

  it('should disallow chrome-extension: URLs when extensions are disabled and allow when enabled', () => {
    assert.strictEqual(
      isAllowedUrl('chrome-extension://abcdef/popup.html', {
        categoryExtensions: undefined,
      }),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('chrome-extension://abcdef/popup.html', {
        categoryExtensions: false,
      }),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('chrome-extension:abcdef', {categoryExtensions: false}),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('chrome-extension://abcdef/popup.html', {
        categoryExtensions: true,
      }),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('chrome-extension:abcdef', {categoryExtensions: true}),
      true,
    );
  });

  it('should allow standard web and navigation URLs', () => {
    assert.strictEqual(
      isAllowedUrl('https://example.com', {categoryExtensions: undefined}),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('http://localhost:3000', {categoryExtensions: undefined}),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('about:blank', {categoryExtensions: undefined}),
      true,
    );
    assert.strictEqual(
      isAllowedUrl('data:text/html,<div>test</div>', {
        categoryExtensions: undefined,
      }),
      true,
    );
  });

  it('should return false for unparseable URLs', () => {
    assert.strictEqual(
      isAllowedUrl('not a url', {categoryExtensions: undefined}),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('', {categoryExtensions: undefined}),
      false,
    );
    assert.strictEqual(
      isAllowedUrl('://', {categoryExtensions: undefined}),
      false,
    );
  });
});
