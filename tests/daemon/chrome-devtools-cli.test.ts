/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {runCli} from '../../src/daemon/chrome-devtools-cli.js';
import type {DaemonStatusResult} from '../../src/daemon/types.js';
import type {CallToolResult} from '../../src/third_party/index.js';
import {VERSION} from '../../src/version.js';
import {createCliMocks} from './cli-mocks.js';

const SESSION_ID = 'aabbccdd-1122-3344-5566-77889900aabb';

describe('chrome-devtools CLI', () => {
  describe('auto-start on tool commands', () => {
    it('does not forward emulate viewport tool arg to daemon startup flags on auto-start', async () => {
      const mocks = createCliMocks();
      const toolResult: CallToolResult = {
        content: [{type: 'text', text: 'Emulated viewport'}],
      };
      mocks.sendCommand.resolves({
        success: true,
        result: JSON.stringify(toolResult),
        error: null,
      });
      mocks.handleResponse.resolves('Emulated viewport');

      const exitCode = await runCli(
        ['emulate', '1', '--viewport', '500x400x1', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.calledOnceWithExactly(mocks.isDaemonRunning, SESSION_ID);
      sinon.assert.calledOnceWithExactly(
        mocks.startDaemon,
        ['--viaCli'],
        SESSION_ID,
      );
      sinon.assert.notCalled(mocks.stopDaemon);
      sinon.assert.notCalled(mocks.verifyDaemonVersion);
      sinon.assert.calledOnceWithMatch(mocks.logDisclaimers, {
        viaCli: true,
        viewport: undefined,
      });
      sinon.assert.calledOnceWithExactly(
        mocks.sendCommand,
        {
          method: 'invoke_tool',
          tool: 'emulate',
          args: {
            pageId: 1,
            viewport: '500x400x1',
          },
        },
        SESSION_ID,
      );
      sinon.assert.calledOnceWithExactly(
        mocks.handleResponse,
        toolResult,
        'md',
      );
      sinon.assert.calledOnceWithExactly(mocks.consoleLog, 'Emulated viewport');
      sinon.assert.notCalled(mocks.consoleError);
      sinon.assert.notCalled(mocks.consoleWarn);
    });

    it('does not forward a two-part emulate viewport value to daemon startup flags on auto-start', async () => {
      const mocks = createCliMocks();

      const exitCode = await runCli(
        ['emulate', '1', '--viewport', '500x400', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.calledOnceWithExactly(
        mocks.startDaemon,
        ['--viaCli'],
        SESSION_ID,
      );
      sinon.assert.calledOnceWithExactly(
        mocks.sendCommand,
        {
          method: 'invoke_tool',
          tool: 'emulate',
          args: {
            pageId: 1,
            viewport: '500x400',
          },
        },
        SESSION_ID,
      );
    });

    it('does not auto-start the daemon when it is already running', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);

      const exitCode = await runCli(
        ['emulate', '1', '--viewport', '500x400x1', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.calledOnceWithExactly(mocks.isDaemonRunning, SESSION_ID);
      sinon.assert.notCalled(mocks.startDaemon);
      sinon.assert.notCalled(mocks.stopDaemon);
      sinon.assert.notCalled(mocks.logDisclaimers);
      sinon.assert.calledOnceWithExactly(
        mocks.verifyDaemonVersion,
        SESSION_ID,
        VERSION,
      );
      sinon.assert.calledOnceWithExactly(
        mocks.sendCommand,
        {
          method: 'invoke_tool',
          tool: 'emulate',
          args: {
            pageId: 1,
            viewport: '500x400x1',
          },
        },
        SESSION_ID,
      );
    });

    it('returns exit code 1 when tool invocation fails', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);
      mocks.sendCommand.resolves({
        success: false,
        result: '',
        error: 'tool failed',
      });

      const exitCode = await runCli(
        ['emulate', '1', '--viewport', '500x400x1', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 1);
      sinon.assert.notCalled(mocks.handleResponse);
      sinon.assert.calledOnceWithExactly(
        mocks.consoleError,
        'Error:',
        'tool failed',
      );
    });

    it('returns exit code 1 when executing a tool command rejects', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);
      const error = new Error('connection reset');
      mocks.sendCommand.rejects(error);

      const exitCode = await runCli(
        ['emulate', '1', '--viewport', '500x400x1', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 1);
      sinon.assert.notCalled(mocks.handleResponse);
      sinon.assert.calledOnceWithExactly(
        mocks.consoleError,
        'Failed to execute command:',
        error,
      );
    });
  });

  describe('start', () => {
    it('forwards explicit startup flags without stopping when daemon is not running', async () => {
      const mocks = createCliMocks();

      const exitCode = await runCli(
        ['start', '--headless=false', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.notCalled(mocks.stopDaemon);
      sinon.assert.calledOnceWithExactly(
        mocks.startDaemon,
        ['--viaCli', '--no-headless'],
        SESSION_ID,
      );
      sinon.assert.calledOnceWithMatch(mocks.logDisclaimers, {
        viaCli: true,
        headless: false,
      });
    });

    it('stops an existing daemon before restarting', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);

      const exitCode = await runCli(
        ['start', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.calledOnceWithExactly(mocks.stopDaemon, SESSION_ID);
      sinon.assert.calledOnceWithExactly(
        mocks.startDaemon,
        ['--viaCli'],
        SESSION_ID,
      );
      sinon.assert.callOrder(mocks.stopDaemon, mocks.startDaemon);
    });

    it('rejects --viewport on start without starting the daemon', async () => {
      const mocks = createCliMocks();

      const exitCode = await runCli(
        ['start', '--viewport', '1280x720', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 1);
      sinon.assert.notCalled(mocks.startDaemon);
      sinon.assert.notCalled(mocks.stopDaemon);
      sinon.assert.calledWithExactly(
        mocks.consoleError.firstCall,
        'Error:',
        'Unknown argument: viewport',
      );
    });

    it('returns exit code 1 and logs once when startDaemon rejects', async () => {
      const mocks = createCliMocks();
      const error = new Error('daemon failed to start');
      mocks.startDaemon.rejects(error);

      const exitCode = await runCli(
        ['start', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 1);
      sinon.assert.calledOnceWithExactly(mocks.consoleError, error);
      sinon.assert.notCalled(mocks.logDisclaimers);
    });

    it('returns exit code 1 and logs once when start config validation fails', async () => {
      const mocks = createCliMocks();

      const exitCode = await runCli(
        [
          'start',
          '--userDataDir',
          '/tmp/profile',
          '--isolated',
          '--sessionId',
          SESSION_ID,
        ],
        mocks.options,
      );

      assert.strictEqual(exitCode, 1);
      sinon.assert.notCalled(mocks.startDaemon);
      sinon.assert.calledOnceWithMatch(
        mocks.consoleError,
        sinon.match.instanceOf(Error),
      );
    });
  });

  describe('status', () => {
    it('prints daemon startup args when running', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);
      const statusResult: DaemonStatusResult = {
        pid: 4242,
        socketPath: '/tmp/server.sock',
        startDate: '2026-01-01T00:00:00.000Z',
        version: VERSION,
        args: ['--viaCli'],
      };
      mocks.sendCommand.resolves({
        success: true,
        result: JSON.stringify(statusResult),
        error: null,
      });

      const exitCode = await runCli(
        ['status', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.calledOnceWithExactly(
        mocks.sendCommand,
        {method: 'status'},
        SESSION_ID,
      );
      sinon.assert.calledWithExactly(
        mocks.consoleLog.firstCall,
        'chrome-devtools-mcp daemon is running.',
      );
      sinon.assert.calledWithExactly(
        mocks.consoleLog.secondCall,
        `pid=4242 socket=/tmp/server.sock start-date=2026-01-01T00:00:00.000Z version=${VERSION}`,
      );
      sinon.assert.calledWithExactly(
        mocks.consoleLog.thirdCall,
        'args=["--viaCli"]',
      );
      sinon.assert.notCalled(mocks.consoleWarn);
    });

    it('reports when daemon is not running without querying it', async () => {
      const mocks = createCliMocks();

      const exitCode = await runCli(
        ['status', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.notCalled(mocks.sendCommand);
      sinon.assert.calledOnceWithExactly(
        mocks.consoleLog,
        'chrome-devtools-mcp daemon is not running.',
      );
    });

    it('returns exit code 1 and logs once when status query rejects', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);
      const error = new Error('socket unreachable');
      mocks.sendCommand.rejects(error);

      const exitCode = await runCli(
        ['status', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 1);
      sinon.assert.calledOnceWithExactly(mocks.consoleError, error);
    });

    it('returns exit code 1 when status returns an error response', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);
      mocks.sendCommand.resolves({
        success: false,
        result: '',
        error: 'status failed',
      });

      const exitCode = await runCli(
        ['status', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 1);
      sinon.assert.calledOnceWithExactly(
        mocks.consoleError,
        'Error:',
        'status failed',
      );
    });
  });

  describe('stop', () => {
    it('stops a running daemon', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);

      const exitCode = await runCli(
        ['stop', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.calledOnceWithExactly(mocks.stopDaemon, SESSION_ID);
    });

    it('does nothing when the daemon is not running', async () => {
      const mocks = createCliMocks();

      const exitCode = await runCli(
        ['stop', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 0);
      sinon.assert.notCalled(mocks.stopDaemon);
    });

    it('returns exit code 1 and logs once when stopDaemon rejects', async () => {
      const mocks = createCliMocks();
      mocks.isDaemonRunning.returns(true);
      const error = new Error('failed to stop');
      mocks.stopDaemon.rejects(error);

      const exitCode = await runCli(
        ['stop', '--sessionId', SESSION_ID],
        mocks.options,
      );

      assert.strictEqual(exitCode, 1);
      sinon.assert.calledOnceWithExactly(mocks.consoleError, error);
    });
  });
});
