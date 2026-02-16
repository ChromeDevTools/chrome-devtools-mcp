/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test fixtures for the `codebase_trace_symbol` tool.
 */

import type {ToolTestFixture} from '../helpers/types.js';
import {field} from '../helpers/assertions.js';

export const codebaseTraceSymbolFixtures: ToolTestFixture[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Basic symbol tracing
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'trace-function-by-name',
    description: 'Traces a function by name alone',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'formatCurrency',
    },
    assertions: {
      isError: false,
      contains: ['formatCurrency'],
    },
  },

  {
    id: 'trace-with-file-hint',
    description: 'Traces a symbol with file path hint for disambiguation',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'debounce',
      file: 'src/utils/helpers.ts',
    },
    assertions: {
      isError: false,
      contains: ['debounce'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Include mode filtering
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'include-definitions-only',
    description: 'Only traces definitions when include is [definitions]',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'User',
      include: ['definitions'],
    },
    assertions: {
      isError: false,
      contains: ['User'],
    },
  },

  {
    id: 'include-references-only',
    description: 'Only traces references when include is [references]',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'UserProfile',
      include: ['references'],
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'include-calls',
    description: 'Traces call hierarchy when include contains calls',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'formatCurrency',
      include: ['calls'],
      depth: 2,
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'include-all',
    description: 'Traces all aspects when include is [all]',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'debounce',
      include: ['all'],
    },
    assertions: {
      isError: false,
      contains: ['debounce'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Depth control
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'depth-1',
    description: 'Limits call hierarchy depth to 1',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'throttle',
      include: ['calls'],
      depth: 1,
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'depth-5',
    description: 'Extends call hierarchy depth to 5',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'generateId',
      include: ['calls'],
      depth: 5,
    },
    assertions: {
      isError: false,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Impact analysis
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'include-impact',
    description: 'Includes blast radius impact analysis',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'User',
      includeImpact: true,
    },
    assertions: {
      isError: false,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Response format
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'response-format-json',
    description: 'Returns structured JSON when response_format is json',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'formatCurrency',
      response_format: 'json',
    },
    assertions: {
      isError: false,
      fields: {
        'symbol': field.isString(),
      },
    },
  },

  {
    id: 'response-format-markdown',
    description: 'Returns markdown when response_format is markdown',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'formatCurrency',
      response_format: 'markdown',
    },
    assertions: {
      isError: false,
      contains: ['#'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'nonexistent-symbol',
    description: 'Handles nonexistent symbol gracefully',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'thisSymbolDoesNotExist12345',
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'max-references-limit',
    description: 'Respects maxReferences limit',
    tool: 'codebase_trace_symbol',
    input: {
      symbol: 'string',
      maxReferences: 10,
    },
    assertions: {
      isError: false,
    },
  },
];
