/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFileSync} from 'node:fs';

import {
  mcpOptions,
  getMcpOptionsForViaCli,
  CLI_EXAMPLES,
  CONFLICTING_ARGS,
  IMPLICATIONS,
  DEFAULT_FILESYSTEM_ROOT,
  withoutDefaults,
} from './mcp-options.js';
import {ConfigLocator} from './ConfigLocator.js';
import type {CliOption, InferOptionTypes} from './types.js';
import {parseOptionTokens} from './cli-parser.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParsedArguments(
  _args: Partial<ParsedArguments>,
): _args is ParsedArguments {
  return true;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatHelp(
  scriptName: string,
  options: Record<string, CliOption>,
  examples: Array<[string, string]>,
): string {
  const lines: string[] = [];
  lines.push(scriptName);
  lines.push('');
  lines.push('Options:');
  lines.push(
    '  --help     Show help                                                 [boolean]',
  );
  lines.push(
    '  --version  Show version number                                       [boolean]',
  );
  for (const [key, opt] of Object.entries(options)) {
    if (opt.hidden) {
      continue;
    }
    const kebab = key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
    let flagStr = kebab !== key ? `--${key}, --${kebab}` : `--${key}`;
    if (opt.alias) {
      const aliasStr =
        opt.alias.length === 1 ? `-${opt.alias}` : `--${opt.alias}`;
      flagStr = `${aliasStr}, ${flagStr}`;
    }
    const desc = opt.describe || opt.description || '';
    lines.push(`  ${flagStr}`);
    if (desc) {
      lines.push(`      ${desc}`);
    }
  }
  if (examples.length > 0) {
    lines.push('');
    lines.push('Examples:');
    for (const [cmd, desc] of examples) {
      const renderedCmd = cmd.replace('$0', scriptName);
      lines.push(`  ${renderedCmd}  ${desc}`);
    }
  }
  return lines.join('\n');
}

export interface CliBuilder {
  scriptName(name: string): this;
  parserConfiguration(config: Record<string, boolean>): this;
  options(opts: Record<string, CliOption>): this;
  showHelpOnFail(show: boolean, msg?: string): this;
  example(examples: Array<[string, string]> | string, desc?: string): this;
  wrap(width: number): this;
  terminalWidth(): number;
  help(): this;
  version(ver?: string): this;
  fail(handler: ((msg: string, err?: unknown) => void) | false): this;
  getHelp(): Promise<string>;
  parseSync(): Partial<ParsedArguments>;
}

export type ParsedArguments = InferOptionTypes<typeof mcpOptions>;

export class ConfigParser {
  #configPath?: string;
  readonly configLocator: ConfigLocator;

  /**
   * @param configLocator Finds the config file when `--config` is not passed.
   * Config file discovery is off without it, for example in tests.
   */
  constructor(
    private version: string,
    private argv = process.argv,
    private env = process.env,
    private exitProcess = true,
  ) {
    this.configLocator = new ConfigLocator();
  }

  buildCliParser(
    options: Record<string, CliOption> = mcpOptions,
  ): CliBuilder {
    let customScriptName = 'npx chrome-devtools-mcp@latest';
    let customVersion = this.version;
    let activeOptions = options;
    let examples = CLI_EXAMPLES;
    const argvToUse = this.argv;
    const exitProc = this.exitProcess;

    const builder: CliBuilder = {
      scriptName(name: string) {
        customScriptName = name;
        return this;
      },
      parserConfiguration(_config: Record<string, boolean>) {
        return this;
      },
      options(opts: Record<string, CliOption>) {
        activeOptions = opts;
        return this;
      },
      showHelpOnFail(_show: boolean, _msg?: string) {
        return this;
      },
      example(ex: Array<[string, string]> | string, _desc?: string) {
        if (Array.isArray(ex)) {
          examples = ex;
        }
        return this;
      },
      wrap(_width: number) {
        return this;
      },
      terminalWidth() {
        return 120;
      },
      help() {
        return this;
      },
      version(ver?: string) {
        if (ver) {
          customVersion = ver;
        }
        return this;
      },
      fail(_handler: ((msg: string, err?: unknown) => void) | false) {
        return this;
      },
      getHelp(): Promise<string> {
        return Promise.resolve(
          formatHelp(customScriptName, activeOptions, examples),
        );
      },
      parseSync(): Partial<ParsedArguments> {
        const rawArgs = argvToUse.slice(2);
        if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
          const helpText = formatHelp(customScriptName, activeOptions, examples);
          if (exitProc) {
            console.log(helpText);
            process.exit(0);
          }
        }
        if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
          if (exitProc) {
            console.log(customVersion);
            process.exit(0);
          }
        }
        return parseOptionTokens(rawArgs, activeOptions);
      },
    };

    return builder;
  }

  /**
   * Step 1: parses the CLI flags without applying defaults, so the result only
   * contains what the user passed. `--help` and `--version` print and exit the
   * process; parse errors throw.
   */
  parseCliArgs(): Partial<ParsedArguments> {
    return this.buildCliParser(withoutDefaults(mcpOptions))
      .fail(false)
      .parseSync();
  }

  /**
   * Step 2: reads the JSON config file and validates it against options to reject
   * unknown keys and apply coercions, without applying defaults.
   */
  parseConfigFile(configPath: string): Partial<ParsedArguments> {
    try {
      const fileContent: unknown = JSON.parse(
        readFileSync(configPath, 'utf-8'),
      );
      if (!isPlainObject(fileContent)) {
        throw new Error('Config must be a JSON object');
      }
      const options = withoutDefaults(mcpOptions);
      const parsed: Record<string, unknown> = {};

      for (const [key, rawValue] of Object.entries(fileContent)) {
        if (!(key in options)) {
          throw new Error(`Unknown argument: ${key}`);
        }
        const opt = options[key];
        if (opt.choices) {
          let match = false;
          for (const choice of opt.choices) {
            if (choice === rawValue) {
              match = true;
              break;
            }
          }
          if (!match) {
            throw new Error(
              `Invalid value for --${key}: "${String(rawValue)}". Allowed choices: ${opt.choices.join(', ')}`,
            );
          }
        }
        if (
          opt.type === 'string' &&
          'coerce' in opt &&
          typeof opt.coerce === 'function'
        ) {
          parsed[key] = opt.coerce(
            typeof rawValue === 'string' ? rawValue : undefined,
          );
        } else if (
          opt.type === 'number' &&
          'coerce' in opt &&
          typeof opt.coerce === 'function'
        ) {
          parsed[key] = opt.coerce(
            typeof rawValue === 'number' ? rawValue : undefined,
          );
        } else if (
          opt.type === 'array' &&
          'coerce' in opt &&
          typeof opt.coerce === 'function'
        ) {
          parsed[key] = opt.coerce(
            Array.isArray(rawValue) ? rawValue : undefined,
          );
        } else {
          parsed[key] = rawValue;
        }
      }
      return parsed;
    } catch (err) {
      throw new Error(`Invalid JSON config file: ${getErrorMessage(err)}`);
    }
  }

  warnUnknownArgs(cliArgs: Partial<ParsedArguments>): void {
    const allowedArgs = new Set(Object.keys(mcpOptions));
    const unknownArgs = Object.keys(cliArgs).filter(
      arg => !allowedArgs.has(arg),
    );
    if (unknownArgs.length > 0) {
      console.error(`Unknown arguments: ${unknownArgs.map(arg => `--${arg}`)}`);
    }
  }

  /**
   * Step 4: rejects mutually exclusive inputs. Only explicit inputs are checked,
   * so defaults never conflict.
   */
  validateConflicts(explicitArgs: Partial<ParsedArguments>): void {
    const activeArgs = new Set<string>();
    for (const [key, val] of Object.entries(explicitArgs)) {
      if (val !== undefined && val !== false) {
        activeArgs.add(key);
      }
    }
    for (const group of CONFLICTING_ARGS) {
      const activeInGroup = group.filter(arg => activeArgs.has(arg));
      if (activeInGroup.length > 1) {
        const [arg1, arg2] = activeInGroup;
        throw new Error(
          `Arguments ${String(arg1)} and ${String(arg2)} are mutually exclusive`,
        );
      }
    }
  }

  validateImplications(explicitArgs: Partial<ParsedArguments>): void {
    for (const [key, implied] of IMPLICATIONS) {
      const isKeySet =
        explicitArgs[key] !== undefined && explicitArgs[key] !== false;
      const isImpliedSet =
        explicitArgs[implied] !== undefined && explicitArgs[implied] !== false;
      if (isKeySet && !isImpliedSet) {
        throw new Error(
          `Implications failed:\n  ${String(key)} -> ${String(implied)}`,
        );
      }
    }
  }

  /**
   * Step 5: fills in defaults for everything that was not set explicitly.
   * `viaCli` is an explicit input like any other; it selects which defaults
   * apply.
   */
  applyDefaults(explicitArgs: Partial<ParsedArguments>): ParsedArguments {
    const isViaCli = explicitArgs.viaCli === true;
    const baseOptions = isViaCli ? getMcpOptionsForViaCli() : mcpOptions;
    const resolvedArgs = {...explicitArgs};
    // `channel` only applies when Chrome is launched by channel. Leaving it
    // unset otherwise keeps it out of telemetry (computeFlagUsage).
    const launchesByChannel =
      !resolvedArgs.browserUrl &&
      !resolvedArgs.wsEndpoint &&
      !resolvedArgs.executablePath;

    const resolvedRecord: Record<string, unknown> = resolvedArgs;
    for (const [key, option] of Object.entries(baseOptions)) {
      if (key === 'channel' && !launchesByChannel) {
        continue;
      }
      if (resolvedRecord[key] === undefined && 'default' in option) {
        resolvedRecord[key] = option.default;
      }
    }

    if (isViaCli) {
      if (
        resolvedArgs.filesystemRoot === DEFAULT_FILESYSTEM_ROOT &&
        explicitArgs.allowUnrestrictedPaths !== false
      ) {
        resolvedArgs.allowUnrestrictedPaths = true;
        resolvedArgs.filesystemRoot = undefined;
      }
      const connectsToExistingBrowser =
        resolvedArgs.autoConnect ||
        resolvedArgs.browserUrl ||
        resolvedArgs.wsEndpoint;
      if (
        explicitArgs.isolated === undefined &&
        resolvedArgs.userDataDir === undefined &&
        !connectsToExistingBrowser
      ) {
        resolvedArgs.isolated = true;
      }
      if (
        resolvedArgs.categoryExtensions === undefined &&
        !connectsToExistingBrowser
      ) {
        resolvedArgs.categoryExtensions = true;
      }
    }

    if (this.env['CI'] || this.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS']) {
      console.error(
        "turning off usage statistics. process.env['CI'] || process.env['CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS'] is set.",
      );
      resolvedArgs.usageStatistics = false;
    }

    if (
      resolvedArgs.categoryExperimentalThirdParty === undefined &&
      this.env['CHROME_DEVTOOLS_MCP_CATEGORY_EXPERIMENTAL_THIRD_PARTY']
    ) {
      resolvedArgs.categoryExperimentalThirdParty = true;
    }

    if (isParsedArguments(resolvedArgs)) {
      return resolvedArgs;
    }
    throw new Error('Failed to resolve all required arguments');
  }

  parse(): ParsedArguments {
    try {
      const cliArgs = this.parseCliArgs();
      this.#configPath = cliArgs.config ?? this.configLocator?.locate(this.env);
      this.warnUnknownArgs(cliArgs);
      return this.#resolve(cliArgs);
    } catch (error) {
      if (this.exitProcess) {
        console.error(getErrorMessage(error));
        process.exit(1);
      }
      throw error;
    }
  }

  /**
   * Re-reads the config file resolved by `parse()` and merges it with the CLI
   * arguments again. Unlike `parse()`, it does not discover a new config file
   * and throws on invalid configuration instead of exiting the process.
   */
  reload(): ParsedArguments {
    return this.#resolve(this.parseCliArgs());
  }

  #resolve(cliArgs: Partial<ParsedArguments>): ParsedArguments {
    const configPath = this.#configPath;
    const configFileArgs = configPath ? this.parseConfigFile(configPath) : {};
    // Step 3: merges the explicit inputs. The CLI wins over the config file.
    const explicitArgs = {
      ...configFileArgs,
      ...cliArgs,
      ...(configPath ? {config: configPath} : {}),
    };
    this.validateConflicts(explicitArgs);
    this.validateImplications(explicitArgs);
    return this.applyDefaults(explicitArgs);
  }
}
