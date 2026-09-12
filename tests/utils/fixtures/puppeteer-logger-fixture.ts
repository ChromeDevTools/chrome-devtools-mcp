/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Standalone fixture spawned as a child process by logger.test.ts.
//
// `util.debuglog(prefix).enabled` reflects the NODE_DEBUG environment
// variable as it was when the *process* started, not a value that can be
// toggled at runtime within a single process. Testing puppeteerLogger's
// DEBUG-gating behavior for both the enabled and disabled cases therefore
// requires spawning separate processes with different NODE_DEBUG values,
// which is what this fixture is for.
//
// Usage: node <compiled-fixture> <prefix> <logFilePath | -->
// If <logFilePath> is "--", saveLogsToFile is not called (no-log-file case).

import {
  saveLogsToFile,
  flushLogs,
  puppeteerLogger,
} from '../../../src/utils/logger.js';

const [, , prefix, logFilePathArg] = process.argv;

if (!prefix || !logFilePathArg) {
  console.error('usage: puppeteer-logger-fixture <prefix> <logFilePath|-->');
  process.exit(2);
}

const logFile =
  logFilePathArg !== '--' ? saveLogsToFile(logFilePathArg) : undefined;

const write = puppeteerLogger(prefix);
if (write) {
  write('fixture message');
}

if (logFile) {
  await flushLogs(logFile);
}

// `write` is undefined when the namespace is not DEBUG-enabled; print
// whether a logger was returned so the parent test can assert on both the
// in-process return value and (for the file case) the file's contents.
console.log(write ? 'logger:defined' : 'logger:undefined');
