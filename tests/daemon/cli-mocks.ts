/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon';

import type {RunCliOptions} from '../../src/daemon/chrome-devtools-cli.js';
import {ConfigLocator} from '../../src/config/ConfigLocator.js';
import type {
  handleResponse,
  sendCommand,
  startDaemon,
  stopDaemon,
  verifyDaemonVersion,
} from '../../src/daemon/client.js';
import type {isDaemonRunning} from '../../src/daemon/utils.js';
import type {CallToolResult} from '../../src/third_party/index.js';
import type {logDisclaimers} from '../../src/utils/disclaimers.js';

export interface CliMocks {
  options: RunCliOptions;
  isDaemonRunning: sinon.SinonStub<
    Parameters<typeof isDaemonRunning>,
    ReturnType<typeof isDaemonRunning>
  >;
  startDaemon: sinon.SinonStub<
    Parameters<typeof startDaemon>,
    ReturnType<typeof startDaemon>
  >;
  stopDaemon: sinon.SinonStub<
    Parameters<typeof stopDaemon>,
    ReturnType<typeof stopDaemon>
  >;
  sendCommand: sinon.SinonStub<
    Parameters<typeof sendCommand>,
    ReturnType<typeof sendCommand>
  >;
  handleResponse: sinon.SinonStub<
    Parameters<typeof handleResponse>,
    ReturnType<typeof handleResponse>
  >;
  verifyDaemonVersion: sinon.SinonStub<
    Parameters<typeof verifyDaemonVersion>,
    ReturnType<typeof verifyDaemonVersion>
  >;
  logDisclaimers: sinon.SinonStub<
    Parameters<typeof logDisclaimers>,
    ReturnType<typeof logDisclaimers>
  >;
  consoleLog: sinon.SinonStub<
    Parameters<typeof console.log>,
    ReturnType<typeof console.log>
  >;
  consoleWarn: sinon.SinonStub<
    Parameters<typeof console.warn>,
    ReturnType<typeof console.warn>
  >;
  consoleError: sinon.SinonStub<
    Parameters<typeof console.error>,
    ReturnType<typeof console.error>
  >;
}

export function createCliMocks(): CliMocks {
  const configLocator = sinon.createStubInstance(ConfigLocator);
  configLocator.locate.returns(undefined);

  const isDaemonRunningStub = sinon.stub<
    Parameters<typeof isDaemonRunning>,
    ReturnType<typeof isDaemonRunning>
  >();
  isDaemonRunningStub.returns(false);

  const startDaemonStub = sinon.stub<
    Parameters<typeof startDaemon>,
    ReturnType<typeof startDaemon>
  >();
  startDaemonStub.resolves();

  const stopDaemonStub = sinon.stub<
    Parameters<typeof stopDaemon>,
    ReturnType<typeof stopDaemon>
  >();
  stopDaemonStub.resolves();

  const sendCommandStub = sinon.stub<
    Parameters<typeof sendCommand>,
    ReturnType<typeof sendCommand>
  >();
  const defaultToolResult: CallToolResult = {
    content: [{type: 'text', text: 'ok'}],
  };
  sendCommandStub.resolves({
    success: true,
    result: JSON.stringify(defaultToolResult),
    error: null,
  });

  const handleResponseStub = sinon.stub<
    Parameters<typeof handleResponse>,
    ReturnType<typeof handleResponse>
  >();
  handleResponseStub.resolves('ok');

  const verifyDaemonVersionStub = sinon.stub<
    Parameters<typeof verifyDaemonVersion>,
    ReturnType<typeof verifyDaemonVersion>
  >();
  verifyDaemonVersionStub.resolves(undefined);

  const logDisclaimersStub = sinon.stub<
    Parameters<typeof logDisclaimers>,
    ReturnType<typeof logDisclaimers>
  >();

  const consoleLog = sinon.stub(console, 'log');
  const consoleWarn = sinon.stub(console, 'warn');
  const consoleError = sinon.stub(console, 'error');

  const options: RunCliOptions = {
    env: {},
    exitProcess: false,
    configLocator,
    isDaemonRunning: isDaemonRunningStub,
    startDaemon: startDaemonStub,
    stopDaemon: stopDaemonStub,
    sendCommand: sendCommandStub,
    handleResponse: handleResponseStub,
    verifyDaemonVersion: verifyDaemonVersionStub,
    logDisclaimers: logDisclaimersStub,
  };

  return {
    options,
    isDaemonRunning: isDaemonRunningStub,
    startDaemon: startDaemonStub,
    stopDaemon: stopDaemonStub,
    sendCommand: sendCommandStub,
    handleResponse: handleResponseStub,
    verifyDaemonVersion: verifyDaemonVersionStub,
    logDisclaimers: logDisclaimersStub,
    consoleLog,
    consoleWarn,
    consoleError,
  };
}
