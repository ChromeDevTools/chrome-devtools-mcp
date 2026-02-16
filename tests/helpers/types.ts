/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type definitions for data-driven MCP tool tests.
 */

/**
 * Field assertion for validating specific fields in tool output.
 */
export interface FieldAssertion {
  /** Whether the field must exist */
  exists?: boolean;

  /** Expected exact value */
  equals?: unknown;

  /** Expected type (typeof check) */
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'undefined' | 'null';

  /** For numbers: minimum value (inclusive) */
  gte?: number;

  /** For numbers: maximum value (inclusive) */
  lte?: number;

  /** For strings/arrays: minimum length */
  minLength?: number;

  /** For strings/arrays: maximum length */
  maxLength?: number;

  /** For strings: regex pattern to match */
  matches?: string | RegExp;

  /** For arrays: expected to contain this value */
  contains?: unknown;

  /** For arrays: expected minimum number of items */
  minItems?: number;
}

/**
 * Assertions for validating tool output.
 */
export interface ToolAssertions {
  /** Field-level assertions using dot notation (e.g., 'result.summary.totalFiles') */
  fields?: Record<string, FieldAssertion>;

  /** Strings that must appear somewhere in the text output */
  contains?: string[];

  /** Strings that must NOT appear in the text output */
  notContains?: string[];

  /** Expected to be an error response */
  isError?: boolean;

  /** If isError, the error message should contain this text */
  errorContains?: string;
}

/**
 * A single test fixture for a tool.
 */
export interface ToolTestFixture<TInput = Record<string, unknown>> {
  /** Unique identifier for this test case */
  id: string;

  /** Human-readable description of what this test validates */
  description: string;

  /** Name of the MCP tool to call */
  tool: string;

  /** Input parameters to pass to the tool */
  input: TInput;

  /** Assertions to validate the output */
  assertions: ToolAssertions;

  /** Optional: skip this test (with reason) */
  skip?: string;

  /** Optional: mark as expected failure */
  expectedFailure?: boolean;

  /** Optional: tags for filtering tests */
  tags?: string[];
}

/**
 * MCP tool call result structure.
 */
export interface McpToolResult {
  /** Whether the call resulted in an error */
  isError?: boolean;

  /** Content array from the response */
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;

  /** Structured content (if outputSchema was defined) */
  structuredContent?: unknown;
}

/**
 * Parsed tool result with convenience accessors.
 */
export interface ParsedToolResult {
  /** Raw MCP result */
  raw: McpToolResult;

  /** Combined text content */
  text: string;

  /** Parsed JSON from text (if valid JSON) */
  json?: unknown;

  /** Whether the call was an error */
  isError: boolean;

  /** Error message (if isError) */
  errorMessage?: string;
}

/**
 * Options for the MCP test client.
 */
export interface McpTestClientOptions {
  /** Workspace path for the MCP server. Defaults to vscode-toolkit root. */
  workspacePath?: string;

  /** Timeout for tool calls in milliseconds */
  timeout?: number;

  /** Whether to auto-connect on first call */
  autoConnect?: boolean;
}
