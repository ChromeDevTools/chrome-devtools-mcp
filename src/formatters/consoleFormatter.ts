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

// The short format for a console message, based on a previous format.
export function formatConsoleEventShort(msg: ConsoleMessageData): string {
  const args = msg.args ? formatArgs(msg, false) : '';
  return `msgid=${msg.consoleMessageStableId} [${msg.type}] ${msg.message}${args}`;
}

// The verbose format for a console message, including all details.
export function formatConsoleEventVerbose(msg: ConsoleMessageData): string {
  const logLevel = msg.type ? (logLevels[msg.type] ?? 'Log') : 'Log';
  let result = `${logLevel}> ${msg.message}`;

  if (msg.args && msg.args.length > 0) {
    result += formatArgs(msg, true);
  }

  result += `
  ID: ${msg.consoleMessageStableId}`;
  result += `
  Type: ${msg.type}`;

  return result;
}

// If `includeAllArgs` is false, only includes the first arg and indicates that there are more args.
function formatArgs(
  consoleData: ConsoleMessageData,
  includeAllArgs = false,
): string {
  if (!consoleData.args || consoleData.args.length === 0) {
    return '';
  }

  let formattedArgs = '';
  // In the short format version, we only include the first arg.
  const messageArgsToFormat = includeAllArgs
    ? consoleData.args
    : [consoleData.args[0]];

  for (const arg of messageArgsToFormat) {
    if (arg !== consoleData.message) {
      formattedArgs += ' ';
      formattedArgs +=
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }
  }

  if (!includeAllArgs && consoleData.args.length > 1) {
    formattedArgs += ` ...`;
  }

  return formattedArgs.length > 0 ? ` Args:${formattedArgs}` : '';
}
