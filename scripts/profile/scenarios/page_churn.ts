/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ScenarioArgs, ToolCall} from '../types.ts';
import {selectedPageIdFromToolResult} from '../utils.ts';

export function get(args: ScenarioArgs): ToolCall[] {
  return [
    {
      name: 'new_page',
      arguments: {url: args.targetUrl},
    },
    // Exercise the per-page collectors after its DevTools Universe has loaded
    // all scripts and source maps.
    {
      name: 'take_snapshot',
      arguments: {},
    },
    {
      name: 'list_network_requests',
      arguments: {},
    },
    {
      name: 'close_page',
      arguments: context => {
        const newPageResult = context.results[0];
        const pageId = selectedPageIdFromToolResult(newPageResult);
        return {pageId};
      },
    },
    // Force the MCP context to reconcile its page list before measuring. This
    // prevents target-destruction event latency from looking like retention.
    {
      name: 'list_pages',
      arguments: {},
    },
  ];
}
