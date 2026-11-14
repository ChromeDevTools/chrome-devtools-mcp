/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import process from 'node:process';
import {logger} from './logger.js';

function isErrnoPermissionError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EPERM' || error.code === 'EACCES')
  );
}

function isPuppeteerActivePortPermissionError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith('Could not read DevToolsActivePort ') &&
    error.message.endsWith(': permission denied')
  );
}

export function devToolsActivePortPermissionError(
  error: unknown,
  userDataDir?: string,
): Error | undefined {
  const matched =
    userDataDir !== undefined
      ? isErrnoPermissionError(error)
      : isPuppeteerActivePortPermissionError(error);
  if (!matched) {
    return undefined;
  }
  const prefix =
    userDataDir !== undefined
      ? `Could not connect to Chrome in ${userDataDir}`
      : 'Could not connect to Chrome';
  const hint =
    os.platform() === 'darwin'
      ? 'macOS blocked reading DevToolsActivePort. Grant the host ' +
        'application (such as your terminal or IDE) access to Google Chrome ' +
        'in System Settings > Privacy & Security > Files & Folders, then ' +
        'try again.'
      : 'reading DevToolsActivePort was denied by file permissions. Check ' +
        'that the current user can read the Chrome profile directory, then ' +
        'try again.';
  return new Error(`${prefix}: ${hint}`, {
    cause: error,
  });
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export function setupUnhandledRejectionHandler(onCrash: () => void): void {
  process.on('unhandledRejection', (reason, promise) => {
    logger?.('Unhandled promise rejection:', promise, reason);
    console.error('Unhandled promise rejection:', reason);

    if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] === 'true') {
      onCrash();
    }
  });
}
