// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { createTokenizer } from './FormatterWorker.js';
export const CSSParserStates = {
    Initial: 'Initial',
    Selector: 'Selector',
    Style: 'Style',
    PropertyName: 'PropertyName',
    PropertyValue: 'PropertyValue',
    AtRule: 'AtRule',
};
export function parseCSS(text, chunkCallback) {
    const chunkSize = 100000; // characters per data chunk
    const lines = text.split('\n');
    let rules = [];
    let processedChunkCharacters = 0;
    let state = CSSParserStates.Initial;
    let rule;
    let property;
    const UndefTokenType = new Set();
    let disabledRules = [];
    function disabledRulesCallback(chunk) {
        disabledRules = disabledRules.concat(chunk.chunk);
    }
    function cssTrim(tokenValue) {
        // https://drafts.csswg.org/css-syntax/#whitespace
        const re = /^(?:\r?\n|[\t\f\r ])+|(?:\r?\n|[\t\f\r ])+$/g;
        return tokenValue.replace(re, '');
    }
    function processToken(tokenValue, tokenTypes, column, newColumn) {
        const tokenType = tokenTypes ? new Set(tokenTypes.split(' ')) : UndefTokenType;
        switch (state) {
            case CSSParserStates.Initial:
                if (tokenType.has('qualifier') || tokenType.has('builtin') || tokenType.has('tag')) {
                    rule = {
                        selectorText: tokenValue,
                        lineNumber,
                        columnNumber: column,
                        properties: [],
                    };
                    state = CSSParserStates.Selector;
                }
                else if (tokenType.has('def')) {
                    rule = {
                        atRule: tokenValue,
                        lineNumber,
                        columnNumber: column,
                    };
                    state = CSSParserStates.AtRule;
                }
                break;
            case CSSParserStates.Selector:
                if (tokenValue === '{' && tokenType === UndefTokenType) {
                    rule.selectorText = cssTrim(rule.selectorText);
                    rule.styleRange = createRange(lineNumber, newColumn);
                    state = CSSParserStates.Style;
                }
                else {
                    rule.selectorText += tokenValue;
                }
                break;
            case CSSParserStates.AtRule:
                if ((tokenValue === ';' || tokenValue === '{') && tokenType === UndefTokenType) {
                    rule.atRule = cssTrim(rule.atRule);
                    rules.push(rule);
                    state = CSSParserStates.Initial;
                }
                else {
                    rule.atRule += tokenValue;
                }
                break;
            case CSSParserStates.Style:
                if (tokenType.has('meta') || tokenType.has('property') || tokenType.has('variable-2')) {
                    property = {
                        name: tokenValue,
                        value: '',
                        range: createRange(lineNumber, column),
                        nameRange: createRange(lineNumber, column),
                    };
                    state = CSSParserStates.PropertyName;
                }
                else if (tokenValue === '}' && tokenType === UndefTokenType) {
                    rule.styleRange.endLine = lineNumber;
                    rule.styleRange.endColumn = column;
                    rules.push(rule);
                    state = CSSParserStates.Initial;
                }
                else if (tokenType.has('comment')) {
                    // The |processToken| is called per-line, so no token spans more than one line.
                    // Support only a one-line comments.
                    if (tokenValue.substring(0, 2) !== '/*' || tokenValue.substring(tokenValue.length - 2) !== '*/') {
                        break;
                    }
                    const uncommentedText = tokenValue.substring(2, tokenValue.length - 2);
                    const fakeRule = 'a{\n' + uncommentedText + '}';
                    disabledRules = [];
                    parseCSS(fakeRule, disabledRulesCallback);
                    if (disabledRules.length === 1 && disabledRules[0].properties.length === 1) {
                        const disabledProperty = disabledRules[0].properties[0];
                        disabledProperty.disabled = true;
                        disabledProperty.range = createRange(lineNumber, column);
                        disabledProperty.range.endColumn = newColumn;
                        const lineOffset = lineNumber - 1;
                        const columnOffset = column + 2;
                        disabledProperty.nameRange.startLine += lineOffset;
                        disabledProperty.nameRange.startColumn += columnOffset;
                        disabledProperty.nameRange.endLine += lineOffset;
                        disabledProperty.nameRange.endColumn += columnOffset;
                        disabledProperty.valueRange.startLine += lineOffset;
                        disabledProperty.valueRange.startColumn += columnOffset;
                        disabledProperty.valueRange.endLine += lineOffset;
                        disabledProperty.valueRange.endColumn += columnOffset;
                        rule.properties.push(disabledProperty);
                    }
                }
                break;
            case CSSParserStates.PropertyName:
                if (tokenValue === ':' && tokenType === UndefTokenType) {
                    property.name = property.name;
                    property.nameRange.endLine = lineNumber;
                    property.nameRange.endColumn = column;
                    property.valueRange = createRange(lineNumber, newColumn);
                    state = CSSParserStates.PropertyValue;
                }
                else if (tokenType.has('property')) {
                    property.name += tokenValue;
                }
                break;
            case CSSParserStates.PropertyValue:
                if ((tokenValue === ';' || tokenValue === '}') && tokenType === UndefTokenType) {
                    property.value = property.value;
                    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
                    // @ts-expect-error
                    property.valueRange.endLine = lineNumber;
                    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
                    // @ts-expect-error
                    property.valueRange.endColumn = column;
                    property.range.endLine = lineNumber;
                    property.range.endColumn = tokenValue === ';' ? newColumn : column;
                    rule.properties.push(property);
                    if (tokenValue === '}') {
                        rule.styleRange.endLine = lineNumber;
                        rule.styleRange.endColumn = column;
                        rules.push(rule);
                        state = CSSParserStates.Initial;
                    }
                    else {
                        state = CSSParserStates.Style;
                    }
                }
                else if (!tokenType.has('comment')) {
                    property.value += tokenValue;
                }
                break;
            default:
                console.assert(false, 'Unknown CSS parser state.');
        }
        processedChunkCharacters += newColumn - column;
        if (processedChunkCharacters > chunkSize) {
            chunkCallback({ chunk: rules, isLastChunk: false });
            rules = [];
            processedChunkCharacters = 0;
        }
    }
    const tokenizer = createTokenizer('text/css');
    let lineNumber;
    for (lineNumber = 0; lineNumber < lines.length; ++lineNumber) {
        const line = lines[lineNumber];
        tokenizer(line, processToken);
        processToken('\n', null, line.length, line.length + 1);
    }
    chunkCallback({ chunk: rules, isLastChunk: true });
    function createRange(lineNumber, columnNumber) {
        return { startLine: lineNumber, startColumn: columnNumber, endLine: lineNumber, endColumn: columnNumber };
    }
}
//# sourceMappingURL=CSSRuleParser.js.map