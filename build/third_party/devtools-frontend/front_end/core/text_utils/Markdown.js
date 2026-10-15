// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Marked from '../../third_party/marked/marked.js';
export const VALID_PLACEHOLDER_MATCH_PATTERN = /\{(PLACEHOLDER_[a-zA-Z][a-zA-Z0-9_]*)\}/g;
const VALID_PLACEHOLDER_NAME_PATTERN = /^PLACEHOLDER_[a-zA-Z][a-zA-Z0-9_]*$/;
const placeholderExtension = {
    name: 'placeholder',
    level: 'inline',
    start(src) {
        return src.match(/\{PLACEHOLDER_[a-zA-Z][a-zA-Z0-9_]*\}/)?.index;
    },
    tokenizer(src) {
        const match = /^\{(PLACEHOLDER_[a-zA-Z][a-zA-Z0-9_]*)\}/.exec(src);
        if (match) {
            return {
                type: 'placeholder',
                raw: match[0],
                key: match[1],
            };
        }
        return undefined;
    },
};
export function validateSubstitutions(rawMarkdown, substitutions) {
    if (!substitutions) {
        return;
    }
    const unusedPlaceholders = new Set(substitutions.keys());
    for (const key of unusedPlaceholders) {
        if (!VALID_PLACEHOLDER_NAME_PATTERN.test(key)) {
            throw new Error(`Invalid placeholder '${key}' provided in the substitutions map.`);
        }
    }
    for (const [, placeholder] of rawMarkdown.matchAll(VALID_PLACEHOLDER_MATCH_PATTERN)) {
        if (!substitutions.has(placeholder)) {
            throw new Error(`No replacement provided for placeholder '${placeholder}'.`);
        }
        unusedPlaceholders.delete(placeholder);
    }
    if (unusedPlaceholders.size > 0) {
        throw new Error(`Unused replacements provided: ${[...unusedPlaceholders]}`);
    }
}
/**
 * Tokenizes markdown into a Marked AST while preserving `{PLACEHOLDER_*}` tokens
 * as `PlaceholderToken` AST nodes instead of substituting strings before lexing.
 */
export function tokenizeWithPlaceholders(markdown, substitutions) {
    const rawMarkdown = typeof markdown === 'string' ? markdown : markdown.map(token => token.raw).join('');
    validateSubstitutions(rawMarkdown, substitutions);
    if (typeof markdown !== 'string' && !rawMarkdown.includes('{PLACEHOLDER_')) {
        return markdown;
    }
    const markedInstance = new Marked.Marked.Marked({
        extensions: [placeholderExtension],
    });
    return markedInstance.lexer(rawMarkdown);
}
//# sourceMappingURL=Markdown.js.map