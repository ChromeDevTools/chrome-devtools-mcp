// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @file This file includes DOM helpers and page-evaluated serialization helpers
 * used by AI assistance that require DOM types. They are isolated in a separate
 * target so DOM types do not leak into the rest of models/ai_assistance.
 */
import * as Platform from '../../core/platform/platform.js';
/* istanbul ignore next */
export function getErrorStackOnThePage() {
    // Using this.stack causes side effect checks to throw.
    return { stack: '', message: this.message };
}
/* istanbul ignore next */
export function stringifyObjectOnThePage() {
    const seenBefore = new Map();
    return JSON.stringify(this, function replacer(key, value) {
        if (typeof value === 'object' && value !== null) {
            if (seenBefore.has(value)) {
                return '(cycle)';
            }
            seenBefore.set(value, true);
        }
        if (value instanceof HTMLElement) {
            const idAttribute = value.id ? ` id="${value.id}"` : '';
            const classAttribute = value.classList.value ? ` class="${value.classList.value}"` : '';
            return `<${value.nodeName.toLowerCase()}${idAttribute}${classAttribute}>${value.hasChildNodes() ? '...' : ''}</${value.nodeName.toLowerCase()}>`;
        }
        if (this instanceof CSSStyleDeclaration) {
            // Do not add number keys to the output.
            if (!isNaN(Number(key))) {
                return undefined;
            }
        }
        return value;
    });
}
export async function sanitizeStyleChanges(selector, styles) {
    const cssStyleValue = [];
    const changedStyles = [];
    const kebabStyles = Platform.StringUtilities.toKebabCaseKeys(styles);
    for (const [style, value] of Object.entries(kebabStyles)) {
        // Build up the CSS style
        cssStyleValue.push(`${style}: ${value};`);
        // Keep track of what style changed to query later.
        changedStyles.push(style);
    }
    if (typeof CSSStyleSheet === 'undefined' || typeof CSSStyleRule === 'undefined') {
        return kebabStyles;
    }
    const styleSheet = new CSSStyleSheet({ disabled: true });
    // Build up the CSS stylesheet value.
    await styleSheet.replace(`${selector} { ${cssStyleValue.join(' ')} }`);
    const sanitizedStyles = {};
    for (const cssRule of styleSheet.cssRules) {
        if (!(cssRule instanceof CSSStyleRule)) {
            continue;
        }
        for (const style of changedStyles) {
            const value = cssRule.style.getPropertyValue(style);
            if (value) {
                sanitizedStyles[style] = value;
            }
        }
    }
    return sanitizedStyles;
}
export function dispatchAiAssistanceDoneEvent() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aiassistancedone'));
    }
}
//# sourceMappingURL=DOMHelpers.js.map