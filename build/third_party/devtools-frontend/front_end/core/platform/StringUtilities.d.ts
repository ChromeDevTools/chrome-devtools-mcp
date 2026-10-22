import type { Brand } from './Brand.js';
export declare const escapeCharacters: (inputString: string, charsToEscape: string) => string;
/**
 * Escapes formatting and surrogate characters in the string into literal Unicode escape sequences (e.g. \u200B).
 * Use this when displaying strings to developers for inspection (e.g. in the Console or Object properties)
 * where you want hidden or invisible characters to be explicitly visible as literal text.
 */
export declare const escapeUnicodeAsText: (content: string) => string;
/**
 * Escapes dangerous formatting and surrogate characters (like bidi override characters) to prevent
 * security and layout issues, but leaves safe, layout-critical zero-width formatting characters
 * (Zero Width Space \u200B, Zero Width Non-Joiner \u200C, and Zero Width Joiner \u200D) untouched.
 * Use this when rendering user-controlled content inside templates or HTML markup where you want formatting
 * characters to function normally for word wrapping or rendering layout, rather than showing as literal text.
 */
export declare const safeEscapeUnicode: (content: string) => string;
export declare const formatAsJSLiteral: (content: string) => string;
/**
 * This implements a subset of the sprintf() function described in the Single UNIX
 * Specification. It supports the %s, %f, %d, and %% formatting specifiers, and
 * understands the %m$d notation to select the m-th parameter for this substitution,
 * as well as the optional precision for %s, %f, and %d.
 *
 * @param fmt format string.
 * @param args parameters to the format string.
 * @returns the formatted output string.
 */
export declare const sprintf: (fmt: string, ...args: unknown[]) => string;
export declare const toBase64: (inputString: string) => string;
export declare const findIndexesOfSubString: (inputString: string, searchString: string) => number[];
export declare const findLineEndingIndexes: (inputString: string) => number[];
export declare const isWhitespace: (inputString: string) => boolean;
export declare const trimURL: (url: string, baseURLDomain?: string) => string;
export declare const collapseWhitespace: (inputString: string) => string;
export declare const reverse: (inputString: string) => string;
export declare const replaceControlCharacters: (inputString: string) => string;
export declare const countWtf8Bytes: (inputString: string) => number;
export declare const stripLineBreaks: (inputStr: string) => string;
/**
 * Tests if the `inputStr` is following the extended Kebab Case naming convention,
 * where words are separated with either a dash (`-`) or a dot (`.`), and all
 * characters must be lower-case alphanumeric.
 *
 * For example, it will yield `true` for `'my.amazing-string.literal'`, but `false`
 * for `'Another.AmazingLiteral'` or '`another_amazing_literal'`.
 *
 * @param inputStr the input string to test.
 * @returns `true` if the `inputStr` follows the extended Kebab Case convention.
 */
export declare const isExtendedKebabCase: (inputStr: string) => boolean;
export declare const toTitleCase: (inputStr: string) => string;
export declare const removeURLFragment: (inputStr: string) => string;
export declare const regexSpecialCharacters: () => string;
export declare const filterRegex: (query: string) => RegExp;
export declare const createSearchRegex: (query: string, caseSensitive: boolean, isRegex: boolean, matchWholeWord?: boolean) => RegExp;
export declare const caseInsensetiveComparator: (a: string, b: string) => number;
export declare const hashCode: (string?: string) => number;
export declare const compare: (a: string, b: string) => number;
/** Returns a string that has no more than maxLength characters. Actual graphemes are used, not bytes. */
export declare const trimMiddle: (str: string, maxLength: number) => string;
/** Returns a string that has no more than maxLength characters. Actual graphemes are used, not bytes. */
export declare const trimEndWithMaxLength: (str: string, maxLength: number) => string;
/**
 * Truncates a string to not exceed a maximum number of UTF-16 code units (as measured by JS `string.length`).
 *
 * Unlike simple character limiters, this helper is grapheme-aware and uses `Intl.Segmenter` to prevent
 * slicing inside surrogate pairs (e.g. Plane 1+ characters or emojis like '𠜎' / '🥳') or combining characters
 * (e.g. 'é' represented in NFD as 'e' + combining acute accent). If the limit falls in the middle of a
 * grapheme cluster, the function backs off to drop the entire cluster, ensuring the result is always a valid
 * Unicode string.
 *
 * @param str The string to truncate.
 * @param maxCodeUnits The maximum allowed code unit length (must be >= 0).
 * @returns The truncated string, guaranteed to be <= maxCodeUnits in length and grapheme-safe.
 */
export declare const truncateToCodeUnitLength: (str: string, maxCodeUnits: number) => string;
export declare const escapeForRegExp: (str: string) => string;
export declare const escapeForURLPattern: (text: string) => string;
export declare const naturalOrderComparator: (a: string, b: string) => number;
export declare const base64ToSize: (content: string | null) => number;
export declare const SINGLE_QUOTE = "'";
export declare const DOUBLE_QUOTE = "\"";
export declare const findUnclosedCssQuote: (str: string) => string;
export declare const countUnmatchedLeftParentheses: (str: string) => number;
export declare const createPlainTextSearchRegex: (query: string, flags?: string) => RegExp;
export type LowerCaseString = Brand<string, 'lowerCaseStringTag'>;
export declare const toLowerCaseString: (input: string) => LowerCaseString;
export declare const toKebabCase: (input: string) => Lowercase<string>;
export declare function toKebabCaseKeys<T>(settingValue: Record<string, T>): Record<string, T>;
/**
 * Converts a given string to snake_case.
 * This function handles camelCase, PascalCase, and acronyms, including transitions between letters and numbers.
 * It uses Unicode-aware regular expressions (`\p{L}`, `\p{N}`, `\p{Lu}`, `\p{Ll}` with the `u` flag)
 * to correctly process letters and numbers from various languages.
 *
 * @param text The input string to convert to snake_case.
 * @returns The snake_case version of the input string.
 */
export declare function toSnakeCase(text: string): string;
/** Replaces the last occurrence of parameter `search` with parameter `replacement` in `input` **/
export declare const replaceLast: (input: string, search: string, replacement: string) => string;
export declare const stringifyWithPrecision: (s: number, precision?: number) => string;
/**
 * Somewhat efficiently concatenates 2 base64 encoded strings.
 */
export declare const concatBase64: (lhs: string, rhs: string) => string;
/**
 * Formats and escapes `value` so it can be safely written as a single CSV cell.
 *
 * This handles two separate layers of escaping:
 * 1. Spreadsheet formula escaping (CWE-1236 & viewer fidelity):
 *    RFC 4180 double-quoting (`"=1+1"` or `"- Loading..."`) only groups text
 *    into a single CSV column; spreadsheet apps strip the outer `"` and still
 *    evaluate cells starting with `=`, `+`, `-`, or `@` as formulas (often
 *    resulting in `#NAME?` errors or unintended formula execution). Prefixing
 *    the value with a single quote (`'`) tells spreadsheet apps to treat the
 *    cell as literal text (and they hide the leading `'` when displaying it).
 *    - Example without commas: `=SUM(A1:A2)` -> `'=SUM(A1:A2)`
 * 2. RFC 4180 structural CSV quoting:
 *    If the cell also contains commas (`,`), double quotes (`"`), or newlines,
 *    it is wrapped in `"..."` (with inner `"` doubled to `""`) so CSV parsers
 *    do not split the cell across columns or rows.
 *    - Example with commas: `=SUM(1,2)` -> `"'=SUM(1,2)"`
 *    - Example starting with a literal quote: `"=SUM(1,2)"` -> `"""=SUM(1,2)"""`
 *      (not treated as a formula since the first character is `"`, not `=`).
 */
export declare const escapeCsvCell: (value: string) => string;
