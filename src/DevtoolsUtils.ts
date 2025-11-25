/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Issue,
  type AggregatedIssue,
  type IssuesManagerEventTypes,
  MarkdownIssueDescription,
  Marked,
  Common,
  I18n,
} from '../node_modules/chrome-devtools-frontend/mcp/mcp.js';

import {ISSUE_UTILS} from './issue-descriptions.js';
import {logger} from './logger.js';

export function extractUrlLikeFromDevToolsTitle(
  title: string,
): string | undefined {
  const match = title.match(new RegExp(`DevTools - (.*)`));
  return match?.[1] ?? undefined;
}

export function urlsEqual(url1: string, url2: string): boolean {
  const normalizedUrl1 = normalizeUrl(url1);
  const normalizedUrl2 = normalizeUrl(url2);
  return normalizedUrl1 === normalizedUrl2;
}

/**
 * For the sake of the MCP server, when we determine if two URLs are equal we
 * remove some parts:
 *
 * 1. We do not care about the protocol.
 * 2. We do not care about trailing slashes.
 * 3. We do not care about "www".
 * 4. We ignore the hash parts.
 *
 * For example, if the user types "record a trace on foo.com", we would want to
 * match a tab in the connected Chrome instance that is showing "www.foo.com/"
 */
function normalizeUrl(url: string): string {
  let result = url.trim();

  // Remove protocols
  if (result.startsWith('https://')) {
    result = result.slice(8);
  } else if (result.startsWith('http://')) {
    result = result.slice(7);
  }

  // Remove 'www.'. This ensures that we find the right URL regardless of if the user adds `www` or not.
  if (result.startsWith('www.')) {
    result = result.slice(4);
  }

  // We use target URLs to locate DevTools but those often do
  // no include hash.
  const hashIdx = result.lastIndexOf('#');
  if (hashIdx !== -1) {
    result = result.slice(0, hashIdx);
  }

  // Remove trailing slash
  if (result.endsWith('/')) {
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * A mock implementation of an issues manager that only implements the methods
 * that are actually used by the IssuesAggregator
 */
export class FakeIssuesManager extends Common.ObjectWrapper
  .ObjectWrapper<IssuesManagerEventTypes> {
  issues(): Issue[] {
    return [];
  }
}

export function mapIssueToMessageObject(issue: AggregatedIssue) {
  const count = issue.getAggregatedIssuesCount();
  const markdownDescription = issue.getDescription();
  const filename = markdownDescription?.file;
  if (!markdownDescription) {
    logger(`no description found for issue:` + issue.code);
    return null;
  }
  const rawMarkdown = filename
    ? ISSUE_UTILS.getIssueDescription(filename)
    : null;
  if (!rawMarkdown) {
    logger(`no markdown ${filename} found for issue:` + issue.code);
    return null;
  }
  let processedMarkdown: string;
  let title: string | null;

  try {
    processedMarkdown = MarkdownIssueDescription.substitutePlaceholders(
      rawMarkdown,
      markdownDescription.substitutions,
    );
    const markdownAst = Marked.Marked.lexer(processedMarkdown);
    title = MarkdownIssueDescription.findTitleFromMarkdownAst(markdownAst);
  } catch {
    logger('error parsing markdown for issue ' + issue.code());
    return null;
  }
  if (!title) {
    logger('cannot read issue title from ' + filename);
    return null;
  }
  return {
    type: 'issue',
    item: issue,
    message: title,
    count,
    description: processedMarkdown,
  };
}

I18n.DevToolsLocale.DevToolsLocale.instance({
  create: true,
  data: {
    navigatorLanguage: 'en-US',
    settingLanguage: 'en-US',
    lookupClosestDevToolsLocale: l => l,
  },
});
I18n.i18n.registerLocaleDataForTest('en-US', {});
