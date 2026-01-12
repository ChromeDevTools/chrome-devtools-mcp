/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FlagUsage,
} from './types.js';
import {ClearcutSender} from './clearcut-sender.js';

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
