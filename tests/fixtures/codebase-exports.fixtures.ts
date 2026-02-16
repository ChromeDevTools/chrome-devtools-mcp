/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test fixtures for the `codebase_exports` tool.
 */

import type {ToolTestFixture} from '../helpers/types.js';
import {field} from '../helpers/assertions.js';

export const codebaseExportsFixtures: ToolTestFixture[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Basic file analysis
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'single-ts-file',
    description: 'Analyzes exports from a single TypeScript file',
    tool: 'codebase_exports',
    input: {
      path: 'src/utils/helpers.ts',
    },
    assertions: {
      isError: false,
      contains: ['formatCurrency', 'export'],
    },
  },

  {
    id: 'directory-exports',
    description: 'Analyzes all exports from a directory',
    tool: 'codebase_exports',
    input: {
      path: 'src/utils',
    },
    assertions: {
      isError: false,
      contains: ['helpers'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Kind filtering
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'kind-functions-only',
    description: 'Filters to show only function exports',
    tool: 'codebase_exports',
    input: {
      path: 'src/utils/helpers.ts',
      kind: 'functions',
    },
    assertions: {
      isError: false,
      contains: ['function'],
    },
  },

  {
    id: 'kind-interfaces-only',
    description: 'Filters to show only interface exports',
    tool: 'codebase_exports',
    input: {
      path: 'src/models/User.ts',
      kind: 'interfaces',
    },
    assertions: {
      isError: false,
      contains: ['interface'],
    },
  },

  {
    id: 'kind-classes',
    description: 'Filters to show only class exports',
    tool: 'codebase_exports',
    input: {
      path: 'src/models/User.ts',
      kind: 'classes',
    },
    assertions: {
      isError: false,
      contains: ['class'],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Include options
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'include-types',
    description: 'Includes type signatures when includeTypes=true',
    tool: 'codebase_exports',
    input: {
      path: 'src/models/User.ts',
      includeTypes: true,
    },
    assertions: {
      isError: false,
      contains: [':'],
    },
  },

  {
    id: 'exclude-types',
    description: 'Excludes type signatures when includeTypes=false',
    tool: 'codebase_exports',
    input: {
      path: 'src/models/User.ts',
      includeTypes: false,
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'include-jsdoc',
    description: 'Includes JSDoc comments when includeJSDoc=true',
    tool: 'codebase_exports',
    input: {
      path: 'src/utils/helpers.ts',
      includeJSDoc: true,
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
    tool: 'codebase_exports',
    input: {
      path: 'src/utils/helpers.ts',
      response_format: 'json',
    },
    assertions: {
      isError: false,
      fields: {
        'module': field.isString(),
        'exports': field.isArray(),
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'nonexistent-file',
    description: 'Returns error for nonexistent file',
    tool: 'codebase_exports',
    input: {
      path: 'nonexistent/file.ts',
    },
    assertions: {
      isError: true,
    },
  },

  {
    id: 'non-ts-file',
    description: 'Handles non-TypeScript files gracefully',
    tool: 'codebase_exports',
    input: {
      path: 'package.json',
    },
    assertions: {
      isError: false,
    },
  },
];
