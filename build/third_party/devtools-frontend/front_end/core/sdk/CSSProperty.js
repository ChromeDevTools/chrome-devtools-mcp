// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as HostModule from '../host/host.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { cssMetadata, GridAreaRowRegex } from './CSSMetadata.js';
import { matchDeclaration, stripComments, } from './CSSPropertyParser.js';
import { CSSWideKeywordMatcher } from './CSSPropertyParserMatchers.js';
import { textEditorIndentSettingDescriptor } from './SDKSettings.js';
export class CSSProperty extends Common.ObjectWrapper.ObjectWrapper {
    ownerStyle;
    index;
    name;
    value;
    important;
    disabled;
    parsedOk;
    implicit;
    text;
    range;
    #active = true;
    #nameRange = null;
    #valueRange = null;
    #invalidString;
    #longhandProperties = [];
    constructor(ownerStyle, index, name, value, important, disabled, parsedOk, implicit, text, range, longhandProperties) {
        super();
        this.ownerStyle = ownerStyle;
        this.index = index;
        this.name = name;
        this.value = value;
        this.important = important;
        this.disabled = disabled;
        this.parsedOk = parsedOk;
        this.implicit = implicit; // A longhand, implicitly set by missing values of shorthand.
        this.text = text;
        this.range = range ? TextUtils.TextRange.TextRange.fromObject(range) : null;
        if (longhandProperties && longhandProperties.length > 0) {
            for (const property of longhandProperties) {
                this.#longhandProperties.push(new CSSProperty(ownerStyle, ++index, property.name, property.value, important, disabled, parsedOk, true));
            }
        }
        else {
            // Blink would not parse shorthands containing 'var()' functions:
            // https://drafts.csswg.org/css-variables/#variables-in-shorthands).
            // Therefore we manually check if the current property is a shorthand,
            // and fills its longhand components with empty values.
            const longhandNames = cssMetadata().getLonghands(name);
            for (const longhandName of longhandNames || []) {
                this.#longhandProperties.push(new CSSProperty(ownerStyle, ++index, longhandName, '', important, disabled, parsedOk, true));
            }
        }
    }
    static parsePayload(ownerStyle, index, payload) {
        // The following default field values are used in the payload:
        // important: false
        // parsedOk: true
        // implicit: false
        // disabled: false
        const result = new CSSProperty(ownerStyle, index, payload.name, payload.value, payload.important || false, payload.disabled || false, ('parsedOk' in payload) ? Boolean(payload.parsedOk) : true, Boolean(payload.implicit), payload.text, payload.range, payload.longhandProperties);
        return result;
    }
    parseExpression(expression, matchedStyles, computedStyles) {
        if (!this.parsedOk) {
            return null;
        }
        return matchDeclaration(this.name, expression, this.#matchers(matchedStyles, computedStyles));
    }
    parseValue(matchedStyles, computedStyles) {
        if (!this.parsedOk) {
            return null;
        }
        return matchDeclaration(this.name, this.value, this.#matchers(matchedStyles, computedStyles));
    }
    #matchers(matchedStyles, computedStyles) {
        const matchers = matchedStyles.propertyMatchers(this.ownerStyle, computedStyles);
        matchers.push(new CSSWideKeywordMatcher(this, matchedStyles));
        return matchers;
    }
    ensureRanges() {
        if (this.#nameRange && this.#valueRange) {
            return;
        }
        const range = this.range;
        const text = this.text ? new TextUtils.Text.Text(this.text) : null;
        if (!range || !text) {
            return;
        }
        const nameIndex = text.value().indexOf(this.name);
        const valueIndex = text.value().lastIndexOf(this.value);
        if (nameIndex === -1 || valueIndex === -1 || nameIndex > valueIndex) {
            return;
        }
        const nameSourceRange = new TextUtils.TextRange.SourceRange(nameIndex, this.name.length);
        const valueSourceRange = new TextUtils.TextRange.SourceRange(valueIndex, this.value.length);
        this.#nameRange = rebase(text.toTextRange(nameSourceRange), range.startLine, range.startColumn);
        this.#valueRange = rebase(text.toTextRange(valueSourceRange), range.startLine, range.startColumn);
        function rebase(oneLineRange, lineOffset, columnOffset) {
            if (oneLineRange.startLine === 0) {
                oneLineRange.startColumn += columnOffset;
                oneLineRange.endColumn += columnOffset;
            }
            oneLineRange.startLine += lineOffset;
            oneLineRange.endLine += lineOffset;
            return oneLineRange;
        }
    }
    nameRange() {
        this.ensureRanges();
        return this.#nameRange;
    }
    valueRange() {
        this.ensureRanges();
        return this.#valueRange;
    }
    rebase(edit) {
        if (this.ownerStyle.styleSheetId !== edit.styleSheetId) {
            return;
        }
        if (this.range) {
            this.range = this.range.rebaseAfterTextEdit(edit.oldRange, edit.newRange);
        }
    }
    setActive(active) {
        this.#active = active;
    }
    get propertyText() {
        if (this.text !== undefined) {
            return this.text;
        }
        if (this.name === '') {
            return '';
        }
        return this.name + ': ' + this.value + (this.important ? ' !important' : '') + ';';
    }
    activeInStyle() {
        return this.#active;
    }
    async setText(propertyText, majorChange, overwrite) {
        if (!this.ownerStyle) {
            throw new Error('No ownerStyle for property');
        }
        if (!this.ownerStyle.styleSheetId) {
            throw new Error('No owner style id');
        }
        if (!this.range || !this.ownerStyle.range) {
            throw new Error('Style not editable');
        }
        if (majorChange) {
            HostModule.userMetrics.actionTaken(HostModule.UserMetrics.Action.StyleRuleEdited);
            if (this.ownerStyle.parentRule?.isKeyframeRule()) {
                HostModule.userMetrics.actionTaken(HostModule.UserMetrics.Action.StylePropertyInsideKeyframeEdited);
            }
            if (this.name.startsWith('--')) {
                HostModule.userMetrics.actionTaken(HostModule.UserMetrics.Action.CustomPropertyEdited);
            }
        }
        if (overwrite && propertyText === this.propertyText) {
            this.ownerStyle.cssModel().domModel().markUndoableState(!majorChange);
            return true;
        }
        const range = this.range.relativeTo(this.ownerStyle.range.startLine, this.ownerStyle.range.startColumn);
        const indentation = this.ownerStyle.cssText ?
            this.detectIndentation(this.ownerStyle.cssText) :
            this.ownerStyle.cssModel().target().targetManager().settings.resolve(textEditorIndentSettingDescriptor).get();
        const endIndentation = this.ownerStyle.cssText ? indentation.substring(0, this.ownerStyle.range.endColumn) : '';
        const text = new TextUtils.Text.Text(this.ownerStyle.cssText || '');
        const newStyleText = text.replaceRange(range, Platform.StringUtilities.sprintf(';%s;', propertyText));
        const styleText = await CSSProperty.formatStyle(newStyleText, indentation, endIndentation);
        return await this.ownerStyle.setText(styleText, majorChange);
    }
    static async formatStyle(styleText, indentation, endIndentation) {
        const doubleIndent = indentation.substring(endIndentation.length) + indentation;
        if (indentation) {
            indentation = '\n' + indentation;
        }
        let result = '';
        let propertyName = '';
        let propertyText = '';
        let insideProperty = false;
        let needsSemi = false;
        const tokenize = TextUtils.CodeMirrorUtils.createCssTokenizer();
        await tokenize('*{' + styleText + '}', processToken);
        if (insideProperty) {
            result += propertyText;
        }
        result = result.substring(2, result.length - 1).trimEnd();
        return result + (indentation ? '\n' + endIndentation : '');
        function processToken(token, tokenType) {
            if (!insideProperty) {
                const disabledProperty = tokenType?.includes('comment') && isDisabledProperty(token);
                const isPropertyStart = (tokenType?.includes('def') || tokenType?.includes('string') || tokenType?.includes('meta') ||
                    tokenType?.includes('property') ||
                    (tokenType?.includes('variableName') && tokenType !== ('variableName.function')));
                if (disabledProperty) {
                    result = result.trimEnd() + indentation + token;
                }
                else if (isPropertyStart) {
                    insideProperty = true;
                    propertyText = token;
                }
                else if (token !== ';' || needsSemi) {
                    result += token;
                    if (token.trim() && !(tokenType?.includes('comment'))) {
                        needsSemi = token !== ';';
                    }
                }
                if (token === '{' && !tokenType) {
                    needsSemi = false;
                }
                return;
            }
            if (token === '}' || token === ';') {
                // While `propertyText` can generally be trimmed, doing so
                // breaks valid CSS declarations such as `--foo:  ;` which would
                // then produce invalid CSS of the form `--foo:;`. This
                // implementation takes special care to restore a single
                // whitespace token in this edge case. https://crbug.com/1071296
                const trimmedPropertyText = propertyText.trim();
                result = result.trimEnd() + indentation + trimmedPropertyText + (trimmedPropertyText.endsWith(':') ? ' ' : '') +
                    token;
                needsSemi = false;
                insideProperty = false;
                propertyName = '';
                return;
            }
            if (cssMetadata().isGridAreaDefiningProperty(propertyName)) {
                const rowResult = GridAreaRowRegex.exec(token);
                if (rowResult?.index === 0 && !propertyText.trimEnd().endsWith(']')) {
                    propertyText = propertyText.trimEnd() + '\n' + doubleIndent;
                }
            }
            if (!propertyName && token === ':') {
                propertyName = propertyText;
            }
            propertyText += token;
        }
        function isDisabledProperty(text) {
            const colon = text.indexOf(':');
            if (colon === -1) {
                return false;
            }
            const propertyName = text.substring(2, colon).trim();
            return cssMetadata().isCSSPropertyName(propertyName);
        }
    }
    detectIndentation(text) {
        const lines = text.split('\n');
        if (lines.length < 2) {
            return '';
        }
        return TextUtils.TextUtils.Utils.lineIndent(lines[1]);
    }
    setValue(newValue, majorChange, overwrite, userCallback) {
        const text = this.name + ': ' + newValue + (this.important ? ' !important' : '') + ';';
        void this.setText(text, majorChange, overwrite).then(userCallback);
    }
    // Updates the value stored locally and emits an event to signal its update.
    setLocalValue(value) {
        this.value = value;
        this.dispatchEventToListeners("localValueUpdated" /* Events.LOCAL_VALUE_UPDATED */);
    }
    async setDisabled(disabled) {
        if (!this.ownerStyle) {
            return false;
        }
        if (disabled === this.disabled) {
            return true;
        }
        if (!this.text) {
            return true;
        }
        const propertyText = this.text.trim();
        // Ensure that if we try to enable/disable a property that has no semicolon (which is only legal
        // in the last position of a css rule), we add it. This ensures that if we then later try
        // to re-enable/-disable the rule, we end up with legal syntax (if the user adds more properties
        // after the disabled rule).
        const appendSemicolonIfMissing = (propertyText) => propertyText + (propertyText.endsWith(';') ? '' : ';');
        let text;
        if (disabled) {
            // We remove comments before wrapping comment tags around propertyText, because otherwise it will
            // create an unmatched trailing `*/`, making the text invalid. This will result in disabled
            // CSSProperty losing its original comments, but since escaping comments will result in the parser
            // to completely ignore and then lose this declaration, this is the best compromise so far.
            text = '/* ' + appendSemicolonIfMissing(stripComments(propertyText)) + ' */';
        }
        else {
            text = appendSemicolonIfMissing(this.text.substring(2, propertyText.length - 2).trim());
        }
        return await this.setText(text, true, true);
    }
    /**
     * This stores the warning string when a CSS Property is improperly parsed.
     */
    setDisplayedStringForInvalidProperty(invalidString) {
        this.#invalidString = invalidString;
    }
    /**
     * Retrieve the warning string for a screen reader to announce when editing the property.
     */
    getInvalidStringForInvalidProperty() {
        return this.#invalidString;
    }
    getLonghandProperties() {
        return this.#longhandProperties;
    }
    ignoreErrors() {
        function hasUnknownVendorPrefix(string) {
            return !string.startsWith('-webkit-') && /^[-_][\w\d]+-\w/.test(string);
        }
        const name = this.name.toLowerCase();
        // IE hack.
        if (name.charAt(0) === '_') {
            return true;
        }
        // IE has a different format for this.
        if (name === 'filter') {
            return true;
        }
        // Common IE-specific property prefix.
        if (name.startsWith('scrollbar-')) {
            return true;
        }
        if (hasUnknownVendorPrefix(name)) {
            return true;
        }
        const value = this.value.toLowerCase();
        // IE hack.
        if (value.endsWith('\\9')) {
            return true;
        }
        if (hasUnknownVendorPrefix(value)) {
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=CSSProperty.js.map