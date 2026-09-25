/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools} from '../third_party/index.js';

export function substitutePlaceholders(
  rawMarkdown: string,
  substitutions?: Map<string, string>,
): string {
  if (!substitutions) {
    return rawMarkdown;
  }
  
  try {
    DevTools.MarkdownIssueDescription.createIssueDescriptionFromRawMarkdown(
      rawMarkdown,
      {
        file: '<unused>',
        links: [],
        substitutions,
      },
    );
  } catch {
    return rawMarkdown;
  }

  let result = rawMarkdown;
  for (const [key, value] of substitutions) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
