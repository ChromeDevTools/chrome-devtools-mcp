/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createStackTraceForConsoleMessage, SymbolizedError, } from '../devtools/DevtoolsUtils.js';
import { UncaughtError } from '../collectors/PageCollector.js';
import * as DevTools from '../third_party/index.js';
export class ConsoleFormatter {
    #id;
    #type;
    #text;
    #argCount;
    #resolvedArgs;
    #stack;
    #cause;
    #includeStackInConcise;
    isIgnored;
    constructor(params) {
        this.#id = params.id;
        this.#type = params.type;
        this.#text = params.text;
        this.#argCount = params.argCount ?? 0;
        this.#resolvedArgs = params.resolvedArgs ?? [];
        this.#stack = params.stack;
        this.#cause = params.cause;
        this.#includeStackInConcise = params.includeStackInConcise ?? false;
        this.isIgnored = params.isIgnored;
    }
    static async from(msg, options) {
        const ignoreListManager = options?.devTools?.universe.context.get(DevTools.DevTools.IgnoreListManager);
        const isIgnored = options.isIgnoredForTesting ||
            (frame => {
                if (!ignoreListManager) {
                    return false;
                }
                if (frame.uiSourceCode) {
                    return ignoreListManager.isUserOrSourceMapIgnoreListedUISourceCode(frame.uiSourceCode);
                }
                if (frame.url) {
                    return ignoreListManager.isUserIgnoreListedURL(frame.url);
                }
                return false;
            });
        if (msg instanceof UncaughtError) {
            const error = await SymbolizedError.fromDetails({
                devTools: options?.devTools,
                details: msg.details,
                targetId: msg.targetId,
                includeStackAndCause: options?.fetchDetailedData || options?.fetchStackTrace,
                resolvedStackTraceForTesting: options?.resolvedStackTraceForTesting,
                resolvedCauseForTesting: options?.resolvedCauseForTesting,
            });
            return new ConsoleFormatter({
                id: options.id,
                type: 'error',
                text: error.message,
                stack: error.stackTrace,
                cause: error.cause,
                includeStackInConcise: options.fetchStackTrace,
                isIgnored,
            });
        }
        let resolvedArgs = [];
        if (options.resolvedArgsForTesting) {
            resolvedArgs = options.resolvedArgsForTesting;
        }
        else if (options.fetchDetailedData) {
            resolvedArgs = await Promise.all(msg.args().map(async (arg, i) => {
                try {
                    const remoteObject = arg.remoteObject();
                    if (remoteObject.type === 'object' &&
                        remoteObject.subtype === 'error') {
                        return await SymbolizedError.fromError({
                            devTools: options.devTools,
                            error: remoteObject,
                            // @ts-expect-error Internal ConsoleMessage API
                            targetId: msg._targetId(),
                        });
                    }
                    return await arg.jsonValue();
                }
                catch {
                    return `<error: Argument ${i} is no longer available>`;
                }
            }));
        }
        let stack;
        if (options.resolvedStackTraceForTesting) {
            stack = options.resolvedStackTraceForTesting;
        }
        else if ((options.fetchDetailedData || options.fetchStackTrace) &&
            options.devTools) {
            try {
                stack = await createStackTraceForConsoleMessage(options.devTools, msg);
            }
            catch {
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
            includeStackInConcise: options.fetchStackTrace,
            isIgnored,
        });
    }
    // The short format for a console message.
    toString() {
        return convertConsoleMessageConciseToString(this.toJSON());
    }
    // The verbose format for a console message, including all details.
    toStringDetailed() {
        return convertConsoleMessageConciseDetailedToString(this.toJSONDetailed());
    }
    #getText() {
        if (this.#text) {
            return this.#text;
        }
        if (this.#resolvedArgs.length > 0) {
            return formatArg(this.#resolvedArgs[0], this);
        }
        return '';
    }
    #getArgs() {
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
    toJSON() {
        const json = {
            type: this.#type,
            text: this.#getText(),
            argsCount: this.#argCount,
            id: this.#id,
        };
        if (this.#includeStackInConcise && this.#stack) {
            json.stackTrace = formatStackTrace(this.#stack, this.#cause, this, {
                includeNote: false,
            });
        }
        return json;
    }
    /**
     * Groups consecutive messages with the same type, text, and argument count.
     * Similar to Chrome DevTools' console grouping behavior.
     */
    static groupConsecutive(messages) {
        const grouped = [];
        for (const msg of messages) {
            const prev = grouped[grouped.length - 1];
            if (prev &&
                prev.message instanceof ConsoleFormatter &&
                msg instanceof ConsoleFormatter &&
                prev.message.#type === msg.#type &&
                prev.message.#getText() === msg.#getText() &&
                prev.message.#argCount === msg.#argCount) {
                prev.count++;
            }
            else {
                grouped.push({ message: msg, count: 1 });
            }
        }
        return grouped.map(({ message, count }) => count > 1 && message instanceof ConsoleFormatter
            ? new GroupedConsoleFormatter({
                id: message.#id,
                type: message.#type,
                text: message.#text,
                argCount: message.#argCount,
                stack: message.#stack,
                cause: message.#cause,
                includeStackInConcise: message.#includeStackInConcise,
                isIgnored: message.isIgnored,
            }, count)
            : message);
    }
    toJSONDetailed() {
        return {
            id: this.#id,
            type: this.#type,
            text: this.#getText(),
            argsCount: this.#argCount,
            args: this.#getArgs().map(arg => formatArg(arg, this)),
            stackTrace: this.#stack
                ? formatStackTrace(this.#stack, this.#cause, this)
                : undefined,
        };
    }
}
export class GroupedConsoleFormatter extends ConsoleFormatter {
    #count;
    constructor(params, count) {
        super(params);
        this.#count = count;
    }
    toString() {
        return convertConsoleMessageConciseToString(this.toJSON());
    }
    toJSON() {
        const json = super.toJSON();
        json.count = this.#count;
        return json;
    }
}
function convertConsoleMessageConciseToString(msg) {
    const countSuffix = msg.count && msg.count > 1 ? ` [${msg.count} times]` : '';
    const messageLine = `msgid=${msg.id} [${msg.type}] ${msg.text} (${msg.argsCount} args)${countSuffix}`;
    if (!msg.stackTrace) {
        return messageLine;
    }
    const indentedStackTrace = msg.stackTrace
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n');
    return `${messageLine}\n${indentedStackTrace}`;
}
function convertConsoleMessageConciseDetailedToString(msg) {
    const result = [
        `ID: ${msg.id}`,
        `Message: ${msg.type}> ${msg.text}`,
        formatArgs(msg),
        ...(msg.stackTrace ? ['### Stack trace', msg.stackTrace] : []),
    ].filter(line => !!line);
    return result.join('\n');
}
function formatArgs(msg) {
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
function formatArg(arg, formatter) {
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
function formatStackTrace(stackTrace, cause, formatter, options) {
    const lines = formatStackTraceInner(stackTrace, cause, formatter);
    const includedLines = lines.slice(0, STACK_TRACE_MAX_LINES);
    const reminderCount = lines.length - includedLines.length;
    return [
        ...includedLines,
        reminderCount > 0 ? `... and ${reminderCount} more frames` : '',
        options?.includeNote === false
            ? ''
            : 'Note: line and column numbers use 1-based indexing',
    ]
        .filter(line => !!line)
        .join('\n');
}
function formatStackTraceInner(stackTrace, cause, formatter) {
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
function formatFragment(fragment, formatter) {
    const frames = fragment.frames.filter(frame => !formatter.isIgnored(frame));
    return frames.map(formatFrame);
}
function formatAsyncFragment(fragment, formatter) {
    const formattedFrames = formatFragment(fragment, formatter);
    if (formattedFrames.length === 0) {
        return [];
    }
    const separatorLineLength = 40;
    const prefix = `--- ${fragment.description || 'async'} `;
    const separator = prefix + '-'.repeat(Math.max(0, separatorLineLength - prefix.length));
    return [separator, ...formattedFrames];
}
function formatFrame(frame) {
    let result = `at ${frame.name ?? '<anonymous>'}`;
    if (frame.uiSourceCode) {
        const location = frame.uiSourceCode.uiLocation(frame.line, frame.column);
        result += ` (${location.linkText(/* skipTrim */ false, /* showColumnNumber */ true)})`;
    }
    else if (frame.url) {
        result += ` (${frame.url}:${frame.line}:${frame.column})`;
    }
    return result;
}
function formatCause(cause, formatter) {
    if (!cause) {
        return [];
    }
    return [
        `Caused by: ${cause.message}`,
        ...formatStackTraceInner(cause.stackTrace, cause.cause, formatter),
    ];
}
//# sourceMappingURL=ConsoleFormatter.js.map