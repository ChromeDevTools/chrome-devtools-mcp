/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {isDeepStrictEqual} from 'node:util';

import {browserOptions} from './browser-options.js';
import type {ParsedArguments} from './ConfigParser.js';
import {puppeteerOptions} from './puppeteer-options.js';

function optionNames<T extends object>(options: T): Array<keyof T> {
  const names: Array<keyof T> = [];
  for (const name in options) {
    names.push(name);
  }
  return names;
}

/**
 * Options that are only read on startup. Changing them in a watched config
 * file requires restarting the server to take full effect. All other options
 * are applied to the running server.
 */
export const RESTART_REQUIRED_OPTIONS: ReadonlyArray<keyof ParsedArguments> = [
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
  'watchConfig',
];

export function getRestartRequiredChanges(
  previous: ParsedArguments,
  next: ParsedArguments,
): Array<keyof ParsedArguments> {
  return RESTART_REQUIRED_OPTIONS.filter(
    name => !isDeepStrictEqual(previous[name], next[name]),
  );
}
