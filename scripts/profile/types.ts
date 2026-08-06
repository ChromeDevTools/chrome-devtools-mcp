/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ScenarioArgs {
  targetUrl: string;
  outputDir: string;
  [key: string]: unknown;
}

export interface ToolCallContext {
  results: unknown[];
}

export type ToolArguments =
  | Record<string, unknown>
  | ((
      context: ToolCallContext,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>);

export interface ToolCall {
  name: string;
  arguments?: ToolArguments;
}

export interface ScenarioIterations {
  iterations?: number;
  warmupIterations?: number;
}

export interface ProfileScenario {
  name?: string;
  description?: string;
  getNumIterations?: () => ScenarioIterations;
  get: (args: ScenarioArgs) => ToolCall[] | Promise<ToolCall[]>;
}
