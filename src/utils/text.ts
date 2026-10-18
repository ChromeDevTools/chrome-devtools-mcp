/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
 * Truncates `text` to at most `maxLength` grapheme clusters and appends
 * `ellipsis` when anything was cut off. Cutting on grapheme boundaries keeps
 * surrogate pairs and emoji sequences whole, so the result never contains a
 * lone surrogate, which `JSON.stringify` serializes as an escape like `\ud83d`
 * that strict JSON parsers (such as the one the Python MCP SDK uses) reject.
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
  // A grapheme cluster is at least one UTF-16 code unit long.
  if (text.length <= maxLength) {
    return text;
  }
  const keep = includeEllipsisInLength
    ? Math.max(0, maxLength - ellipsis.length)
    : maxLength;
  const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  let count = 0;
  let cut = 0;
  for (const {index} of segmenter.segment(text)) {
    if (count === keep) {
      cut = index;
    }
    if (count === maxLength) {
      return text.slice(0, cut) + ellipsis;
    }
    count++;
  }
  return text;
}
