/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration test runner for single-file MCP tool fixtures.
 * 
 * Each test is a JSON file containing:
 * - input: Tool input parameters
 * - output: Expected JSON field assertions
 * 
 * Structure: fixtures/{tool_name}/{test_id}.json
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {getTestClient, cleanupTestClient} from '../helpers/mcp-client.js';
import {
  loadFixturesForTool,
  getToolNames,
  type LoadedFixture,
} from '../helpers/fixture-loader.js';
import {assertJsonFields} from '../helpers/field-assertions.js';

describe('MCP Tools - Single File Fixtures', () => {
  beforeAll(async () => {
    await getTestClient().connect();
  }, 60000);

  afterAll(async () => {
    await cleanupTestClient();
  });

  // Discover all tools with fixtures
  const toolNames = getToolNames();
  
  for (const toolName of toolNames) {
    const fixtures = loadFixturesForTool(toolName);
    
    if (fixtures.length === 0) {
      continue;
    }
    
    describe(`${toolName}`, () => {
      for (const fixture of fixtures) {
        it(fixture.id, async () => {
          await runFixtureTest(fixture);
        }, 120000);
      }
    });
  }
});

/**
 * Run a single fixture test.
 */
async function runFixtureTest(fixture: LoadedFixture): Promise<void> {
  const client = getTestClient();
  
  // Always request JSON format for field assertions
  const input: Record<string, unknown> = {
    ...fixture.input,
    response_format: 'json',
  };
  
  // Call the tool
  const result = await client.callTool(fixture.tool, input);
  
  // Log for debugging
  console.error(`[${fixture.tool}/${fixture.id}] isError=${result.isError}, hasJson=${result.json !== undefined}`);
  
  // Basic success check
  expect(result.isError, `Tool returned error: ${result.text?.slice(0, 200)}`).toBe(false);
  
  // Run field assertions if output exists
  if (fixture.expectedJson && result.json) {
    assertJsonFields(result.json, fixture.expectedJson);
  }
}
