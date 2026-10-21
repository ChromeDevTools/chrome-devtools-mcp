/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {describe, it} from 'node:test';
import sinon from 'sinon';

import {
  authenticateBrowserContext,
  buildAuthHelperArgs,
  parseCookieJar,
  tokenizeCommand,
  validateAuthHelperCommand,
} from '../../src/utils/authHelper.js';
import {createMockBrowserContext} from '../mocks.js';

describe('authHelper', () => {
  describe('tokenizeCommand', () => {
    it('splits simple space-separated arguments', () => {
      const tokens = tokenizeCommand('helper --flag value');
      assert.deepStrictEqual(tokens, ['helper', '--flag', 'value']);
    });

    it('handles single-quoted arguments with spaces', () => {
      const tokens = tokenizeCommand("helper --flag 'hello world'");
      assert.deepStrictEqual(tokens, ['helper', '--flag', 'hello world']);
    });

    it('handles double-quoted arguments with spaces', () => {
      const tokens = tokenizeCommand('helper --flag "hello world"');
      assert.deepStrictEqual(tokens, ['helper', '--flag', 'hello world']);
    });

    it('handles escaped quotes and backslashes inside double quotes', () => {
      const tokens = tokenizeCommand('helper "escaped \\"quote\\""');
      assert.deepStrictEqual(tokens, ['helper', 'escaped "quote"']);
    });

    it('handles backslash escaped spaces outside quotes', () => {
      const tokens = tokenizeCommand('helper escaped\\ space arg2');
      assert.deepStrictEqual(tokens, ['helper', 'escaped space', 'arg2']);
    });

    it('throws when single quote is unclosed', () => {
      assert.throws(() => tokenizeCommand("helper 'unclosed"), {
        message: 'Invalid --auth-helper command: unclosed quote.',
      });
    });

    it('throws when double quote is unclosed', () => {
      assert.throws(() => tokenizeCommand('helper "unclosed'), {
        message: 'Invalid --auth-helper command: unclosed quote.',
      });
    });

    it('throws when trailing backslash exists', () => {
      assert.throws(() => tokenizeCommand('helper \\'), {
        message: 'Invalid --auth-helper command: trailing backslash.',
      });
    });
  });

  describe('validateAuthHelperCommand', () => {
    it('throws when command is empty or whitespace only', () => {
      assert.throws(() => validateAuthHelperCommand(''), {
        message: '--auth-helper command must not be empty.',
      });
      assert.throws(() => validateAuthHelperCommand('   '), {
        message: '--auth-helper command must not be empty.',
      });
    });

    it('returns trimmed command string for valid command', () => {
      const validated = validateAuthHelperCommand('  my-auth-helper --flag  ');
      assert.strictEqual(validated, 'my-auth-helper --flag');
    });
  });

  describe('buildAuthHelperArgs', () => {
    it('appends default flags when placeholders are not present', () => {
      const result = buildAuthHelperArgs(
        'my-helper --custom-arg',
        '/tmp/cookies.json',
        'https://example.com/login',
      );
      assert.strictEqual(result.executable, 'my-helper');
      assert.deepStrictEqual(result.args, [
        '--custom-arg',
        '-cookie-jar',
        '/tmp/cookies.json',
        '-url',
        'https://example.com/login',
      ]);
    });

    it('substitutes placeholders when present', () => {
      const result = buildAuthHelperArgs(
        'my-helper --jar={cookieJar} --target={url}',
        '/tmp/cookies.json',
        'https://example.com/login',
      );
      assert.strictEqual(result.executable, 'my-helper');
      assert.deepStrictEqual(result.args, [
        '--jar=/tmp/cookies.json',
        '--target=https://example.com/login',
      ]);
    });

    it('appends missing flag when only one placeholder is present', () => {
      const result = buildAuthHelperArgs(
        'my-helper --jar={cookieJar}',
        '/tmp/cookies.json',
        'https://example.com/login',
      );
      assert.strictEqual(result.executable, 'my-helper');
      assert.deepStrictEqual(result.args, [
        '--jar=/tmp/cookies.json',
        '-url',
        'https://example.com/login',
      ]);
    });
  });

  describe('parseCookieJar', () => {
    it('returns empty array for empty or invalid input', () => {
      assert.deepStrictEqual(parseCookieJar(''), []);
      assert.deepStrictEqual(parseCookieJar('   '), []);
      assert.deepStrictEqual(parseCookieJar('not json'), []);
      assert.deepStrictEqual(parseCookieJar('{}'), []);
    });

    it('parses url-keyed cookie jar entries', () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const rawJar = JSON.stringify([
        {
          URL: 'https://internal.example.com/',
          Cookies: [
            {
              Name: 'SESSION',
              Value: 'secret123',
              Domain: 'example.com',
              Path: '/app',
              Expires: futureDate,
              MaxAge: 3600,
              Secure: true,
              HttpOnly: true,
              SameSite: 2,
            },
            {
              Name: 'HOST_ONLY',
              Value: 'secret456',
              Domain: '',
              Path: '/',
              Expires: '0001-01-01T00:00:00Z',
              Secure: true,
              HttpOnly: true,
              SameSite: 3,
            },
          ],
        },
      ]);

      const cookies = parseCookieJar(rawJar);
      assert.strictEqual(cookies.length, 2);

      const firstCookie = cookies[0];
      assert.ok(firstCookie);
      assert.strictEqual(firstCookie.name, 'SESSION');
      assert.strictEqual(firstCookie.value, 'secret123');
      assert.strictEqual(firstCookie.domain, 'example.com');
      assert.strictEqual(firstCookie.path, '/app');
      assert.strictEqual(firstCookie.secure, true);
      assert.strictEqual(firstCookie.httpOnly, true);
      assert.strictEqual(firstCookie.sameSite, 'Lax');
      assert.ok(typeof firstCookie.expires === 'number');

      const secondCookie = cookies[1];
      assert.ok(secondCookie);
      assert.strictEqual(secondCookie.name, 'HOST_ONLY');
      assert.strictEqual(secondCookie.value, 'secret456');
      assert.strictEqual(secondCookie.domain, 'internal.example.com');
      assert.strictEqual(secondCookie.path, '/');
      assert.strictEqual(secondCookie.sameSite, 'Strict');
      assert.strictEqual(secondCookie.expires, undefined);
    });

    it('skips expired cookies and cookies with negative MaxAge', () => {
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
      const rawJar = JSON.stringify([
        {
          URL: 'https://internal.example.com/',
          Cookies: [
            {
              Name: 'EXPIRED',
              Value: 'val',
              Domain: 'example.com',
              Expires: pastDate,
            },
            {
              Name: 'NEGATIVE_MAX_AGE',
              Value: 'val',
              Domain: 'example.com',
              MaxAge: -1,
            },
          ],
        },
      ]);

      const cookies = parseCookieJar(rawJar);
      assert.deepStrictEqual(cookies, []);
    });

    it('parses flat cookie entries', () => {
      const rawJar = JSON.stringify([
        {
          name: 'AUTH',
          value: 'token789',
          domain: 'example.com',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);

      const cookies = parseCookieJar(rawJar);
      assert.strictEqual(cookies.length, 1);
      const cookie = cookies[0];
      assert.ok(cookie);
      assert.strictEqual(cookie.name, 'AUTH');
      assert.strictEqual(cookie.value, 'token789');
      assert.strictEqual(cookie.domain, 'example.com');
      assert.strictEqual(cookie.sameSite, 'Lax');
    });
  });

  describe('authenticateBrowserContext', () => {
    it('does nothing when authHelperCommand is undefined', async () => {
      const browserContext = createMockBrowserContext();
      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/dashboard',
        authHelperCommand: undefined,
      });
      sinon.assert.notCalled(browserContext.setCookie);
    });

    it('skips localhost and loopback urls', async () => {
      const browserContext = createMockBrowserContext();
      const execStub = sinon.stub().resolves({stdout: '', stderr: ''});
      await authenticateBrowserContext({
        browserContext,
        url: 'http://localhost:8080/dashboard',
        authHelperCommand: 'helper',
        execFileAsync: execStub,
      });
      sinon.assert.notCalled(execStub);
      sinon.assert.notCalled(browserContext.setCookie);
    });

    it('skips non-http/https urls', async () => {
      const browserContext = createMockBrowserContext();
      const execStub = sinon.stub().resolves({stdout: '', stderr: ''});
      await authenticateBrowserContext({
        browserContext,
        url: 'about:blank',
        authHelperCommand: 'helper',
        execFileAsync: execStub,
      });
      sinon.assert.notCalled(execStub);
      sinon.assert.notCalled(browserContext.setCookie);
    });

    it('executes helper and sets cookies on browser context', async () => {
      const browserContext = createMockBrowserContext();
      const execStub = sinon
        .stub()
        .callsFake(async (_file: string, args: string[]) => {
          const jarIndex = args.indexOf('-cookie-jar');
          assert.notStrictEqual(jarIndex, -1);
          const jarPath = args[jarIndex + 1];
          assert.ok(jarPath);
          await fs.promises.writeFile(
            jarPath,
            JSON.stringify([
              {
                URL: 'https://example.com/',
                Cookies: [
                  {
                    Name: 'SESSION',
                    Value: 'test-session',
                    Domain: 'example.com',
                    Path: '/',
                  },
                ],
              },
            ]),
            'utf8',
          );
          return {stdout: '', stderr: ''};
        });

      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/app',
        authHelperCommand: 'helper --custom',
        execFileAsync: execStub,
      });

      sinon.assert.calledOnce(browserContext.setCookie);
      const setCookieArg = browserContext.setCookie.firstCall.args[0];
      assert.ok(setCookieArg);
      assert.strictEqual(setCookieArg.name, 'SESSION');
      assert.strictEqual(setCookieArg.value, 'test-session');
      assert.strictEqual(setCookieArg.domain, 'example.com');
    });

    it('caches per host per browser context', async () => {
      const browserContext = createMockBrowserContext();
      const execStub = sinon
        .stub()
        .callsFake(async (_file: string, args: string[]) => {
          const jarIndex = args.indexOf('-cookie-jar');
          const jarPath = args[jarIndex + 1];
          if (jarPath) {
            await fs.promises.writeFile(jarPath, '[]', 'utf8');
          }
          return {stdout: '', stderr: ''};
        });

      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/first',
        authHelperCommand: 'helper',
        execFileAsync: execStub,
      });

      // Second navigation to same origin on same context uses cache.
      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/second',
        authHelperCommand: 'helper',
        execFileAsync: execStub,
      });

      sinon.assert.calledOnce(execStub);

      // Navigation to different origin calls helper again.
      await authenticateBrowserContext({
        browserContext,
        url: 'https://other.example.com/third',
        authHelperCommand: 'helper',
        execFileAsync: execStub,
      });

      sinon.assert.calledTwice(execStub);
    });

    it('falls back gracefully on helper failure and allows retry', async () => {
      const browserContext = createMockBrowserContext();
      const execStub = sinon
        .stub()
        .rejects(new Error('Authentication failed.'));

      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/login',
        authHelperCommand: 'helper',
        execFileAsync: execStub,
      });

      sinon.assert.notCalled(browserContext.setCookie);
      sinon.assert.calledOnce(execStub);

      // Subsequent call should retry since the failure removed the cache entry.
      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/login',
        authHelperCommand: 'helper',
        execFileAsync: execStub,
      });

      sinon.assert.calledTwice(execStub);
    });
  });
});
