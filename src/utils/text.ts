/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {StringUtilities} from '../third_party/index.js';

const VALID_PLACEHOLDER_MATCH_PATTERN =
  /\{(PLACEHOLDER_[a-zA-Z][a-zA-Z0-9_]*)\}/g;

export function substitutePlaceholders(
  rawMarkdown: string,
  substitutions?: Map<string, string>,
): string {
  if (!substitutions) {
    return rawMarkdown;
  }

  return rawMarkdown.replace(
    VALID_PLACEHOLDER_MATCH_PATTERN,
    (_, placeholder) => {
      return substitutions.get(placeholder) ?? '';
    },
  );
}

/**
 * Truncates `text` to at most `maxLength` UTF-16 code units and appends
 * `ellipsis` when anything was cut off. The cut uses devtools-frontend's
 * `StringUtilities.truncateToCodeUnitLength`, which moves back to the last
 * grapheme boundary at or before the limit, so surrogate pairs and emoji
 * sequences stay whole and the result never contains a lone surrogate, which
 * `JSON.stringify` serializes as an escape like `\ud83d` that strict JSON
 * parsers (such as the one the Python MCP SDK uses) reject.
 *
 * With `includeEllipsisInLength`, the ellipsis counts toward `maxLength`.
 */
export function truncateText(
  text: string,
  maxLength: number,
  {
    ellipsis = '...',
    includeEllipsisInLength = false,
  }: {ellipsis?: string; includeEllipsisInLength?: boolean} = {},
): string {
  if (text.length <= maxLength) {
    return text;
  }
  const keep = includeEllipsisInLength
    ? Math.max(0, maxLength - ellipsis.length)
    : maxLength;
  return StringUtilities.truncateToCodeUnitLength(text, keep) + ellipsis;
}

const URL_SIZE_LIMIT = 255;
const URL_TRUNCATION_SUFFIX = '... <truncated>';

/**
 * Truncates a URL for tool output, such as a `data:` URL with a base64 payload.
 */
export function truncateUrl(url: string): string {
  const truncated = truncateText(url, URL_SIZE_LIMIT, {
    ellipsis: URL_TRUNCATION_SUFFIX,
  });
  if (truncated.length === url.length) {
    return url;
  }
  let prefix = truncated.slice(0, -URL_TRUNCATION_SUFFIX.length);
  const lastPercent = prefix.lastIndexOf('%');
  if (lastPercent !== -1 && prefix.length - lastPercent < 3) {
    prefix = prefix.slice(0, lastPercent);
  }
  return prefix + URL_TRUNCATION_SUFFIX;
}
