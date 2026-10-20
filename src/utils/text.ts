/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools} from '../third_party/index.js';

const {StringUtilities} = DevTools.Platform;

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
