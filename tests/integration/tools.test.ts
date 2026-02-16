/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration test runner for MCP tools.
 *
 * This test file uses a data-driven approach:
 * - Fixtures define inputs and expected outputs
 * - Tests are generated from fixtures using describe.each
 * - Assertions validate tool responses against expectations
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {getTestClient, cleanupTestClient} from '../helpers/mcp-client.js';
import {assertToolResult} from '../helpers/assertions.js';
import {
  allFixtures,
  codebaseOverviewFixtures,
  codebaseExportsFixtures,
  codebaseTraceSymbolFixtures,
  terminalFixtures,
  waitFixtures,
} from '../fixtures/index.js';
import type {ToolTestFixture} from '../helpers/types.js';

describe('MCP Tools Integration Tests', () => {
  beforeAll(async () => {
    // Get or create the shared MCP client
    await getTestClient();
  }, 60000);

  afterAll(async () => {
    // Cleanup the MCP client
    await cleanupTestClient();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Wait Tool Tests (simple tool for infrastructure validation)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wait tool', () => {
    it.each(waitFixtures.map(f => [f.id, f] as const))(
      'fixture: %s',
      async (_id: string, fixture: ToolTestFixture) => {
        await runFixtureTest(fixture);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Codebase Overview Tool Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('codebase_overview tool', () => {
    it.each(codebaseOverviewFixtures.map(f => [f.id, f] as const))(
      'fixture: %s',
      async (_id: string, fixture: ToolTestFixture) => {
        await runFixtureTest(fixture);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Codebase Exports Tool Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('codebase_exports tool', () => {
    it.each(codebaseExportsFixtures.map(f => [f.id, f] as const))(
      'fixture: %s',
      async (_id: string, fixture: ToolTestFixture) => {
        await runFixtureTest(fixture);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Codebase Trace Symbol Tool Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('codebase_trace_symbol tool', () => {
    it.each(codebaseTraceSymbolFixtures.map(f => [f.id, f] as const))(
      'fixture: %s',
      async (_id: string, fixture: ToolTestFixture) => {
        await runFixtureTest(fixture);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Terminal Tool Tests
  // ═══════════════════════════════════════════════════════════════════════════

  describe('terminal tools', () => {
    it.each(terminalFixtures.map(f => [f.id, f] as const))(
      'fixture: %s',
      async (_id: string, fixture: ToolTestFixture) => {
        await runFixtureTest(fixture);
      },
    );
  });
});

/**
 * Runs a single fixture test.
 */
async function runFixtureTest(fixture: ToolTestFixture): Promise<void> {
  const client = await getTestClient();
  const result = await client.callTool(fixture.tool, fixture.input);

  // Always log the response for debugging
  console.error(`\n========== [${fixture.id}] ==========`);
  console.error('Tool:', fixture.tool);
  console.error('Input:', JSON.stringify(fixture.input));
  console.error('isError:', result.isError);
  console.error('Text (first 500 chars):', result.text?.slice(0, 500));
  console.error('==========================================\n');

  // Run all assertions
  assertToolResult(result, fixture.assertions);

  // Additional custom assertions if needed
  if (fixture.assertions.contains) {
    const text = result.text || JSON.stringify(result.json);

    for (const substring of fixture.assertions.contains) {
      expect(text.toLowerCase()).toContain(substring.toLowerCase());
    }
  }
}
