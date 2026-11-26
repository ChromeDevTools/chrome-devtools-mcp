/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Protocol} from '../third_party/browser.js';

import {formatRemoteObject} from './RemoteObjectFormatter.js';

const FORMAT_SPECIFIER_RE = /%([%_Oocsdfi])|\x1B\[([\d;]*)m/;

export function hasConsoleFormatSpecifier(fmt: string): boolean {
  return FORMAT_SPECIFIER_RE.test(fmt);
}

function formatStringArg(arg: Protocol.Runtime.RemoteObject): string {
  if (arg.type === 'string' && arg.value !== undefined) {
    return String(arg.value);
  }
  if (arg.description !== undefined) {
    return arg.description;
  }
  if (arg.value !== undefined) {
    return String(arg.value);
  }
  return formatRemoteObject(arg);
}

/**
 * Plain-text implementation of Chrome DevTools' ConsoleFormat
 * (front_end/panels/console/ConsoleFormat.ts), applying standard console
 * format specifiers and stripping inline `%c` styles and ANSI escape codes.
 */
export function formatConsoleTemplate(
  fmt: string,
  args: readonly Protocol.Runtime.RemoteObject[],
): {text: string; unusedArgs: Protocol.Runtime.RemoteObject[]} {
  let rendered = '';
  let rest = fmt;
  let argIndex = 0;

  for (
    let match = FORMAT_SPECIFIER_RE.exec(rest);
    match !== null;
    match = FORMAT_SPECIFIER_RE.exec(rest)
  ) {
    rendered += rest.slice(0, match.index);
    const specifier = match[1];
    let replacement = match[0];

    switch (specifier) {
      case '%':
        replacement = '%';
        break;
      case 's':
        if (argIndex < args.length) {
          replacement = formatStringArg(args[argIndex++]);
        }
        break;
      case 'c':
      case '_':
        if (argIndex < args.length) {
          argIndex++;
          replacement = '';
        }
        break;
      case 'o':
      case 'O':
        if (argIndex < args.length) {
          replacement = formatRemoteObject(args[argIndex++]);
        }
        break;
      case 'd':
      case 'i':
      case 'f':
        if (argIndex < args.length) {
          const rawValue = args[argIndex++].value;
          const num = typeof rawValue === 'number' ? rawValue : NaN;
          replacement = String(specifier === 'f' ? num : Math.floor(num));
        }
        break;
      case undefined:
        replacement = '';
        break;
    }

    rendered += replacement;
    rest = rest.slice(match.index + match[0].length);
  }
  rendered += rest;

  const unusedArgs = args.slice(argIndex);
  if (unusedArgs.length > 0) {
    const trailing = unusedArgs.map(formatRemoteObject).join(' ');
    rendered = rendered.length > 0 ? `${rendered} ${trailing}` : trailing;
  }

  return {text: rendered, unusedArgs};
}
