/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {ChildProcess} from 'node:child_process';
import {Writable} from 'node:stream';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {OsType, WatchdogMessageType} from '../../src/telemetry/types.js';
import {WatchdogClient} from '../../src/telemetry/WatchdogClient.js';

describe('WatchdogClient', () => {
  let spawnStub: sinon.SinonStub;
  let stdinStub: sinon.SinonStubbedInstance<Writable>;
  let mockChildProcess: sinon.SinonStubbedInstance<ChildProcess>;

  beforeEach(() => {
    stdinStub = sinon.createStubInstance(Writable);
    mockChildProcess = sinon.createStubInstance(ChildProcess);
    spawnStub = sinon.stub().returns(mockChildProcess);

    Object.defineProperty(mockChildProcess, 'stdin', {
      value: stdinStub,
      writable: true,
    });
    Object.defineProperty(mockChildProcess, 'pid', {
      value: 12345,
      writable: true,
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('spawns watchdog process with correct arguments', () => {
    new WatchdogClient(
      {
        parentPid: 100,
        appVersion: '1.2.3',
        osType: OsType.OS_TYPE_MACOS,
      },
      {spawn: spawnStub},
    );

    assert.ok(spawnStub.calledOnce, 'Expected `spawn` to be called');
    const args = spawnStub.firstCall.args;
    const cmdArgs = args[1];

    assert.match(
      cmdArgs[0],
      /watchdog[/\\]main\.js$/,
      'First argument should be path to watchdog/main.js',
    );
    assert.ok(
      cmdArgs.includes('--parent-pid=100'),
      'Arguments should include parent PID',
    );
    assert.ok(
      cmdArgs.includes('--app-version=1.2.3'),
      'Arguments should include app version',
    );
    assert.ok(
      cmdArgs.includes('--os-type=2'),
      'Arguments should include OS type',
    );
    assert.strictEqual(
      spawnStub.firstCall.args[2].detached,
      true,
      'Process should be spawned as detached',
    );
  });

  it('passes log-file argument if provided', () => {
    new WatchdogClient(
      {
        parentPid: 100,
        appVersion: '1.0.0',
        osType: OsType.OS_TYPE_LINUX,
        logFile: '/tmp/test.log',
      },
      {spawn: spawnStub},
    );

    const cmdArgs = spawnStub.firstCall.args[1];
    assert.ok(
      cmdArgs.includes('--log-file=/tmp/test.log'),
      'Arguments should include log file path',
    );
  });

  it('sends IPC messages via stdin', () => {
    const client = new WatchdogClient(
      {
        parentPid: 100,
        appVersion: '1.0.0',
        osType: OsType.OS_TYPE_LINUX,
      },
      {spawn: spawnStub},
    );

    const msg = {type: WatchdogMessageType.LOG_EVENT, payload: {}};
    client.send(msg);

    assert.ok(
      stdinStub.write.calledOnce,
      'Expected `stdin.write` to be called',
    );

    const writtenData = stdinStub.write.firstCall.args[0];
    assert.strictEqual(
      writtenData.trim(),
      JSON.stringify(msg),
      'Written data should match expected JSON message',
    );
  });

  it('handles write errors gracefully', () => {
    const client = new WatchdogClient(
      {
        parentPid: 100,
        appVersion: '1.0.0',
        osType: OsType.OS_TYPE_LINUX,
      },
      {spawn: spawnStub},
    );

    stdinStub.write.throws(new Error('EPIPE'));

    assert.doesNotThrow(() => {
      client.send({type: WatchdogMessageType.LOG_EVENT, payload: {}});
    }, 'Client should catch and ignore write errors');
  });
});
