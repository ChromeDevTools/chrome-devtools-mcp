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
} from '../daemon/client.js';
import {isDaemonRunning, serializeArgs} from '../daemon/utils.js';
import {logDisclaimers} from '../index.js';
import {hideBin, yargs, type CallToolResult} from '../third_party/index.js';
import {VERSION} from '../version.js';

import {commands} from './chrome-devtools-cli-options.js';
import {cliOptions, parseArguments} from './chrome-devtools-mcp-cli-options.js';

async function start(args: string[]) {
  const combinedArgs = [...args, ...defaultArgs];
  await startDaemon(combinedArgs);
  logDisclaimers(parseArguments(VERSION, combinedArgs));
}

const defaultArgs = ['--viaCli', '--experimentalStructuredContent'];

const startCliOptions = {
  ...cliOptions,
} as Partial<typeof cliOptions>;

// Not supported in CLI on purpose.
delete startCliOptions.autoConnect;
// Missing CLI serialization.
delete startCliOptions.viewport;
// CLI is generated based on the default tool definitions. To enable conditional
// tools, they need to be enabled during CLI generation.
delete startCliOptions.experimentalPageIdRouting;
delete startCliOptions.experimentalVision;
delete startCliOptions.experimentalInteropTools;
delete startCliOptions.experimentalScreencast;
delete startCliOptions.categoryEmulation;
delete startCliOptions.categoryPerformance;
delete startCliOptions.categoryNetwork;
delete startCliOptions.categoryExtensions;
// Always on in CLI.
delete startCliOptions.experimentalStructuredContent;
// Change the defaults.
if (!('default' in cliOptions.headless)) {
  throw new Error('headless cli option unexpectedly does not have a default');
}
if ('default' in cliOptions.isolated) {
  throw new Error('isolated cli option unexpectedly has a default');
}
startCliOptions.headless!.default = true;
startCliOptions.isolated!.description =
  'If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed. Defaults to true unless userDataDir is provided.';

const y = yargs(hideBin(process.argv))
  .scriptName('chrome-devtools')
  .showHelpOnFail(true)
  .usage('chrome-devtools <command> [...args] --flags')
  .usage(
    `Run 'chrome-devtools <command> --help' for help on the specific command.`,
  )
  .demandCommand()
  .version(VERSION)
  .strict()
  .help(true)
  .wrap(120);

y.command(
  'start',
  'Start or restart chrome-devtools-mcp',
  y =>
    y
      .options(startCliOptions)
      .example(
        '$0 start --browserUrl http://localhost:9222',
        'Start the server connecting to an existing browser',
      )
      .strict(),
  async argv => {
    if (isDaemonRunning()) {
      await stopDaemon();
    }
    // Defaults but we do not want to affect the yargs conflict resolution.
    if (argv.isolated === undefined && argv.userDataDir === undefined) {
      argv.isolated = true;
    }
    if (argv.headless === undefined) {
      argv.headless = true;
    }
    const args = serializeArgs(cliOptions, argv);
    await start(args);
    process.exit(0);
  },
).strict(); // Re-enable strict validation for other commands; this is applied to the yargs instance itself

y.command('status', 'Checks if chrome-devtools-mcp is running', async () => {
  if (isDaemonRunning()) {
    console.log('chrome-devtools-mcp daemon is running.');
    const response = await sendCommand({
      method: 'status',
    });
    if (response.success) {
      const data = JSON.parse(response.result) as {
        pid: number | null;
        socketPath: string;
        startDate: string;
        version: string;
        args: string[];
      };
      console.log(
        `pid=${data.pid} socket=${data.socketPath} start-date=${data.startDate} version=${data.version}`,
      );
      console.log(`args=${JSON.stringify(data.args)}`);
    } else {
      console.error('Error:', response.error);
      process.exit(1);
    }
  } else {
    console.log('chrome-devtools-mcp daemon is not running.');
  }
  process.exit(0);
});

y.command('stop', 'Stop chrome-devtools-mcp if any', async () => {
  if (!isDaemonRunning()) {
    process.exit(0);
  }
  await stopDaemon();
  process.exit(0);
});

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
      try {
        if (!isDaemonRunning()) {
          await start([]);
        }

        const commandArgs: Record<string, unknown> = {};
        for (const argName of Object.keys(args)) {
          if (argName in argv) {
            commandArgs[argName] = argv[argName];
          }
        }

        const response = await sendCommand({
          method: 'invoke_tool',
          tool: commandName,
          args: commandArgs,
        });

        if (response.success) {
          console.log(
            await handleResponse(
              JSON.parse(response.result) as unknown as CallToolResult,
              argv['output-format'] as 'json' | 'md',
            ),
          );
        } else {
          console.error('Error:', response.error);
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
