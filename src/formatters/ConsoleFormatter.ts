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
import type * as DevTools from '../third_party/index.js';
import type {ConsoleMessage} from '../third_party/index.js';

export interface ConsoleFormatterOptions {
  fetchDetailedData?: boolean;
  id: number;
  devTools?: TargetUniverse;
  resolvedArgsForTesting?: unknown[];
  resolvedStackTraceForTesting?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
  resolvedCauseForTesting?: SymbolizedError;
}

export class ConsoleFormatter {
  static readonly #STACK_TRACE_MAX_LINES = 50;

  readonly #id: number;
  readonly #type: string;
  readonly #text: string;

  readonly #argCount: number;
  readonly #resolvedArgs: unknown[];

  readonly #stack?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
  readonly #cause?: SymbolizedError;

  private constructor(params: {
    id: number;
    type: string;
    text: string;
    argCount?: number;
    resolvedArgs?: unknown[];
    stack?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
    cause?: SymbolizedError;
  }) {
    this.#id = params.id;
    this.#type = params.type;
    this.#text = params.text;
    this.#argCount = params.argCount ?? 0;
    this.#resolvedArgs = params.resolvedArgs ?? [];
    this.#stack = params.stack;
    this.#cause = params.cause;
  }

  static async from(
    msg: ConsoleMessage | UncaughtError,
    options: ConsoleFormatterOptions,
  ): Promise<ConsoleFormatter> {
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
    });
  }

  // The short format for a console message.
  toString(): string {
    return `msgid=${this.#id} [${this.#type}] ${this.#text} (${this.#argCount} args)`;
  }

  // The verbose format for a console message, including all details.
  toStringDetailed(): string {
    const result = [
      `ID: ${this.#id}`,
      `Message: ${this.#type}> ${this.#text}`,
      this.#formatArgs(),
      this.#formatStackTrace(this.#stack, this.#cause, {
        includeHeading: true,
      }),
    ].filter(line => !!line);
    return result.join('\n');
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

  #formatArg(arg: unknown) {
    if (arg instanceof SymbolizedError) {
      return [
        arg.message,
        this.#formatStackTrace(arg.stackTrace, arg.cause, {
          includeHeading: false,
        }),
      ]
        .filter(line => !!line)
        .join('\n');
    }
    return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
  }

  #formatArgs(): string {
    const args = this.#getArgs();

    if (!args.length) {
      return '';
    }

    const result = ['### Arguments'];

    for (const [key, arg] of args.entries()) {
      result.push(`Arg #${key}: ${this.#formatArg(arg)}`);
    }

    return result.join('\n');
  }

  #formatStackTrace(
    stackTrace: DevTools.DevTools.StackTrace.StackTrace.StackTrace | undefined,
    cause: SymbolizedError | undefined,
    opts: {includeHeading: boolean},
  ): string {
    if (!stackTrace) {
      return '';
    }

    const lines = this.#formatStackTraceInner(stackTrace, cause);
    const includedLines = lines.slice(
      0,
      ConsoleFormatter.#STACK_TRACE_MAX_LINES,
    );
    const reminderCount = lines.length - includedLines.length;

    return [
      opts.includeHeading ? '### Stack trace' : '',
      ...includedLines,
      reminderCount > 0 ? `... and ${reminderCount} more frames` : '',
      'Note: line and column numbers use 1-based indexing',
    ]
      .filter(line => !!line)
      .join('\n');
  }

  #formatStackTraceInner(
    stackTrace: DevTools.DevTools.StackTrace.StackTrace.StackTrace | undefined,
    cause: SymbolizedError | undefined,
  ): string[] {
    if (!stackTrace) {
      return [];
    }

    return [
      ...this.#formatFragment(stackTrace.syncFragment),
      ...stackTrace.asyncFragments
        .map(this.#formatAsyncFragment.bind(this))
        .flat(),
      ...this.#formatCause(cause),
    ];
  }

  #formatFragment(
    fragment: DevTools.DevTools.StackTrace.StackTrace.Fragment,
  ): string[] {
    return fragment.frames.map(this.#formatFrame.bind(this));
  }

  #formatAsyncFragment(
    fragment: DevTools.DevTools.StackTrace.StackTrace.AsyncFragment,
  ): string[] {
    const separatorLineLength = 40;
    const prefix = `--- ${fragment.description || 'async'} `;
    const separator = prefix + '-'.repeat(separatorLineLength - prefix.length);
    return [separator, ...this.#formatFragment(fragment)];
  }

  #formatFrame(frame: DevTools.DevTools.StackTrace.StackTrace.Frame): string {
    let result = `at ${frame.name ?? '<anonymous>'}`;
    if (frame.uiSourceCode) {
      const location = frame.uiSourceCode.uiLocation(frame.line, frame.column);
      result += ` (${location.linkText(/* skipTrim */ false, /* showColumnNumber */ true)})`;
    } else if (frame.url) {
      result += ` (${frame.url}:${frame.line}:${frame.column})`;
    }
    return result;
  }

  #formatCause(cause: SymbolizedError | undefined): string[] {
    if (!cause) {
      return [];
    }

    return [
      `Caused by: ${cause.message}`,
      ...this.#formatStackTraceInner(cause.stackTrace, cause.cause),
    ];
  }

  toJSON(): object {
    return {
      type: this.#type,
      text: this.#text,
      argsCount: this.#argCount,
      id: this.#id,
    };
  }

  toJSONDetailed(): object {
    return {
      id: this.#id,
      type: this.#type,
      text: this.#text,
      args: this.#getArgs().map(arg =>
        typeof arg === 'object' ? arg : String(arg),
      ),
      stackTrace: this.#stack,
    };
  }
}
