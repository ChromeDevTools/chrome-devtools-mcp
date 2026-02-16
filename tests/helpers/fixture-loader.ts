/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fixture loader for single-file test fixtures.
 * 
 * Each test is a single JSON file containing:
 * - input: Tool input parameters
 * - output: Expected JSON response assertions
 * 
 * Convention:
 * - Tool name: folder name (fixtures/{tool_name}/)
 * - Test ID: filename without .json extension (fixtures/codebase_overview/{test_id}.json)
 */

import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {join, basename, dirname, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

/**
 * Raw fixture file format.
 */
interface FixtureFile {
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}

/**
 * Represents a single loaded test fixture.
 */
export interface LoadedFixture {
  /** Test ID derived from filename */
  id: string;
  
  /** Tool name derived from parent folder */
  tool: string;
  
  /** Full path to the fixture file */
  path: string;
  
  /** Input parameters */
  input: Record<string, unknown>;
  
  /** Expected JSON assertions */
  expectedJson?: Record<string, unknown>;
}

/**
 * Dynamic field rules for stripping non-deterministic content.
 */
export interface DynamicFieldRules {
  /** Regex patterns to strip from text output before comparison */
  stripPatterns: RegExp[];
  
  /** JSON field paths to ignore in assertions */
  ignoredFields: string[];
}

/**
 * Per-tool dynamic field configuration.
 */
export const dynamicFieldRules: Record<string, DynamicFieldRules> = {
  codebase_overview: {
    stripPatterns: [
      /---\n📺 \*\*Terminal Sessions[\s\S]*/,
      /---\n✅ \*\*Recently Completed[\s\S]*/,
    ],
    ignoredFields: ['terminalSessions', 'activeProcesses', 'recentlyCompleted'],
  },
  codebase_exports: {
    stripPatterns: [
      /---\n📺 \*\*Terminal Sessions[\s\S]*/,
      /---\n✅ \*\*Recently Completed[\s\S]*/,
    ],
    ignoredFields: ['terminalSessions', 'activeProcesses', 'recentlyCompleted'],
  },
  codebase_trace_symbol: {
    stripPatterns: [
      /---\n📺 \*\*Terminal Sessions[\s\S]*/,
      /---\n✅ \*\*Recently Completed[\s\S]*/,
    ],
    ignoredFields: ['terminalSessions', 'activeProcesses', 'recentlyCompleted'],
  },
  codebase_find_unused: {
    stripPatterns: [
      /---\n📺 \*\*Terminal Sessions[\s\S]*/,
      /---\n✅ \*\*Recently Completed[\s\S]*/,
    ],
    ignoredFields: ['terminalSessions', 'activeProcesses', 'recentlyCompleted'],
  },
};

/**
 * Load a single test fixture from a JSON file.
 */
export function loadFixture(filePath: string, toolName: string): LoadedFixture | null {
  if (!existsSync(filePath) || extname(filePath) !== '.json') {
    return null;
  }
  
  const content = JSON.parse(readFileSync(filePath, 'utf-8')) as FixtureFile;
  
  if (!content.input) {
    console.warn(`Skipping ${filePath}: no 'input' field found`);
    return null;
  }
  
  return {
    id: basename(filePath, '.json'),
    tool: toolName,
    path: filePath,
    input: content.input,
    expectedJson: content.output,
  };
}

/**
 * Load all fixtures for a specific tool.
 */
export function loadFixturesForTool(toolName: string): LoadedFixture[] {
  const toolDir = join(FIXTURES_DIR, toolName);
  
  if (!existsSync(toolDir)) {
    return [];
  }
  
  const fixtures: LoadedFixture[] = [];
  const entries = readdirSync(toolDir);
  
  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue;
    }
    
    const filePath = join(toolDir, entry);
    if (statSync(filePath).isFile()) {
      const fixture = loadFixture(filePath, toolName);
      if (fixture) {
        fixtures.push(fixture);
      }
    }
  }
  
  return fixtures;
}

/**
 * Load all fixtures for all tools.
 */
export function loadAllFixtures(): LoadedFixture[] {
  const allFixtures: LoadedFixture[] = [];
  
  if (!existsSync(FIXTURES_DIR)) {
    return allFixtures;
  }
  
  const tools = getToolNames();
  
  for (const tool of tools) {
    allFixtures.push(...loadFixturesForTool(tool));
  }
  
  return allFixtures;
}

/**
 * Get available tool names (top-level folders in fixtures/).
 */
export function getToolNames(): string[] {
  if (!existsSync(FIXTURES_DIR)) {
    return [];
  }
  
  return readdirSync(FIXTURES_DIR)
    .filter(entry => {
      const fullPath = join(FIXTURES_DIR, entry);
      return statSync(fullPath).isDirectory() && !entry.startsWith('_');
    });
}

/**
 * Strip dynamic content from text output based on tool rules.
 */
export function stripDynamicContent(text: string, toolName: string): string {
  const rules = dynamicFieldRules[toolName];
  if (!rules) {
    return text;
  }
  
  let result = text;
  for (const pattern of rules.stripPatterns) {
    result = result.replace(pattern, '');
  }
  
  return result.trim();
}
