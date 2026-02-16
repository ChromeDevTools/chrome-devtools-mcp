/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test fixtures for the `wait` tool.
 * This is a simple tool useful for testing the infrastructure.
 */

import type {ToolTestFixture} from '../helpers/types.js';
import {field} from '../helpers/assertions.js';

export const waitFixtures: ToolTestFixture[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Basic wait operations
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'wait-100ms',
    description: 'Waits for 100 milliseconds',
    tool: 'wait',
    input: {
      durationMs: 100,
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'wait-with-reason',
    description: 'Waits with a reason provided',
    tool: 'wait',
    input: {
      durationMs: 50,
      reason: 'testing infrastructure',
    },
    assertions: {
      isError: false,
      contains: ['testing infrastructure'],
    },
  },

  {
    id: 'wait-zero-ms',
    description: 'Waits for 0 milliseconds (immediate return)',
    tool: 'wait',
    input: {
      durationMs: 0,
    },
    assertions: {
      isError: false,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Response format
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'wait-json-format',
    description: 'Returns JSON response format',
    tool: 'wait',
    input: {
      durationMs: 10,
      response_format: 'json',
    },
    assertions: {
      isError: false,
      fields: {
        'elapsed_ms': field.gte(0),
        'requested_ms': field.equals(10),
      },
    },
  },

  {
    id: 'wait-markdown-format',
    description: 'Returns markdown response format',
    tool: 'wait',
    input: {
      durationMs: 10,
      response_format: 'markdown',
    },
    assertions: {
      isError: false,
      contains: ['Waited'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'wait-max-duration',
    description: 'Tests maximum allowed duration (30000ms) - uses shorter value',
    tool: 'wait',
    input: {
      durationMs: 1000,
    },
    assertions: {
      isError: false,
    },
  },
];
