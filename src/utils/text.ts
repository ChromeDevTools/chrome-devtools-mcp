/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


export function substitutePlaceholders(
  rawMarkdown: string,
  substitutions?: Map<string, string>,
): string {
  if (!substitutions) {
    return rawMarkdown;
  }

  let result = rawMarkdown;
  for (const [key, value] of substitutions) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
