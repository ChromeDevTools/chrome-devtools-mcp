/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ConsoleMessageData} from '../McpResponse.js';

const logLevels: Record<string, string> = {
  log: 'Log',
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  exception: 'Exception',
  assert: 'Assert',
};

export function formatConsoleEvent(msg: ConsoleMessageData): string {
  const logLevel = logLevels[msg.type] ?? 'Log';
  const text = msg.message;

  const formattedArgs = formatArgs(msg.args, text);
  return `${logLevel}> ${text} ${formattedArgs}`.trim();
}

// Only includes the first arg and indicates that there are more args
function formatArgs(args: string[], messageText: string): string {
  if (args.length === 0) {
    return '';
  }

  let formattedArgs = '';
  const firstArg = args[0];

  if (firstArg !== messageText) {
    formattedArgs +=
      typeof firstArg === 'object'
        ? JSON.stringify(firstArg)
        : String(firstArg);
  }

  if (args.length > 1) {
    return `${formattedArgs} ...`;
  }

  return formattedArgs;
}
