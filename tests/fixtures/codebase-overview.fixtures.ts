/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test fixtures for the `codebase_overview` tool.
 * 
 * These tests use the test-workspace folder which contains:
 * - src/index.ts, src/models/, src/services/, src/utils/
 * - Various test files for parsers
 */

import type {ToolTestFixture} from '../helpers/types.js';
import {field} from '../helpers/assertions.js';

export const codebaseOverviewFixtures: ToolTestFixture[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Basic functionality tests
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'default-params',
    description: 'Returns project overview with default parameters (depth 1)',
    tool: 'codebase_overview',
    input: {},
    assertions: {
      isError: false,
      contains: ['src'],
    },
  },

  {
    id: 'depth-0-files-only',
    description: 'Returns only file tree when depth=0 (no symbols)',
    tool: 'codebase_overview',
    input: {
      depth: 0,
    },
    assertions: {
      isError: false,
      contains: ['src'],
    },
  },

  {
    id: 'depth-2-with-members',
    description: 'Includes class members when depth=2',
    tool: 'codebase_overview',
    input: {
      depth: 2,
      filter: 'src/models/**',
    },
    assertions: {
      isError: false,
      contains: ['User'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Filter tests
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'filter-glob-pattern',
    description: 'Filters files using glob pattern',
    tool: 'codebase_overview',
    input: {
      filter: 'src/**/*.ts',
      depth: 1,
    },
    assertions: {
      isError: false,
      contains: ['index.ts'],
    },
  },

  {
    id: 'filter-subdirectory',
    description: 'Scopes to specific subdirectory',
    tool: 'codebase_overview',
    input: {
      filter: 'src/utils/**',
      depth: 1,
    },
    assertions: {
      isError: false,
      contains: ['helpers'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Response format tests
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'response-format-json',
    description: 'Returns JSON when response_format is json',
    tool: 'codebase_overview',
    input: {
      response_format: 'json',
      filter: 'src/**',
      depth: 0,
    },
    assertions: {
      isError: false,
      fields: {
        'projectRoot': field.isString(),
      },
    },
  },

  {
    id: 'response-format-markdown',
    description: 'Returns markdown by default',
    tool: 'codebase_overview',
    input: {
      response_format: 'markdown',
      filter: 'src/**',
      depth: 0,
    },
    assertions: {
      isError: false,
      contains: ['##'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Option combination tests
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'include-imports',
    description: 'Includes import statements when includeImports=true',
    tool: 'codebase_overview',
    input: {
      includeImports: true,
      filter: 'src/index.ts',
      depth: 1,
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'include-stats',
    description: 'Includes line counts when includeStats=true',
    tool: 'codebase_overview',
    input: {
      includeStats: true,
      filter: 'src/**',
      depth: 0,
    },
    assertions: {
      isError: false,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'empty-filter-no-matches',
    description: 'Handles filter with no matching files gracefully',
    tool: 'codebase_overview',
    input: {
      filter: 'nonexistent-folder/**',
      depth: 1,
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'max-depth',
    description: 'Handles maximum depth value',
    tool: 'codebase_overview',
    input: {
      depth: 6,
      filter: 'src/models/**',
    },
    assertions: {
      isError: false,
    },
  },
];
