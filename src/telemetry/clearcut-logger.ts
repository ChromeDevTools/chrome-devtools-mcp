/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ClearcutSender} from './clearcut-sender.js';
import type {
  FlagUsage,
} from './types.js';

export class ClearcutLogger {
  #sender: ClearcutSender;

  constructor(sender?: ClearcutSender) {
    this.#sender = sender ?? new ClearcutSender();
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
}
