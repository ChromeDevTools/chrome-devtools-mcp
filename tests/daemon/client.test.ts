/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import childProcess, {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs, {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import net from 'node:net';
import {dirname} from 'node:path';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {
  sendCommand,
  handleResponse,
  startDaemon,
  stopDaemon,
  verifyDaemonVersion,
} from '../../src/daemon/client.js';
import {
  DAEMON_SCRIPT_PATH,
  getDaemonPid,
  getPidFilePath,
  isDaemonRunning,
} from '../../src/daemon/utils.js';
import {VERSION} from '../../src/version.js';

describe('daemon client', () => {
  let sessionId: string;

  beforeEach(async () => {
    sessionId = crypto.randomUUID();
    await stopDaemon(sessionId);
  });

  afterEach(async () => {
    await stopDaemon(sessionId);
  });

  describe('start/stop', () => {
    it('should start and stop daemon', async () => {
      assert.ok(
        !isDaemonRunning(sessionId),
        'Daemon should not be running initially',
      );

      await startDaemon([], sessionId);
      assert.ok(
        isDaemonRunning(sessionId),
        'Daemon should be running after start',
      );

      await stopDaemon(sessionId);
      assert.ok(
        !isDaemonRunning(sessionId),
        'Daemon should not be running after stop',
      );
    });

    it('should handle starting daemon when already running', async () => {
      await startDaemon([], sessionId);
      assert.ok(isDaemonRunning(sessionId), 'Daemon should be running');

      // Starting again should be a no-op
      await startDaemon([], sessionId);
      assert.ok(isDaemonRunning(sessionId), 'Daemon should still be running');
    });

    it('should handle stopping daemon when not running', async () => {
      assert.ok(
        !isDaemonRunning(sessionId),
        'Daemon should not be running initially',
      );

      // Stopping when not running should be a no-op
      await stopDaemon(sessionId);
      assert.ok(
        !isDaemonRunning(sessionId),
        'Daemon should still not be running',
      );
    });

    it('should stop and allow restarting a daemon when its socket is unreachable', async () => {
      const child = spawn(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)', DAEMON_SCRIPT_PATH],
        {
          stdio: 'ignore',
        },
      );
      child.unref();
      assert.ok(child.pid, 'Child process should have a PID');

      try {
        const pidFilePath = getPidFilePath(sessionId);
        mkdirSync(dirname(pidFilePath), {recursive: true, mode: 0o700});
        writeFileSync(pidFilePath, String(child.pid), 'utf-8');
        assert.ok(
          isDaemonRunning(sessionId),
          'Daemon should be detected as running via PID file',
        );

        await stopDaemon(sessionId);
        assert.ok(
          !isDaemonRunning(sessionId),
          'Unreachable daemon should be stopped via signal fallback',
        );

        await startDaemon([], sessionId);
        assert.ok(
          isDaemonRunning(sessionId),
          'New daemon should start after stopping unreachable daemon',
        );
        assert.notStrictEqual(getDaemonPid(sessionId), child.pid);
      } finally {
        child.kill();
      }
    });

    it('should not signal an unrelated process when its PID is in the PID file', async () => {
      const child = spawn(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        {
          stdio: 'ignore',
        },
      );
      child.unref();
      const childPid = child.pid;
      assert.ok(childPid, 'Child process should have a PID');

      try {
        const pidFilePath = getPidFilePath(sessionId);
        mkdirSync(dirname(pidFilePath), {recursive: true, mode: 0o700});
        writeFileSync(pidFilePath, String(childPid), 'utf-8');

        await stopDaemon(sessionId);
        assert.doesNotThrow(
          () => process.kill(childPid, 0),
          'stopDaemon must not kill the unrelated process',
        );

        await startDaemon([], sessionId);
        assert.ok(
          isDaemonRunning(sessionId),
          'New daemon should start when PID file points to an unrelated process',
        );
        assert.notStrictEqual(getDaemonPid(sessionId), childPid);
        assert.doesNotThrow(
          () => process.kill(childPid, 0),
          'startDaemon must not kill the unrelated process',
        );
      } finally {
        child.kill();
      }
    });
  });

  describe('verifyDaemonVersion', () => {
    it('warns when daemon version does not match CLI version', async () => {
      await startDaemon([], sessionId);
      const warning = await verifyDaemonVersion(sessionId, '0.0.0-mismatch');
      assert.ok(
        warning &&
          warning.includes('does not match CLI version (0.0.0-mismatch)'),
        `Expected warning message about version mismatch, got: ${warning}`,
      );
    });

    it('does not warn when daemon version matches CLI version', async () => {
      await startDaemon([], sessionId);
      const warning = await verifyDaemonVersion(sessionId, VERSION);
      assert.strictEqual(
        warning,
        undefined,
        'Should not return warning when version matches',
      );
    });

    it('does nothing when daemon is not running', async () => {
      const warning = await verifyDaemonVersion(sessionId, '0.0.0-mismatch');
      assert.strictEqual(
        warning,
        undefined,
        'Should not return warning when daemon is stopped',
      );
    });
  });

  describe('parsing', () => {
    it('handles MCP response with text format', async () => {
      const textResponse = {content: [{type: 'text' as const, text: 'test'}]};
      assert.strictEqual(await handleResponse(textResponse, 'md'), 'test');
    });

    it('handles JSON response', async () => {
      const jsonResponse = {
        content: [],
        structuredContent: {
          test: 'data',
          number: 123,
        },
      };
      assert.strictEqual(
        await handleResponse(jsonResponse, 'json'),
        JSON.stringify(jsonResponse.structuredContent),
      );
    });

    it('handles error response when isError is true with md format', async () => {
      const errorResponse = {
        isError: true,
        content: [{type: 'text' as const, text: 'Something went wrong'}],
      };
      assert.strictEqual(
        await handleResponse(errorResponse, 'md'),
        'Something went wrong',
      );
    });

    it('handles JSON response for performance_analyze_insight with traceInsight', async () => {
      const insightResponse = {
        structuredContent: {
          traceInsight: '## Insight Title: LCP breakdown',
        },
        content: [
          {
            type: 'text' as const,
            text: '## Insight Title: LCP breakdown',
          },
        ],
      };
      assert.strictEqual(
        await handleResponse(insightResponse, 'json'),
        JSON.stringify(insightResponse.structuredContent),
      );
    });

    it('handles error response when isError is true with json format', async () => {
      const errorResponse = {
        isError: true,
        content: [{type: 'text' as const, text: 'Something went wrong'}],
      };
      assert.strictEqual(
        await handleResponse(errorResponse, 'json'),
        JSON.stringify(errorResponse.content),
      );
    });

    it('handles text response when json format is requested but no structured content', async () => {
      const textResponse = {
        content: [{type: 'text' as const, text: 'Fall through text'}],
      };
      assert.deepStrictEqual(
        await handleResponse(textResponse, 'json'),
        JSON.stringify(['Fall through text']),
      );
    });

    it('supports images', async () => {
      const unsupportedContentResponse = {
        content: [
          {
            type: 'image' as const,
            data: 'base64data',
            mimeType: 'image/png',
          },
        ],
        structuredContent: {},
      };
      const response = await handleResponse(unsupportedContentResponse, 'md');
      assert.ok(response.includes('.png'));
    });

    it('includes saved image file paths in structured JSON responses', async () => {
      const imageContentResponse = {
        content: [
          {
            type: 'text' as const,
            text: 'Took a screenshot.',
          },
          {
            type: 'image' as const,
            data: Buffer.from('image data').toString('base64'),
            mimeType: 'image/png',
          },
        ],
        structuredContent: {
          message: 'Took a screenshot.',
        },
      };
      let filePath: string | undefined;
      try {
        const response = await handleResponse(imageContentResponse, 'json');
        const parsed = JSON.parse(response) as {
          message: string;
          images: Array<{filePath: string; mimeType: string}>;
        };
        assert.strictEqual(parsed.message, 'Took a screenshot.');
        assert.strictEqual(parsed.images.length, 1);
        assert.strictEqual(parsed.images[0].mimeType, 'image/png');
        filePath = parsed.images[0].filePath;
        assert.ok(filePath.endsWith('.png'));
        assert.ok(existsSync(filePath));
      } finally {
        if (filePath) {
          rmSync(dirname(filePath), {recursive: true, force: true});
        }
      }
    });

    it('uses the webp extension for WebP images', async () => {
      const webpContentResponse = {
        content: [
          {
            type: 'image' as const,
            data: 'base64data',
            mimeType: 'image/webp',
          },
        ],
        structuredContent: {},
      };
      const response = await handleResponse(webpContentResponse, 'md');
      assert.ok(response.includes('.webp'));
    });
  });
});

describe('daemon response deadline', () => {
  let socket: net.Socket;
  let destroy: sinon.SinonStub<Parameters<net.Socket['destroy']>, net.Socket>;

  beforeEach(() => {
    const pidFile = getPidFilePath('');
    sinon.stub(fs, 'existsSync').callThrough().withArgs(pidFile).returns(true);
    sinon
      .stub(fs, 'readFileSync')
      .callThrough()
      .withArgs(pidFile, 'utf-8')
      .returns(String(process.pid));
    sinon.stub(childProcess, 'execFileSync').returns(DAEMON_SCRIPT_PATH);
    socket = new net.Socket();
    sinon.stub(socket, 'write').returns(true);
    sinon.stub(socket, 'end').returns(socket);
    destroy = sinon.stub(socket, 'destroy').returns(socket);
    sinon.stub(net, 'createConnection').returns(socket);
  });

  it('receives a tool result after the default socket deadline', async () => {
    const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const result = sendCommand(
      {method: 'invoke_tool', tool: 'navigate_page', args: {timeout: 120_000}},
      '',
    );
    const expected = {success: true, result: 'loaded', error: null};
    const received = result.catch((error: unknown) => error);
    await clock.tickAsync(75_000);
    socket.emit('data', Buffer.from(JSON.stringify(expected) + '\0'));
    assert.deepStrictEqual(await received, expected);
  });

  it('still times out when a long-running tool never responds', async () => {
    const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const result = sendCommand(
      {method: 'invoke_tool', tool: 'wait_for', args: {timeout: 120_000}},
      '',
    );
    const assertion = assert.rejects(
      result,
      /Timeout waiting for daemon response/,
    );
    await clock.tickAsync(179_999);
    sinon.assert.notCalled(destroy);
    await clock.tickAsync(1);
    await assertion;
  });

  for (const timeout of [undefined, 0, -1, NaN, Infinity, '120000']) {
    it(`keeps a bounded default deadline for timeout ${timeout}`, async () => {
      const clock = sinon.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout'],
      });
      const result = sendCommand(
        {method: 'invoke_tool', tool: 'wait_for', args: {timeout}},
        '',
      );
      const assertion = assert.rejects(
        result,
        /Timeout waiting for daemon response/,
      );
      await clock.tickAsync(59_999);
      sinon.assert.notCalled(destroy);
      await clock.tickAsync(1);
      await assertion;
      sinon.assert.calledOnceWithExactly(destroy);
    });
  }

  it('does not overflow the timer for an extremely large tool timeout', async () => {
    const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const result = sendCommand(
      {method: 'invoke_tool', tool: 'wait_for', args: {timeout: 2 ** 31}},
      '',
    );
    const assertion = assert.rejects(
      result,
      /Timeout waiting for daemon response/,
    );
    await clock.tickAsync(60_000);
    sinon.assert.notCalled(destroy);
    await clock.tickAsync(2 ** 31 - 1 - 60_000);
    await assertion;
  });

  it('preserves an explicit socket deadline', async () => {
    const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const assertion = assert.rejects(
      sendCommand(
        {method: 'invoke_tool', tool: 'wait_for', args: {timeout: 120_000}},
        '',
        1000,
      ),
      /Timeout waiting for daemon response/,
    );
    await clock.tickAsync(1000);
    await assertion;
  });
});
