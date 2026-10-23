import * as Marked from '../../third_party/marked/marked.js';
export interface PlaceholderToken extends Marked.Marked.Tokens.Generic {
    type: 'placeholder';
    raw: string;
    key: string;
}
export declare const VALID_PLACEHOLDER_MATCH_PATTERN: RegExp;
export declare function validateSubstitutions(rawMarkdown: string, substitutions?: Map<string, string>): void;
/**
 * Tokenizes markdown into a Marked AST while preserving `{PLACEHOLDER_*}` tokens
 * as `PlaceholderToken` AST nodes instead of substituting strings before lexing.
 */
export declare function tokenizeWithPlaceholders(markdown: string | Marked.Marked.Token[], substitutions?: Map<string, string>): Marked.Marked.Token[];
