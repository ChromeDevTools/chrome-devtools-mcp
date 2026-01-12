/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';

import {ClearcutSender} from './clearcut-sender.js';
import type {LocalState, Persistence} from './persistence.js';
import {FilePersistence} from './persistence.js';
import type {FlagUsage} from './types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class ClearcutLogger {
  #persistence: Persistence;
  #sender: ClearcutSender;

  constructor(options?: {persistence?: Persistence; sender?: ClearcutSender}) {
    this.#persistence = options?.persistence ?? new FilePersistence();
    this.#sender = options?.sender ?? new ClearcutSender();
  }

  async logToolInvocation(args: {
    toolName: string;
    success: boolean;
    latencyMs: number;
  }): Promise<void> {
    await this.#sender.send({
      tool_invocation: {
        tool_name: args.toolName,
        success: args.success,
        latency_ms: args.latencyMs,
      },
    });
  }

  async logServerStart(flagUsage: FlagUsage): Promise<void> {
    await this.#sender.send({
      server_start: {
        flag_usage: flagUsage,
      },
    });
  }

  async logDailyActiveIfNeeded(): Promise<void> {
    try {
      const state = await this.#persistence.loadState();

      if (this.#shouldLogDailyActive(state)) {
        let daysSince = -1;
        if (state.lastActive) {
          const lastActiveDate = new Date(state.lastActive);
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - lastActiveDate.getTime());
          daysSince = Math.ceil(diffTime / MS_PER_DAY);
        }

        await this.#sender.send({
          daily_active: {
            days_since_last_active: daysSince,
          },
        });

        // Update persistence
        state.lastActive = new Date().toISOString();
        await this.#persistence.saveState(state);
      }
    } catch (err) {
      logger('Error in logDailyActiveIfNeeded:', err);
    }
  }

  #shouldLogDailyActive(state: LocalState): boolean {
    if (!state.lastActive) {
      return true;
    }
    const lastActiveDate = new Date(state.lastActive);
    const now = new Date();

    // Compare UTC dates
    const isSameDay =
      lastActiveDate.getUTCFullYear() === now.getUTCFullYear() &&
      lastActiveDate.getUTCMonth() === now.getUTCMonth() &&
      lastActiveDate.getUTCDate() === now.getUTCDate();

    return !isSameDay;
  }
}
