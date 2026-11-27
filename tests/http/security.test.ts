/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {
  applySecurityHeaders,
  buildAllowedHostnames,
  buildAllowedOrigins,
  createSecurityGate,
  formatHostForUrl,
  verifyStaticBearerToken,
} from '../../src/http/security.js';
import {logDisclaimers} from '../../src/utils/disclaimers.js';
import {createMockParsedArguments} from '../mocks.js';

function assertSecurityHeaders(response: Response): void {
  assert.strictEqual(response.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(response.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(response.headers.get('cache-control'), 'no-store');
}

describe('HTTP security helpers', () => {
  describe('formatHostForUrl', () => {
    it('brackets raw IPv6 literals', () => {
      assert.strictEqual(formatHostForUrl('::1'), '[::1]');
      assert.strictEqual(formatHostForUrl('2001:db8::1'), '[2001:db8::1]');
      assert.strictEqual(
        formatHostForUrl('::ffff:127.0.0.1'),
        '[::ffff:127.0.0.1]',
      );
      assert.strictEqual(formatHostForUrl(' ::1 '), '[::1]');
    });

    it('leaves bracketed IPv6, IPv4, and hostnames untouched', () => {
      assert.strictEqual(formatHostForUrl('[::1]'), '[::1]');
      assert.strictEqual(formatHostForUrl('127.0.0.1'), '127.0.0.1');
      assert.strictEqual(formatHostForUrl('localhost'), 'localhost');
      assert.strictEqual(
        formatHostForUrl('mcp.example.com'),
        'mcp.example.com',
      );
    });
  });

  describe('buildAllowedHostnames', () => {
    it('includes localhost hostnames for loopback binds and deduplicates', () => {
      assert.deepStrictEqual(buildAllowedHostnames('127.0.0.1'), [
        'localhost',
        '127.0.0.1',
        '[::1]',
      ]);
      assert.deepStrictEqual(buildAllowedHostnames('::1'), [
        'localhost',
        '127.0.0.1',
        '[::1]',
      ]);
      assert.deepStrictEqual(buildAllowedHostnames('[::1]'), [
        'localhost',
        '127.0.0.1',
        '[::1]',
      ]);
      assert.deepStrictEqual(buildAllowedHostnames('127.0.0.2'), [
        'localhost',
        '127.0.0.1',
        '[::1]',
        '127.0.0.2',
      ]);
    });

    it('excludes wildcard bind addresses and allows localhost plus extras', () => {
      for (const wildcard of ['0.0.0.0', '::', '[::]', '0:0:0:0:0:0:0:0']) {
        const allowed = buildAllowedHostnames(wildcard, [
          'MCP.Internal',
          '2001:db8::1',
          'mcp.internal',
          '   ',
        ]);
        assert.deepStrictEqual(allowed, [
          'localhost',
          '127.0.0.1',
          '[::1]',
          'mcp.internal',
          '[2001:db8::1]',
        ]);
        assert.strictEqual(allowed.includes('0.0.0.0'), false);
        assert.strictEqual(allowed.includes('[::]'), false);
      }
    });

    it('allows bound non-loopback host plus normalized extras', () => {
      assert.deepStrictEqual(
        buildAllowedHostnames('192.168.1.25', ['App.Local', '192.168.1.25']),
        ['192.168.1.25', 'app.local'],
      );
      assert.deepStrictEqual(buildAllowedHostnames('2001:db8::42'), [
        '[2001:db8::42]',
      ]);
    });
  });

  describe('buildAllowedOrigins', () => {
    it('starts with localhost origins and appends normalized extras', () => {
      assert.deepStrictEqual(buildAllowedOrigins(), [
        'localhost',
        '127.0.0.1',
        '[::1]',
      ]);
      assert.deepStrictEqual(
        buildAllowedOrigins([
          'App.Example.COM',
          'localhost',
          'MOZ-EXTENSION://*',
          '2001:db8::1',
          '',
        ]),
        [
          'localhost',
          '127.0.0.1',
          '[::1]',
          'app.example.com',
          'moz-extension://*',
          '[2001:db8::1]',
        ],
      );
    });
  });

  describe('verifyStaticBearerToken', () => {
    it('accepts matching Bearer tokens with case-insensitive scheme', () => {
      assert.strictEqual(
        verifyStaticBearerToken('Bearer secret-token', 'secret-token'),
        true,
      );
      assert.strictEqual(
        verifyStaticBearerToken('bearer secret-token', 'secret-token'),
        true,
      );
      assert.strictEqual(
        verifyStaticBearerToken('BEARER secret-token', 'secret-token'),
        true,
      );
    });

    it('rejects missing, malformed, wrong, or padded tokens', () => {
      const cases: Array<[string | null, string]> = [
        [null, 'secret-token'],
        ['', 'secret-token'],
        ['Bearer ', 'secret-token'],
        ['Bearer', 'secret-token'],
        ['Basic secret-token', 'secret-token'],
        ['Bearer wrong-token', 'secret-token'],
        ['Bearer short', 'secret-token'],
        ['Bearer secret-token ', 'secret-token'],
        [' Bearer secret-token', 'secret-token'],
        ['Bearer secret-token extra', 'secret-token'],
        ['Bearer secret-token', ''],
      ];
      for (const [header, expected] of cases) {
        assert.strictEqual(
          verifyStaticBearerToken(header, expected),
          false,
          `Expected header ${JSON.stringify(header)} to be rejected`,
        );
      }
    });
  });

  describe('applySecurityHeaders', () => {
    it('adds security headers without mutating the original response and preserves streaming bodies', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('chunk-1'));
          controller.enqueue(encoder.encode('chunk-2'));
          controller.close();
        },
      });
      const original = new Response(stream, {
        status: 201,
        statusText: 'Created',
        headers: {'Content-Type': 'text/event-stream', 'X-Custom': 'kept'},
      });

      const wrapped = applySecurityHeaders(original);

      assert.strictEqual(original.headers.get('x-content-type-options'), null);
      assert.strictEqual(wrapped.status, 201);
      assert.strictEqual(wrapped.statusText, 'Created');
      assert.strictEqual(wrapped.headers.get('x-custom'), 'kept');
      assertSecurityHeaders(wrapped);
      assert.strictEqual(await wrapped.text(), 'chunk-1chunk-2');
    });
  });

  describe('createSecurityGate', () => {
    it('allows valid Host and Origin without token when unauthenticated', () => {
      const gate = createSecurityGate({host: '127.0.0.1'});
      const request = new Request('http://127.0.0.1:3000/mcp', {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:3000',
          Origin: 'http://localhost:5173',
        },
      });
      assert.strictEqual(gate(request), undefined);
    });

    it('rejects disallowed Host headers with 403 and security headers', () => {
      const gate = createSecurityGate({host: '127.0.0.1'});
      const request = new Request('http://127.0.0.1:3000/mcp', {
        method: 'POST',
        headers: {Host: 'evil.example:3000'},
      });
      const response = gate(request);
      assert.ok(response);
      assert.strictEqual(response.status, 403);
      assertSecurityHeaders(response);
    });

    it('rejects disallowed and opaque null Origin headers with 403', () => {
      const gate = createSecurityGate({host: '127.0.0.1'});

      const evilOrigin = gate(
        new Request('http://127.0.0.1:3000/mcp', {
          method: 'POST',
          headers: {
            Host: '127.0.0.1:3000',
            Origin: 'https://evil.example',
          },
        }),
      );
      assert.ok(evilOrigin);
      assert.strictEqual(evilOrigin.status, 403);
      assertSecurityHeaders(evilOrigin);

      const nullOrigin = gate(
        new Request('http://127.0.0.1:3000/mcp', {
          method: 'POST',
          headers: {
            Host: '127.0.0.1:3000',
            Origin: 'null',
          },
        }),
      );
      assert.ok(nullOrigin);
      assert.strictEqual(nullOrigin.status, 403);
      assertSecurityHeaders(nullOrigin);
    });

    it('enforces static Bearer token and returns 401 without resource_metadata', async () => {
      const gate = createSecurityGate({
        host: '127.0.0.1',
        httpToken: 'top-secret-token',
      });

      const missing = gate(
        new Request('http://127.0.0.1:3000/mcp', {
          method: 'POST',
          headers: {Host: '127.0.0.1:3000'},
        }),
      );
      assert.ok(missing);
      assert.strictEqual(missing.status, 401);
      assert.strictEqual(missing.headers.get('www-authenticate'), 'Bearer');
      assert.strictEqual(
        missing.headers.get('content-type'),
        'application/json',
      );
      assertSecurityHeaders(missing);
      const body = await missing.text();
      assert.ok(!body.includes('resource_metadata'));
      assert.ok(!body.includes('top-secret-token'));

      const wrong = gate(
        new Request('http://127.0.0.1:3000/mcp', {
          method: 'POST',
          headers: {
            Host: '127.0.0.1:3000',
            Authorization: 'Bearer wrong-token',
          },
        }),
      );
      assert.ok(wrong);
      assert.strictEqual(wrong.status, 401);

      const valid = gate(
        new Request('http://127.0.0.1:3000/mcp', {
          method: 'POST',
          headers: {
            Host: '127.0.0.1:3000',
            Authorization: 'Bearer top-secret-token',
          },
        }),
      );
      assert.strictEqual(valid, undefined);
    });
  });

  describe('HTTP disclaimers', () => {
    it('logs roots restriction notice in HTTP mode when using default roots', () => {
      const errorStub = sinon.stub(console, 'error');
      const args = createMockParsedArguments({
        transport: 'http',
        host: '127.0.0.1',
        usageStatistics: false,
        performanceCrux: false,
      });

      logDisclaimers(args);

      const messages = errorStub.args.map(call => String(call[0]));
      assert.ok(
        messages.some(msg => msg.includes('Stateless HTTP transport')),
        `Expected HTTP roots notice, got: ${messages.join('\n')}`,
      );
      assert.strictEqual(
        messages.some(msg => msg.includes('non-loopback')),
        false,
      );
    });

    it('omits HTTP roots notice when workspace is set or transport is stdio', () => {
      const errorStub = sinon.stub(console, 'error');
      logDisclaimers(
        createMockParsedArguments({
          transport: 'http',
          host: '127.0.0.1',
          filesystemRoot: ['/tmp/custom-workspace'],
          usageStatistics: false,
          performanceCrux: false,
        }),
      );
      logDisclaimers(
        createMockParsedArguments({
          transport: 'stdio',
          usageStatistics: false,
          performanceCrux: false,
        }),
      );

      const messages = errorStub.args.map(call => String(call[0]));
      assert.strictEqual(
        messages.some(msg => msg.includes('Stateless HTTP transport')),
        false,
      );
    });

    it('warns loudly for unauthenticated non-loopback HTTP mode and stays quiet when token is set', () => {
      const errorStub = sinon.stub(console, 'error');
      logDisclaimers(
        createMockParsedArguments({
          transport: 'http',
          host: '192.168.1.50',
          allowUnauthenticatedHttp: true,
          usageStatistics: false,
          performanceCrux: false,
        }),
      );
      const unauthMessages = errorStub.args.map(call => String(call[0]));
      assert.ok(
        unauthMessages.some(
          msg => msg.includes('non-loopback') && msg.includes('192.168.1.50'),
        ),
      );

      errorStub.resetHistory();
      logDisclaimers(
        createMockParsedArguments({
          transport: 'http',
          host: '192.168.1.50',
          httpToken: 'do-not-log-this-token',
          usageStatistics: false,
          performanceCrux: false,
        }),
      );
      const authMessages = errorStub.args.map(call => String(call[0]));
      assert.strictEqual(
        authMessages.some(msg => msg.includes('non-loopback')),
        false,
      );
      assert.strictEqual(
        authMessages.some(msg => msg.includes('do-not-log-this-token')),
        false,
      );
    });
  });
});
