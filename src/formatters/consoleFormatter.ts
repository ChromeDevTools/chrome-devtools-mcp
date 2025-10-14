/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ConsoleMessage, JSHandle} from 'puppeteer-core';

const logLevels: Record<string, string> = {
  log: 'Log',
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  exception: 'Exception',
  assert: 'Assert',
};

export async function formatConsoleEvent(
  event: ConsoleMessage | Error,
): Promise<string> {
  // Check if the event object has the .type() method, which is unique to ConsoleMessage
  if ('type' in event) {
    return await formatConsoleMessage(event);
  }
  return `Error: ${event.message}`;
}

async function formatConsoleMessage(msg: ConsoleMessage): Promise<string> {
  const logLevel = logLevels[msg.type()];
  const text = msg.text();
  const args = msg.args();

  const formattedArgs = await formatArgs(args, text);
  return `${logLevel}> ${text} ${formattedArgs}`.trim();
}

// Only includes the first arg and indicates that there are more args
async function formatArgs(
  args: readonly JSHandle[],
  messageText: string,
): Promise<string> {
  if (args.length === 0) {
    return '';
  }

  let formattedArgs = '';
  const firstArg = await args[0].jsonValue().catch(() => {
    // Ignore errors
  });

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
