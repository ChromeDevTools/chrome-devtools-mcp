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
import {
  fetchRemoteHealth,
  invokeRemoteTool,
  parseHeaderFlags,
  stopRemoteSession,
  type RemoteOptions,
} from '../daemon/remote-client.js';
import {isDaemonRunning, serializeArgs} from '../daemon/utils.js';
import {logDisclaimers} from '../index.js';
import {hideBin, yargs, type CallToolResult} from '../third_party/index.js';
import {checkForUpdates} from '../utils/check-for-updates.js';
import {VERSION} from '../version.js';

import {commands} from './chrome-devtools-cli-options.js';
import {cliOptions, parseArguments} from './chrome-devtools-mcp-cli-options.js';

await checkForUpdates(
  'Run `npm install -g chrome-devtools-mcp@latest` and `chrome-devtools start` to update and restart the daemon.',
);

async function start(args: string[], sessionId: string) {
  const combinedArgs = [...args, ...defaultArgs];
  await startDaemon(combinedArgs, sessionId);
  logDisclaimers(parseArguments(VERSION, combinedArgs));
}

const defaultArgs = ['--viaCli', '--experimentalStructuredContent'];

const startCliOptions = {
  ...cliOptions,
} as Partial<typeof cliOptions>;

// Missing CLI serialization.
delete startCliOptions.viewport;

// Change the defaults for the CLI.
delete startCliOptions.experimentalStructuredContent;
delete startCliOptions.experimentalInteropTools;
delete startCliOptions.experimentalPageIdRouting;
if (!('default' in cliOptions.headless)) {
  throw new Error('headless cli option unexpectedly does not have a default');
}
if ('default' in cliOptions.isolated) {
  throw new Error('isolated cli option unexpectedly has a default');
}
startCliOptions.headless!.default = true;
startCliOptions.isolated!.description =
  'If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed. Defaults to true unless userDataDir is provided.';
startCliOptions.categoryExtensions!.default = true;

const y = yargs(hideBin(process.argv))
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
  })
  .option('remote', {
    type: 'string',
    description:
      'Connect to a remote chrome-devtools-mcp HTTP endpoint (e.g. https://host.tailnet/mcp) instead of running a local daemon. Defaults to $CHROME_DEVTOOLS_MCP_REMOTE_URL.',
    default: process.env['CHROME_DEVTOOLS_MCP_REMOTE_URL'],
  })
  .option('header', {
    type: 'array',
    string: true,
    description:
      'Header to attach to remote requests, e.g. --header "Authorization: Bearer ...". Repeatable. Only honored with --remote.',
    default: [] as string[],
  })
  .option('insecure', {
    type: 'boolean',
    description:
      'Disable TLS certificate verification for --remote. Useful for self-signed tailnet certs. Defaults to $CHROME_DEVTOOLS_MCP_REMOTE_INSECURE.',
    default:
      process.env['CHROME_DEVTOOLS_MCP_REMOTE_INSECURE'] === '1' ||
      process.env['CHROME_DEVTOOLS_MCP_REMOTE_INSECURE'] === 'true',
  })
  .demandCommand()
  .version(VERSION)
  .strict()
  .help(true)
  .wrap(120);

/**
 * Parse and validate top-level --remote flags into a RemoteOptions value.
 * Returns undefined when --remote is not set (i.e. local daemon mode).
 * Exits with a non-zero status on user-visible validation errors so the
 * caller can stay in the happy path.
 */
function resolveRemoteOptions(argv: {
  remote?: string;
  header?: string[];
  insecure?: boolean;
}): RemoteOptions | undefined {
  if (!argv.remote) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(argv.remote);
  } catch {
    console.error(
      `Invalid --remote URL: ${JSON.stringify(argv.remote)}. Expected e.g. https://host.tailnet/mcp.`,
    );
    process.exit(2);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    console.error(
      `Invalid --remote URL: ${url.toString()} (must use http:// or https://).`,
    );
    process.exit(2);
  }
  let headers: Record<string, string> | undefined;
  try {
    headers = parseHeaderFlags(argv.header);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
  return {url, headers, insecure: argv.insecure};
}

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
    if (argv.remote) {
      console.error(
        'start is not supported with --remote: the server lives on the remote host.',
      );
      console.error(
        'Start chrome-devtools-mcp on the remote host directly (e.g. as a service or `npx chrome-devtools-mcp --port 3100`).',
      );
      process.exit(2);
    }
    if (isDaemonRunning(argv.sessionId)) {
      await stopDaemon(argv.sessionId);
    }
    // Defaults but we do not want to affect the yargs conflict resolution.
    if (argv.isolated === undefined && argv.userDataDir === undefined) {
      argv.isolated = true;
    }
    if (argv.headless === undefined) {
      argv.headless = true;
    }
    const args = serializeArgs(cliOptions, argv);
    await start(args, argv.sessionId);
    process.exit(0);
  },
).strict(); // Re-enable strict validation for other commands; this is applied to the yargs instance itself

y.command(
  'status',
  'Checks if chrome-devtools-mcp is running',
  y => y,
  async argv => {
    const remote = resolveRemoteOptions(argv);
    if (remote) {
      try {
        const health = await fetchRemoteHealth(remote);
        console.log(
          `remote=${remote.url.toString()} status=${health.ok ? 'ok' : 'error'} http=${health.status}`,
        );
        console.log(JSON.stringify(health.body, null, 2));
        process.exit(health.ok ? 0 : 1);
      } catch (err) {
        console.error('Failed to reach remote:', (err as Error).message);
        process.exit(1);
      }
    }
    if (isDaemonRunning(argv.sessionId)) {
      console.log('chrome-devtools-mcp daemon is running.');
      const response = await sendCommand(
        {
          method: 'status',
        },
        argv.sessionId,
      );
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
  },
);

y.command(
  'stop',
  'Stop chrome-devtools-mcp if any',
  y => y,
  async argv => {
    const remote = resolveRemoteOptions(argv);
    if (remote) {
      await stopRemoteSession(remote);
      process.exit(0);
    }
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
      const remote = resolveRemoteOptions(argv);
      const commandArgs: Record<string, unknown> = {};
      for (const argName of Object.keys(args)) {
        if (argName in argv) {
          commandArgs[argName] = argv[argName];
        }
      }
      try {
        if (remote) {
          const result = await invokeRemoteTool({
            ...remote,
            tool: commandName,
            args: commandArgs,
          });
          console.log(
            await handleResponse(
              result,
              argv['output-format'] as 'json' | 'md',
            ),
          );
          return;
        }

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
