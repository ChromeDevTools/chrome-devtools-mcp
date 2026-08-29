#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

process.title = 'chrome-devtools';

import process from 'node:process';

import type {Options, PositionalOptions} from 'yargs';

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
import {hideBin, yargs, type CallToolResult} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {VERSION} from '../version.js';

import {
  applyCliStartDefaults,
  getCliStartOptions,
  readCliConfig,
  resolveCliStartArgs,
} from '../config/cli-config.js';
import {commands} from '../config/cli-options.js';
import {mcpOptions, parseArguments} from '../config/mcp-options.js';

await checkForUpdates(
  'Run `npm install -g chrome-devtools-mcp@latest` and `chrome-devtools start` to update and restart the daemon.',
);

const DEFAULT_CLI_ARGS = ['--viaCli'];

async function start(args: string[], sessionId: string) {
  const combinedArgs = [...DEFAULT_CLI_ARGS, ...args];
  await startDaemon(combinedArgs, sessionId);
  logDisclaimers(parseArguments(VERSION, combinedArgs));
}

const y = yargs(hideBin(process.argv))
  .locale('en') // Force English to ensure error string matching works in .fail, all custom messages we output are in English anyways
  .scriptName('chrome-devtools')
  .showHelpOnFail(true)
  .usage('chrome-devtools <command> [...args] --flags')
  .usage(
    `Run 'chrome-devtools <command> --help' for help on the specific command.`,
  )
  .option('sessionId', {
    type: 'string',
    description: 'Session ID for daemon scoping',
    default: '',
    hidden: true,
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
          '2. Optional parameters are passed as double-dash options/flags (e.g. --dblClick true).',
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
    process.exit(1);
  });

y.command(
  'start',
  'Start or restart chrome-devtools-mcp',
  y =>
    y
      .options(getCliStartOptions())
      .config(readCliConfig())
      .example(
        '$0 start --browserUrl http://localhost:9222',
        'Start the server connecting to an existing browser',
      )
      .strict(),
  async argv => {
    if (isDaemonRunning(argv.sessionId)) {
      await stopDaemon(argv.sessionId);
    }
    applyCliStartDefaults(argv);
    const args = serializeArgs(mcpOptions, argv);
    await start(args, argv.sessionId);
    process.exit(0);
  },
).strict(); // Re-enable strict validation for other commands; this is applied to the yargs instance itself

y.command(
  'status',
  'Checks if chrome-devtools-mcp is running',
  y => y,
  async argv => {
    if (isDaemonRunning(argv.sessionId)) {
      console.log('chrome-devtools-mcp daemon is running.');
      const response = await sendCommand(
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
        console.log(`args=${JSON.stringify(data.args)}`);
        if (data.version !== VERSION) {
          console.warn(
            `Warning: Daemon server version (${data.version}) does not match CLI version (${VERSION}). Run 'chrome-devtools start' to update and restart the daemon.`,
          );
        }
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } else {
      console.log('chrome-devtools-mcp daemon is not running.');
    }
    process.exit(0);
  },
);

y.command(
  'stop',
  'Stop chrome-devtools-mcp if any',
  y => y,
  async argv => {
    const sessionId = argv.sessionId as string;
    if (!isDaemonRunning(sessionId)) {
      process.exit(0);
    }
    await stopDaemon(sessionId);
    process.exit(0);
  },
);

for (const [commandName, commandDef] of Object.entries(commands)) {
  const args = commandDef.args;
  const requiredArgNames = Object.keys(args).filter(
    name => args[name].required,
  );

  const optionalArgNames = Object.keys(args).filter(
    name => !args[name].required,
  );

  let commandStr = commandName;
  for (const arg of requiredArgNames) {
    commandStr += ` <${arg}>`;
  }

  for (const arg of optionalArgNames) {
    commandStr += ` [--${arg}]`;
  }

  y.command(
    commandStr,
    commandDef.description,
    y => {
      y.option('output-format', {
        choices: ['md', 'json'],
        default: 'md',
      });
      for (const [argName, opt] of Object.entries(args)) {
        const type =
          opt.type === 'integer' || opt.type === 'number'
            ? 'number'
            : opt.type === 'boolean'
              ? 'boolean'
              : opt.type === 'array'
                ? 'array'
                : 'string';

        if (opt.required) {
          const options: PositionalOptions = {
            describe: opt.description,
            type: type as PositionalOptions['type'],
          };
          if (opt.default !== undefined) {
            options.default = opt.default;
          }
          if (opt.enum) {
            options.choices = opt.enum as Array<string | number>;
          }
          y.positional(argName, options);
        } else {
          const options: Options = {
            describe: opt.description,
            type: type as Options['type'],
          };
          if (opt.default !== undefined) {
            options.default = opt.default;
          }
          if (opt.enum) {
            options.choices = opt.enum as Array<string | number>;
          }
          y.option(argName, options);
        }
      }
    },
    async argv => {
      const sessionId = argv.sessionId as string;
      try {
        const versionWarningPromise = isDaemonRunning(sessionId)
          ? verifyDaemonVersion(sessionId, VERSION)
          : Promise.resolve(undefined);

        if (!isDaemonRunning(sessionId)) {
          await start(resolveCliStartArgs([], readCliConfig()), sessionId);
        }

        const commandArgs: Record<string, unknown> = {};
        for (const argName of Object.keys(args)) {
          if (argName in argv) {
            commandArgs[argName] = argv[argName];
          }
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
          console.log(
            await handleResponse(
              JSON.parse(response.result) as unknown as CallToolResult,
              argv['output-format'] as 'json' | 'md',
            ),
          );
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
    },
  );
}

await y.parse();
