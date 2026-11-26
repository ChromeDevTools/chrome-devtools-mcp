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
const PERCENT_ESCAPE_PATTERN = /^%[0-9a-fA-F]{2}/;

function utf8ExpectedByteCount(leadByte: number): number {
  if (leadByte >= 0xc2 && leadByte <= 0xdf) {
    return 2;
  }
  if (leadByte >= 0xe0 && leadByte <= 0xef) {
    return 3;
  }
  if (leadByte >= 0xf0 && leadByte <= 0xf4) {
    return 4;
  }
  return 1;
}

/**
 * Truncates a URL for tool output, such as a `data:` URL with a base64 payload,
 * backing up before any split percent-escape or multi-byte UTF-8 escape so the
 * prefix still percent-decodes cleanly.
 */
export function truncateUrl(url: string): string {
  if (url.length <= URL_SIZE_LIMIT) {
    return url;
  }
  let prefix = truncateText(url, URL_SIZE_LIMIT, {ellipsis: ''});

  // Back up if the cut landed inside a %HH escape.
  const partialEscape = /%[0-9a-fA-F]?$/.exec(prefix);
  if (
    partialEscape &&
    PERCENT_ESCAPE_PATTERN.test(url.slice(partialEscape.index))
  ) {
    prefix = prefix.slice(0, partialEscape.index);
  }

  // Back up if the cut split a multi-byte UTF-8 percent-encoded code point.
  let pos = prefix.length;
  let trailingBytes = 0;
  while (pos >= 3 && trailingBytes < 3) {
    const escape = prefix.slice(pos - 3, pos);
    if (!PERCENT_ESCAPE_PATTERN.test(escape)) {
      break;
    }
    const byte = Number.parseInt(escape.slice(1), 16);
    trailingBytes++;
    pos -= 3;
    if ((byte & 0xc0) === 0x80) {
      continue;
    }
    const expectedBytes = utf8ExpectedByteCount(byte);
    if (trailingBytes < expectedBytes) {
      const fullEscape = url.slice(pos, pos + expectedBytes * 3);
      if (fullEscape.length === expectedBytes * 3) {
        try {
          decodeURIComponent(fullEscape);
          prefix = prefix.slice(0, pos);
        } catch {
          // Not a valid UTF-8 sequence in the original URL; keep as-is.
        }
      }
    }
    break;
  }

  return prefix + URL_TRUNCATION_SUFFIX;
}
