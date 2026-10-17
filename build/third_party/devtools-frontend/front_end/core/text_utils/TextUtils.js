// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import { ContentData } from './ContentData.js';
import { SearchMatch } from './ContentProvider.js';
const KEY_VALUE_FILTER_REGEXP = /(?:^|\s)(\-)?([\w\-]+):([^\s]+)/;
const REGEXP_FILTER_REGEXP = /(?:^|\s)(\-)?\/((?:[^\/\\]|\\.)+)\//;
const TEXT_FILTER_REGEXP = /(?:^|\s)(\-)?([^\s]+)/;
const SPACE_CHAR_REGEXP = /\s/;
export const Utils = {
    isSpaceChar: function (char) {
        return SPACE_CHAR_REGEXP.test(char);
    },
    lineIndent: function (line) {
        let indentation = 0;
        while (indentation < line.length && Utils.isSpaceChar(line.charAt(indentation))) {
            ++indentation;
        }
        return line.substr(0, indentation);
    },
    splitStringByRegexes(text, regexes) {
        const matches = [];
        const globalRegexes = [];
        for (let i = 0; i < regexes.length; i++) {
            const regex = regexes[i];
            if (!regex.global) {
                globalRegexes.push(new RegExp(regex.source, regex.flags ? regex.flags + 'g' : 'g'));
            }
            else {
                globalRegexes.push(regex);
            }
        }
        doSplit(text, 0, 0);
        return matches;
        function doSplit(text, regexIndex, startIndex) {
            if (regexIndex >= globalRegexes.length) {
                // Set regexIndex as -1 if text did not match with any regular expression
                matches.push({ value: text, position: startIndex, regexIndex: -1, captureGroups: [] });
                return;
            }
            const regex = globalRegexes[regexIndex];
            let currentIndex = 0;
            let result;
            regex.lastIndex = 0;
            while ((result = regex.exec(text)) !== null) {
                const stringBeforeMatch = text.substring(currentIndex, result.index);
                if (stringBeforeMatch) {
                    doSplit(stringBeforeMatch, regexIndex + 1, startIndex + currentIndex);
                }
                const match = result[0];
                matches.push({
                    value: match,
                    position: startIndex + result.index,
                    regexIndex,
                    captureGroups: result.slice(1),
                });
                currentIndex = result.index + match.length;
            }
            const stringAfterMatches = text.substring(currentIndex);
            if (stringAfterMatches) {
                doSplit(stringAfterMatches, regexIndex + 1, startIndex + currentIndex);
            }
        }
    },
};
export class FilterParser {
    keys;
    constructor(keys) {
        this.keys = keys;
    }
    static cloneFilter(filter) {
        return { key: filter.key, text: filter.text, regex: filter.regex, negative: filter.negative };
    }
    parse(query) {
        const splitFilters = Utils.splitStringByRegexes(query, [KEY_VALUE_FILTER_REGEXP, REGEXP_FILTER_REGEXP, TEXT_FILTER_REGEXP]);
        const parsedFilters = [];
        for (const { regexIndex, captureGroups } of splitFilters) {
            if (regexIndex === -1) {
                continue;
            }
            if (regexIndex === 0) {
                const startsWithMinus = captureGroups[0];
                const parsedKey = captureGroups[1];
                const parsedValue = captureGroups[2];
                if (this.keys.indexOf(parsedKey) !== -1) {
                    parsedFilters.push({
                        key: parsedKey,
                        text: parsedValue,
                        negative: Boolean(startsWithMinus),
                    });
                }
                else {
                    parsedFilters.push({
                        text: `${parsedKey}:${parsedValue}`,
                        negative: Boolean(startsWithMinus),
                    });
                }
            }
            else if (regexIndex === 1) {
                const startsWithMinus = captureGroups[0];
                const parsedRegex = captureGroups[1];
                try {
                    parsedFilters.push({
                        regex: new RegExp(parsedRegex, 'im'),
                        negative: Boolean(startsWithMinus),
                    });
                }
                catch {
                    parsedFilters.push({
                        text: `/${parsedRegex}/`,
                        negative: Boolean(startsWithMinus),
                    });
                }
            }
            else if (regexIndex === 2) {
                const startsWithMinus = captureGroups[0];
                const parsedText = captureGroups[1];
                parsedFilters.push({
                    text: parsedText,
                    negative: Boolean(startsWithMinus),
                });
            }
        }
        return parsedFilters;
    }
}
export class BalancedJSONTokenizer {
    callback;
    index;
    balance;
    buffer;
    findMultiple;
    closingDoubleQuoteRegex;
    lastBalancedIndex;
    constructor(callback, findMultiple) {
        this.callback = callback;
        this.index = 0;
        this.balance = 0;
        this.buffer = '';
        this.findMultiple = findMultiple || false;
        this.closingDoubleQuoteRegex = /[^\\](?:\\\\)*"/g;
    }
    write(chunk) {
        this.buffer += chunk;
        const lastIndex = this.buffer.length;
        const buffer = this.buffer;
        let index;
        for (index = this.index; index < lastIndex; ++index) {
            const character = buffer[index];
            if (character === '"') {
                this.closingDoubleQuoteRegex.lastIndex = index;
                if (!this.closingDoubleQuoteRegex.test(buffer)) {
                    break;
                }
                index = this.closingDoubleQuoteRegex.lastIndex - 1;
            }
            else if (character === '{') {
                ++this.balance;
            }
            else if (character === '}') {
                --this.balance;
                if (this.balance < 0) {
                    this.reportBalanced();
                    return false;
                }
                if (!this.balance) {
                    this.lastBalancedIndex = index + 1;
                    if (!this.findMultiple) {
                        break;
                    }
                }
            }
            else if (character === ']' && !this.balance) {
                this.reportBalanced();
                return false;
            }
        }
        this.index = index;
        this.reportBalanced();
        return true;
    }
    reportBalanced() {
        if (!this.lastBalancedIndex) {
            return;
        }
        this.callback(this.buffer.slice(0, this.lastBalancedIndex));
        this.buffer = this.buffer.slice(this.lastBalancedIndex);
        this.index -= this.lastBalancedIndex;
        this.lastBalancedIndex = 0;
    }
    remainder() {
        return this.buffer;
    }
}
/**
 * Detects the indentation used by a given text document, based on the _Comparing
 * lines_ approach suggested by Heather Arthur (and also found in Firefox DevTools).
 *
 * This implementation differs from the original proposal in that tab indentation
 * isn't detected by checking if at least 50% of the lines start with a tab, but
 * instead by comparing the number of lines that start with a tab to the frequency
 * of the other indentation patterns. This way we also detect small snippets with
 * long leading comments correctly, when tab indentation is used for the snippets
 * of code.
 *
 * @param lines The input document lines.
 * @returns The indentation detected for the lines as string or `null` if it's inconclusive.
 * @see https://heathermoor.medium.com/detecting-code-indentation-eff3ed0fb56b
 */
export const detectIndentation = function (lines) {
    const frequencies = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    let tabs = 0, previous = 0;
    for (const line of lines) {
        let current = 0;
        if (line.length !== 0) {
            let char = line.charAt(0);
            if (char === '\t') {
                tabs++;
                continue;
            }
            while (char === ' ') {
                char = line.charAt(++current);
            }
        }
        if (current === line.length) {
            // Don't consider empty lines.
            previous = 0;
            continue;
        }
        const delta = Math.abs(current - previous);
        if (delta < frequencies.length) {
            // Don't consider deltas above 8 characters.
            frequencies[delta] = frequencies[delta] + 1;
        }
        previous = current;
    }
    // Find most frequent non-zero width difference between adjacent lines.
    let mostFrequentDelta = 0, highestFrequency = 0;
    for (let delta = 1; delta < frequencies.length; ++delta) {
        const frequency = frequencies[delta];
        if (frequency > highestFrequency) {
            highestFrequency = frequency;
            mostFrequentDelta = delta;
        }
    }
    if (tabs > mostFrequentDelta) {
        // If more lines start with tabs than any other indentation,
        // we assume that the document was written with tab indentation
        // in mind. This differs from the original algorithm.
        return '\t';
    }
    if (!mostFrequentDelta) {
        return null;
    }
    return ' '.repeat(mostFrequentDelta);
};
/**
 * Heuristic to check whether a given text was likely minified. Intended to
 * be used for HTML, CSS, and JavaScript inputs.
 *
 * A text is considered to be the result of minification if the average
 * line length for the whole text is 80 characters or more.
 *
 * @param text The input text to check.
 * @returns `true` if the heuristic considers `text` to be minified.
 */
export const isMinified = function (text) {
    let lineCount = 0;
    for (let lastIndex = 0; lastIndex < text.length; ++lineCount) {
        let eolIndex = text.indexOf('\n', lastIndex);
        if (eolIndex < 0) {
            eolIndex = text.length;
        }
        lastIndex = eolIndex + 1;
    }
    return (text.length - lineCount) / lineCount >= 80;
};
/**
 * Small wrapper around {@link performSearchInContent} to reduce boilerplate when searching
 * in {@link ContentDataOrError}.
 *
 * @returns empty search matches if `contentData` is an error or not text content.
 */
export const performSearchInContentData = function (contentData, query, caseSensitive, isRegex) {
    if (ContentData.isError(contentData) || !contentData.isTextContent) {
        return [];
    }
    return performSearchInContent(contentData.textObj, query, caseSensitive, isRegex);
};
/**
 * @returns One {@link SearchMatch} per match. Multiple matches on the same line each
 * result in their own `SearchMatchExact` instance.
 */
export const performSearchInContent = function (text, query, caseSensitive, isRegex) {
    const regex = Platform.StringUtilities.createSearchRegex(query, caseSensitive, isRegex);
    const result = [];
    for (let i = 0; i < text.lineCount(); ++i) {
        const lineContent = text.lineAt(i);
        const matches = lineContent.matchAll(regex);
        for (const match of matches) {
            result.push(new SearchMatch(i, lineContent, match.index, match[0].length));
        }
    }
    return result;
};
/**
 * Similar to {@link performSearchInContent} but doesn't search in a whole text but rather
 * finds the exact matches on a prelminiary search result (i.e. lines with known matches).
 * @param matches is deliberatedly typed as an object literal so we can pass the
 *                CDP search result type.
 */
export const performSearchInSearchMatches = function (matches, query, caseSensitive, isRegex) {
    const regex = Platform.StringUtilities.createSearchRegex(query, caseSensitive, isRegex);
    const result = [];
    for (const { lineNumber, lineContent } of matches) {
        const matches = lineContent.matchAll(regex);
        for (const match of matches) {
            result.push(new SearchMatch(lineNumber, lineContent, match.index, match[0].length));
        }
    }
    return result;
};
/**
 * Finds the longest overlapping string segment between the end of the first
 * string and the beginning of the second string.
 *
 * @param s1 The first string (whose suffix will be checked).
 * @param s2 The second string (whose prefix will be checked).
 * @returns The overlapping string segment, or an empty string ("")
 * if no overlap is found.
 */
export const getOverlap = function (s1, s2) {
    const minLen = Math.min(s1.length, s2.length);
    // Check from longest possible overlap down to 1
    for (let n = minLen; n > 0; n--) {
        // slice(-n) gets the last 'n' chars
        const suffix = s1.slice(-n);
        // substring(0, n) gets the first 'n' chars
        const prefix = s2.substring(0, n);
        if (suffix === prefix) {
            return suffix;
        }
    }
    return null;
};
//# sourceMappingURL=TextUtils.js.map