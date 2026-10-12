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
import {
  isDaemonRunning,
  serializeArgs,
  assertValidSessionId,
} from '../daemon/utils.js';
import {logDisclaimers} from '../index.js';
import type {CallToolResult} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {VERSION} from '../version.js';

import {buildCommand, isOptionalPositionalArg} from '../config/cli-commands.js';
import {commands} from '../config/cli-options.js';
import {mcpOptions, getCliOptions} from '../config/mcp-options.js';
import {ConfigParser} from '../config/ConfigParser.js';
import {
  parseCliCommand,
  formatCliTip,
  CliParseError,
} from '../config/cli-parser.js';

process.title = 'chrome-devtools';

function isDaemonStatusResult(val: unknown): val is DaemonStatusResult {
  return typeof val === 'object' && val !== null;
}

function isCallToolResult(val: unknown): val is CallToolResult {
  return typeof val === 'object' && val !== null;
}

await checkForUpdates(
  'Run `npm install -g chrome-devtools-mcp@latest` and `chrome-devtools start` to update and restart the daemon.',
);

const DEFAULT_CLI_ARGS = ['--viaCli'];

async function start(
  args: string[],
  sessionId: string,
  stopExisting = false,
): Promise<void> {
  const combinedArgs = [...DEFAULT_CLI_ARGS, ...args];
  const parsedArgs = new ConfigParser(VERSION, [
    process.execPath,
    process.argv[1],
    ...combinedArgs,
  ]).parse();
  if (stopExisting && isDaemonRunning(sessionId)) {
    await stopDaemon(sessionId);
  }
  await startDaemon(combinedArgs, sessionId);
  logDisclaimers(parsedArgs);
}

function printGeneralHelp(): void {
  console.log('chrome-devtools <command> [...args] --flags');
  console.log(
    "Run 'chrome-devtools <command> --help' for help on the specific command.\n",
  );
  console.log('Commands:');
  console.log('  start   Start or restart chrome-devtools-mcp');
  console.log('  status  Checks if chrome-devtools-mcp is running');
  console.log('  stop    Stop chrome-devtools-mcp if any');
  for (const [cmd, def] of Object.entries(commands)) {
    const {command} = buildCommand(cmd, def.args);
    console.log(`  chrome-devtools ${command.padEnd(32)} ${def.description}`);
  }
}

async function printCommandHelp(commandName: string): Promise<void> {
  if (commandName === 'start') {
    const parser = new ConfigParser(VERSION, [
      process.execPath,
      process.argv[1],
    ]);
    const help = await parser
      .buildCliParser(getCliOptions())
      .scriptName('chrome-devtools start')
      .example([
        [
          '$0 --browserUrl http://localhost:9222',
          'Start the server connecting to an existing browser',
        ],
      ])
      .getHelp();
    console.log(help);
    return;
  }
  if (commandName === 'status') {
    console.log('chrome-devtools status\n');
    console.log('Checks if chrome-devtools-mcp is running');
    return;
  }
  if (commandName === 'stop') {
    console.log('chrome-devtools stop\n');
    console.log('Stop chrome-devtools-mcp if any');
    return;
  }
  const cmdDef = commands[commandName];
  if (cmdDef) {
    const {usage} = buildCommand(commandName, cmdDef.args);
    console.log(usage.replace('$0', 'chrome-devtools'));
    console.log(`\n${cmdDef.description}\n`);

    const positionals = Object.entries(cmdDef.args).filter(
      ([argName, opt]) =>
        opt.required || isOptionalPositionalArg(commandName, argName),
    );
    const options = Object.entries(cmdDef.args).filter(
      ([argName, opt]) =>
        !opt.required && !isOptionalPositionalArg(commandName, argName),
    );

    if (positionals.length > 0) {
      console.log('Positionals:');
      for (const [argName, opt] of positionals) {
        const meta = [
          `[${opt.type}]`,
          opt.required ? '[required]' : '',
          opt.enum ? `[choices: ${opt.enum.map(c => JSON.stringify(c)).join(', ')}]` : '',
        ]
          .filter(Boolean)
          .join(' ');
        console.log(`  ${argName.padEnd(20)} ${opt.description} ${meta}`);
      }
      console.log('');
    }

    console.log('Options:');
    console.log('  --help               Show help [boolean]');
    console.log(
      '  --output-format      Output format [choices: "md", "json"] [default: "md"]',
    );
    for (const [argName, opt] of options) {
      const meta = [
        `[${opt.type}]`,
        opt.enum ? `[choices: ${opt.enum.map(c => JSON.stringify(c)).join(', ')}]` : '',
        opt.default !== undefined ? `[default: ${JSON.stringify(opt.default)}]` : '',
      ]
        .filter(Boolean)
        .join(' ');
      console.log(`  --${argName.padEnd(18)} ${opt.description} ${meta}`);
    }
  }
}

try {
  const rawArgs = process.argv.slice(2);
  const parsed = parseCliCommand(rawArgs, commands, getCliOptions);

  if (parsed.command === 'version') {
    console.log(VERSION);
    process.exit(0);
  }

  if (parsed.help) {
    if (parsed.command === 'help') {
      printGeneralHelp();
    } else {
      await printCommandHelp(parsed.command);
    }
    process.exit(0);
  }

  assertValidSessionId(parsed.sessionId);

  if (parsed.command === 'start') {
    const args = serializeArgs(getCliOptions(), parsed.serverArgs ?? {});
    await start(args, parsed.sessionId, /* stopExisting= */ true);
    process.exit(0);
  }

  if (parsed.command === 'status') {
    if (isDaemonRunning(parsed.sessionId)) {
      console.log('chrome-devtools-mcp daemon is running.');
      const response = await sendCommand(
        {
          method: 'status',
        },
        parsed.sessionId,
      );
      if (response.success) {
        const rawData: unknown = JSON.parse(response.result);
        if (isDaemonStatusResult(rawData)) {
          console.log(
            `pid=${rawData.pid} socket=${rawData.socketPath} start-date=${rawData.startDate} version=${rawData.version}`,
          );
          console.log(`args=${JSON.stringify(rawData.args)}`);
          if (rawData.version !== VERSION) {
            console.warn(
              `Warning: Daemon server version (${rawData.version}) does not match CLI version (${VERSION}). Run 'chrome-devtools start' to update and restart the daemon.`,
            );
          }
        }
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } else {
      console.log('chrome-devtools-mcp daemon is not running.');
    }
    process.exit(0);
  }

  if (parsed.command === 'stop') {
    if (!isDaemonRunning(parsed.sessionId)) {
      process.exit(0);
    }
    await stopDaemon(parsed.sessionId);
    process.exit(0);
  }

  const commandName = parsed.command;
  const sessionId = parsed.sessionId;
  try {
    const versionWarningPromise = isDaemonRunning(sessionId)
      ? verifyDaemonVersion(sessionId, VERSION)
      : Promise.resolve(undefined);

    if (!isDaemonRunning(sessionId)) {
      await start(serializeArgs(mcpOptions, parsed.toolArgs ?? {}), sessionId);
    }

    const response = await sendCommand(
      {
        method: 'invoke_tool',
        tool: commandName,
        args: parsed.toolArgs ?? {},
      },
      sessionId,
    );

    if (response.success) {
      const toolResult: unknown = JSON.parse(response.result);
      if (isCallToolResult(toolResult)) {
        console.log(
          await handleResponse(
            toolResult,
            parsed.outputFormat ?? 'md',
          ),
        );
      }
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
} catch (error) {
  if (error instanceof CliParseError) {
    console.error(formatCliTip(error.message));
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
}
