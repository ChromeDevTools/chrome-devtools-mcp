#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {createConnection} from 'node:net';
import process from 'node:process';

import yargs, {type Options, type PositionalOptions} from 'yargs';
import {hideBin} from 'yargs/helpers';

import {commands} from './cliDefinitions.js';
import {
  getSocketPath,
  isDaemonRunning,
  startDaemon,
  stopDaemon,
} from './daemonClient.js';

async function sendToDaemon(
  request: unknown,
): Promise<{success: boolean; result: unknown; error: unknown}> {
  const socketPath = await getSocketPath();
  return new Promise((resolve, reject) => {
    const client = createConnection({path: socketPath}, () => {
      client.write(JSON.stringify(request) + '\0');
    });

    let buffer = '';
    client.on('data', data => {
      buffer += data.toString();
      if (buffer.endsWith('\0')) {
        try {
          const response = JSON.parse(buffer.slice(0, -1));
          client.end();
          resolve(response);
        } catch (e) {
          reject(e);
        }
      }
    });

    client.on('error', err => {
      reject(err);
    });
  });
}

const y = yargs(hideBin(process.argv))
  .scriptName('chrome-devtools')
  .help()
  .showHelpOnFail(true)
  .demandCommand()
  .strict();

y.command(
  'start',
  'Starts or restarts the daemon process',
  y => y.help(false), // Disable help for start command to avoid parsing issues with passed args
  async () => {
    if (await isDaemonRunning()) {
      await stopDaemon();
    }
    // Extract args after 'start'
    const startIndex = process.argv.indexOf('start');
    const args = startIndex !== -1 ? process.argv.slice(startIndex + 1) : [];
    await startDaemon(args);
  },
);

y.command('status', 'Checks if the MCP server process is running', async () => {
  if (await isDaemonRunning()) {
    console.log('Daemon is running');
  } else {
    console.log('Daemon is not running');
  }
});

y.command('stop', 'Stop the running MCP server if any', async () => {
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
        if (!(await isDaemonRunning())) {
          await startDaemon(['--via-cli']);
        }

        const commandArgs: Record<string, unknown> = {};
        for (const argName of Object.keys(args)) {
          if (argName in argv) {
            commandArgs[argName] = argv[argName];
          }
        }

        const response = await sendToDaemon({
          method: 'invoke_tool',
          tool: commandName,
          args: commandArgs,
        });

        if (response.success) {
          console.log(response.result);
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
