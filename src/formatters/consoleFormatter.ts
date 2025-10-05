/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ConsoleMessage,
  JSHandle,
  ConsoleMessageLocation,
} from 'puppeteer-core';

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
  const args = msg.args();

  if (logLevel === 'Error') {
    let message = `${logLevel}> `;
    if (msg.text() === 'JSHandle@error') {
      const errorHandle = args[0] as JSHandle<Error>;
      message += await errorHandle
        .evaluate(error => {
          return error.toString();
        })
        .catch(() => {
          return 'Error occurred';
        });
      void errorHandle.dispose().catch();

      const formattedArgs = await formatArgs(args.slice(1));
      if (formattedArgs) {
        message += ` ${formattedArgs}`;
      }
    } else {
      message += msg.text();
      const formattedArgs = await formatArgs(args);
      if (formattedArgs) {
        message += ` ${formattedArgs}`;
      }
      for (const frame of msg.stackTrace()) {
        message += '\n' + formatStackFrame(frame);
      }
    }
    return message;
  }

  const formattedArgs = await formatArgs(args);
  const text = msg.text();

  return `${logLevel}> ${formatStackFrame(
    msg.location(),
  )}: ${text} ${formattedArgs}`.trim();
}

async function formatArgs(args: readonly JSHandle[]): Promise<string> {
  const argValues = await Promise.all(
    args.map(arg =>
      arg.jsonValue().catch(() => {
        // Ignore errors
      }),
    ),
  );

  return argValues
    .map(value => {
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    })
    .join(' ');
}

function formatStackFrame(stackFrame: ConsoleMessageLocation): string {
  if (!stackFrame?.url) {
    return '<unknown>';
  }
  const filename = stackFrame.url.replace(/^.*\//, '');
  return `${filename}:${stackFrame.lineNumber}:${stackFrame.columnNumber}`;
}
