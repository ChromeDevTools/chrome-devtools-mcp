/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  getOneBrowserExecutableCandidates,
  resolveOneBrowserExecutablePath,
  resolveOneBrowserUserDataDir,
} from '../src/browser-executable.js';

describe('1Browser executable resolution', () => {
  it('uses ONEBROWSER_PATH before platform defaults', () => {
    const executablePath = resolveOneBrowserExecutablePath({
      platform: 'linux',
      env: {
        ONEBROWSER_PATH: '/custom/1browser',
        PATH: '/usr/bin',
      },
      homeDir: '/home/test',
      isExecutable: candidate => {
        return candidate === '/custom/1browser';
      },
    });

    assert.strictEqual(executablePath, '/custom/1browser');
  });

  it('rejects an invalid ONEBROWSER_PATH without silently falling back', () => {
    assert.throws(() => {
      resolveOneBrowserExecutablePath({
        platform: 'linux',
        env: {
          ONEBROWSER_PATH: '/missing/1browser',
          PATH: '/usr/bin',
        },
        homeDir: '/home/test',
        isExecutable: candidate => {
          return candidate === '/usr/bin/1browser';
        },
      });
    }, /ONEBROWSER_PATH points to \/missing\/1browser/);
  });

  it('checks the system and user Applications directories on macOS', () => {
    assert.deepStrictEqual(
      getOneBrowserExecutableCandidates('darwin', {}, '/Users/test'),
      [
        '/Applications/1Browser.app/Contents/MacOS/1Browser',
        '/Users/test/Applications/1Browser.app/Contents/MacOS/1Browser',
      ],
    );
  });

  it('searches PATH and common installation directories on Linux', () => {
    assert.deepStrictEqual(
      getOneBrowserExecutableCandidates(
        'linux',
        {PATH: '/custom/bin:/usr/bin'},
        '/home/test',
      ),
      [
        '/custom/bin/1browser',
        '/usr/bin/1browser',
        '/usr/local/bin/1browser',
        '/opt/1browser/1browser',
      ],
    );
  });

  it('checks 64-bit, 32-bit and per-user locations on Windows', () => {
    assert.deepStrictEqual(
      getOneBrowserExecutableCandidates(
        'win32',
        {
          PROGRAMFILES: 'C:\\Program Files',
          PROGRAMW6432: 'C:\\Program Files',
          'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
          LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
        },
        'C:\\Users\\test',
      ),
      [
        'C:\\Program Files\\1Browser\\1Browser\\Application\\1browser.exe',
        'C:\\Program Files (x86)\\1Browser\\1Browser\\Application\\1browser.exe',
        'C:\\Users\\test\\AppData\\Local\\1Browser\\1Browser\\Application\\1browser.exe',
      ],
    );
  });

  it('reports every attempted path when no executable is found', () => {
    assert.throws(
      () => {
        resolveOneBrowserExecutablePath({
          platform: 'darwin',
          env: {},
          homeDir: '/Users/test',
          isExecutable: () => {
            return false;
          },
        });
      },
      error => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /\/Applications\/1Browser\.app/);
        assert.match(
          error.message,
          /\/Users\/test\/Applications\/1Browser\.app/,
        );
        assert.match(error.message, /ONEBROWSER_PATH/);
        assert.match(error.message, /--executable-path/);
        return true;
      },
    );
  });

  it('resolves the default 1Browser user data directory on macOS', () => {
    assert.strictEqual(
      resolveOneBrowserUserDataDir({
        platform: 'darwin',
        env: {},
        homeDir: '/Users/test',
      }),
      '/Users/test/Library/Application Support/1browser',
    );
  });

  it('respects XDG_CONFIG_HOME on Linux', () => {
    assert.strictEqual(
      resolveOneBrowserUserDataDir({
        platform: 'linux',
        env: {XDG_CONFIG_HOME: '/custom/config'},
        homeDir: '/home/test',
      }),
      '/custom/config/1browser',
    );
  });

  it('resolves the per-user 1Browser data directory on Windows', () => {
    assert.strictEqual(
      resolveOneBrowserUserDataDir({
        platform: 'win32',
        env: {LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local'},
        homeDir: 'C:\\Users\\test',
      }),
      'C:\\Users\\test\\AppData\\Local\\1browser\\1browser\\User Data',
    );
  });
});
