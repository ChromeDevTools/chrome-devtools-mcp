/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test fixtures for terminal-related tools.
 */

import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {ToolTestFixture} from '../helpers/types.js';
import {field} from '../helpers/assertions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_PATH = resolve(__dirname, '../../../test-workspace');

export const terminalFixtures: ToolTestFixture[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // terminal_run tests
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'terminal-run-simple-command',
    description: 'Runs a simple echo command',
    tool: 'terminal_run',
    input: {
      command: 'echo "hello world"',
      cwd: WORKSPACE_PATH,
      response_format: 'json',
    },
    assertions: {
      isError: false,
      fields: {
        'status': field.equals('completed'),
      },
      contains: ['hello world'],
    },
  },

  {
    id: 'terminal-run-with-name',
    description: 'Runs command in a named terminal',
    tool: 'terminal_run',
    input: {
      command: 'echo "named terminal test"',
      cwd: WORKSPACE_PATH,
      name: 'test-terminal',
      response_format: 'json',
    },
    assertions: {
      isError: false,
      fields: {
        'name': field.equals('test-terminal'),
        'status': field.equals('completed'),
      },
    },
  },

  {
    id: 'terminal-run-background-mode',
    description: 'Runs command in background mode',
    tool: 'terminal_run',
    input: {
      command: 'echo "background"',
      cwd: WORKSPACE_PATH,
      waitMode: 'background',
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'terminal-run-json-format',
    description: 'Returns JSON response format',
    tool: 'terminal_run',
    input: {
      command: 'echo "json test"',
      cwd: WORKSPACE_PATH,
      response_format: 'json',
    },
    assertions: {
      isError: false,
      fields: {
        'status': field.isString(),
        'output': field.isString(),
        'cwd': field.isString(),
        'shell': field.equals('powershell'),
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // read_terminal tests
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'read-terminal-default',
    description: 'Reads from default terminal',
    tool: 'read_terminal',
    input: {
      response_format: 'json',
    },
    assertions: {
      isError: false,
      fields: {
        'status': field.isString(),
      },
    },
  },

  {
    id: 'read-terminal-with-limit',
    description: 'Reads limited lines from terminal',
    tool: 'read_terminal',
    input: {
      limit: 10,
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'read-terminal-with-pattern',
    description: 'Filters terminal output by pattern',
    tool: 'read_terminal',
    input: {
      pattern: 'error|warning',
    },
    assertions: {
      isError: false,
    },
  },

  {
    id: 'read-terminal-named',
    description: 'Reads from a named terminal',
    tool: 'read_terminal',
    input: {
      name: 'test-terminal',
      response_format: 'json',
    },
    assertions: {
      isError: false,
      fields: {
        'name': field.equals('test-terminal'),
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // terminal_kill tests
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'terminal-kill-default',
    description: 'Sends Ctrl+C to default terminal',
    tool: 'terminal_kill',
    input: {},
    assertions: {
      isError: false,
    },
  },

  {
    id: 'terminal-kill-named',
    description: 'Sends Ctrl+C to named terminal',
    tool: 'terminal_kill',
    input: {
      name: 'test-terminal',
    },
    assertions: {
      isError: false,
    },
  },
];
