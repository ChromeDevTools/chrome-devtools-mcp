
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

import type {JiraMetadata} from '../metadata.js';

export interface JiraReporterOptions {
  enabled?: boolean;
}

function parseMetadata(test: TestCase): JiraMetadata {
  const annotation = test.annotations.find(item => item.type === 'jira');
  if (!annotation?.description) {
    return {};
  }

  try {
    const value = JSON.parse(annotation.description);
    if (typeof value !== 'object' || value === null) {
      return {};
    }
    const metadata: JiraMetadata = {};
    if ('issueType' in value && typeof value.issueType === 'string') {
      metadata.issueType = value.issueType;
    }
    if ('labels' in value && Array.isArray(value.labels)) {
      metadata.labels = value.labels.filter(
        (label): label is string => typeof label === 'string',
      );
    }
    if ('projectKey' in value && typeof value.projectKey === 'string') {
      metadata.projectKey = value.projectKey;
    }
    if (
      'summaryPrefix' in value &&
      typeof value.summaryPrefix === 'string'
    ) {
      metadata.summaryPrefix = value.summaryPrefix;
    }
    return metadata;
  } catch {
    return {};
  }
}

export class JiraReporter implements Reporter {
  private readonly enabled: boolean;

  constructor(options: JiraReporterOptions = {}) {
    this.enabled =
      options.enabled === true || process.env.JIRA_CREATE_BUGS === 'true';
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (!this.enabled || result.status !== 'failed') {
      return;
    }

    const baseUrl = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;
    const metadata = parseMetadata(test);
    const projectKey = metadata.projectKey ?? process.env.JIRA_PROJECT_KEY;
    if (!baseUrl || !email || !apiToken || !projectKey) {
      return;
    }

    const summary =
      `${metadata.summaryPrefix ? `${metadata.summaryPrefix}: ` : ''}` +
      `E2E failure: ${test.title}`;
    const error = result.errors.map(item => item.message ?? '').join('\n');
    const payload = {
      fields: {
        project: {key: projectKey},
        summary,
        description: [
          `Test: ${test.titlePath().join(' > ')}`,
          `File: ${test.location.file}:${test.location.line}`,
          '',
          'Failure:',
          error,
        ].join('\n'),
        issuetype: {name: metadata.issueType ?? 'Bug'},
        labels: metadata.labels ?? [],
      },
    };

    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/rest/api/2/issue`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString(
            'base64',
          )}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const body = await response.json();
      let detail = 'Jira rejected the issue';
      if (
        typeof body === 'object' &&
        body !== null &&
        'errorMessages' in body &&
        Array.isArray(body.errorMessages)
      ) {
        detail =
          body.errorMessages
            .filter((message): message is string => typeof message === 'string')
            .join('; ') || detail;
      }
      throw new Error(
        `Jira bug-ticket creation failed with HTTP ${response.status}: ` +
          detail,
      );
    }
  }

  onBegin(): void {}
  onEnd(_result: FullResult): Promise<void> | void {}
  onConfigure(_config: FullConfig): void {}
}
