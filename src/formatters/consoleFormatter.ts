/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ConsoleMessageData {
  consoleMessageStableId: number;
  type?: string;
  message?: string;
  args?: string[];
}

// The short format for a console message, based on a previous format.
export function formatConsoleEventShort(msg: ConsoleMessageData): string {
  return `msgid=${msg.consoleMessageStableId} [${msg.type}] ${msg.message} (${msg.args?.length ?? 0} args)`;
}

function getArgs(msg: ConsoleMessageData) {
  const args = [...(msg.args ?? [])];

  // If there is no text, the first argument serves as text (see formatMessage).
  if (!msg.message) {
    args.shift();
  }

  return args;
}

// The verbose format for a console message, including all details.
export function formatConsoleEventVerbose(msg: ConsoleMessageData): string {
  const result = [
    `ID: ${msg.consoleMessageStableId}`,
    `Message: ${msg.type}> ${msg.message}`,
    formatArgs(msg),
  ].filter(line => !!line);

  return result.join('\n');
}

function formatArg(arg: unknown) {
  return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
}

function formatArgs(consoleData: ConsoleMessageData): string {
  const args = getArgs(consoleData);

  if (!args.length) {
    return '';
  }

  const result = ['### Arguments'];

  for (const [key, arg] of args.entries()) {
    result.push(`Arg #${key}: ${formatArg(arg)}`);
  }

  return result.join('\n');
}
