/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import readline from 'node:readline';
import {parseArgs} from 'node:util';

import {logger, saveLogsToFileSync} from '../../logger.js';
import type {OsType} from '../types.js';
import {WatchdogMessageType} from '../types.js';

import {ClearcutSender} from './clearcut-sender.js';

function main() {
  const {values} = parseArgs({
    options: {
      'parent-pid': {type: 'string'},
      'app-version': {type: 'string'},
      'os-type': {type: 'string'},
      'log-file': {type: 'string'},
    },
    strict: true,
  });

  const parentPid = parseInt(values['parent-pid'] ?? '', 10);
  const appVersion = values['app-version'];
  const osType = parseInt(values['os-type'] ?? '', 10);
  const logFile = values['log-file'];
  if (logFile) {
    saveLogsToFileSync(logFile);
  }

  if (isNaN(parentPid) || !appVersion || isNaN(osType)) {
    logger(
      'Invalid arguments provided for watchdog process: ',
      JSON.stringify({parentPid, appVersion, osType}),
    );
    process.exit(1);
  }

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

  const sender = new ClearcutSender(appVersion, osType as OsType);

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
        process.exit(0);
      })
      .catch(err => {
        logger('Failed to send shutdown event', err);
        process.exit(1);
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
        sender.send(msg.payload).catch(err => {
          logger('Error sending event', err);
        });
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
