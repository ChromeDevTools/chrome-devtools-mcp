/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {WriteStream} from 'node:fs';
import process from 'node:process';
import readline from 'node:readline';
import {parseArgs} from 'node:util';

import {logger, flushLogs, saveLogsToFile} from '../../logger.js';
import type {OsType} from '../types.js';
import {WatchdogMessageType} from '../types.js';

import {ClearcutSender} from './ClearcutSender.js';

interface WatchdogArgs {
  // Required arguments
  parentPid: number;
  appVersion: string;
  osType: OsType;
  // Optional arguments
  logFile?: string;
  clearcutEndpoint?: string;
  clearcutForceFlushIntervalMs?: number;
  clearcutIncludePidHeader?: boolean;
}

function parseWatchdogArgs(): WatchdogArgs {
  const {values} = parseArgs({
    options: {
      'parent-pid': {type: 'string'},
      'app-version': {type: 'string'},
      'os-type': {type: 'string'},
      'log-file': {type: 'string'},
      'clearcut-endpoint': {type: 'string'},
      'clearcut-force-flush-interval-ms': {type: 'string'},
      'clearcut-include-pid-header': {type: 'boolean'},
    },
    strict: true,
  });
  // Verify required arguments
  const parentPid = parseInt(values['parent-pid'] ?? '', 10);
  const appVersion = values['app-version'];
  const osType = parseInt(values['os-type'] ?? '', 10);
  if (isNaN(parentPid) || !appVersion || isNaN(osType)) {
    console.error(
      'Invalid arguments provided for watchdog process: ',
      JSON.stringify({parentPid, appVersion, osType}),
    );
    process.exit(1);
  }

  // Parse Optional Arguments
  const logFile = values['log-file'];
  const clearcutEndpoint = values['clearcut-endpoint'];
  const clearcutIncludePidHeader = values['clearcut-include-pid-header'];
  let clearcutForceFlushIntervalMs: number | undefined;
  if (values['clearcut-force-flush-interval-ms']) {
    const parsed = parseInt(values['clearcut-force-flush-interval-ms'], 10);
    if (!isNaN(parsed)) {
      clearcutForceFlushIntervalMs = parsed;
    }
  }

  return {
    parentPid,
    appVersion,
    osType,
    logFile,
    clearcutEndpoint,
    clearcutForceFlushIntervalMs,
    clearcutIncludePidHeader,
  };
}

function main() {
  const {
    parentPid,
    appVersion,
    osType,
    logFile,
    clearcutEndpoint,
    clearcutForceFlushIntervalMs,
    clearcutIncludePidHeader,
  } = parseWatchdogArgs();
  let logStream: WriteStream | undefined;
  if (logFile) {
    logStream = saveLogsToFile(logFile);
  }

  const exit = (code: number) => {
    if (!logStream) {
      process.exit(code);
    }

    void flushLogs(logStream).finally(() => {
      process.exit(code);
    });
  };

  logger(
    'Watchdog started',
    JSON.stringify(
      {
        pid: process.pid,
        parentPid,
        version: appVersion,
        osType,
      },
      null,
      2,
    ),
  );

  const sender = new ClearcutSender({
    appVersion,
    osType: osType,
    clearcutEndpoint,
    forceFlushIntervalMs: clearcutForceFlushIntervalMs,
    includePidHeader: clearcutIncludePidHeader,
  });

  let isShuttingDown = false;
  function onParentDeath(reason: string) {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger(`Parent death detected (${reason}). Sending shutdown event...`);
    sender
      .sendShutdownEvent()
      .then(() => {
        logger('Shutdown event sent. Exiting.');
        exit(0);
      })
      .catch(err => {
        logger('Failed to send shutdown event', err);
        exit(1);
      });
  }

  process.stdin.on('end', () => onParentDeath('stdin end'));
  process.stdin.on('close', () => onParentDeath('stdin close'));
  process.on('disconnect', () => onParentDeath('ipc disconnect'));

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', line => {
    try {
      if (!line.trim()) {
        return;
      }

      const msg = JSON.parse(line);
      if (msg.type === WatchdogMessageType.LOG_EVENT && msg.payload) {
        sender.enqueueEvent(msg.payload);
      }
    } catch (err) {
      logger('Failed to parse IPC message', err);
    }
  });
}

try {
  main();
} catch (err) {
  console.error('Watchdog fatal error:', err);
  process.exit(1);
}
