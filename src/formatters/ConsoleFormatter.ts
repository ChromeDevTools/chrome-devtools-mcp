/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createStackTraceForConsoleMessage,
  createStackTrace,
  type TargetUniverse,
} from '../DevtoolsUtils.js';
import type {UncaughtError} from '../PageCollector.js';
import type * as DevTools from '../third_party/index.js';
import type {ConsoleMessage} from '../third_party/index.js';

export interface ConsoleFormatterOptions {
  fetchDetailedData?: boolean;
  id: number;
  devTools?: TargetUniverse;
  resolvedStackTraceForTesting?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
}

export interface FormattableMessage {
  type: string;
  text: string;
  argsCount: number;

  // Present when details are fetched.
  args: unknown[];
  stackTrace?: DevTools.DevTools.StackTrace.StackTrace.StackTrace;
}

export class ConsoleFormatter {
  readonly #id: number;
  readonly #msg: FormattableMessage;

  constructor(id: number, msg: FormattableMessage) {
    this.#id = id;
    this.#msg = msg;
  }

  static async from(
    message: ConsoleMessage | Error | UncaughtError,
    options: ConsoleFormatterOptions,
  ): Promise<ConsoleFormatter> {
    if (ConsoleFormatter.#isConsoleMessage(message)) {
      const msg: FormattableMessage = {
        type: message.type(),
        text: message.text(),
        argsCount: message.args().length,
        args: [],
      };
      if (options.fetchDetailedData) {
        msg.args = await Promise.all(
          message.args().map(async (arg, i) => {
            try {
              return await arg.jsonValue();
            } catch {
              return `<error: Argument ${i} is no longer available>`;
            }
          }),
        );
        if (options.devTools) {
          msg.stackTrace = await createStackTraceForConsoleMessage(
            options.devTools,
            message,
          );
        }
      }
      return new ConsoleFormatter(options.id, msg);
    }

    const msg: FormattableMessage = {
      type: 'error',
      text: message.message,
      argsCount: 0,
      args: [],
    };
    if (
      options.fetchDetailedData &&
      options.devTools &&
      'stackTrace' in message &&
      message.stackTrace
    ) {
      msg.stackTrace = await createStackTrace(
        options.devTools,
        message.stackTrace,
        message.targetId,
      );
    }
    return new ConsoleFormatter(options.id, msg);
  }

  static #isConsoleMessage(
    msg: ConsoleMessage | Error | UncaughtError,
  ): msg is ConsoleMessage {
    // No `instanceof` as tests mock `ConsoleMessage`.
    return 'args' in msg && typeof msg.args === 'function';
  }

  // The short format for a console message.
  toString(): string {
    const {type, text, argsCount} = this.#msg;
    const idPart = this.#id !== undefined ? `msgid=${this.#id} ` : '';
    return `${idPart}[${type}] ${text} (${argsCount} args)`;
  }

  // The verbose format for a console message, including all details.
  toStringDetailed(): string {
    const result = [
      this.#id !== undefined ? `ID: ${this.#id}` : '',
      `Message: ${this.#msg.type}> ${this.#msg.text}`,
      this.#formatArgs(),
      this.#formatStackTrace(this.#msg.stackTrace),
    ].filter(line => !!line);
    return result.join('\n');
  }

  #getArgs(): unknown[] {
    if (this.#msg.args.length > 0) {
      const args = [...this.#msg.args];
      // If there is no text, the first argument serves as text (see formatMessage).
      if (!this.#msg.text) {
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
      type: this.#msg.type,
      text: this.#msg.text,
      argsCount: this.#msg.argsCount,
      id: this.#id,
    };
  }

  toJSONDetailed(): object {
    return {
      id: this.#id,
      type: this.#msg.type,
      text: this.#msg.text,
      args: this.#getArgs().map(arg =>
        typeof arg === 'object' ? arg : String(arg),
      ),
      stackTrace: this.#msg.stackTrace,
    };
  }
}
