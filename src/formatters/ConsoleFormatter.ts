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
}

export class ConsoleFormatter {
  readonly #id: number;
  readonly #type: string;
  readonly #text: string;

  readonly #argCount: number;
  readonly #resolvedArgs: unknown[];

  readonly #stack?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
  readonly #cause?: SymbolizedError; // eslint-disable-line no-unused-private-class-members

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
      this.#formatStackTrace(this.#stack),
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
  ): string {
    if (!stackTrace) {
      return '';
    }

    return [
      '### Stack trace',
      this.#formatFragment(stackTrace.syncFragment),
      ...stackTrace.asyncFragments.map(this.#formatAsyncFragment.bind(this)),
      'Note: line and column numbers use 1-based indexing',
    ].join('\n');
  }

  #formatFragment(
    fragment: DevTools.DevTools.StackTrace.StackTrace.Fragment,
  ): string {
    return fragment.frames.map(this.#formatFrame.bind(this)).join('\n');
  }

  #formatAsyncFragment(
    fragment: DevTools.DevTools.StackTrace.StackTrace.AsyncFragment,
  ): string {
    const separatorLineLength = 40;
    const prefix = `--- ${fragment.description || 'async'} `;
    const separator = prefix + '-'.repeat(separatorLineLength - prefix.length);
    return separator + '\n' + this.#formatFragment(fragment);
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
