/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createStackTraceForConsoleMessage,
  type TargetUniverse,
  SymbolizedError,
} from '../DevtoolsUtils.js';
import {UncaughtError} from '../PageCollector.js';
import * as DevTools from '../third_party/index.js';
import type {ConsoleMessage} from '../third_party/index.js';

export interface ConsoleFormatterOptions {
  fetchDetailedData?: boolean;
  id: number;
  devTools?: TargetUniverse;
  resolvedArgsForTesting?: unknown[];
  resolvedStackTraceForTesting?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
  resolvedCauseForTesting?: SymbolizedError;
  isIgnoredForTesting?: IgnoreCheck;
}

export type IgnoreCheck = (
  frame: DevTools.DevTools.StackTrace.StackTrace.Frame,
) => boolean;

interface ConsoleMessageConcise {
  type: string;
  text: string;
  argsCount: number;
  id: number;
}

interface ConsoleMessageDetailed extends ConsoleMessageConcise {
  // pre-formatted args.
  args: string[];
  // pre-formatted stacktrace.
  stackTrace?: string;
}

export class ConsoleFormatter {
  readonly #id: number;
  readonly #type: string;
  readonly #text: string;

  readonly #argCount: number;
  readonly #resolvedArgs: unknown[];

  readonly #stack?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
  readonly #cause?: SymbolizedError;

  readonly isIgnored: IgnoreCheck;

  private constructor(params: {
    id: number;
    type: string;
    text: string;
    argCount?: number;
    resolvedArgs?: unknown[];
    stack?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
    cause?: SymbolizedError;
    isIgnored: IgnoreCheck;
  }) {
    this.#id = params.id;
    this.#type = params.type;
    this.#text = params.text;
    this.#argCount = params.argCount ?? 0;
    this.#resolvedArgs = params.resolvedArgs ?? [];
    this.#stack = params.stack;
    this.#cause = params.cause;
    this.isIgnored = params.isIgnored;
  }

  static async from(
    msg: ConsoleMessage | UncaughtError,
    options: ConsoleFormatterOptions,
  ): Promise<ConsoleFormatter> {
    const ignoreListManager = options?.devTools?.universe.context.get(
      DevTools.DevTools.IgnoreListManager,
    );
    const isIgnored: IgnoreCheck =
      options.isIgnoredForTesting ||
      (frame => {
        if (!ignoreListManager) {
          return false;
        }
        if (frame.uiSourceCode) {
          return ignoreListManager.isUserOrSourceMapIgnoreListedUISourceCode(
            frame.uiSourceCode,
          );
        }
        if (frame.url) {
          return ignoreListManager.isUserIgnoreListedURL(
            frame.url as Parameters<
              DevTools.DevTools.IgnoreListManager['isUserIgnoreListedURL']
            >[0],
          );
        }
        return false;
      });

    if (msg instanceof UncaughtError) {
      const error = await SymbolizedError.fromDetails({
        devTools: options?.devTools,
        details: msg.details,
        targetId: msg.targetId,
        includeStackAndCause: options?.fetchDetailedData,
        resolvedStackTraceForTesting: options?.resolvedStackTraceForTesting,
        resolvedCauseForTesting: options?.resolvedCauseForTesting,
      });
      return new ConsoleFormatter({
        id: options.id,
        type: 'error',
        text: error.message,
        stack: error.stackTrace,
        cause: error.cause,
        isIgnored,
      });
    }

    let resolvedArgs: unknown[] = [];
    if (options.resolvedArgsForTesting) {
      resolvedArgs = options.resolvedArgsForTesting;
    } else if (options.fetchDetailedData) {
      resolvedArgs = await Promise.all(
        msg.args().map(async (arg, i) => {
          try {
            const remoteObject = arg.remoteObject();
            if (
              remoteObject.type === 'object' &&
              remoteObject.subtype === 'error'
            ) {
              return await SymbolizedError.fromError({
                devTools: options.devTools,
                error: remoteObject,
                // @ts-expect-error Internal ConsoleMessage API
                targetId: msg._targetId(),
              });
            }
            return await arg.jsonValue();
          } catch {
            return `<error: Argument ${i} is no longer available>`;
          }
        }),
      );
    }

    let stack: DevTools.DevTools.StackTrace.StackTrace.StackTrace | undefined;
    if (options.resolvedStackTraceForTesting) {
      stack = options.resolvedStackTraceForTesting;
    } else if (options.fetchDetailedData && options.devTools) {
      try {
        stack = await createStackTraceForConsoleMessage(options.devTools, msg);
      } catch {
        // ignore
      }
    }

    return new ConsoleFormatter({
      id: options.id,
      type: msg.type(),
      text: msg.text(),
      argCount: resolvedArgs.length || msg.args().length,
      resolvedArgs,
      stack,
      isIgnored,
    });
  }

  // The short format for a console message.
  toString(): string {
    return convertConsoleMessageConciseToString(this.toJSON());
  }

  // The verbose format for a console message, including all details.
  toStringDetailed(): string {
    return convertConsoleMessageConciseDetailedToString(this.toJSONDetailed());
  }

  #getArgs(): unknown[] {
    if (this.#resolvedArgs.length > 0) {
      const args = [...this.#resolvedArgs];
      // If there is no text, the first argument serves as text (see formatMessage).
      if (!this.#text) {
        args.shift();
      }
      return args;
    }
    return [];
  }

  toJSON(): ConsoleMessageConcise {
    return {
      type: this.#type,
      text: this.#text,
      argsCount: this.#argCount,
      id: this.#id,
    };
  }

  toJSONDetailed(): ConsoleMessageDetailed {
    return {
      id: this.#id,
      type: this.#type,
      text: this.#text,
      argsCount: this.#argCount,
      args: this.#getArgs().map(arg => formatArg(arg, this)),
      stackTrace: this.#stack
        ? formatStackTrace(this.#stack, this.#cause, this)
        : undefined,
    };
  }
}

function convertConsoleMessageConciseToString(msg: ConsoleMessageConcise) {
  return `msgid=${msg.id} [${msg.type}] ${msg.text} (${msg.argsCount} args)`;
}

function convertConsoleMessageConciseDetailedToString(
  msg: ConsoleMessageDetailed,
) {
  const result = [
    `ID: ${msg.id}`,
    `Message: ${msg.type}> ${msg.text}`,
    formatArgs(msg),
    ...(msg.stackTrace ? ['### Stack trace', msg.stackTrace] : []),
  ].filter(line => !!line);
  return result.join('\n');
}

function formatArgs(msg: ConsoleMessageDetailed): string {
  const args = msg.args;

  if (!args.length) {
    return '';
  }

  const result = ['### Arguments'];

  for (const [key, arg] of args.entries()) {
    result.push(`Arg #${key}: ${arg}`);
  }

  return result.join('\n');
}

function formatArg(arg: unknown, formatter: {isIgnored: IgnoreCheck}) {
  if (arg instanceof SymbolizedError) {
    return [
      arg.message,
      arg.stackTrace
        ? formatStackTrace(arg.stackTrace, arg.cause, formatter)
        : undefined,
    ]
      .filter(line => !!line)
      .join('\n');
  }
  return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
}

const STACK_TRACE_MAX_LINES = 50;

function formatStackTrace(
  stackTrace: DevTools.DevTools.StackTrace.StackTrace.StackTrace,
  cause: SymbolizedError | undefined,
  formatter: {isIgnored: IgnoreCheck},
): string {
  const lines = formatStackTraceInner(stackTrace, cause, formatter);
  const includedLines = lines.slice(0, STACK_TRACE_MAX_LINES);
  const reminderCount = lines.length - includedLines.length;

  return [
    ...includedLines,
    reminderCount > 0 ? `... and ${reminderCount} more frames` : '',
    'Note: line and column numbers use 1-based indexing',
  ]
    .filter(line => !!line)
    .join('\n');
}

function formatStackTraceInner(
  stackTrace: DevTools.DevTools.StackTrace.StackTrace.StackTrace | undefined,
  cause: SymbolizedError | undefined,
  formatter: {isIgnored: IgnoreCheck},
): string[] {
  if (!stackTrace) {
    return [];
  }

  return [
    ...formatFragment(stackTrace.syncFragment, formatter),
    ...stackTrace.asyncFragments
      .map(item => formatAsyncFragment(item, formatter))
      .flat(),
    ...formatCause(cause, formatter),
  ];
}

function formatFragment(
  fragment: DevTools.DevTools.StackTrace.StackTrace.Fragment,
  formatter: {isIgnored: IgnoreCheck},
): string[] {
  const frames = fragment.frames.filter(frame => !formatter.isIgnored(frame));
  return frames.map(formatFrame);
}

function formatAsyncFragment(
  fragment: DevTools.DevTools.StackTrace.StackTrace.AsyncFragment,
  formatter: {isIgnored: IgnoreCheck},
): string[] {
  const formattedFrames = formatFragment(fragment, formatter);
  if (formattedFrames.length === 0) {
    return [];
  }

  const separatorLineLength = 40;
  const prefix = `--- ${fragment.description || 'async'} `;
  const separator = prefix + '-'.repeat(separatorLineLength - prefix.length);
  return [separator, ...formattedFrames];
}

function formatFrame(
  frame: DevTools.DevTools.StackTrace.StackTrace.Frame,
): string {
  let result = `at ${frame.name ?? '<anonymous>'}`;
  if (frame.uiSourceCode) {
    const location = frame.uiSourceCode.uiLocation(frame.line, frame.column);
    result += ` (${location.linkText(/* skipTrim */ false, /* showColumnNumber */ true)})`;
  } else if (frame.url) {
    result += ` (${frame.url}:${frame.line}:${frame.column})`;
  }
  return result;
}

function formatCause(
  cause: SymbolizedError | undefined,
  formatter: {isIgnored: IgnoreCheck},
): string[] {
  if (!cause) {
    return [];
  }

  return [
    `Caused by: ${cause.message}`,
    ...formatStackTraceInner(cause.stackTrace, cause.cause, formatter),
  ];
}
