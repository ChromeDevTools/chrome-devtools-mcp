/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import process from 'node:process';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import sinon from 'sinon';

import {
  devToolsActivePortPermissionError,
  getErrorMessage,
  setupUnhandledRejectionHandler,
} from '../../src/utils/errorHandling.js';

describe('getErrorMessage', () => {
  it('returns the message for Error instances', () => {
    assert.strictEqual(getErrorMessage(new Error('boom')), 'boom');
  });

  it('converts non-Error values to strings', () => {
    assert.strictEqual(getErrorMessage('string error'), 'string error');
  });
});

describe('setupUnhandledRejectionHandler', () => {
  let originalEnvValue: string | undefined;

  beforeEach(() => {
    originalEnvValue = process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'];
    delete process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'];
  });

  afterEach(() => {
    mock.restoreAll();
    if (originalEnvValue === undefined) {
      delete process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'];
    } else {
      process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] = originalEnvValue;
    }
  });

  it('crashes and logs if CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT is true', () => {
    process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] = 'true';
    const onCrash = mock.fn();
    const consoleError = mock.method(console, 'error', () => undefined);

    // Stub process.on to capture the handler
    const processOn = mock.method(process, 'on', () => process);

    setupUnhandledRejectionHandler(onCrash);

    assert.strictEqual(processOn.mock.calls.length, 1);
    assert.strictEqual(
      processOn.mock.calls[0].arguments[0],
      'unhandledRejection',
    );

    const handler = processOn.mock.calls[0].arguments[1] as (
      reason: unknown,
      promise: Promise<unknown>,
    ) => void;

    const reason = new Error('Test error');
    handler(reason, Promise.resolve());

    assert.strictEqual(consoleError.mock.calls.length, 1);
    assert.strictEqual(
      consoleError.mock.calls[0].arguments[0],
      'Unhandled promise rejection:',
    );
    assert.strictEqual(consoleError.mock.calls[0].arguments[1], reason);

    assert.strictEqual(onCrash.mock.calls.length, 1);
  });

  it('logs and swallows other errors', () => {
    const onCrash = mock.fn();
    const consoleError = mock.method(console, 'error', () => undefined);
    const processOn = mock.method(process, 'on', () => process);

    setupUnhandledRejectionHandler(onCrash);

    const handler = processOn.mock.calls[0].arguments[1] as (
      reason: unknown,
      promise: Promise<unknown>,
    ) => void;

    const reason = new TypeError('Test type error');
    handler(reason, Promise.resolve());

    assert.strictEqual(consoleError.mock.calls.length, 1);
    assert.strictEqual(
      consoleError.mock.calls[0].arguments[0],
      'Unhandled promise rejection:',
    );
    assert.strictEqual(consoleError.mock.calls[0].arguments[1], reason);

    assert.strictEqual(onCrash.mock.calls.length, 0);
  });
});

describe('devToolsActivePortPermissionError', () => {
  it('formats permission errors and ignores missing files or unrelated socket errors', () => {
    sinon.stub(os, 'platform').returns('darwin');
    const epermError = Object.assign(
      new Error('EPERM: operation not permitted'),
      {code: 'EPERM'},
    );
    const puppeteerPermissionError = new Error(
      'Could not read DevToolsActivePort for chrome at /Users/test/DevToolsActivePort: permission denied',
      {cause: epermError},
    );
    const formatted = devToolsActivePortPermissionError(
      puppeteerPermissionError,
    );
    assert.ok(formatted);
    assert.strictEqual(
      formatted.message,
      'Could not connect to Chrome: macOS blocked reading DevToolsActivePort. Grant the host application (such as your terminal or IDE) access to Google Chrome in System Settings > Privacy & Security > Files & Folders, then try again.',
    );
    assert.strictEqual(formatted.cause, puppeteerPermissionError);

    const enoentError = Object.assign(
      new Error('ENOENT: no such file or directory'),
      {code: 'ENOENT'},
    );
    const socketEaccesError = Object.assign(
      new Error('connect EACCES 127.0.0.1:9222'),
      {code: 'EACCES'},
    );
    assert.strictEqual(
      devToolsActivePortPermissionError(enoentError, '/tmp/profile'),
      undefined,
    );
    assert.strictEqual(
      devToolsActivePortPermissionError(
        new Error(
          'Could not find DevToolsActivePort for chrome at /tmp/profile/DevToolsActivePort',
          {cause: enoentError},
        ),
      ),
      undefined,
    );
    assert.strictEqual(
      devToolsActivePortPermissionError(socketEaccesError),
      undefined,
    );
  });
});
