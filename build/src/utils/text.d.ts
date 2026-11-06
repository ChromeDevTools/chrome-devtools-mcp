/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare function substitutePlaceholders(rawMarkdown: string, substitutions?: Map<string, string>): string;
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
export declare function truncateText(text: string, maxLength: number, { ellipsis, includeEllipsisInLength, }?: {
    ellipsis?: string;
    includeEllipsisInLength?: boolean;
}): string;
/**
 * Truncates a URL for tool output, such as a `data:` URL with a base64 payload.
 */
export declare function truncateUrl(url: string): string;
