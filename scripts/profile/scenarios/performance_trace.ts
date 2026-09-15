/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ScenarioArgs, ScenarioIterations, ToolCall} from '../types.ts';

/**
 * Defines iteration counts for the performance trace profiling scenario.
 *
 * Keeps iteration counts bounded so profiling remains fast while still providing
 * enough repetitions to detect memory retention across consecutive traces.
 */
export function getNumIterations(): ScenarioIterations {
  return {
    iterations: 5,
    warmupIterations: 3,
  };
}

/**
 * Returns the sequence of MCP tool calls to execute per iteration.
 *
 * Each iteration navigates to the target URL to ensure a known page state,
 * begins a performance trace with page reload (`autoStop: false` to avoid
 * the default 5-second sleep), and explicitly stops the trace to trigger
 * parsing, summary generation, and model teardown.
 *
 * @param args Arguments supplied to the scenario, including the target URL.
 */
export function get(args: ScenarioArgs): ToolCall[] {
  return [
    {
      name: 'navigate_page',
      arguments: {type: 'url', url: args.targetUrl},
    },
    {
      name: 'performance_start_trace',
      arguments: {reload: true, autoStop: false},
    },
    {
      name: 'performance_stop_trace',
      arguments: {},
    },
  ];
}
