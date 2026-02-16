/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // Test directory
    include: ['tests/**/*.test.ts'],

    // Global timeout (120s for real VS Code operations)
    testTimeout: 120_000,

    // Hooks timeout
    hookTimeout: 60_000,

    // Run tests sequentially - we're talking to a shared MCP server
    // In Vitest 4, poolOptions are now top-level
    pool: 'forks',
    isolate: false,

    // Reporter
    reporters: ['verbose'],

    // Globals (describe, it, expect)
    globals: true,

    // TypeScript support
    typecheck: {
      enabled: false, // Rely on tsc for type checking
    },
  },
});
