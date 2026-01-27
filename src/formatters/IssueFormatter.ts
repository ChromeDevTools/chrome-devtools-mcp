/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ISSUE_UTILS} from '../issue-descriptions.js';
import {logger} from '../logger.js';
import {DevTools} from '../third_party/index.js';

export interface IssueFormatterOptions {
  requestIdResolver?: (requestId: string) => number | undefined;
  elementIdResolver?: (backendNodeId: number) => string | undefined;
  id?: number;
}

export interface AffectedResource {
  uid?: string;
  data?: unknown;
  request?: string | number;
}

export class IssueFormatter {
  #issue: DevTools.AggregatedIssue;
  #options: IssueFormatterOptions;

  constructor(issue: DevTools.AggregatedIssue, options: IssueFormatterOptions) {
    this.#issue = issue;
    this.#options = options;
  }

  toString(): string {
    const title = this.#getTitle();
    const count = this.#issue.getAggregatedIssuesCount();
    const idPart =
      this.#options.id !== undefined ? `msgid=${this.#options.id} ` : '';
    return `${idPart}[issue] ${title} (count: ${count})`;
  }

  toStringDetailed(): string {
    const result: string[] = [];
    if (this.#options.id !== undefined) {
      result.push(`ID: ${this.#options.id}`);
    }

    const bodyParts: string[] = [];

    const description = this.#getDescription();
    let processedMarkdown = description?.trim();
    // Remove heading in order not to conflict with the whole console message response markdown
    if (processedMarkdown?.startsWith('# ')) {
      processedMarkdown = processedMarkdown.substring(2).trimStart();
    }
    if (processedMarkdown) {
      bodyParts.push(processedMarkdown);
    } else {
      bodyParts.push(this.#getTitle() ?? 'Unknown Issue');
    }

    const links = this.#issue.getDescription()?.links;
    if (links && links.length > 0) {
      bodyParts.push('Learn more:');
      for (const link of links) {
        bodyParts.push(`[${link.linkTitle}](${link.link})`);
      }
    }

    const affectedResources = this.#getAffectedResources();
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

  toJSON(): object {
    return {
      type: 'issue',
      title: this.#getTitle(),
      count: this.#issue.getAggregatedIssuesCount(),
      id: this.#options.id,
    };
  }

  toJSONDetailed(): object {
    return {
      id: this.#options.id,
      type: 'issue',
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

  // Helper to extract title
  #getTitle(): string | undefined {
    const markdownDescription = this.#issue.getDescription();
    const filename = markdownDescription?.file;
    if (!filename) {
      logger(`no description found for issue:` + this.#issue.code());
      return undefined;
    }

    // We already have the description logic in #getDescription, but title extraction is separate
    // We can reuse the logic or cache it.
    // Ideally we should process markdown once.

    const rawMarkdown = ISSUE_UTILS.getIssueDescription(filename);
    if (!rawMarkdown) {
      logger(`no markdown ${filename} found for issue:` + this.#issue.code());
      return undefined;
    }

    try {
      const processedMarkdown =
        DevTools.MarkdownIssueDescription.substitutePlaceholders(
          rawMarkdown,
          markdownDescription?.substitutions,
        );
      const markdownAst = DevTools.Marked.Marked.lexer(processedMarkdown);
      const title =
        DevTools.MarkdownIssueDescription.findTitleFromMarkdownAst(markdownAst);
      if (!title) {
        logger('cannot read issue title from ' + filename);
        return undefined;
      }
      return title;
    } catch {
      logger('error parsing markdown for issue ' + this.#issue.code());
      return undefined;
    }
  }

  #getDescription(): string | undefined {
    const markdownDescription = this.#issue.getDescription();
    const filename = markdownDescription?.file;
    if (!filename) {
      return undefined;
    }

    const rawMarkdown = ISSUE_UTILS.getIssueDescription(filename);
    if (!rawMarkdown) {
      return undefined;
    }

    try {
      return DevTools.MarkdownIssueDescription.substitutePlaceholders(
        rawMarkdown,
        markdownDescription?.substitutions,
      );
    } catch {
      return undefined;
    }
  }
}
