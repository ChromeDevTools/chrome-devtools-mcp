/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createStackTrace,
  createStackTraceForConsoleMessage,
  type TargetUniverse,
  SymbolizedError,
} from '../devtools/DevtoolsUtils.js';
import {UncaughtError} from '../PageCollector.js';
import * as DevTools from '../third_party/index.js';
import type {ConsoleMessage, Protocol} from '../third_party/index.js';

import type {IssueFormatter} from './IssueFormatter.js';

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

interface ConsoleMessageLocation {
  /** Full URL of the source. May be empty for inline scripts. */
  url: string;
  /** Short display name (filename) used for compact text output. */
  displayName: string;
  /** 1-based line number. */
  lineNumber: number;
  /** 1-based column number. */
  columnNumber: number;
}

interface ConsoleMessageConcise {
  type: string;
  text: string;
  argsCount: number;
  id: number;
  location?: ConsoleMessageLocation;
  count?: number;
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
  readonly #location?: ConsoleMessageLocation;

  readonly isIgnored: IgnoreCheck;

  protected constructor(params: {
    id: number;
    type: string;
    text: string;
    argCount?: number;
    resolvedArgs?: unknown[];
    stack?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
    cause?: SymbolizedError;
    location?: ConsoleMessageLocation;
    isIgnored: IgnoreCheck;
  }) {
    this.#id = params.id;
    this.#type = params.type;
    this.#text = params.text;
    this.#argCount = params.argCount ?? 0;
    this.#resolvedArgs = params.resolvedArgs ?? [];
    this.#stack = params.stack;
    this.#cause = params.cause;
    this.#location = params.location;
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
      // Fetch stack trace eagerly so that source-mapped location is available
      // for both the concise and detailed outputs. Cause resolution remains
      // gated by `fetchDetailedData` since it can be more expensive.
      let stack: DevTools.DevTools.StackTrace.StackTrace.StackTrace | undefined;
      if (options.resolvedStackTraceForTesting) {
        stack = options.resolvedStackTraceForTesting;
      } else if (options.devTools && msg.details.stackTrace) {
        try {
          stack = await withResolveTimeout(
            createStackTrace(
              options.devTools,
              msg.details.stackTrace,
              msg.targetId,
            ),
            options.fetchDetailedData,
          );
        } catch {
          // ignore
        }
      }

      const error = await SymbolizedError.fromDetails({
        devTools: options?.devTools,
        details: msg.details,
        targetId: msg.targetId,
        includeStackAndCause: options?.fetchDetailedData,
        resolvedStackTraceForTesting: stack,
        resolvedCauseForTesting: options?.resolvedCauseForTesting,
      });
      const location =
        extractLocationFromStack(error.stackTrace, isIgnored) ??
        extractLocationFromExceptionDetails(msg.details);
      return new ConsoleFormatter({
        id: options.id,
        type: 'error',
        text: error.message,
        stack: error.stackTrace,
        cause: error.cause,
        location,
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

    // Always try to resolve the stack trace so we can derive a source-mapped
    // location, even for the concise output. We use a short timeout to bound
    // the work in case underlying CDP calls hang (e.g. when the page is
    // paused on a dialog).
    let stack: DevTools.DevTools.StackTrace.StackTrace.StackTrace | undefined;
    if (options.resolvedStackTraceForTesting) {
      stack = options.resolvedStackTraceForTesting;
    } else if (options.devTools) {
      try {
        stack = await withResolveTimeout(
          createStackTraceForConsoleMessage(options.devTools, msg),
          options.fetchDetailedData,
        );
      } catch {
        // ignore
      }
    }

    const location =
      extractLocationFromStack(stack, isIgnored) ??
      extractLocationFromConsoleMessage(msg);
    return new ConsoleFormatter({
      id: options.id,
      type: msg.type(),
      text: msg.text(),
      argCount: resolvedArgs.length || msg.args().length,
      resolvedArgs,
      stack,
      location,
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
      ...(this.#location ? {location: this.#location} : {}),
    };
  }

  /**
   * Groups consecutive messages with the same type, text, argument count, and
   * source location. Similar to Chrome DevTools' console grouping behavior.
   */
  static groupConsecutive(
    messages: Array<ConsoleFormatter | IssueFormatter>,
  ): Array<ConsoleFormatter | IssueFormatter> {
    const grouped: Array<{
      message: ConsoleFormatter | IssueFormatter;
      count: number;
    }> = [];
    for (const msg of messages) {
      const prev = grouped[grouped.length - 1];
      if (
        prev &&
        prev.message instanceof ConsoleFormatter &&
        msg instanceof ConsoleFormatter &&
        prev.message.#type === msg.#type &&
        prev.message.#text === msg.#text &&
        prev.message.#argCount === msg.#argCount &&
        sameLocation(prev.message.#location, msg.#location)
      ) {
        prev.count++;
      } else {
        grouped.push({message: msg, count: 1});
      }
    }
    return grouped.map(({message, count}) =>
      count > 1 && message instanceof ConsoleFormatter
        ? new GroupedConsoleFormatter(
            {
              id: message.#id,
              type: message.#type,
              text: message.#text,
              argCount: message.#argCount,
              location: message.#location,
              isIgnored: message.isIgnored,
            },
            count,
          )
        : message,
    );
  }

  toJSONDetailed(): ConsoleMessageDetailed {
    return {
      id: this.#id,
      type: this.#type,
      text: this.#text,
      argsCount: this.#argCount,
      ...(this.#location ? {location: this.#location} : {}),
      args: this.#getArgs().map(arg => formatArg(arg, this)),
      stackTrace: this.#stack
        ? formatStackTrace(this.#stack, this.#cause, this)
        : undefined,
    };
  }
}

export class GroupedConsoleFormatter extends ConsoleFormatter {
  readonly #count: number;

  constructor(
    params: {
      id: number;
      type: string;
      text: string;
      argCount: number;
      location?: ConsoleMessageLocation;
      isIgnored: IgnoreCheck;
    },
    count: number,
  ) {
    super(params);
    this.#count = count;
  }

  override toString(): string {
    return convertConsoleMessageConciseToString(this.toJSON());
  }

  override toJSON(): ConsoleMessageConcise {
    const json = super.toJSON();
    json.count = this.#count;
    return json;
  }
}

function convertConsoleMessageConciseToString(msg: ConsoleMessageConcise) {
  const countSuffix = msg.count && msg.count > 1 ? ` [${msg.count} times]` : '';
  const locationStr = msg.location ? ` ${formatLocation(msg.location)}` : '';
  return `msgid=${msg.id} [${msg.type}] ${msg.text} (${msg.argsCount} args)${locationStr}${countSuffix}`;
}

function convertConsoleMessageConciseDetailedToString(
  msg: ConsoleMessageDetailed,
) {
  const result = [
    `ID: ${msg.id}`,
    `Message: ${msg.type}> ${msg.text}`,
    msg.location ? `Location: ${formatLocation(msg.location)}` : '',
    formatArgs(msg),
    ...(msg.stackTrace ? ['### Stack trace', msg.stackTrace] : []),
  ].filter(line => !!line);
  return result.join('\n');
}

function formatLocation(location: ConsoleMessageLocation): string {
  const name = location.displayName || '<anonymous>';
  return `${name}:${location.lineNumber}:${location.columnNumber}`;
}

function sameLocation(
  a: ConsoleMessageLocation | undefined,
  b: ConsoleMessageLocation | undefined,
): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.url === b.url &&
    a.lineNumber === b.lineNumber &&
    a.columnNumber === b.columnNumber
  );
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

/**
 * Returns the source-mapped location of the top non-ignored frame in the
 * given stack trace. Falls back to the raw frame URL when the frame does not
 * have an associated `uiSourceCode`.
 */
function extractLocationFromStack(
  stack: DevTools.DevTools.StackTrace.StackTrace.StackTrace | undefined,
  isIgnored: IgnoreCheck,
): ConsoleMessageLocation | undefined {
  if (!stack) {
    return undefined;
  }
  const frame = stack.syncFragment.frames.find(f => !isIgnored(f));
  if (!frame) {
    return undefined;
  }
  if (frame.uiSourceCode) {
    const uiLocation = frame.uiSourceCode.uiLocation(frame.line, frame.column);
    const url = uiLocation.uiSourceCode.url();
    return {
      url,
      displayName: shortUrl(url) || uiLocation.uiSourceCode.displayName(),
      // UILocation stores 0-based line/column indices.
      lineNumber: uiLocation.lineNumber + 1,
      columnNumber: (uiLocation.columnNumber ?? 0) + 1,
    };
  }
  if (frame.url) {
    return {
      url: frame.url,
      displayName: shortUrl(frame.url),
      // StackTrace frames are already 1-based.
      lineNumber: frame.line,
      columnNumber: frame.column,
    };
  }
  return undefined;
}

function extractLocationFromConsoleMessage(
  msg: ConsoleMessage,
): ConsoleMessageLocation | undefined {
  const loc = msg.location();
  if (loc.lineNumber !== undefined && loc.columnNumber !== undefined) {
    const url = loc.url ?? '';
    return {
      url,
      displayName: shortUrl(url),
      lineNumber: loc.lineNumber + 1,
      columnNumber: loc.columnNumber + 1,
    };
  }
  return undefined;
}

function extractLocationFromExceptionDetails(
  details: Protocol.Runtime.ExceptionDetails,
): ConsoleMessageLocation | undefined {
  const frame = details.stackTrace?.callFrames?.[0];
  if (frame) {
    return {
      url: frame.url,
      displayName: shortUrl(frame.url),
      lineNumber: frame.lineNumber + 1,
      columnNumber: frame.columnNumber + 1,
    };
  }
  if (details.lineNumber !== undefined) {
    const url = details.url ?? '';
    return {
      url,
      displayName: shortUrl(url),
      lineNumber: details.lineNumber + 1,
      columnNumber: (details.columnNumber ?? 0) + 1,
    };
  }
  return undefined;
}

/**
 * Returns the last path segment of a URL as a short display name.
 * Decodes percent-encoded characters, unwraps parenthesised inner URLs
 * used by puppeteer (e.g.
 * `pptr:evaluateHandle;performEvaluation (file:///.../script.js:104:34)`),
 * and strips any trailing `:line:col` suffix so URLs reduce to the
 * inner file's basename.
 */
function shortUrl(url: string): string {
  if (!url) {
    return '';
  }
  let str = url;
  try {
    str = decodeURIComponent(str);
  } catch {
    // Leave url as-is when it is not validly percent-encoded.
  }
  // Unwrap parenthesised inner URL for puppeteer-style wrappers.
  const parenMatch = str.match(/\(([^()]+)\)/);
  if (parenMatch) {
    str = parenMatch[1];
  }
  // Strip trailing :line:col or :line so the basename is extractable.
  str = str.replace(/:\d+(?::\d+)?$/, '');
  const slashIdx = str.lastIndexOf('/');
  return slashIdx >= 0 ? str.slice(slashIdx + 1) : str;
}

/**
 * Bounds a stack-trace resolution promise with a timeout so that hanging CDP
 * calls (for example, when the page is paused on a dialog) do not block the
 * containing tool call. Required because we resolve the stack trace eagerly
 * even for the concise output to derive a source-mapped location.
 */
async function withResolveTimeout<T>(
  promise: Promise<T>,
  fetchDetailedData: boolean | undefined,
): Promise<T | undefined> {
  const timeoutMs = fetchDetailedData ? 10_000 : 5_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<undefined>(resolve => {
    timeoutId = setTimeout(() => resolve(undefined), timeoutMs);
  });
  try {
    return await Promise.race([promise.catch(() => undefined), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
