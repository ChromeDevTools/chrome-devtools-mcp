// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Functions in this file are serialized via `.toString()` and evaluated in the
 * inspected page context over CDP (e.g. `Runtime.callFunctionOn`). Because they
 * execute in the inspected browser environment, they use standard DOM types.
 */
export function scrollListenerInPage(id, reportScrollPositionBindingName, scrollListenerNameInPage) {
    if ('scrollingElement' in this && !this.scrollingElement) {
        return;
    }
    const scrollingElement = ('scrollingElement' in this ? this.scrollingElement : this);
    // @ts-expect-error We're setting a custom field on `Element` or `Document` for retaining the function on the page.
    this[scrollListenerNameInPage] = () => {
        // @ts-expect-error `reportScrollPosition` binding is injected to the page before calling the function.
        globalThis[reportScrollPositionBindingName](JSON.stringify({ scrollTop: scrollingElement.scrollTop, scrollLeft: scrollingElement.scrollLeft, id }));
    };
    // @ts-expect-error We've already defined the function used below.
    this.addEventListener('scroll', this[scrollListenerNameInPage], true);
}
export function removeScrollListenerInPage(scrollListenerNameInPage) {
    // @ts-expect-error We've already set this custom field while adding scroll listener.
    this.removeEventListener('scroll', this[scrollListenerNameInPage]);
    // @ts-expect-error We've already set this custom field while adding scroll listener.
    delete this[scrollListenerNameInPage];
}
export function scrollTopInPage() {
    if ('scrollingElement' in this) {
        if (!this.scrollingElement) {
            return 0;
        }
        return this.scrollingElement.scrollTop;
    }
    return this.scrollTop;
}
export function scrollLeftInPage() {
    if ('scrollingElement' in this) {
        if (!this.scrollingElement) {
            return 0;
        }
        return this.scrollingElement.scrollLeft;
    }
    return this.scrollLeft;
}
export function setScrollTopInPage(offsetInPage) {
    if ('scrollingElement' in this) {
        if (!this.scrollingElement) {
            return;
        }
        this.scrollingElement.scrollTop = offsetInPage;
    }
    else {
        this.scrollTop = offsetInPage;
    }
}
export function setScrollLeftInPage(offsetInPage) {
    if ('scrollingElement' in this) {
        if (!this.scrollingElement) {
            return;
        }
        this.scrollingElement.scrollLeft = offsetInPage;
    }
    else {
        this.scrollLeft = offsetInPage;
    }
}
export function verticalScrollRangeInPage() {
    if ('scrollingElement' in this) {
        if (!this.scrollingElement) {
            return 0;
        }
        return this.scrollingElement.scrollHeight - this.scrollingElement.clientHeight;
    }
    return this.scrollHeight - this.clientHeight;
}
export function horizontalScrollRangeInPage() {
    if ('scrollingElement' in this) {
        if (!this.scrollingElement) {
            return 0;
        }
        return this.scrollingElement.scrollWidth - this.scrollingElement.clientWidth;
    }
    return this.scrollWidth - this.clientWidth;
}
export function toggleClassAndInjectStyleRule(pseudoElementName, hidden) {
    const classNamePrefix = '__web-inspector-hide';
    const classNameSuffix = '-shortcut__';
    const styleTagId = '__web-inspector-hide-shortcut-style__';
    let pseudoElementNameEscaped = '';
    if (pseudoElementName) {
        pseudoElementNameEscaped = pseudoElementName.replace(/[^a-zA-Z0-9-]/g, function (c) {
            return '_' + c.charCodeAt(0).toString(16) + '_';
        });
    }
    const className = classNamePrefix + pseudoElementNameEscaped + classNameSuffix;
    this.classList.toggle(className, hidden);
    let localRoot = this;
    while (localRoot.parentNode) {
        localRoot = localRoot.parentNode;
    }
    if (localRoot.nodeType === 9 /* Node.DOCUMENT_NODE */) {
        localRoot = document.head;
    }
    let style = localRoot.querySelector('style#' + styleTagId);
    if (!style) {
        const selectors = [];
        selectors.push('.__web-inspector-hide-shortcut__');
        selectors.push('.__web-inspector-hide-shortcut__ *');
        const selector = selectors.join(', ');
        const ruleBody = '    visibility: hidden !important;';
        const rule = '\n' + selector + '\n{\n' + ruleBody + '\n}\n';
        style = document.createElement('style');
        style.id = styleTagId;
        style.textContent = rule;
        localRoot.appendChild(style);
    }
    // In addition to putting them on the element we want to hide, we will
    // also add pseudo element classes to the style element to keep track of
    // which pseudo elements we have style rules for.
    if (pseudoElementName && !style.classList.contains(className)) {
        style.classList.add(className);
        style.textContent = `.${className}${pseudoElementName}, ${style.textContent}`;
    }
}
export function scrollIntoViewInPage() {
    this.scrollIntoViewIfNeeded(true);
}
export function focusInPage() {
    this.focus();
}
export function toStringForClipboard(data) {
    const subtype = data.subtype;
    const indent = data.indent;
    if (subtype === 'node') {
        return this instanceof Element ? this.outerHTML : undefined;
    }
    if (subtype && typeof this === 'undefined') {
        return String(subtype);
    }
    try {
        return JSON.stringify(this, null, indent);
    }
    catch {
        return String(this);
    }
}
export function saveVariable(value) {
    const prefix = 'temp';
    let index = 1;
    while ((prefix + index) in this) {
        ++index;
    }
    const name = prefix + index;
    // @ts-expect-error Assignment to global object
    this[name] = value;
    return name;
}
//# sourceMappingURL=PageFunctions.js.map