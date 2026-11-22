
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface JiraMetadata {
  issueType?: string;
  labels?: string[];
  projectKey?: string;
  summaryPrefix?: string;
}

export function jiraMetadata(metadata: JiraMetadata) {
  return {
    type: 'jira',
    description: JSON.stringify(metadata),
  };
}
