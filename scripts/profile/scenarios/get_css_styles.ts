/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ScenarioArgs, ScenarioIterations, ToolCall} from '../types.ts';
import {uidsFromSnapshotResult} from '../utils.ts';

export function getNumIterations(): ScenarioIterations {
  return {
    iterations: 10,
    warmupIterations: 10,
  };
}

export function get(args: ScenarioArgs): ToolCall[] {
  const pageId = 1;
  const toolCalls: ToolCall[] = [
    {
      name: 'navigate_page',
      arguments: {
        pageId,
        type: 'url',
        url: args.targetUrl,
      },
    },
    {
      name: 'take_snapshot',
      arguments: {
        pageId,
      },
    },
  ];

  for (let index = 0; index < 25; index++) {
    toolCalls.push({
      name: 'get_css_styles',
      arguments: context => {
        const snapshotResult = context.results[1];
        const uids = uidsFromSnapshotResult(snapshotResult);
        const uid = uids[index % uids.length];
        if (!uid) {
          throw new Error(
            `No element UID available in snapshot for index ${index}`,
          );
        }
        const pagination =
          index % 3 === 0
            ? {pageSize: 3, pageIdx: 0}
            : index % 3 === 1
              ? {pageSize: 3, pageIdx: 1}
              : {};
        return {
          pageId,
          uid,
          ...pagination,
        };
      },
    });
  }

  return toolCalls;
}
