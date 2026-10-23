/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ArgDef } from './cli-options.js';
/**
 * Builds the yargs command string and usage line for a CLI command.
 *
 * Optional flag args are rendered as `[--flag]` in the usage line only: as
 * part of the command string yargs parses each one as a trailing positional,
 * and a variadic positional has to be the last one. Which args are positional
 * is decided at build time by `scripts/generate-cli.ts`.
 */
export declare function buildCommand(commandName: string, args: Record<string, ArgDef>): {
    command: string;
    usage: string;
};
export type OptionKind = 'boolean' | 'array' | 'value';
/**
 * Options that are available on every tool command and are consumed by yargs
 * rather than forwarded to the tool.
 */
export declare const GLOBAL_CLI_OPTIONS: ReadonlyMap<string, OptionKind>;
/**
 * Describes what a CLI command accepts, as needed by `shieldLiteralArgs`.
 */
export interface CommandArgSpec {
    /** Known option names (camelCase and aliases) and how they take values. */
    options: Map<string, OptionKind>;
    /** Number of positional arguments. */
    positionalCount: number;
    /** Whether the last positional is variadic. */
    variadic: boolean;
}
/**
 * Builds a `CommandArgSpec` for a tool command from its generated arg
 * definitions and the options available on every command.
 */
export declare function getCommandArgSpec(args: Record<string, ArgDef>, globalOptions?: ReadonlyMap<string, OptionKind>): CommandArgSpec;
export declare function toOptionKind(type: string | undefined): OptionKind;
/**
 * Shields positional values that yargs cannot carry through its parsing.
 *
 * yargs re-parses command positionals as `--name value` pairs, and in that
 * pass yargs-parser treats any value starting with `-` (other than a negative
 * number) as the next flag, replacing the value with `''`. It also never fills
 * positionals from the tokens after `--`. See
 * https://github.com/yargs/yargs/issues/1312 and
 * https://github.com/yargs/yargs/issues/1821.
 *
 * Shielded tokens are replaced by opaque placeholders that `restore` maps back
 * to the original values. A token is shielded when:
 *
 * - it is a lone `-`, which can never be an option;
 * - it follows the first `--`, which is dropped so the tokens populate
 *   positionals;
 * - it starts with `-`, is not a known option of the command, and the command
 *   still has an unfilled positional. Known options and their values are
 *   skipped the way yargs consumes them, so a dash-prefixed value such as
 *   `--flag` in a positional slot is passed through as text, while an unknown
 *   flag after all positionals are filled is still rejected by yargs.
 *
 * `getSpec` resolves the spec of a command by name and returns `undefined`
 * for tokens that are not a command.
 */
export declare function shieldLiteralArgs(argv: readonly string[], getSpec: (commandName: string) => CommandArgSpec | undefined): {
    argv: string[];
    restore: (value: unknown) => unknown;
};
