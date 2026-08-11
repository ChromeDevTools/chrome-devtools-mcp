/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {afterEach, beforeEach, describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {
  serializeArgs,
  assertValidSessionId,
  getSocketPath,
  getRuntimeHome,
  getPidFilePath,
  getDaemonPid,
  isDaemonRunning,
  IS_WINDOWS,
} from '../../src/daemon/utils.js';
import type {YargsOptions} from '../../src/third_party/index.js';

const APP_NAME = 'chrome-devtools-mcp';
const SESSION_ID = 'aabbccdd-1122-3344-5566-77889900aabb';

describe('assertValidSessionId', () => {
  it('should not throw for empty sessionId', () => {
    assert.doesNotThrow(() => assertValidSessionId(''));
  });

  it('should not throw for valid UUID', () => {
    assert.doesNotThrow(() =>
      assertValidSessionId('123e4567-e89b-12d3-a456-426614174000'),
    );
    assert.doesNotThrow(() =>
      assertValidSessionId('aabbccdd-1122-3344-5566-77889900aabb'),
    );
  });

  it('should throw for invalid sessionId formats', () => {
    assert.throws(
      () => assertValidSessionId('../../../etc/passwd'),
      /Invalid sessionId/,
    );
    assert.throws(
      () => assertValidSessionId('sessionId_with_underscore'),
      /Invalid sessionId/,
    );
    assert.throws(
      () => assertValidSessionId('session@id'),
      /Invalid sessionId/,
    );
  });
});

describe('serializeArgs', () => {
  it('should ignore undefined or null values', () => {
    const options: Record<string, YargsOptions> = {
      foo: {},
      bar: {},
      baz: {},
    };
    const argv = {
      foo: undefined,
      bar: null,
      baz: 'value',
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, ['--baz=value']);
  });

  it('should handle boolean values', () => {
    const options: Record<string, YargsOptions> = {foo: {}, bar: {}};
    const argv = {
      foo: true,
      bar: false,
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, ['--foo', '--no-bar']);
  });

  it('should handle array values including hyphenated flags', () => {
    const options: Record<string, YargsOptions> = {foo: {}, chromeArg: {}};
    const argv = {
      foo: ['val1', 'val2'],
      chromeArg: [
        '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=/tmp/test.wav',
      ],
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, [
      '--foo=val1',
      '--foo=val2',
      '--chrome-arg=--use-fake-device-for-media-stream',
      '--chrome-arg=--use-file-for-fake-audio-capture=/tmp/test.wav',
    ]);
  });

  it('should handle primitive values', () => {
    const options: Record<string, YargsOptions> = {foo: {}, bar: {}};
    const argv = {
      foo: 'string',
      bar: 42,
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, ['--foo=string', '--bar=42']);
  });

  it('should convert camelCase keys to kebab-case', () => {
    const options: Record<string, YargsOptions> = {
      camelCaseKey: {},
      anotherKey: {},
    };
    const argv = {
      camelCaseKey: 'value1',
      anotherKey: true,
      _: [],
      $0: 'test',
    } as unknown as ParsedArguments;
    const result = serializeArgs(options, argv);
    assert.deepStrictEqual(result, [
      '--camel-case-key=value1',
      '--another-key',
    ]);
  });
});

describe('getRuntimeHome', () => {
  let savedXdgRuntimeDir: string | undefined;

  beforeEach(() => {
    savedXdgRuntimeDir = process.env['XDG_RUNTIME_DIR'];
  });

  afterEach(() => {
    if (savedXdgRuntimeDir === undefined) {
      delete process.env['XDG_RUNTIME_DIR'];
    } else {
      process.env['XDG_RUNTIME_DIR'] = savedXdgRuntimeDir;
    }
  });

  it('uses XDG_RUNTIME_DIR when set', () => {
    const xdgDir = path.join(os.tmpdir(), 'xdg-test');
    process.env['XDG_RUNTIME_DIR'] = xdgDir;
    assert.strictEqual(getRuntimeHome(''), path.join(xdgDir, APP_NAME));
    assert.strictEqual(
      getRuntimeHome(SESSION_ID),
      path.join(xdgDir, `${APP_NAME}-${SESSION_ID}`),
    );
  });

  it(
    'falls back to /tmp with the uid when XDG_RUNTIME_DIR is unset',
    {skip: IS_WINDOWS},
    () => {
      delete process.env['XDG_RUNTIME_DIR'];
      const uid = os.userInfo().uid;
      assert.strictEqual(getRuntimeHome(''), `/tmp/${APP_NAME}-${uid}`);
      assert.strictEqual(
        getRuntimeHome(SESSION_ID),
        `/tmp/${APP_NAME}-${SESSION_ID}-${uid}`,
      );
    },
  );

  it(
    'falls back to os.tmpdir() on Windows when XDG_RUNTIME_DIR is unset',
    {skip: !IS_WINDOWS},
    () => {
      delete process.env['XDG_RUNTIME_DIR'];
      assert.strictEqual(getRuntimeHome(''), path.join(os.tmpdir(), APP_NAME));
    },
  );

  it('throws for invalid session ids', () => {
    assert.throws(() => getRuntimeHome('../escape'), /Invalid sessionId/);
  });
});

describe('getSocketPath', () => {
  let savedXdgRuntimeDir: string | undefined;

  beforeEach(() => {
    savedXdgRuntimeDir = process.env['XDG_RUNTIME_DIR'];
  });

  afterEach(() => {
    if (savedXdgRuntimeDir === undefined) {
      delete process.env['XDG_RUNTIME_DIR'];
    } else {
      process.env['XDG_RUNTIME_DIR'] = savedXdgRuntimeDir;
    }
  });

  it('uses XDG_RUNTIME_DIR when set', {skip: IS_WINDOWS}, () => {
    const xdgDir = path.join(os.tmpdir(), 'xdg-test');
    process.env['XDG_RUNTIME_DIR'] = xdgDir;
    assert.strictEqual(
      getSocketPath(''),
      path.join(xdgDir, APP_NAME, 'server.sock'),
    );
    assert.strictEqual(
      getSocketPath(SESSION_ID),
      path.join(xdgDir, `${APP_NAME}-${SESSION_ID}`, 'server.sock'),
    );
  });

  it(
    'falls back to a /tmp socket with the uid when XDG_RUNTIME_DIR is unset',
    {skip: IS_WINDOWS},
    () => {
      delete process.env['XDG_RUNTIME_DIR'];
      const uid = os.userInfo().uid;
      assert.strictEqual(getSocketPath(''), `/tmp/${APP_NAME}-${uid}.sock`);
      assert.strictEqual(
        getSocketPath(SESSION_ID),
        `/tmp/${APP_NAME}-${SESSION_ID}-${uid}.sock`,
      );
    },
  );

  it(
    'stays under the POSIX socket path length limit for UUID session ids',
    {skip: IS_WINDOWS},
    () => {
      delete process.env['XDG_RUNTIME_DIR'];
      // macOS limits sun_path to 104 characters.
      assert.ok(getSocketPath(SESSION_ID).length < 104);
    },
  );

  it('uses a named pipe on Windows', {skip: !IS_WINDOWS}, () => {
    const socketPath = getSocketPath(SESSION_ID);
    assert.ok(socketPath.startsWith('\\\\.\\pipe\\'));
    assert.ok(socketPath.includes(SESSION_ID));
    // The username is appended to prevent cross-user pipe squatting.
    assert.ok(socketPath.includes(os.userInfo().username));
  });

  it('throws for invalid session ids', () => {
    assert.throws(() => getSocketPath('../escape'), /Invalid sessionId/);
  });
});

describe('getPidFilePath', () => {
  it('is daemon.pid inside the runtime home', () => {
    assert.strictEqual(
      getPidFilePath(SESSION_ID),
      path.join(getRuntimeHome(SESSION_ID), 'daemon.pid'),
    );
    assert.strictEqual(path.basename(getPidFilePath('')), 'daemon.pid');
  });

  it('throws for invalid session ids', () => {
    assert.throws(() => getPidFilePath('../escape'), /Invalid sessionId/);
  });
});

describe('daemon pid handling', () => {
  let savedXdgRuntimeDir: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    savedXdgRuntimeDir = process.env['XDG_RUNTIME_DIR'];
    // Point XDG_RUNTIME_DIR at a temp dir so the pid file paths used by
    // getDaemonPid/isDaemonRunning are isolated from any real daemon.
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-daemon-utils-test-'));
    process.env['XDG_RUNTIME_DIR'] = tempDir;
  });

  afterEach(() => {
    if (savedXdgRuntimeDir === undefined) {
      delete process.env['XDG_RUNTIME_DIR'];
    } else {
      process.env['XDG_RUNTIME_DIR'] = savedXdgRuntimeDir;
    }
    fs.rmSync(tempDir, {recursive: true, force: true});
  });

  function writePidFile(sessionId: string, contents: string): void {
    const pidFile = getPidFilePath(sessionId);
    fs.mkdirSync(path.dirname(pidFile), {recursive: true});
    fs.writeFileSync(pidFile, contents);
  }

  describe('getDaemonPid', () => {
    it('returns null when no pid file exists', () => {
      assert.strictEqual(getDaemonPid(SESSION_ID), null);
    });

    it('reads the pid from the pid file, ignoring whitespace', () => {
      writePidFile(SESSION_ID, '12345\n');
      assert.strictEqual(getDaemonPid(SESSION_ID), 12345);
    });

    it('is scoped per session id', () => {
      writePidFile(SESSION_ID, '12345\n');
      assert.strictEqual(getDaemonPid('00000000-0000'), null);
    });

    it('returns null for empty or non-numeric pid files', () => {
      writePidFile(SESSION_ID, '');
      assert.strictEqual(getDaemonPid(SESSION_ID), null);
      writePidFile(SESSION_ID, 'not-a-pid');
      assert.strictEqual(getDaemonPid(SESSION_ID), null);
    });

    it('parses the leading integer of malformed contents', () => {
      // Documents current parseInt-based behavior.
      writePidFile(SESSION_ID, '123abc');
      assert.strictEqual(getDaemonPid(SESSION_ID), 123);
    });
  });

  describe('isDaemonRunning', () => {
    it('returns false when no pid file exists', () => {
      assert.strictEqual(isDaemonRunning(SESSION_ID), false);
    });

    it('returns true when the pid file points to a live process', () => {
      writePidFile(SESSION_ID, `${process.pid}\n`);
      assert.strictEqual(isDaemonRunning(SESSION_ID), true);
    });

    it('returns false when the pid file points to a dead process', async () => {
      const child = spawn(process.execPath, ['--version'], {stdio: 'ignore'});
      await once(child, 'exit');
      assert.ok(child.pid);
      // In theory the OS could reuse the pid between the child exiting and
      // this check, but pid reuse within milliseconds is practically
      // impossible on all supported platforms.
      writePidFile(SESSION_ID, `${child.pid}\n`);
      assert.strictEqual(isDaemonRunning(SESSION_ID), false);
    });

    it('returns false when the pid file contains 0', () => {
      // Important: signaling pid 0 would target the whole process group, so
      // isDaemonRunning must not treat it as a live daemon.
      writePidFile(SESSION_ID, '0');
      assert.strictEqual(isDaemonRunning(SESSION_ID), false);
    });

    it('returns false for non-numeric pid files', () => {
      writePidFile(SESSION_ID, 'garbage');
      assert.strictEqual(isDaemonRunning(SESSION_ID), false);
    });
  });
});
