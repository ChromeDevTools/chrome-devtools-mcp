/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategory} from '../tools/categories.js';

import {categoryToFlagName} from './category-options.js';
import type {ParsedArguments} from './ConfigParser.js';
import {toolOptions} from './tool-options.js';

function optionNames<T extends object>(options: T): Array<keyof T> {
  const names: Array<keyof T> = [];
  for (const name in options) {
    names.push(name);
  }
  return names;
}

function reloadableCategoryFlags(): Array<keyof ParsedArguments> {
  const flags: Array<keyof ParsedArguments> = [];
  for (const category of Object.values(ToolCategory)) {
    // Extensions support is enabled when the browser is launched.
    if (category === ToolCategory.EXTENSIONS) {
      continue;
    }
    flags.push(categoryToFlagName(category));
  }
  return flags;
}

/**
 * Options that are applied to a running server when the config is reloaded.
 * Every other option is only read on startup and keeps the value the server
 * was started with until it is restarted. New options are therefore
 * restart-required unless they are explicitly added here.
 */
export const RELOADABLE_OPTIONS: ReadonlyArray<keyof ParsedArguments> = [
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
  'sourceMaps',
  'redactNetworkHeaders',
  'allowUnrestrictedPaths',
  'filesystemRoot',
];

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
    Reflect.set(merged, name, next[name]);
  }
  return merged;
}
