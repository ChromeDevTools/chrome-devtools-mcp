/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Barrel export for all test fixtures.
 */

export {codebaseOverviewFixtures} from './codebase-overview.fixtures.js';
export {codebaseExportsFixtures} from './codebase-exports.fixtures.js';
export {codebaseTraceSymbolFixtures} from './codebase-trace-symbol.fixtures.js';
export {terminalFixtures} from './terminal.fixtures.js';
export {waitFixtures} from './wait.fixtures.js';

import {codebaseOverviewFixtures} from './codebase-overview.fixtures.js';
import {codebaseExportsFixtures} from './codebase-exports.fixtures.js';
import {codebaseTraceSymbolFixtures} from './codebase-trace-symbol.fixtures.js';
import {terminalFixtures} from './terminal.fixtures.js';
import {waitFixtures} from './wait.fixtures.js';

/**
 * All fixtures combined for running comprehensive test suites.
 */
export const allFixtures = [
  ...codebaseOverviewFixtures,
  ...codebaseExportsFixtures,
  ...codebaseTraceSymbolFixtures,
  ...terminalFixtures,
  ...waitFixtures,
];

/**
 * Fixtures grouped by tool for selective testing.
 */
export const fixturesByTool: Record<string, typeof allFixtures> = {
  'codebase_overview': codebaseOverviewFixtures,
  'codebase_exports': codebaseExportsFixtures,
  'codebase_trace_symbol': codebaseTraceSymbolFixtures,
  'terminal_run': terminalFixtures.filter(f => f.tool === 'terminal_run'),
  'read_terminal': terminalFixtures.filter(f => f.tool === 'read_terminal'),
  'terminal_kill': terminalFixtures.filter(f => f.tool === 'terminal_kill'),
  'wait': waitFixtures,
};
