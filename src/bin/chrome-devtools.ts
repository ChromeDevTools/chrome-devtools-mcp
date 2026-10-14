#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {
  startDaemon,
  stopDaemon,
  sendCommand,
  handleResponse,
  verifyDaemonVersion,
} from '../daemon/client.js';
import type {DaemonStatusResult} from '../daemon/types.js';
import {isDaemonRunning} from '../daemon/utils.js';
import {logDisclaimers} from '../index.js';
import type {CallToolResult} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {VERSION} from '../version.js';

import {formatRootHelp, formatStartHelp, formatToolHelp} from '../cli/help.js';
import {
  assertNoArgs,
  CliUsageError,
  parseGlobalArgs,
  parseToolArgs,
} from '../cli/parser.js';
import {commands} from '../config/cli-options.js';
import {getCliOptions} from '../config/mcp-options.js';

import {ConfigParser} from '../config/ConfigParser.js';

process.title = 'chrome-devtools';

await checkForUpdates(
  'Run `npm install -g chrome-devtools-mcp@latest` and `chrome-devtools start` to update and restart the daemon.',
);

const DEFAULT_CLI_ARGS = ['--viaCli'];

/**
 * `chrome-devtools start` forwards the raw arguments to the daemon, which
 * accepts every chrome-devtools-mcp option. Keep the CLI restricted to the
 * options that make sense for it.
 */
function rejectNonCliOptions(parser: ConfigParser): void {
  const allowed = new Set<string>([
    ...Object.keys(getCliOptions()),
    'viaCli',
    'config',
  ]);
  let cliArgs: Record<string, unknown>;
  try {
    cliArgs = parser.parseCliArgs();
  } catch (error) {
    throw new CliUsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  const unknown = Object.keys(cliArgs).filter(key => !allowed.has(key));
  if (unknown.length > 0) {
    throw new CliUsageError(
      `Unknown arguments: ${unknown.map(key => `--${key}`).join(', ')}`,
    );
  }
}

async function start(
  mcpArgs: string[],
  sessionId: string,
  stopExisting = false,
): Promise<void> {
  const combinedArgs = [...DEFAULT_CLI_ARGS, ...mcpArgs];
  // Validates the arguments and the config file before starting the daemon:
  // the daemon's stdio is detached, so errors there would not reach the user.
  const parser = new ConfigParser(VERSION, [
    process.execPath,
    process.argv[1],
    ...combinedArgs,
  ]);
  rejectNonCliOptions(parser);
  const parsedArgs = parser.parse();
  if (stopExisting && isDaemonRunning(sessionId)) {
    await stopDaemon(sessionId);
  }
  await startDaemon(combinedArgs, sessionId);
  logDisclaimers(parsedArgs);
}

function printAgentTip(): void {
  console.error('\n=========================================');
  console.error('💡 TIP FOR AI AGENT / DEVELOPER:');
  console.error('In the `chrome-devtools` CLI:');
  console.error(
    '1. Required parameters MUST be passed as positional arguments (without flags).',
  );
  console.error('   - INCORRECT: chrome-devtools click --pageId 1 --uid "1_2"');
  console.error('   - CORRECT:   chrome-devtools click 1 "1_2"');
  console.error(
    '   - CORRECT:   chrome-devtools evaluate_script "() => document.title" --pageId 1',
  );
  console.error(
    '2. Optional parameters are passed as double-dash options/flags (e.g. --dblClick true), except optional positional parameters shown in command help.',
  );
  console.error(
    '3. Make sure to escape quotes properly for your shell environment.',
  );
  console.error(
    'Run `chrome-devtools <command> --help` to see exact positional and optional parameters.',
  );
  console.error('=========================================');
}

function fail(error: unknown): never {
  if (error instanceof CliUsageError) {
    console.error('Error:', error.message);
    if (error.showTip) {
      printAgentTip();
    }
  } else {
    console.error(error);
  }
  process.exit(1);
}

async function status(sessionId: string): Promise<void> {
  if (!isDaemonRunning(sessionId)) {
    console.log('chrome-devtools-mcp daemon is not running.');
    return;
  }
  console.log('chrome-devtools-mcp daemon is running.');
  const response = await sendCommand({method: 'status'}, sessionId);
  if (!response.success) {
    console.error('Error:', response.error);
    process.exit(1);
  }
  const data: DaemonStatusResult = JSON.parse(response.result);
  console.log(
    `pid=${data.pid} socket=${data.socketPath} start-date=${data.startDate} version=${data.version}`,
  );
  console.log(`args=${JSON.stringify(data.args)}`);
  if (data.version !== VERSION) {
    console.warn(
      `Warning: Daemon server version (${data.version}) does not match CLI version (${VERSION}). Run 'chrome-devtools start' to update and restart the daemon.`,
    );
  }
}

async function invokeTool(
  commandName: string,
  args: string[],
  sessionId: string,
): Promise<void> {
  const commandDef = commands[commandName];
  const {args: commandArgs, outputFormat} = parseToolArgs(
    {name: commandName, args: commandDef.args},
    args,
  );
  try {
    const versionWarningPromise = isDaemonRunning(sessionId)
      ? verifyDaemonVersion(sessionId, VERSION)
      : Promise.resolve(undefined);

    if (!isDaemonRunning(sessionId)) {
      await start([], sessionId);
    }

    const response = await sendCommand(
      {
        method: 'invoke_tool',
        tool: commandName,
        args: commandArgs,
      },
      sessionId,
    );

    if (response.success) {
      const result: CallToolResult = JSON.parse(response.result);
      console.log(await handleResponse(result, outputFormat));
    } else {
      console.error('Error:', response.error);
    }

    const versionWarning = await versionWarningPromise;
    if (versionWarning) {
      console.warn(versionWarning);
    }

    if (!response.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to execute command:', error);
    process.exit(1);
  }
}

try {
  const global = parseGlobalArgs(
    process.argv.slice(2),
    process.env.CD4A_INTERNAL_DAEMON_SESSION_ID || '',
  );
  if (global.version) {
    console.log(VERSION);
    process.exit(0);
  }
  if (global.command === undefined) {
    if (global.help) {
      console.log(formatRootHelp(commands));
      process.exit(0);
    }
    console.error(formatRootHelp(commands));
    throw new CliUsageError(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  }

  if (global.command === 'start') {
    if (global.help) {
      console.log(formatStartHelp(getCliOptions()));
      process.exit(0);
    }
    await start(global.rest, global.sessionId, /* stopExisting= */ true);
  } else if (global.command === 'status') {
    assertNoArgs('status', global.rest);
    await status(global.sessionId);
  } else if (global.command === 'stop') {
    assertNoArgs('stop', global.rest);
    if (isDaemonRunning(global.sessionId)) {
      await stopDaemon(global.sessionId);
    }
  } else {
    if (!Object.hasOwn(commands, global.command)) {
      throw new CliUsageError(
        `Unknown command: ${global.command}`,
        /* showTip= */ true,
      );
    }
    const commandDef = commands[global.command];
    if (global.help) {
      console.log(formatToolHelp(global.command, commandDef));
      process.exit(0);
    }
    await invokeTool(global.command, global.rest, global.sessionId);
  }
  process.exit(0);
} catch (error) {
  fail(error);
}
