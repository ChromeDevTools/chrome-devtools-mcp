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
  validateAuthHelperCommand,
} from '../../src/utils/authHelper.js';
import {createMockBrowserContext} from '../mocks.js';

describe('authHelper', () => {
  describe('validateAuthHelperCommand', () => {
    it('throws when command is empty or whitespace only', () => {
      assert.throws(() => validateAuthHelperCommand(''), {
        message: '--auth-helper command must not be empty.',
      });
      assert.throws(() => validateAuthHelperCommand('   '), {
        message: '--auth-helper command must not be empty.',
      });
    });

    it('throws when required placeholders are missing', () => {
      assert.throws(() => validateAuthHelperCommand('helper --url {url}'), {
        message:
          '--auth-helper command must include {cookieJar} and ' +
          '{url} placeholders.',
      });
      assert.throws(
        () => validateAuthHelperCommand('helper --jar {cookieJar}'),
        {
          message:
            '--auth-helper command must include {cookieJar} and ' +
            '{url} placeholders.',
        },
      );
    });

    it('returns trimmed command string for valid command', () => {
      const validated = validateAuthHelperCommand(
        '  my-auth-helper -jar {cookieJar} -url {url}  ',
      );
      assert.strictEqual(
        validated,
        'my-auth-helper -jar {cookieJar} -url {url}',
      );
    });
  });

  describe('buildAuthHelperArgs', () => {
    it('substitutes placeholders', () => {
      const result = buildAuthHelperArgs(
        'my-helper --jar {cookieJar} --target {url}',
        '/tmp/cookies.json',
        'https://example.com/login',
      );
      assert.strictEqual(result.executable, 'my-helper');
      assert.deepStrictEqual(result.args, [
        '--jar',
        '/tmp/cookies.json',
        '--target',
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
      const rawJar = JSON.stringify([
        {
          URL: 'https://internal.example.com/',
          Cookies: [
            {
              Name: 'SESSION',
              Value: 'secret123',
              Domain: 'example.com',
              Path: '/app',
              Secure: true,
              HttpOnly: true,
            },
            {
              Name: 'HOST_ONLY',
              Value: 'secret456',
              Domain: '',
              Path: '/',
              Secure: true,
              HttpOnly: true,
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

      const secondCookie = cookies[1];
      assert.ok(secondCookie);
      assert.strictEqual(secondCookie.name, 'HOST_ONLY');
      assert.strictEqual(secondCookie.value, 'secret456');
      assert.strictEqual(secondCookie.domain, 'internal.example.com');
      assert.strictEqual(secondCookie.path, '/');
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
        authHelperCommand: 'helper {cookieJar} {url}',
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
        authHelperCommand: 'helper {cookieJar} {url}',
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
          const jarIndex = args.indexOf('--jar');
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
        authHelperCommand: 'helper --jar {cookieJar} --target {url}',
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
          const jarIndex = args.indexOf('--jar');
          const jarPath = args[jarIndex + 1];
          if (jarPath) {
            await fs.promises.writeFile(jarPath, '[]', 'utf8');
          }
          return {stdout: '', stderr: ''};
        });

      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/first',
        authHelperCommand: 'helper --jar {cookieJar} --target {url}',
        execFileAsync: execStub,
      });

      // Second navigation to same origin on same context uses cache.
      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/second',
        authHelperCommand: 'helper --jar {cookieJar} --target {url}',
        execFileAsync: execStub,
      });

      sinon.assert.calledOnce(execStub);

      // Navigation to different origin calls helper again.
      await authenticateBrowserContext({
        browserContext,
        url: 'https://other.example.com/third',
        authHelperCommand: 'helper --jar {cookieJar} --target {url}',
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
        authHelperCommand: 'helper --jar {cookieJar} --target {url}',
        execFileAsync: execStub,
      });

      sinon.assert.notCalled(browserContext.setCookie);
      sinon.assert.calledOnce(execStub);

      // Subsequent call should retry since the failure removed the cache entry.
      await authenticateBrowserContext({
        browserContext,
        url: 'https://example.com/login',
        authHelperCommand: 'helper --jar {cookieJar} --target {url}',
        execFileAsync: execStub,
      });

      sinon.assert.calledTwice(execStub);
    });
  });
});
