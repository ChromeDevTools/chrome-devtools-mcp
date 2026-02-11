/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {spawn, type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {logger} from '../logger.js';

import type {WatchdogMessage, OsType} from './types.js';

export class WatchdogClient {
  #childProcess: ChildProcess;

  constructor(
    config: {
      parentPid: number;
      appVersion: string;
      osType: OsType;
      logFile?: string;
      clearcutEndpoint?: string;
      clearcutForceFlushIntervalMs?: number;
      clearcutIncludePidHeader?: boolean;
    },
    options?: {spawn?: typeof spawn},
  ) {
    const watchdogPath = fileURLToPath(
      new URL('./watchdog/main.js', import.meta.url),
    );

    const args = [
      watchdogPath,
      `--parent-pid=${config.parentPid}`,
      `--app-version=${config.appVersion}`,
      `--os-type=${config.osType}`,
    ];

    if (config.logFile) {
      args.push(`--log-file=${config.logFile}`);
    }
    if (config.clearcutEndpoint) {
      args.push(`--clearcut-endpoint=${config.clearcutEndpoint}`);
    }
    if (config.clearcutForceFlushIntervalMs) {
      args.push(
        `--clearcut-force-flush-interval-ms=${config.clearcutForceFlushIntervalMs}`,
      );
    }
    if (config.clearcutIncludePidHeader) {
      args.push('--clearcut-include-pid-header');
    }

    const spawner = options?.spawn ?? spawn;
    this.#childProcess = spawner(process.execPath, args, {
      stdio: ['pipe', 'ignore', 'ignore'],
      detached: true,
    });
    this.#childProcess.unref();
    this.#childProcess.on('error', err => {
      logger('Watchdog process error:', err);
    });
    this.#childProcess.on('exit', (code, signal) => {
      logger(`Watchdog exited with code ${code} and signal ${signal}`);
    });
  }

  send(message: WatchdogMessage): void {
    if (
      this.#childProcess.stdin &&
      !this.#childProcess.stdin.destroyed &&
      this.#childProcess.pid
    ) {
      try {
        const line = JSON.stringify(message) + '\n';
        this.#childProcess.stdin.write(line);
      } catch (err) {
        logger('Failed to write to watchdog stdin', err);
      }
    } else {
      logger('Watchdog stdin not available, dropping message');
    }
  }
}
