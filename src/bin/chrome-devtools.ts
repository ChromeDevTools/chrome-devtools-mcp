#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

import yargs, {type Options, type PositionalOptions} from 'yargs';
import {hideBin} from 'yargs/helpers';

import {
  startDaemon,
  stopDaemon,
  sendCommand,
  handleResponse,
} from '../daemon/client.js';
import {isDaemonRunning} from '../daemon/utils.js';
import type {CallToolResult} from '../third_party/index.js';
import {VERSION} from '../version.js';

import {commands} from './cliDefinitions.js';
import {generateCustomHelp} from './customHelp.js';

const argv = hideBin(process.argv);

if (argv.length === 0 || argv[0] === '--custom-help') {
  console.log(generateCustomHelp(VERSION, commands));
  process.exit(0);
}

const defaultArgs = ['--viaCli', '--experimentalStructuredContent'];

const y = yargs(argv)
  .scriptName('chrome-devtools')
  .showHelpOnFail(true)
  .demandCommand()
  .version(VERSION)
  .strict()
  .help(true);

y.command(
  'start',
  'Start or restart chrome-devtools-mcp',
  y => y.help(false), // Disable help for start command to avoid parsing issues with passed args
  async () => {
    if (isDaemonRunning()) {
      await stopDaemon();
    }
    // Extract args after 'start'
    const startIndex = process.argv.indexOf('start');
    const args = startIndex !== -1 ? process.argv.slice(startIndex + 1) : [];
    await startDaemon([...args, ...defaultArgs]);
  },
);

y.command('status', 'Checks if chrome-devtools-mcp is running', async () => {
  if (isDaemonRunning()) {
    console.log('chrome-devtools-mcp daemon is running.');
  } else {
    console.log('chrome-devtools-mcp daemon is not running');
  }
});

y.command('stop', 'Stop chrome-devtools-mcp if any', async () => {
  await stopDaemon();
});

for (const [commandName, commandDef] of Object.entries(commands)) {
  const args = commandDef.args;
  const requiredArgNames = Object.keys(args).filter(
    name => args[name].required,
  );

  let commandStr = commandName;
  for (const arg of requiredArgNames) {
    commandStr += ` <${arg}>`;
  }

  y.command(
    commandStr,
    commandDef.description,
    y => {
      y.option('format', {
        choices: ['text', 'json'],
        default: 'text',
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
          await startDaemon(defaultArgs);
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
            handleResponse(
              JSON.parse(response.result) as unknown as CallToolResult,
              argv['format'] as 'json' | 'text',
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
