/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ISSUE_UTILS} from '../devtools/issueDescriptions.js';
import {DevTools} from '../third_party/index.js';
import {logger} from '../utils/logger.js';
import {substitutePlaceholders} from '../utils/text.js';

export interface IssueFormatterOptions {
  requestIdResolver?: (requestId: string) => number | undefined;
  elementIdResolver?: (backendNodeId: number) => string | undefined;
  id: number;
}

export interface AffectedResource {
  uid?: string;
  data?: unknown;
  request?: string | number;
}

interface IssueConcise {
  type: 'issue';
  title?: string;
  count: number;
  id: number;
}

interface IssueDetailed extends IssueConcise {
  description?: string;
  links?: Array<{
    link: string;
    linkTitle: string;
  }>;
  affectedResources: AffectedResource[];
}

const parsedDescriptionCache = new WeakMap<
  DevTools.AggregatedIssue,
  {title?: string; description?: string}
>();

export class IssueFormatter {
  #issue: DevTools.AggregatedIssue;
  #options: IssueFormatterOptions;

  constructor(issue: DevTools.AggregatedIssue, options: IssueFormatterOptions) {
    this.#issue = issue;
    this.#options = options;
  }

  toString(): string {
    return convertIssueConciseToString(this.toJSON());
  }

  toStringDetailed(): string {
    return convertIssueDetailedToString(this.toJSONDetailed());
  }

  toJSON(): IssueConcise {
    return {
      type: 'issue',
      title: this.#getTitle(),
      count: this.#issue.getAggregatedIssuesCount(),
      id: this.#options.id,
    };
  }

  toJSONDetailed(): IssueDetailed {
    return {
      id: this.#options.id,
      type: 'issue',
      count: this.#issue.getAggregatedIssuesCount(),
      title: this.#getTitle(),
      description: this.#getDescription(),
      links: this.#issue.getDescription()?.links,
      affectedResources: this.#getAffectedResources(),
    };
  }

  #getAffectedResources(): AffectedResource[] {
    const issues = this.#issue.getAllIssues();
    const affectedResources: Array<{
      uid?: string;
      data?: object;
      request?: string | number;
    }> = [];
    for (const singleIssue of issues) {
      const details = singleIssue.details();
      if (!details) {
        continue;
      }

      // We send the remaining details as untyped JSON because the DevTools
      // frontend code is currently not re-usable.
      const data = structuredClone(details) as unknown as Record<
        string,
        unknown
      >;

      let uid;
      let request: number | string | undefined;
      if (
        'violatingNodeId' in details &&
        details.violatingNodeId &&
        this.#options.elementIdResolver
      ) {
        uid = this.#options.elementIdResolver(details.violatingNodeId);
        delete data.violatingNodeId;
      }
      if (
        'nodeId' in details &&
        details.nodeId &&
        this.#options.elementIdResolver
      ) {
        uid = this.#options.elementIdResolver(details.nodeId);
        delete data.nodeId;
      }
      if (
        'documentNodeId' in details &&
        details.documentNodeId &&
        this.#options.elementIdResolver
      ) {
        uid = this.#options.elementIdResolver(details.documentNodeId);
        delete data.documentNodeId;
      }

      if ('request' in details && details.request) {
        request = details.request.url;
        if (details.request.requestId && this.#options.requestIdResolver) {
          const resolvedId = this.#options.requestIdResolver(
            details.request.requestId,
          );
          if (resolvedId) {
            request = resolvedId;
            const requestData = data.request as Record<string, unknown>;
            delete requestData.requestId;
          }
        }
      }

      // These fields has no use for the MCP client (redundant or irrelevant).
      delete data.errorType;
      delete data.frameId;
      affectedResources.push({
        uid,
        data: data,
        request,
      });
    }
    return affectedResources;
  }

  isValid(): boolean {
    return this.#getTitle() !== undefined;
  }

  #getParsedDescription(): {title?: string; description?: string} {
    if (parsedDescriptionCache.has(this.#issue)) {
      return parsedDescriptionCache.get(this.#issue)!;
    }

    const markdownDescription = this.#issue.getDescription();
    const filename = markdownDescription?.file;
    if (!filename) {
      logger?.(`no description found for issue:` + this.#issue.code());
      const empty = {};
      parsedDescriptionCache.set(this.#issue, empty);
      return empty;
    }

    const rawMarkdown = ISSUE_UTILS.getIssueDescription(filename);
    if (!rawMarkdown) {
      logger?.(`no markdown ${filename} found for issue:` + this.#issue.code());
      const empty = {};
      parsedDescriptionCache.set(this.#issue, empty);
      return empty;
    }

    try {
      const description =
        DevTools.MarkdownIssueDescription.createIssueDescriptionFromRawMarkdown(
          rawMarkdown,
          {
            file: filename,
            links: markdownDescription?.links || [],
            substitutions: markdownDescription?.substitutions,
          },
        );

      const parsed = {
        title: description.title,
        description: substitutePlaceholders(
          rawMarkdown,
          markdownDescription?.substitutions,
        ),
      };
      parsedDescriptionCache.set(this.#issue, parsed);
      return parsed;
    } catch {
      logger?.('error parsing markdown for issue ' + this.#issue.code());
      const empty = {};
      parsedDescriptionCache.set(this.#issue, empty);
      return empty;
    }
  }

  // Helper to extract title
  #getTitle(): string | undefined {
    return this.#getParsedDescription().title;
  }

  #getDescription(): string | undefined {
    return this.#getParsedDescription().description;
  }
}

function convertIssueConciseToString(issue: IssueConcise): string {
  return `msgid=${issue.id} [issue] ${issue.title ?? 'Unknown Issue'} (count: ${issue.count})`;
}

function convertIssueDetailedToString(issue: IssueDetailed): string {
  const result: string[] = [];
  result.push(`ID: ${issue.id}`);

  const bodyParts: string[] = [];

  const description = issue.description;
  let processedMarkdown = description?.trim();
  // Remove heading in order not to conflict with the whole console message response markdown
  if (processedMarkdown?.startsWith('# ')) {
    processedMarkdown = processedMarkdown.substring(2).trimStart();
  }
  if (processedMarkdown) {
    bodyParts.push(processedMarkdown);
  } else {
    bodyParts.push(issue.title ?? 'Unknown Issue');
  }

  const links = issue.links;
  if (links && links.length > 0) {
    bodyParts.push('Learn more:');
    for (const link of links) {
      bodyParts.push(`[${link.linkTitle}](${link.link})`);
    }
  }

  const affectedResources = issue.affectedResources;
  if (affectedResources.length) {
    bodyParts.push('### Affected resources');
    bodyParts.push(
      ...affectedResources.map(item => {
        const details = [];
        if (item.uid) {
          details.push(`uid=${item.uid}`);
        }
        if (item.request) {
          details.push(
            (typeof item.request === 'number' ? `reqid=` : 'url=') +
              item.request,
          );
        }
        if (item.data) {
          details.push(`data=${JSON.stringify(item.data)}`);
        }
        return details.join(' ');
      }),
    );
  }

  result.push(`Message: issue> ${bodyParts.join('\n')}`);

  return result.join('\n');
}
