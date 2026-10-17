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
 * Returns the first `maxLength` UTF-16 code units of `text`, one fewer if the
 * cut would separate a surrogate pair. A lone surrogate is serialized by
 * `JSON.stringify` as an escape like `\ud83d` that strict JSON parsers, such as
 * the one the Python MCP SDK uses, reject.
 */
export function sliceWithoutSplittingSurrogates(
  text: string,
  maxLength: number,
): string {
  const end = Math.max(0, maxLength);
  if (end >= text.length) {
    return text;
  }
  const last = text.charCodeAt(end - 1);
  const next = text.charCodeAt(end);
  const splitsPair =
    last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  return text.slice(0, splitsPair ? end - 1 : end);
}
