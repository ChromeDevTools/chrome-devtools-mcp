/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {McpContext} from '../McpContext.js';
import type {DevTools} from '../third_party/index.js';

import {IssueFormatter} from './IssueFormatter.js';

export interface ConsoleMessageData {
  consoleMessageStableId: number;
  type?: string;
  item?: DevTools.AggregatedIssue;
  message?: string;
  count?: number;
  description?: string;
  args?: string[];
  stackTrace?: DevTools.StackTrace.StackTrace.StackTrace;
}

// The short format for a console message, based on a previous format.
export function formatConsoleEventShort(msg: ConsoleMessageData): string {
  if (msg.item) {
    const formatter = new IssueFormatter(msg.item, {
      id: msg.consoleMessageStableId,
    });
    return formatter.toString();
  }
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
export function formatConsoleEventVerbose(
  msg: ConsoleMessageData,
  context?: McpContext,
): string {
  const aggregatedIssue = msg.item;
  if (aggregatedIssue) {
    return new IssueFormatter(aggregatedIssue, {
      id: msg.consoleMessageStableId,
      requestIdResolver: context
        ? context.resolveCdpRequestId.bind(context)
        : undefined,
      elementIdResolver: context
        ? context.resolveCdpElementId.bind(context)
        : undefined,
    }).toStringDetailed();
  }

  const result = [
    `ID: ${msg.consoleMessageStableId}`,
    `Message: ${msg.type}> ${msg.message}`,
    formatArgs(msg),
    formatStackTrace(msg.stackTrace),
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

function formatStackTrace(
  stackTrace: DevTools.StackTrace.StackTrace.StackTrace | undefined,
): string {
  if (!stackTrace) {
    return '';
  }

  return [
    '### Stack trace',
    formatFragment(stackTrace.syncFragment),
    ...stackTrace.asyncFragments.map(formatAsyncFragment),
  ].join('\n');
}

function formatFragment(
  fragment: DevTools.StackTrace.StackTrace.Fragment,
): string {
  return fragment.frames.map(formatFrame).join('\n');
}

function formatAsyncFragment(
  fragment: DevTools.StackTrace.StackTrace.AsyncFragment,
): string {
  const separatorLineLength = 40;
  const prefix = `--- ${fragment.description || 'async'} `;
  const separator = prefix + '-'.repeat(separatorLineLength - prefix.length);
  return separator + '\n' + formatFragment(fragment);
}

function formatFrame(frame: DevTools.StackTrace.StackTrace.Frame): string {
  let result = `at ${frame.name ?? '<anonymous>'}`;
  if (frame.uiSourceCode) {
    result += ` (${frame.uiSourceCode.displayName()}:${frame.line}:${frame.column})`;
  } else if (frame.url) {
    result += ` (${frame.url}:${frame.line}:${frame.column})`;
  }
  return result;
}
