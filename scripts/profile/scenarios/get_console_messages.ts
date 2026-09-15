/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ScenarioArgs, ScenarioIterations, ToolCall} from '../types.ts';

export function getNumIterations(): ScenarioIterations {
  return {
    iterations: 3,
    warmupIterations: 3,
  };
}

export function get(args: ScenarioArgs): ToolCall[] {
  const toolCalls: ToolCall[] = [
    {
      name: 'navigate_page',
      arguments: {type: 'url', url: args.targetUrl},
    },
    {
      name: 'list_console_messages',
      arguments: {},
    },
  ];

  for (let msgid = 1; msgid <= 25; msgid++) {
    toolCalls.push({
      name: 'get_console_message',
      arguments: {msgid},
    });
  }

  return toolCalls;
}
