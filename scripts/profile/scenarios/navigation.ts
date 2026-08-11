/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import type {ScenarioArgs, ToolCall} from '../types.ts';

export function get(args: ScenarioArgs): ToolCall[] {
  return [
    {
      name: 'navigate_page',
      arguments: {type: 'url', url: args.targetUrl},
    },
    {
      name: 'navigate_page',
      arguments: {type: 'url', url: args.targetUrl},
    },
    {
      name: 'navigate_page',
      arguments: {type: 'url', url: args.targetUrl},
    },
    {
      name: 'navigate_page',
      arguments: {type: 'url', url: args.targetUrl},
    },
    {
      name: 'take_snapshot',
      arguments: {},
    },
    {
      name: 'take_screenshot',
      arguments: {
        filePath: path.join(args.outputDir, 'page.png'),
      },
    },
    {
      name: 'list_network_requests',
      arguments: {},
    },
  ];
}
