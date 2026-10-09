/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory} from '../tools/categories.js';

import {browserOptions} from './browser-options.js';
import {
  type CategoryFlagName,
  categoryToFlagName,
} from './category-options.js';
import type {ParsedArguments} from './ConfigParser.js';
import {CONFLICTING_ARGS, IMPLICATIONS} from './mcp-options.js';
import {puppeteerOptions} from './puppeteer-options.js';
import {toolOptions} from './tool-options.js';

function optionNames<T extends object>(options: T): Array<keyof T> {
  const names: Array<keyof T> = [];
  for (const name in options) {
    names.push(name);
  }
  return names;
}

function isReloadableCategoryFlag(
  flag: CategoryFlagName,
): flag is Exclude<CategoryFlagName, 'categoryExtensions'> {
  return flag !== 'categoryExtensions';
}

function reloadableCategoryFlags(): Array<
  Exclude<CategoryFlagName, 'categoryExtensions'>
> {
  const flags: Array<Exclude<CategoryFlagName, 'categoryExtensions'>> = [];
  for (const category of Object.values(ToolCategory)) {
    // Extensions support is enabled when the browser is launched.
    const flag = categoryToFlagName(category);
    if (isReloadableCategoryFlag(flag)) {
      flags.push(flag);
    }
  }
  return flags;
}

function defineOptionList<
  const T extends ReadonlyArray<keyof ParsedArguments>,
>(options: T): T {
  return options;
}

/**
 * Options that are applied to a running server when the config is reloaded.
 * Every other option is only read on startup and keeps the value the server
 * was started with until it is restarted. New options are therefore
 * restart-required unless they are explicitly added here.
 */
export const RELOADABLE_OPTIONS = defineOptionList([
  ...reloadableCategoryFlags(),
  ...optionNames(toolOptions),
  'pageIdRouting',
  'devtoolsComments',
  'experimentalVision',
  'memoryDebugging',
  'experimentalStructuredContent',
  'experimentalToonFormat',
  'experimentalDataFormat',
  'experimentalIncludeAllPages',
  'experimentalInteropTools',
  'experimentalScreencast',
  'experimentalFfmpegPath',
  'experimentalScreencastFps',
  'performanceCrux',
  'javascriptEvaluation',
  'fileNavigations',
  'sourceMaps',
  'redactNetworkHeaders',
  'allowUnrestrictedPaths',
  'filesystemRoot',
]);

/**
 * Options that are only read on startup. Changing them in a config file
 * requires restarting the server to take full effect.
 */
export const RESTART_REQUIRED_OPTIONS = defineOptionList([
  // Used to launch or connect to the browser.
  ...optionNames(browserOptions),
  // Applied through Puppeteer when launching or connecting to the browser.
  ...optionNames(puppeteerOptions),
  'categoryExtensions',
  'experimentalDevtools',
  // Process-wide settings.
  'slim',
  'logFile',
  'usageStatistics',
  'clearcutEndpoint',
  'clearcutForceFlushIntervalMs',
  'clearcutIncludePidHeader',
  'viaCli',
  'config',
]);

type ReloadableOption = (typeof RELOADABLE_OPTIONS)[number];
type RestartRequiredOption = (typeof RESTART_REQUIRED_OPTIONS)[number];
type UnclassifiedOption = Exclude<
  keyof ParsedArguments,
  ReloadableOption | RestartRequiredOption
>;
type OverlappingOption = Extract<ReloadableOption, RestartRequiredOption>;

// Compile-time check that every option in ParsedArguments is classified in
// either RELOADABLE_OPTIONS or RESTART_REQUIRED_OPTIONS without overlap.
const _exhaustiveOptionClassificationCheck: Record<
  UnclassifiedOption | OverlappingOption,
  never
> = {};
void _exhaustiveOptionClassificationCheck;

const RELOADABLE_OPTION_SET: ReadonlySet<keyof ParsedArguments> = new Set(
  RELOADABLE_OPTIONS,
);

const CROSS_BOUNDARY_CONFLICTING_ARGS = CONFLICTING_ARGS.filter(
  group =>
    group.some(arg => RELOADABLE_OPTION_SET.has(arg)) &&
    group.some(arg => !RELOADABLE_OPTION_SET.has(arg)),
);

const CROSS_BOUNDARY_IMPLICATIONS = IMPLICATIONS.filter(
  ([key, implied]) =>
    RELOADABLE_OPTION_SET.has(key) !== RELOADABLE_OPTION_SET.has(implied),
);

function copyExplicitOption<K extends keyof ParsedArguments>(
  target: Partial<ParsedArguments>,
  source: Partial<ParsedArguments>,
  key: K,
): void {
  if (key in source) {
    target[key] = source[key];
  } else {
    delete target[key];
  }
}

function copyOption<K extends keyof ParsedArguments>(
  target: ParsedArguments,
  source: ParsedArguments,
  key: K,
): void {
  target[key] = source[key];
}

/**
 * Merges reloadable explicit arguments from `next` onto the startup explicit
 * arguments from `previous`.
 */
export function mergeExplicitReloadableArgs(
  previous: Partial<ParsedArguments>,
  next: Partial<ParsedArguments>,
): Partial<ParsedArguments> {
  const merged: Partial<ParsedArguments> = {...previous};
  for (const name of RELOADABLE_OPTIONS) {
    copyExplicitOption(merged, next, name);
  }
  return merged;
}

/**
 * Returns the arguments a running server continues with: `next` for
 * RELOADABLE_OPTIONS and `previous` for everything else.
 */
export function mergeReloadableOptions(
  previous: ParsedArguments,
  next: ParsedArguments,
): ParsedArguments {
  const merged = {...previous};
  for (const name of RELOADABLE_OPTIONS) {
    copyOption(merged, next, name);
  }
  for (const group of CROSS_BOUNDARY_CONFLICTING_ARGS) {
    const activeInGroup = group.filter(
      arg => merged[arg] !== undefined && merged[arg] !== false,
    );
    if (activeInGroup.length > 1) {
      const [arg1, arg2] = activeInGroup;
      throw new Error(
        `Arguments ${String(arg1)} and ${String(arg2)} are mutually exclusive`,
      );
    }
  }
  for (const [key, implied] of CROSS_BOUNDARY_IMPLICATIONS) {
    const isKeySet = merged[key] !== undefined && merged[key] !== false;
    const isImpliedSet =
      merged[implied] !== undefined && merged[implied] !== false;
    if (isKeySet && !isImpliedSet) {
      throw new Error(
        `Implications failed:\n  ${String(key)} -> ${String(implied)}`,
      );
    }
  }
  return merged;
}
