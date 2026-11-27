/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import {
  buildCommand,
  getCommandArgSpec,
  registerCommandArgs,
  shieldLiteralArgs,
} from '../config/cli-commands.js';
import {commands} from '../config/cli-options.js';
import type {ConfigLocator} from '../config/ConfigLocator.js';
import {ConfigParser} from '../config/ConfigParser.js';
import {getCliOptions} from '../config/mcp-options.js';
import {
  handleResponse,
  sendCommand,
  startDaemon,
  stopDaemon,
  verifyDaemonVersion,
} from './client.js';
import type {DaemonStatusResult} from './types.js';
import {
  assertValidSessionId,
  getDefaultSessionId,
  isDaemonRunning,
  serializeArgs,
  SESSION_ID_ENV_VAR,
} from './utils.js';
import {yargs} from '../third_party/cli.js';
import type {CallToolResult} from '../third_party/index.js';
import {logDisclaimers} from '../utils/disclaimers.js';
import {
  redactDaemonArgsForLogging,
  stripTerminalEscapes,
} from '../utils/logger.js';
import {VERSION} from '../version.js';

const DEFAULT_CLI_ARGS = ['--viaCli'];

class CliExitError extends Error {
  constructor(readonly exitCode: number) {
    super(`CLI exited with code ${exitCode}`);
  }
}

export interface RunCliOptions {
  env?: NodeJS.ProcessEnv;
  exitProcess?: boolean;
  configLocator?: ConfigLocator;
  isDaemonRunning?: typeof isDaemonRunning;
  startDaemon?: typeof startDaemon;
  stopDaemon?: typeof stopDaemon;
  sendCommand?: typeof sendCommand;
  handleResponse?: typeof handleResponse;
  verifyDaemonVersion?: typeof verifyDaemonVersion;
  logDisclaimers?: typeof logDisclaimers;
}

export async function runCli(
  rawArgs: readonly string[],
  options: RunCliOptions = {},
): Promise<number> {
  const {
    env = process.env,
    exitProcess = true,
    configLocator,
    isDaemonRunning: checkDaemonRunning = isDaemonRunning,
    startDaemon: launchDaemon = startDaemon,
    stopDaemon: terminateDaemon = stopDaemon,
    sendCommand: sendDaemonCommand = sendCommand,
    handleResponse: formatToolResponse = handleResponse,
    verifyDaemonVersion: checkDaemonVersion = verifyDaemonVersion,
    logDisclaimers: printDisclaimers = logDisclaimers,
  } = options;

  let exitCode = 0;
  let handledFail = false;
  let handledFailError: unknown;

  async function start(
    args: string[],
    sessionId: string,
    stopExisting = false,
  ): Promise<void> {
    const combinedArgs = [...DEFAULT_CLI_ARGS, ...args];
    // Validates the arguments and the config file before starting the daemon.
    const parsedArgs = new ConfigParser(
      VERSION,
      [process.execPath, process.argv[1], ...combinedArgs],
      env,
      exitProcess,
      configLocator,
    ).parse();
    if (stopExisting && checkDaemonRunning(sessionId)) {
      await terminateDaemon(sessionId);
    }
    await launchDaemon(combinedArgs, sessionId);
    printDisclaimers(parsedArgs);
  }

  const {argv: cliArgs, restore: restoreLiteralArg} = shieldLiteralArgs(
    rawArgs,
    commandName => {
      const commandDef = Object.hasOwn(commands, commandName)
        ? commands[commandName]
        : undefined;
      return commandDef ? getCommandArgSpec(commandDef.args) : undefined;
    },
  );

  const y = yargs(cliArgs)
    .locale('en') // Force English to ensure error string matching works in .fail, all custom messages we output are in English anyways
    .scriptName('chrome-devtools')
    .exitProcess(exitProcess)
    .showHelpOnFail(true)
    .usage('chrome-devtools <command> [...args] --flags')
    .usage(
      `Run 'chrome-devtools <command> --help' for help on the specific command.`,
    )
    .option('sessionId', {
      type: 'string',
      description:
        'Use a separate daemon, browser and tabs for this ID. Use hex digits and dashes, for example a UUID. Commands without an ID share one default daemon. Pass the same ID to start, status, stop and every tool command.',
      default: getDefaultSessionId(env),
      defaultDescription: `$${SESSION_ID_ENV_VAR}`,
      coerce: (sessionId: string) => {
        assertValidSessionId(sessionId);
        return sessionId;
      },
    })
    .demandCommand()
    .version(VERSION)
    .strict()
    .help(true)
    .wrap(120)
    .fail((msg, err) => {
      handledFail = true;
      handledFailError = err;
      if (msg) {
        console.error('Error:', msg);
        if (
          msg.includes('Not enough non-option arguments') ||
          msg.includes('Unknown argument') ||
          msg.includes('Unknown arguments')
        ) {
          console.error('\n=========================================');
          console.error('💡 TIP FOR AI AGENT / DEVELOPER:');
          console.error('In the `chrome-devtools` CLI:');
          console.error(
            '1. Required parameters MUST be passed as positional arguments (without flags).',
          );
          console.error(
            '   - INCORRECT: chrome-devtools click --pageId 1 --uid "1_2"',
          );
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
      } else if (err) {
        console.error(err);
      }
      throw new CliExitError(1);
    });

  y.command(
    'start',
    'Start or restart chrome-devtools-mcp',
    y =>
      y
        .options(getCliOptions())
        .requiresArg('filesystemRoot')
        .check(argv => {
          const roots = argv.filesystemRoot;
          if (
            Array.isArray(roots) &&
            (roots.length === 0 ||
              roots.some(
                root => typeof root === 'string' && root.trim() === '',
              ))
          ) {
            throw new Error(
              'Invalid --filesystemRoot: at least one non-empty path is required.',
            );
          }
          return true;
        })
        .example(
          '$0 start --browserUrl http://localhost:9222',
          'Start the server connecting to an existing browser',
        )
        .strict(),
    async argv => {
      const args = serializeArgs(getCliOptions(), argv);
      await start(args, argv.sessionId, /* stopExisting= */ true);
    },
  ).strict(); // Re-enable strict validation for other commands; this is applied to the yargs instance itself

  y.command(
    'status',
    'Checks if chrome-devtools-mcp is running',
    y => y,
    async argv => {
      if (checkDaemonRunning(argv.sessionId)) {
        console.log('chrome-devtools-mcp daemon is running.');
        const response = await sendDaemonCommand(
          {
            method: 'status',
          },
          argv.sessionId,
        );
        if (response.success) {
          const data: DaemonStatusResult = JSON.parse(response.result);
          console.log(
            `pid=${data.pid} socket=${data.socketPath} start-date=${data.startDate} version=${data.version}`,
          );
          const redactedArgs = Array.isArray(data.args)
            ? redactDaemonArgsForLogging(data.args)
            : [];
          console.log(`args=${JSON.stringify(redactedArgs)}`);
          if (data.version !== VERSION) {
            console.warn(
              `Warning: Daemon server version (${data.version}) does not match CLI version (${VERSION}). Run 'chrome-devtools start' to update and restart the daemon.`,
            );
          }
        } else {
          console.error('Error:', response.error);
          exitCode = 1;
        }
      } else {
        console.log('chrome-devtools-mcp daemon is not running.');
      }
    },
  );

  y.command(
    'stop',
    'Stop chrome-devtools-mcp if any',
    y => y,
    async argv => {
      if (!checkDaemonRunning(argv.sessionId)) {
        return;
      }
      await terminateDaemon(argv.sessionId);
    },
  );

  for (const [commandName, commandDef] of Object.entries(commands)) {
    const args = commandDef.args;
    const {command, usage} = buildCommand(commandName, args);

    y.command(
      command,
      commandDef.description,
      y => {
        y.usage(usage);
        y.option('output-format', {
          choices: ['md', 'json'],
          default: 'md',
        });
        registerCommandArgs(y, args);
        return y;
      },
      async argv => {
        const sessionId = argv.sessionId;
        try {
          const daemonRunning = checkDaemonRunning(sessionId);
          const versionWarningPromise = daemonRunning
            ? checkDaemonVersion(sessionId, VERSION)
            : Promise.resolve(undefined);

          if (!daemonRunning) {
            await start([], sessionId);
          }

          const commandArgs: Record<string, unknown> = {};
          for (const argName of Object.keys(args)) {
            if (argName in argv) {
              commandArgs[argName] = restoreLiteralArg(argv[argName]);
            }
          }

          const response = await sendDaemonCommand(
            {
              method: 'invoke_tool',
              tool: commandName,
              args: commandArgs,
            },
            sessionId,
          );

          if (response.success) {
            const toolResult: CallToolResult = JSON.parse(response.result);
            const outputFormat =
              argv['output-format'] === 'json' ? 'json' : 'md';
            console.log(
              stripTerminalEscapes(
                await formatToolResponse(toolResult, outputFormat),
              ),
            );
          } else {
            console.error(
              'Error:',
              stripTerminalEscapes(String(response.error)),
            );
          }

          const versionWarning = await versionWarningPromise;
          if (versionWarning) {
            console.warn(versionWarning);
          }

          if (!response.success) {
            exitCode = 1;
          }
        } catch (error) {
          console.error('Failed to execute command:', error);
          exitCode = 1;
        }
      },
    );
  }

  try {
    await y.parse();
    return exitCode;
  } catch (error) {
    if (error instanceof CliExitError) {
      return error.exitCode;
    }
    if (handledFail && error === handledFailError) {
      return 1;
    }
    throw error;
  }
}
