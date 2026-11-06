// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
let graphemeSegmenter = null;
export const escapeCharacters = (inputString, charsToEscape) => {
    let foundChar = false;
    for (let i = 0; i < charsToEscape.length; ++i) {
        if (inputString.indexOf(charsToEscape.charAt(i)) !== -1) {
            foundChar = true;
            break;
        }
    }
    if (!foundChar) {
        return String(inputString);
    }
    let result = '';
    for (let i = 0; i < inputString.length; ++i) {
        if (charsToEscape.indexOf(inputString.charAt(i)) !== -1) {
            result += '\\';
        }
        result += inputString.charAt(i);
    }
    return result;
};
const toHexadecimal = (charCode, padToLength) => {
    return charCode.toString(16).toUpperCase().padStart(padToLength, '0');
};
// Remember to update the third group in the regexps patternsToEscape and
// patternsToEscapePlusSingleQuote when adding new entries in this map.
const escapedReplacements = new Map([
    ['\b', '\\b'],
    ['\f', '\\f'],
    ['\n', '\\n'],
    ['\r', '\\r'],
    ['\t', '\\t'],
    ['\v', '\\v'],
    ['\'', '\\\''],
    ['\\', '\\\\'],
    ['<!--', '\\x3C!--'],
    ['<script', '\\x3Cscript'],
    ['</script', '\\x3C/script'],
]);
const UNICODE_ESCAPE_SOURCE = '[\\p{Format}\\p{Surrogate}]';
const UNICODE_ESCAPE_REGEX = new RegExp(UNICODE_ESCAPE_SOURCE, 'u');
const UNICODE_ESCAPE_GLOBAL_REGEX = new RegExp(UNICODE_ESCAPE_SOURCE, 'gu');
const UNICODE_ESCAPE_EXCEPT_ZWSP_SOURCE = '(?![\\u200B\\u200C\\u200D])[\\p{Format}]|\\p{Surrogate}';
const UNICODE_ESCAPE_EXCEPT_ZWSP_REGEX = new RegExp(UNICODE_ESCAPE_EXCEPT_ZWSP_SOURCE, 'u');
const UNICODE_ESCAPE_EXCEPT_ZWSP_GLOBAL_REGEX = new RegExp(UNICODE_ESCAPE_EXCEPT_ZWSP_SOURCE, 'gu');
/**
 * Escapes formatting and surrogate characters in the string into literal Unicode escape sequences (e.g. \u200B).
 * Use this when displaying strings to developers for inspection (e.g. in the Console or Object properties)
 * where you want hidden or invisible characters to be explicitly visible as literal text.
 */
export const escapeUnicodeAsText = (content) => {
    if (!UNICODE_ESCAPE_REGEX.test(content)) {
        return content;
    }
    return content.replaceAll(UNICODE_ESCAPE_GLOBAL_REGEX, match => {
        return match.split('').map(char => '\\u' + toHexadecimal(char.charCodeAt(0), 4)).join('');
    });
};
/**
 * Escapes dangerous formatting and surrogate characters (like bidi override characters) to prevent
 * security and layout issues, but leaves safe, layout-critical zero-width formatting characters
 * (Zero Width Space \u200B, Zero Width Non-Joiner \u200C, and Zero Width Joiner \u200D) untouched.
 * Use this when rendering user-controlled content inside templates or HTML markup where you want formatting
 * characters to function normally for word wrapping or rendering layout, rather than showing as literal text.
 */
export const safeEscapeUnicode = (content) => {
    if (!UNICODE_ESCAPE_EXCEPT_ZWSP_REGEX.test(content)) {
        return content;
    }
    return content.replaceAll(UNICODE_ESCAPE_EXCEPT_ZWSP_GLOBAL_REGEX, match => {
        return match.split('').map(char => '\\u' + toHexadecimal(char.charCodeAt(0), 4)).join('');
    });
};
export const formatAsJSLiteral = (content) => {
    const patternsToEscape = /(\\|<(?:!--|\/?script))|(\p{Control}|\p{Format})|(\p{Surrogate})/giu;
    const patternsToEscapePlusSingleQuote = /(\\|'|<(?:!--|\/?script))|(\p{Control}|\p{Format})|(\p{Surrogate})/giu;
    const escapePattern = (match, pattern, controlChar, loneSurrogate) => {
        if (controlChar) {
            if (escapedReplacements.has(controlChar)) {
                // @ts-expect-error https://github.com/microsoft/TypeScript/issues/13086
                return escapedReplacements.get(controlChar);
            }
            return controlChar.split('')
                .map(char => {
                const charCode = char.charCodeAt(0);
                if (controlChar.length === 1 && charCode <= 0xFF) {
                    return '\\x' + toHexadecimal(charCode, 2);
                }
                return '\\u' + toHexadecimal(charCode, 4);
            })
                .join('');
        }
        if (loneSurrogate) {
            const fourDigitHex = toHexadecimal(loneSurrogate.charCodeAt(0), 4);
            return '\\u' + fourDigitHex;
        }
        if (pattern) {
            if (pattern.startsWith('<')) {
                return '\\x3C' + pattern.slice(1);
            }
            return escapedReplacements.get(pattern) || '';
        }
        return match;
    };
    let escapedContent = '';
    let quote = '';
    if (!content.includes('\'')) {
        quote = '\'';
        escapedContent = content.replaceAll(patternsToEscape, escapePattern);
    }
    else if (!content.includes('"')) {
        quote = '"';
        escapedContent = content.replaceAll(patternsToEscape, escapePattern);
    }
    else if (!content.includes('`') && !content.includes('${')) {
        quote = '`';
        escapedContent = content.replaceAll(patternsToEscape, escapePattern);
    }
    else {
        quote = '\'';
        escapedContent = content.replaceAll(patternsToEscapePlusSingleQuote, escapePattern);
    }
    return `${quote}${escapedContent}${quote}`;
};
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
export const sprintf = (fmt, ...args) => {
    let argIndex = 0;
    const RE = /%(?:(\d+)\$)?(?:\.(\d*))?([%dfs])/g;
    return fmt.replaceAll(RE, (_, index, precision, specifier) => {
        if (specifier === '%') {
            return '%';
        }
        if (index !== undefined) {
            argIndex = parseInt(index, 10) - 1;
            if (argIndex < 0) {
                throw new RangeError(`Invalid parameter index ${argIndex + 1}`);
            }
        }
        if (argIndex >= args.length) {
            throw new RangeError(`Expected at least ${argIndex + 1} format parameters, but only ${args.length} where given.`);
        }
        if (specifier === 's') {
            const argValue = String(args[argIndex++]);
            if (precision !== undefined) {
                return argValue.substring(0, Number(precision));
            }
            return argValue;
        }
        let argValue = Number(args[argIndex++]);
        if (isNaN(argValue)) {
            argValue = 0;
        }
        if (specifier === 'd') {
            return String(Math.floor(argValue)).padStart(Number(precision), '0');
        }
        if (precision !== undefined) {
            return argValue.toFixed(Number(precision));
        }
        return String(argValue);
    });
};
export const toBase64 = (inputString) => {
    /* note to the reader: we can't use btoa here because we need to
     * support Unicode correctly. See the test cases for this function and
     * also
     * https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
     */
    function encodeBits(b) {
        return b < 26 ? b + 65 : b < 52 ? b + 71 : b < 62 ? b - 4 : b === 62 ? 43 : b === 63 ? 47 : 65;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(inputString.toString());
    const n = data.length;
    let encoded = '';
    if (n === 0) {
        return encoded;
    }
    let shift;
    let v = 0;
    for (let i = 0; i < n; i++) {
        shift = i % 3;
        v |= data[i] << (16 >>> shift & 24);
        if (shift === 2) {
            encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), encodeBits(v >>> 6 & 63), encodeBits(v & 63));
            v = 0;
        }
    }
    if (shift === 0) {
        encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), 61, 61);
    }
    else if (shift === 1) {
        encoded += String.fromCharCode(encodeBits(v >>> 18 & 63), encodeBits(v >>> 12 & 63), encodeBits(v >>> 6 & 63), 61);
    }
    return encoded;
};
export const findIndexesOfSubString = (inputString, searchString) => {
    const matches = [];
    let i = inputString.indexOf(searchString);
    while (i !== -1) {
        matches.push(i);
        i = inputString.indexOf(searchString, i + searchString.length);
    }
    return matches;
};
export const findLineEndingIndexes = (inputString) => {
    const endings = findIndexesOfSubString(inputString, '\n');
    endings.push(inputString.length);
    return endings;
};
export const isWhitespace = (inputString) => {
    return /^\s*$/.test(inputString);
};
export const trimURL = (url, baseURLDomain) => {
    let result = url.replace(/^(https|http|file):\/\//i, '');
    if (baseURLDomain) {
        if (result.toLowerCase().startsWith(baseURLDomain.toLowerCase())) {
            result = result.substr(baseURLDomain.length);
        }
    }
    return result;
};
export const collapseWhitespace = (inputString) => {
    return inputString.replace(/[\s\xA0]+/g, ' ');
};
export const reverse = (inputString) => {
    return inputString.split('').reverse().join('');
};
export const replaceControlCharacters = (inputString) => {
    // Replace C0 and C1 control character sets with replacement character.
    // Do not replace '\t', \n' and '\r'.
    return inputString.replace(/[\0-\x08\x0B\f\x0E-\x1F\x80-\x9F]/g, '\uFFFD');
};
export const countWtf8Bytes = (inputString) => {
    let count = 0;
    for (let i = 0; i < inputString.length; i++) {
        const c = inputString.charCodeAt(i);
        if (c <= 0x7F) {
            count++;
        }
        else if (c <= 0x07FF) {
            count += 2;
        }
        else if (c < 0xD800 || 0xDFFF < c) {
            count += 3;
        }
        else {
            if (c <= 0xDBFF && i + 1 < inputString.length) {
                // The current character is a leading surrogate, and there is a
                // next character.
                const next = inputString.charCodeAt(i + 1);
                if (0xDC00 <= next && next <= 0xDFFF) {
                    // The next character is a trailing surrogate, meaning this
                    // is a surrogate pair.
                    count += 4;
                    i++;
                    continue;
                }
            }
            count += 3;
        }
    }
    return count;
};
export const stripLineBreaks = (inputStr) => {
    return inputStr.replace(/(\r)?\n/g, '');
};
const EXTENDED_KEBAB_CASE_REGEXP = /^([a-z0-9]+(?:-[a-z0-9]+)*\.)*[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
export const isExtendedKebabCase = (inputStr) => {
    return EXTENDED_KEBAB_CASE_REGEXP.test(inputStr);
};
export const toTitleCase = (inputStr) => {
    return inputStr.substring(0, 1).toUpperCase() + inputStr.substring(1);
};
export const removeURLFragment = (inputStr) => {
    const url = new URL(inputStr);
    url.hash = '';
    return url.toString();
};
const SPECIAL_REGEX_CHARACTERS = '^[]{}()\\.^$*+?|-,';
const SPECIAL_URL_PATTERN_CHARACTERS = '?+*(){}\\:';
export const regexSpecialCharacters = function () {
    return SPECIAL_REGEX_CHARACTERS;
};
export const filterRegex = function (query) {
    let regexString = '^(?:.*\\0)?'; // Start from beginning or after a \0
    for (let i = 0; i < query.length; ++i) {
        let c = query.charAt(i);
        if (SPECIAL_REGEX_CHARACTERS.indexOf(c) !== -1) {
            c = '\\' + c;
        }
        regexString += '[^\\0' + c + ']*' + c;
    }
    return new RegExp(regexString, 'i');
};
export const createSearchRegex = function (query, caseSensitive, isRegex, matchWholeWord = false) {
    const regexFlags = caseSensitive ? 'g' : 'gi';
    let regexObject;
    if (isRegex) {
        try {
            regexObject = new RegExp(query, regexFlags);
        }
        catch {
            // Silent catch.
        }
    }
    if (!regexObject) {
        regexObject = createPlainTextSearchRegex(query, regexFlags);
    }
    if (matchWholeWord && regexObject) {
        regexObject = new RegExp(`\\b${regexObject.source}\\b`, regexFlags);
    }
    return regexObject;
};
export const caseInsensetiveComparator = function (a, b) {
    a = a.toUpperCase();
    b = b.toUpperCase();
    if (a === b) {
        return 0;
    }
    return a > b ? 1 : -1;
};
export const hashCode = function (string) {
    if (!string) {
        return 0;
    }
    // Hash algorithm for substrings is described in "Über die Komplexität der Multiplikation in
    // eingeschränkten Branchingprogrammmodellen" by Woelfe.
    // http://opendatastructures.org/versions/edition-0.1d/ods-java/node33.html#SECTION00832000000000000000
    const p = ((1 << 30) * 4 - 5); // prime: 2^32 - 5
    const z = 0x5033d967; // 32 bits from random.org
    const z2 = 0x59d2f15d; // random odd 32 bit number
    let s = 0;
    let zi = 1;
    for (let i = 0; i < string.length; i++) {
        const xi = string.charCodeAt(i) * z2;
        s = (s + zi * xi) % p;
        zi = (zi * z) % p;
    }
    s = (s + zi * (p - 1)) % p;
    return Math.abs(s | 0);
};
export const compare = (a, b) => {
    if (a > b) {
        return 1;
    }
    if (a < b) {
        return -1;
    }
    return 0;
};
/** Returns a string that has no more than maxLength characters. Actual graphemes are used, not bytes. */
export const trimMiddle = (str, maxLength) => {
    // Early return for the case where there are fewer bytes than the character limit.
    if (str.length <= maxLength) {
        return str;
    }
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    // If the max length is so small it can't fit the ellipsis, just return the ellipsis.
    const ellipsis = '…';
    const ellipsisLength = 1;
    if (maxLength <= ellipsisLength) {
        return ellipsis;
    }
    // Calculate how many graphemes to keep on each side.
    const freeSpace = maxLength - ellipsisLength;
    const leftCount = Math.ceil(freeSpace / 2);
    const rightCount = Math.floor(freeSpace / 2);
    let currentGraphemeCount = 0;
    let leftEndIndex = 0;
    // Sliding Window Buffer
    // We need to know where the "Right Half" starts. Since we can't iterate backwards,
    // we keep track of the start index of the last N graphemes we've seen.
    const rightIndexBuffer = [];
    // This function would be significantly simpler if we created an array of all the
    // segments upfront, but could result in poor performance for large input strings.
    for (const { segment, index } of segmenter.segment(str)) {
        currentGraphemeCount++;
        // Mark the byte index where the "Left Half" ends
        if (currentGraphemeCount === leftCount) {
            leftEndIndex = index + segment.length;
        }
        // Maintain the buffer for the "Right Half"
        if (rightCount > 0) {
            rightIndexBuffer.push(index);
            if (rightIndexBuffer.length > rightCount) {
                rightIndexBuffer.shift(); // Remove the oldest index to keep buffer size constant.
            }
        }
    }
    // If the total grapheme count didn't exceed the limit, return the original string.
    if (currentGraphemeCount <= maxLength) {
        return str;
    }
    // The first item in our buffer is exactly 'rightCount' graphemes away from the end.
    const rightStartIndex = rightCount > 0 ? rightIndexBuffer[0] : str.length;
    return str.slice(0, leftEndIndex) + ellipsis + str.slice(rightStartIndex);
};
/** Returns a string that has no more than maxLength characters. Actual graphemes are used, not bytes. */
export const trimEndWithMaxLength = (str, maxLength) => {
    // Early return for the case where there are fewer bytes than the character limit.
    if (str.length <= maxLength) {
        return str;
    }
    const ellipsis = '…';
    const ellipsisLength = 1;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const iterator = segmenter.segment(str)[Symbol.iterator]();
    let lastSegmentIndex = 0;
    for (let i = 0; i <= maxLength - ellipsisLength; i++) {
        const result = iterator.next();
        if (result.done) {
            return str;
        }
        lastSegmentIndex = result.value.index;
    }
    for (let i = 0; i < ellipsisLength; i++) {
        if (iterator.next().done) {
            return str;
        }
    }
    return str.slice(0, lastSegmentIndex) + ellipsis;
};
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
export const truncateToCodeUnitLength = (str, maxCodeUnits) => {
    if (isNaN(maxCodeUnits) || maxCodeUnits <= 0) {
        return '';
    }
    if (str.length <= maxCodeUnits) {
        return str;
    }
    if (!graphemeSegmenter) {
        graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    }
    let lastSafeIndex = 0;
    for (const { index, segment } of graphemeSegmenter.segment(str)) {
        if (index + segment.length > maxCodeUnits) {
            break;
        }
        lastSafeIndex = index + segment.length;
    }
    return str.slice(0, lastSafeIndex);
};
export const escapeForRegExp = (str) => {
    return escapeCharacters(str, SPECIAL_REGEX_CHARACTERS);
};
export const escapeForURLPattern = (text) => {
    return escapeCharacters(text, SPECIAL_URL_PATTERN_CHARACTERS);
};
export const naturalOrderComparator = (a, b) => {
    const chunk = /^\d+|^\D+/;
    let chunkA, chunkB, numA, numB;
    while (true) {
        if (a) {
            if (!b) {
                return 1;
            }
        }
        else {
            if (b) {
                return -1;
            }
            return 0;
        }
        chunkA = a.match(chunk)[0];
        chunkB = b.match(chunk)[0];
        numA = !Number.isNaN(Number(chunkA));
        numB = !Number.isNaN(Number(chunkB));
        if (numA && !numB) {
            return -1;
        }
        if (numB && !numA) {
            return 1;
        }
        if (numA && numB) {
            const diff = Number(chunkA) - Number(chunkB);
            if (diff) {
                return diff;
            }
            if (chunkA.length !== chunkB.length) {
                if (!Number(chunkA) && !Number(chunkB)) { // chunks are strings of all 0s (special case)
                    return chunkA.length - chunkB.length;
                }
                return chunkB.length - chunkA.length;
            }
        }
        else if (chunkA !== chunkB) {
            return (chunkA < chunkB) ? -1 : 1;
        }
        a = a.substring(chunkA.length);
        b = b.substring(chunkB.length);
    }
};
export const base64ToSize = function (content) {
    if (!content) {
        return 0;
    }
    let size = content.length * 3 / 4;
    if (content[content.length - 1] === '=') {
        size--;
    }
    if (content.length > 1 && content[content.length - 2] === '=') {
        size--;
    }
    return size;
};
export const SINGLE_QUOTE = '\'';
export const DOUBLE_QUOTE = '"';
const BACKSLASH = '\\';
export const findUnclosedCssQuote = function (str) {
    let unmatchedQuote = '';
    for (let i = 0; i < str.length; ++i) {
        const char = str[i];
        if (char === BACKSLASH) {
            i++;
            continue;
        }
        if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
            if (unmatchedQuote === char) {
                unmatchedQuote = '';
            }
            else if (unmatchedQuote === '') {
                unmatchedQuote = char;
            }
        }
    }
    return unmatchedQuote;
};
export const countUnmatchedLeftParentheses = (str) => {
    const stringLiteralRegex = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g;
    // Remove all matched string literals from the original string.
    const strWithoutStrings = str.replace(stringLiteralRegex, '');
    let unmatchedCount = 0;
    for (const c of strWithoutStrings) {
        if (c === '(') {
            unmatchedCount++;
        }
        else if (c === ')' && unmatchedCount > 0) {
            unmatchedCount--;
        }
    }
    return unmatchedCount;
};
export const createPlainTextSearchRegex = function (query, flags) {
    // This should be kept the same as the one in StringUtil.cpp.
    let regex = '';
    for (let i = 0; i < query.length; ++i) {
        const c = query.charAt(i);
        if (regexSpecialCharacters().indexOf(c) !== -1) {
            regex += '\\';
        }
        regex += c;
    }
    return new RegExp(regex, flags || '');
};
export const toLowerCaseString = function (input) {
    return input.toLowerCase();
};
/**
 * 1: two or more consecutive uppercase letters. This is useful for identifying acronyms
 * 2: lookahead assertion that matches a word boundary
 * 3: numeronym: single letter followed by number and another letter
 * 4: word starting with an optional uppercase letter
 * 5: single digit followed by word to handle '3D' or '2px' (this might be controverial)
 * 6: single uppercase letter or number
 * 7: a dot character. We extract it into a separate word and remove dashes around it later.
 * This is makes more sense conceptually and allows accounting for all possible word variants.
 * Making dot a part of a word prevent us from handling acronyms or numeronyms after the word
 * correctly without making the RegExp prohibitively complicated.
 * https://regex101.com/r/FhMVKc/1
 *            <---1---><------------2-----------> <---------3--------> <-----4----> <------5-----> <-----6----> <7>
 */
const WORD = /[A-Z]{2,}(?=[A-Z0-9][a-z0-9]+|\b|_)|[A-Za-z][0-9]+[a-z]?|[A-Z]?[a-z]+|[0-9][A-Za-z]+|[A-Z]|[0-9]+|[.]/g;
export const toKebabCase = function (input) {
    return (input.match?.(WORD)?.map(w => w.toLowerCase()).join('-').replaceAll('-.-', '.') || input);
};
export function toKebabCaseKeys(settingValue) {
    return Object.fromEntries(Object.entries(settingValue).map(([key, value]) => [toKebabCase(key), value]));
}
/**
 * Converts a given string to snake_case.
 * This function handles camelCase, PascalCase, and acronyms, including transitions between letters and numbers.
 * It uses Unicode-aware regular expressions (`\p{L}`, `\p{N}`, `\p{Lu}`, `\p{Ll}` with the `u` flag)
 * to correctly process letters and numbers from various languages.
 *
 * @param text The input string to convert to snake_case.
 * @returns The snake_case version of the input string.
 */
export function toSnakeCase(text) {
    if (!text) {
        return '';
    }
    // First, handle case-based transformations to insert underscores correctly.
    // 1. Add underscore between a letter and a number.
    //    e.g., "version2" -> "version_2"
    // 2. Add underscore between an uppercase letter sequence and a following uppercase+lowercase sequence.
    //    e.g., "APIFlags" -> "API_Flags"
    // 3. Add underscore between a lowercase/number and an uppercase letter.
    //    e.g., "lastName" -> "last_Name", "version_2Update" -> "version_2_Update"
    // 4. Replace sequences of non-alphanumeric with a single underscore
    // 5. Remove any leading or trailing underscores.
    const result = text.replace(/(\p{L})(\p{N})/gu, '$1_$2') // 1
        .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1_$2') // 2
        .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1_$2') // 3
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '_') // 4
        .replace(/^_|_$/g, ''); // 5
    return result;
}
/** Replaces the last occurrence of parameter `search` with parameter `replacement` in `input` **/
export const replaceLast = function (input, search, replacement) {
    const replacementStartIndex = input.lastIndexOf(search);
    if (replacementStartIndex === -1) {
        return input;
    }
    return input.slice(0, replacementStartIndex) + input.slice(replacementStartIndex).replace(search, replacement);
};
export const stringifyWithPrecision = function stringifyWithPrecision(s, precision = 2) {
    if (precision === 0) {
        return s.toFixed(0);
    }
    const string = s.toFixed(precision).replace(/\.?0*$/, '');
    return string === '-0' ? '0' : string;
};
/**
 * Somewhat efficiently concatenates 2 base64 encoded strings.
 */
export const concatBase64 = function (lhs, rhs) {
    if (lhs.length === 0 || !lhs.endsWith('=')) {
        // Empty string or no padding, we can straight-up concatenate.
        return lhs + rhs;
    }
    const lhsLeaveAsIs = lhs.substring(0, lhs.length - 4);
    const lhsToDecode = lhs.substring(lhs.length - 4);
    return lhsLeaveAsIs + globalThis.btoa(globalThis.atob(lhsToDecode) + globalThis.atob(rhs));
};
/**
 * Characters that cause spreadsheet viewers (Excel, Google Sheets, LibreOffice
 * Calc) to evaluate a cell as a formula rather than rendering it as plain text
 * when they appear at the start of a cell.
 */
const CSV_FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);
/**
 * Matches plain numeric literals (e.g. `-42`, `+3.14`, `-1e-3`).
 * Even though negative/signed numbers start with `-` or `+`, spreadsheets parse
 * them as numbers rather than formulas, so we exempt them from `'` prefixing to
 * keep numeric columns usable.
 */
const CSV_PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
/**
 * Returns true if a spreadsheet viewer could interpret `value` as a formula
 * (for example `=SUM(A1:A2)`, `"- Loading..."`, or `"@alice"`).
 */
function isCsvFormula(value) {
    // Check both the raw string and the leading-whitespace-trimmed string, since
    // some spreadsheet parsers ignore leading spaces before `=`, `+`, `-`, or `@`.
    const trimmed = value.trimStart();
    if (!CSV_FORMULA_TRIGGERS.has(value[0]) && !CSV_FORMULA_TRIGGERS.has(trimmed[0])) {
        return false;
    }
    return !CSV_PLAIN_NUMBER.test(trimmed.trimEnd());
}
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
export const escapeCsvCell = function (value) {
    // Step 1: Prefix formula-like text with `'` so spreadsheets render it as literal text.
    let escaped = isCsvFormula(value) ? `'${value}` : value;
    // Step 2: Apply standard RFC 4180 double-quoting if the cell contains quotes,
    // commas, or line breaks so the CSV structure stays intact.
    if (escaped.includes('"')) {
        escaped = escaped.replace(/"/g, '""');
        return `"${escaped}"`;
    }
    if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('\r')) {
        return `"${escaped}"`;
    }
    return escaped;
};
//# sourceMappingURL=StringUtilities.js.map