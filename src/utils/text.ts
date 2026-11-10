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

const URL_SIZE_LIMIT = 255;

// Matches a trailing 2-byte (%C0-%DF), 3-byte (%E0-%EF), or 4-byte (%F0-%FF)
// UTF-8 lead byte that has fewer continuation bytes (%80-%BF) than required.
const INCOMPLETE_UTF8_ESCAPE =
  /%(?:[cd][0-9a-f]|e[0-9a-f](?:%[89ab][0-9a-f])?|f[0-9a-f](?:%[89ab][0-9a-f]){0,2})$/i;

/**
 * Truncates a URL for tool output, such as a `data:` URL with a base64 payload.
 */
export function truncateUrl(url: string): string {
  if (url.length <= URL_SIZE_LIMIT) {
    return url;
  }
  // Cut at a grapheme boundary first so unescaped surrogate pairs stay whole.
  const kept = StringUtilities.truncateToCodeUnitLength(url, URL_SIZE_LIMIT)
    // Remove a trailing '%' or '%X' that was cut inside a single '%XX' byte.
    .replace(/%[0-9a-f]?$/i, '')
    // Remove a trailing multi-byte UTF-8 sequence that lost continuation bytes.
    .replace(INCOMPLETE_UTF8_ESCAPE, '');
  return `${kept}... <truncated>`;
}
