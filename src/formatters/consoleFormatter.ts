/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {AggregatedIssue} from '../../node_modules/chrome-devtools-frontend/mcp/mcp.js';
import type {McpContext} from '../McpContext.js';

export interface ConsoleMessageData {
  consoleMessageStableId: number;
  type?: string;
  item?: AggregatedIssue;
  message?: string;
  count?: number;
  description?: string;
  args?: string[];
}

// The short format for a console message, based on a previous format.
export function formatConsoleEventShort(msg: ConsoleMessageData): string {
  if (msg.type === 'issue') {
    return `msgid=${msg.consoleMessageStableId} [${msg.type}] ${msg.message} (count: ${msg.count})`;
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
  const result = [
    `ID: ${msg.consoleMessageStableId}`,
    `Message: ${msg.type}> ${aggregatedIssue ? formatIssue(aggregatedIssue, msg.description, context) : msg.message}`,
    aggregatedIssue ? undefined : formatArgs(msg),
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
interface IssueDetailsWithResources {
  violatingNodeId?: number;
  nodeId?: number;
  documentNodeId?: number;
}
export function formatIssue(
  issue: AggregatedIssue,
  description?: string,
  context?: McpContext,
): string {
  const result: string[] = [];

  let processedMarkdown = description?.trim();
  // Remove heading in order not to conflict with the whole console message response markdown
  if (processedMarkdown?.startsWith('# ')) {
    processedMarkdown = processedMarkdown.substring(2).trimStart();
  }
  if (processedMarkdown) result.push(processedMarkdown);

  const links = issue.getDescription()?.links;
  if (links && links.length > 0) {
    result.push('Learn more:');
    for (const link of links) {
      result.push(`[${link.linkTitle}](${link.link})`);
    }
  }

  const issues: Array<{details?: () => IssueDetailsWithResources}> = [
    ...issue.getGenericIssues(),
    ...issue.getLowContrastIssues(),
    ...issue.getElementAccessibilityIssues(),
    ...issue.getQuirksModeIssues(),
    // ...issue.getAttributionReportingIssues(), // Uncomment when AttributionReportingIssue has details()
  ];
  const affectedElement: Array<{uid?: string; data?: object}> = [];
  for (const singleIssue of issues) {
    if (!singleIssue.details) break;

    const details =
      singleIssue.details() as unknown as IssueDetailsWithResources;
    let uid;
    if (details.violatingNodeId && context) {
      uid = context.resolveCdpElementId(details.violatingNodeId);
    }
    if (details.nodeId && context) {
      uid = context.resolveCdpElementId(details.nodeId);
    }
    if (details.documentNodeId && context) {
      uid = context.resolveCdpElementId(details.documentNodeId);
    }

    // eslint-disable-next-line
    const data = structuredClone(details) as any;
    delete data.violatingNodeId;
    delete data.errorType;
    delete data.frameId;
    affectedElement.push({uid, data: data});
  }
  if (affectedElement.length) {
    result.push('### Affected resources');
  }
  result.push(
    ...affectedElement.map(item => {
      return `uid=${item.uid} data=${JSON.stringify(item.data)}`;
    }),
  );
  if (result.length === 0)
    return 'No details provided for the issue ' + issue.code();
  return result.join('\n');
}
