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
  options?: {
    compact?: boolean;
    includeTimestamp?: boolean;
  },
): Promise<string> {
  // Check if the event object has the .type() method, which is unique to ConsoleMessage
  if ('type' in event) {
    return await formatConsoleMessage(event, options);
  }
  return `Error: ${event.message}`;
}

async function formatConsoleMessage(
  msg: ConsoleMessage,
  options?: {
    compact?: boolean;
    includeTimestamp?: boolean;
  },
): Promise<string> {
  const logLevel = logLevels[msg.type()];
  const args = msg.args();
  const compact = options?.compact !== false; // Default to true
  const includeTimestamp = options?.includeTimestamp || false;

  if (logLevel === 'Error') {
    let message = compact ? 'Error> ' : `${logLevel}> `;

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

      if (!compact) {
        const formattedArgs = await formatArgs(args.slice(1), compact);
        if (formattedArgs) {
          message += ` ${formattedArgs}`;
        }
      }
    } else {
      message += msg.text();
      if (!compact) {
        const formattedArgs = await formatArgs(args, compact);
        if (formattedArgs) {
          message += ` ${formattedArgs}`;
        }
        // Only include stack trace in non-compact mode
        for (const frame of msg.stackTrace()) {
          message += '\n' + formatStackFrame(frame);
        }
      }
    }
    return message;
  }

  const text = msg.text();

  if (compact) {
    // Compact format: just the log level and text, no location/args
    return `${logLevel}> ${text}`;
  } else {
    // Verbose format: include location and formatted args
    const formattedArgs = await formatArgs(args, compact);
    const locationInfo = includeTimestamp
      ? formatStackFrame(msg.location())
      : '';

    return `${logLevel}> ${locationInfo}: ${text} ${formattedArgs}`.trim();
  }
}

async function formatArgs(
  args: readonly JSHandle[],
  compact = true,
): Promise<string> {
  if (compact && args.length === 0) {
    return '';
  }

  const argValues = await Promise.all(
    args.map(arg =>
      arg.jsonValue().catch(() => {
        // Ignore errors
      }),
    ),
  );

  return argValues
    .map(value => {
      if (typeof value === 'object') {
        if (compact) {
          // In compact mode, simplify objects
          if (Array.isArray(value)) {
            return `[Array(${value.length})]`;
          }
          if (value === null) {
            return 'null';
          }
          return '[Object]';
        } else {
          // In verbose mode, stringify with truncation
          const json = JSON.stringify(value);
          return json.length > 200 ? json.slice(0, 200) + '...' : json;
        }
      }
      return String(value);
    })
    .filter(Boolean)
    .join(' ');
}

function formatStackFrame(stackFrame: ConsoleMessageLocation): string {
  if (!stackFrame?.url) {
    return '<unknown>';
  }
  const filename = stackFrame.url.replace(/^.*\//, '');
  return `${filename}:${stackFrame.lineNumber}:${stackFrame.columnNumber}`;
}
