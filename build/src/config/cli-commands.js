/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Builds the yargs command string and usage line for a CLI command.
 *
 * Optional flag args are rendered as `[--flag]` in the usage line only: as
 * part of the command string yargs parses each one as a trailing positional,
 * and a variadic positional has to be the last one. Which args are positional
 * is decided at build time by `scripts/generate-cli.ts`.
 */
export function buildCommand(commandName, args) {
    let command = commandName;
    let flags = '';
    for (const [name, arg] of Object.entries(args)) {
        if (!arg.positional) {
            flags += ` [--${name}]`;
        }
        else if (arg.required) {
            command += arg.type === 'array' ? ` <${name}..>` : ` <${name}>`;
        }
        else {
            command += arg.type === 'array' ? ` [${name}..]` : ` [${name}]`;
        }
    }
    return { command, usage: `$0 ${command}${flags}` };
}
/**
 * Options that are available on every tool command and are consumed by yargs
 * rather than forwarded to the tool.
 */
export const GLOBAL_CLI_OPTIONS = new Map([
    ['sessionId', 'value'],
    ['outputFormat', 'value'],
    ['help', 'boolean'],
    ['version', 'boolean'],
]);
/**
 * Builds a `CommandArgSpec` for a tool command from its generated arg
 * definitions and the options available on every command.
 */
export function getCommandArgSpec(args, globalOptions = GLOBAL_CLI_OPTIONS) {
    const options = new Map(globalOptions);
    let positionalCount = 0;
    let variadic = false;
    for (const [name, arg] of Object.entries(args)) {
        if (arg.positional) {
            positionalCount++;
            variadic = arg.type === 'array';
        }
        else {
            options.set(name, toOptionKind(arg.type));
        }
    }
    return { options, positionalCount, variadic };
}
export function toOptionKind(type) {
    if (type === 'boolean') {
        return 'boolean';
    }
    if (type === 'array') {
        return 'array';
    }
    return 'value';
}
const LITERAL_ARG_PREFIX = '\0literal:';
// Mirrors yargs-parser's negative number detection.
const NEGATIVE_NUMBER = /^-\d+(\.\d*)?(e-?\d+)?$/;
function optionName(token) {
    let name = token.replace(/^-+/, '');
    const eq = name.indexOf('=');
    if (eq !== -1) {
        name = name.slice(0, eq);
    }
    if (name.startsWith('no-')) {
        name = name.slice(3);
    }
    return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
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
export function shieldLiteralArgs(argv, getSpec) {
    const literals = new Map();
    const result = [];
    const shield = (token) => {
        const placeholder = `${LITERAL_ARG_PREFIX}${literals.size}`;
        literals.set(placeholder, token);
        result.push(placeholder);
    };
    let spec;
    let filled = 0;
    let afterDoubleDash = false;
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (afterDoubleDash) {
            shield(token);
            continue;
        }
        if (token === '--') {
            afterDoubleDash = true;
            continue;
        }
        if (token === '-') {
            shield(token);
            filled++;
            continue;
        }
        if (!token.startsWith('-') || NEGATIVE_NUMBER.test(token)) {
            result.push(token);
            if (!spec) {
                spec = getSpec(token);
            }
            else {
                filled++;
            }
            continue;
        }
        const kind = spec?.options.get(optionName(token));
        if (kind !== undefined) {
            result.push(token);
            if (token.includes('=')) {
                continue;
            }
            if (kind === 'boolean') {
                if (/^(true|false)$/.test(argv[i + 1] ?? '')) {
                    result.push(argv[++i]);
                }
            }
            else if (kind === 'array') {
                while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                    result.push(argv[++i]);
                }
            }
            else if (i + 1 < argv.length) {
                result.push(argv[++i]);
            }
            continue;
        }
        const hasUnfilledPositional = spec !== undefined &&
            (filled < spec.positionalCount ||
                (spec.variadic && spec.positionalCount > 0));
        if (hasUnfilledPositional) {
            shield(token);
            filled++;
        }
        else {
            result.push(token);
        }
    }
    const restore = (value) => {
        if (typeof value === 'string') {
            return literals.get(value) ?? value;
        }
        if (Array.isArray(value)) {
            return value.map(restore);
        }
        return value;
    };
    return { argv: result, restore };
}
//# sourceMappingURL=cli-commands.js.map