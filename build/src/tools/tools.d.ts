/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type ParsedArguments } from '../config/mcp-options.js';
import type { AnyToolDefinition } from './ToolDefinition.js';
export declare const createTools: (args: ParsedArguments) => AnyToolDefinition[];
/**
 * Returns true if the tool is gated behind a hidden (internal) flag. Such
 * tools are excluded from the generated documentation and CLI.
 */
export declare function requiresHiddenFlag(tool: AnyToolDefinition): boolean;
