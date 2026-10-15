// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import { CSSFormatter } from './CSSFormatter.js';
import { AbortTokenization, createTokenizer } from './FormatterWorker.js';
import { JavaScriptFormatter } from './JavaScriptFormatter.js';
import { JSONFormatter } from './JSONFormatter.js';
export class HTMLFormatter {
    #builder;
    #jsFormatter;
    #jsonFormatter;
    #cssFormatter;
    #text;
    #lineEndings;
    #model;
    constructor(builder) {
        this.#builder = builder;
        this.#jsFormatter = new JavaScriptFormatter(builder);
        this.#jsonFormatter = new JSONFormatter(builder);
        this.#cssFormatter = new CSSFormatter(builder);
    }
    format(text, lineEndings) {
        this.#text = text;
        this.#lineEndings = lineEndings;
        this.#model = new HTMLModel(text);
        this.#walk(this.#model.document());
    }
    #formatTokensTill(element, offset) {
        if (!this.#model) {
            return;
        }
        let nextToken = this.#model.peekToken();
        while (nextToken && nextToken.startOffset < offset) {
            const token = this.#model.nextToken();
            this.#formatToken(element, token);
            nextToken = this.#model.peekToken();
        }
    }
    #walk(element) {
        if (!element.openTag || !element.closeTag) {
            throw new Error('Element is missing open or close tag');
        }
        if (element.parent) {
            this.#formatTokensTill(element.parent, element.openTag.startOffset);
        }
        this.#beforeOpenTag(element);
        this.#formatTokensTill(element, element.openTag.endOffset);
        this.#afterOpenTag(element);
        for (let i = 0; i < element.children.length; ++i) {
            this.#walk(element.children[i]);
        }
        this.#formatTokensTill(element, element.closeTag.startOffset);
        this.#beforeCloseTag(element);
        this.#formatTokensTill(element, element.closeTag.endOffset);
        this.#afterCloseTag(element);
    }
    #beforeOpenTag(element) {
        if (!this.#model) {
            return;
        }
        if (!element.children.length || element === this.#model.document()) {
            return;
        }
        this.#builder.addNewLine();
    }
    #afterOpenTag(element) {
        if (!this.#model) {
            return;
        }
        if (!element.children.length || element === this.#model.document()) {
            return;
        }
        this.#builder.increaseNestingLevel();
        this.#builder.addNewLine();
    }
    #beforeCloseTag(element) {
        if (!this.#model) {
            return;
        }
        if (!element.children.length || element === this.#model.document()) {
            return;
        }
        this.#builder.decreaseNestingLevel();
        this.#builder.addNewLine();
    }
    #afterCloseTag(element) {
        if (!this.#model) {
            return;
        }
        if (!element.children.length && element !== this.#model.document()) {
            const nextToken = this.#model.peekToken();
            if (nextToken) {
                if (isTextToken(nextToken)) {
                    return;
                }
                const followingToken = this.#model.peekToken(1);
                if (Platform.StringUtilities.isWhitespace(nextToken.value) && !/[\r\n]/.test(nextToken.value) &&
                    followingToken && isTextToken(followingToken)) {
                    this.#model.nextToken();
                    this.#builder.addToken(nextToken.value, nextToken.startOffset);
                    return;
                }
            }
        }
        this.#builder.addNewLine();
    }
    #formatToken(element, token) {
        const isBodyToken = Boolean(element.openTag && !element.openTag.selfClosingTag && element.closeTag &&
            element.openTag.endOffset <= token.startOffset && token.startOffset < element.closeTag.startOffset);
        if (Platform.StringUtilities.isWhitespace(token.value) &&
            (!isBodyToken || element.children.length > 0 ||
                (!element.hasContent && !element.hasComments && /[\r\n]/.test(token.value)))) {
            return;
        }
        if ((hasTokenInSet(token.type, 'comment') || hasTokenInSet(token.type, 'meta')) &&
            (!isBodyToken || element.children.length > 0)) {
            this.#builder.addNewLine();
            this.#builder.addToken(token.value.trim(), token.startOffset);
            this.#builder.addNewLine();
            return;
        }
        if (!element.openTag || !element.closeTag) {
            return;
        }
        if (isBodyToken && element.name === 'style') {
            this.#builder.addNewLine();
            this.#builder.increaseNestingLevel();
            this.#cssFormatter.format(this.#text || '', this.#lineEndings || [], token.startOffset, token.endOffset);
            this.#builder.decreaseNestingLevel();
            return;
        }
        if (isBodyToken && element.name === 'script') {
            this.#builder.addNewLine();
            this.#builder.increaseNestingLevel();
            if (scriptTagIsJavaScript(element)) {
                this.#jsFormatter.format(this.#text || '', this.#lineEndings || [], token.startOffset, token.endOffset);
            }
            else if (scriptTagIsJSON(element)) {
                this.#jsonFormatter.format(this.#text || '', this.#lineEndings || [], token.startOffset, token.endOffset);
            }
            else {
                this.#builder.addToken(token.value, token.startOffset);
                this.#builder.addNewLine();
            }
            this.#builder.decreaseNestingLevel();
            return;
        }
        if (!isBodyToken && hasTokenInSet(token.type, 'attribute')) {
            this.#builder.addSoftSpace();
        }
        // When adding tag brackets and tag names (<, </, /, div, >), disable word space enforcement so
        // that FormattedContentBuilder does not insert unwanted spaces (e.g. splitting </title> into </ title>).
        const restore = !isBodyToken && !hasTokenInSet(token.type, 'attribute') ?
            this.#builder.setEnforceSpaceBetweenWords(false) :
            false;
        this.#builder.addToken(token.value, token.startOffset);
        if (!isBodyToken && !hasTokenInSet(token.type, 'attribute')) {
            this.#builder.setEnforceSpaceBetweenWords(restore);
        }
    }
}
function scriptTagIsJavaScript(element) {
    if (!element.openTag) {
        return true;
    }
    if (!element.openTag.attributes.has('type')) {
        return true;
    }
    let type = element.openTag.attributes.get('type');
    if (!type) {
        return true;
    }
    type = type.toLowerCase();
    const isWrappedInQuotes = /^(["\'])(.*)\1$/.exec(type.trim());
    if (isWrappedInQuotes) {
        type = isWrappedInQuotes[2];
    }
    return [
        'application/ecmascript',
        'application/javascript',
        'application/x-ecmascript',
        'application/x-javascript',
        'module',
        'text/ecmascript',
        'text/javascript',
        'text/javascript1.0',
        'text/javascript1.1',
        'text/javascript1.2',
        'text/javascript1.3',
        'text/javascript1.4',
        'text/javascript1.5',
        'text/jscript',
        'text/livescript',
        'text/x-ecmascript',
        'text/x-javascript',
    ].includes(type.trim());
}
function scriptTagIsJSON(element) {
    if (!element.openTag) {
        return false;
    }
    let type = element.openTag.attributes.get('type');
    if (!type) {
        return false;
    }
    type = type.toLowerCase();
    const isWrappedInQuotes = /^(["\'])(.*)\1$/.exec(type.trim());
    if (isWrappedInQuotes) {
        type = isWrappedInQuotes[2];
    }
    const isSubtype = /^application\/\w+\+json$/.exec(type.trim());
    if (isSubtype) {
        type = 'application/json';
    }
    return [
        'application/json',
        'importmap',
        'speculationrules',
    ].includes(type.trim());
}
function hasTokenInSet(tokenTypes, type) {
    // We prefix the CodeMirror HTML tokenizer with the xml- prefix
    // in a full version. When running in a worker context, this
    // prefix is not appended, as the global is only overridden
    // in CodeMirrorTextEditor.js.
    return tokenTypes.has(type) || tokenTypes.has(`xml-${type}`);
}
function isTextToken(token) {
    return !Platform.StringUtilities.isWhitespace(token.value) && !hasTokenInSet(token.type, 'tag') &&
        !hasTokenInSet(token.type, 'attribute') && !hasTokenInSet(token.type, 'bracket') &&
        !hasTokenInSet(token.type, 'comment') && !hasTokenInSet(token.type, 'meta');
}
export class HTMLModel {
    #state = "Initial" /* ParseState.INITIAL */;
    #document;
    #stack;
    #tokens = [];
    #tokenIndex = 0;
    #attributes = new Map();
    #attributeName = '';
    #tagName = '';
    #isOpenTag = false;
    #tagStartOffset;
    #tagEndOffset;
    constructor(text) {
        this.#document = new FormatterElement('document');
        this.#document.openTag = new Tag('document', 0, 0, new Map(), true, false);
        this.#document.closeTag = new Tag('document', text.length, text.length, new Map(), false, false);
        this.#stack = [this.#document];
        this.#build(text);
    }
    #build(text) {
        const tokenizer = createTokenizer('text/html');
        let lastOffset = 0;
        let pendingToken = null;
        const pushToken = (token) => {
            this.#tokens.push(token);
            this.#updateDOM(token);
            const element = this.#stack[this.#stack.length - 1];
            if (element && (hasTokenInSet(token.type, 'comment') || hasTokenInSet(token.type, 'meta'))) {
                element.hasComments = true;
            }
            if (element && isTextToken(token)) {
                element.hasContent = true;
            }
            if (element && (element.name === 'script' || element.name === 'style') &&
                element.openTag?.endOffset === lastOffset) {
                return AbortTokenization;
            }
            return;
        };
        const processToken = (tokenValue, type, tokenStart, tokenEnd) => {
            lastOffset = tokenEnd;
            const tokenType = type ? new Set(type.split(' ')) : new Set();
            const token = new Token(tokenValue, tokenType, tokenStart, tokenEnd);
            // This is a pretty horrible work-around for two bugs in the CodeMirror 5 HTML
            // tokenizer, which aren't easy to fix because it shares this code with the
            // XML parser[^1], and which is also not actively maintained anymore. The
            // real fix here is to migrate off of CodeMirror 5 also for formatting and
            // pretty printing and use CodeMirror 6 instead, but that's a bigger
            // project.
            //
            // For now we ducktape the first problem by merging a '/' token
            // following a string token in the HTML formatter, which does the trick, and
            // also merging the error tokens for unescaped ampersands with text tokens
            // (where `type` is `null`) preceeding and following the error tokens.
            //
            // [^1]: https://github.com/codemirror/codemirror5/blob/742627a/mode/xml/xml.js#L137
            //
            if (pendingToken) {
                if (tokenValue === '/' && type === 'attribute' && pendingToken.type.has('string')) {
                    token.startOffset = pendingToken.startOffset;
                    token.value = `${pendingToken.value}${tokenValue}`;
                    token.type = pendingToken.type;
                }
                else if ((tokenValue.startsWith('&') && type === 'error' && pendingToken.type.size === 0) ||
                    (type === null && pendingToken.type.has('error'))) {
                    pendingToken.endOffset = token.endOffset;
                    pendingToken.value += tokenValue;
                    pendingToken.type = token.type;
                    return;
                }
                else if (pushToken(pendingToken) === AbortTokenization) {
                    return AbortTokenization;
                }
                pendingToken = null;
            }
            if (type === 'string' || type === null) {
                pendingToken = token;
                return;
            }
            return pushToken(token);
        };
        while (true) {
            tokenizer(text, processToken, lastOffset);
            if (pendingToken) {
                pushToken(pendingToken);
                pendingToken = null;
            }
            if (lastOffset >= text.length) {
                break;
            }
            const element = this.#stack[this.#stack.length - 1];
            if (!element) {
                break;
            }
            while (true) {
                lastOffset = text.indexOf('</', lastOffset);
                if (lastOffset === -1) {
                    lastOffset = text.length;
                    break;
                }
                // Check if the tag at lastOffset matches the current element name (e.g. </script>).
                // Slice only the length of the tag name to avoid allocating a large substring
                // of the remainder of the document.
                const sliced = text.slice(lastOffset + 2, lastOffset + 2 + element.name.length);
                if (sliced.toLowerCase() === element.name) {
                    break;
                }
                lastOffset += 2;
            }
            if (!element.openTag) {
                break;
            }
            const tokenStart = element.openTag.endOffset;
            const tokenEnd = lastOffset;
            const tokenValue = text.substring(tokenStart, tokenEnd);
            this.#tokens.push(new Token(tokenValue, new Set(), tokenStart, tokenEnd));
        }
        while (this.#stack.length > 1) {
            const element = this.#stack[this.#stack.length - 1];
            if (!element) {
                break;
            }
            this.#popElement(new Tag(element.name, text.length, text.length, new Map(), false, false));
        }
    }
    #updateDOM(token) {
        const value = token.value;
        const type = token.type;
        switch (this.#state) {
            case "Initial" /* ParseState.INITIAL */:
                if (hasTokenInSet(type, 'bracket') && (value === '<' || value === '</')) {
                    this.#onStartTag(token);
                    this.#state = "Tag" /* ParseState.TAG */;
                }
                return;
            case "Tag" /* ParseState.TAG */:
                if (hasTokenInSet(type, 'tag') && !hasTokenInSet(type, 'bracket')) {
                    this.#tagName = value.trim().toLowerCase();
                }
                else if (hasTokenInSet(type, 'attribute')) {
                    this.#attributeName = value.trim().toLowerCase();
                    this.#attributes.set(this.#attributeName, '');
                    this.#state = "AttributeName" /* ParseState.ATTRIBUTE_NAME */;
                }
                else if (hasTokenInSet(type, 'bracket') && (value === '>' || value === '/>')) {
                    this.#onEndTag(token);
                    this.#state = "Initial" /* ParseState.INITIAL */;
                }
                return;
            case "AttributeName" /* ParseState.ATTRIBUTE_NAME */:
                if (!type.size && value === '=') {
                    this.#state = "AttributeValue" /* ParseState.ATTRIBUTE_VALUE */;
                }
                else if (hasTokenInSet(type, 'bracket') && (value === '>' || value === '/>')) {
                    this.#onEndTag(token);
                    this.#state = "Initial" /* ParseState.INITIAL */;
                }
                return;
            case "AttributeValue" /* ParseState.ATTRIBUTE_VALUE */:
                if (hasTokenInSet(type, 'string')) {
                    this.#attributes.set(this.#attributeName, value);
                    this.#state = "Tag" /* ParseState.TAG */;
                }
                else if (hasTokenInSet(type, 'bracket') && (value === '>' || value === '/>')) {
                    this.#onEndTag(token);
                    this.#state = "Initial" /* ParseState.INITIAL */;
                }
                return;
        }
    }
    #onStartTag(token) {
        this.#tagName = '';
        this.#tagStartOffset = token.startOffset;
        this.#tagEndOffset = null;
        this.#attributes = new Map();
        this.#attributeName = '';
        this.#isOpenTag = token.value === '<';
    }
    #onEndTag(token) {
        this.#tagEndOffset = token.endOffset;
        const selfClosingTag = token.value === '/>' || SelfClosingTags.has(this.#tagName);
        const tag = new Tag(this.#tagName, this.#tagStartOffset || 0, this.#tagEndOffset, this.#attributes, this.#isOpenTag, selfClosingTag);
        this.#onTagComplete(tag);
    }
    #onTagComplete(tag) {
        if (tag.isOpenTag) {
            const topElement = this.#stack[this.#stack.length - 1];
            if (topElement) {
                const tagSet = AutoClosingTags.get(topElement.name);
                if (topElement !== this.#document && topElement.openTag?.selfClosingTag) {
                    this.#popElement(autocloseTag(topElement, topElement.openTag.endOffset));
                }
                else if (tagSet?.has(tag.name)) {
                    this.#popElement(autocloseTag(topElement, tag.startOffset));
                }
                this.#pushElement(tag);
            }
            return;
        }
        let lastTag = this.#stack[this.#stack.length - 1];
        while (this.#stack.length > 1 && lastTag && lastTag.name !== tag.name) {
            this.#popElement(autocloseTag(lastTag, tag.startOffset));
            lastTag = this.#stack[this.#stack.length - 1];
        }
        if (this.#stack.length === 1) {
            return;
        }
        this.#popElement(tag);
        function autocloseTag(element, offset) {
            return new Tag(element.name, offset, offset, new Map(), false, false);
        }
    }
    #popElement(closeTag) {
        const element = this.#stack.pop();
        if (!element) {
            return;
        }
        element.closeTag = closeTag;
    }
    #pushElement(openTag) {
        const topElement = this.#stack[this.#stack.length - 1];
        const newElement = new FormatterElement(openTag.name);
        if (topElement) {
            newElement.parent = topElement;
            topElement.children.push(newElement);
        }
        newElement.openTag = openTag;
        this.#stack.push(newElement);
    }
    peekToken(offset = 0) {
        return this.#tokenIndex + offset < this.#tokens.length ? this.#tokens[this.#tokenIndex + offset] : null;
    }
    nextToken() {
        return this.#tokens[this.#tokenIndex++];
    }
    document() {
        return this.#document;
    }
}
const SelfClosingTags = new Set([
    'area',
    'base',
    'br',
    'col',
    'command',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);
// @see https://www.w3.org/TR/html/syntax.html 8.1.2.4 Optional tags
const AutoClosingTags = new Map([
    ['head', new Set(['body'])],
    ['li', new Set(['li'])],
    ['dt', new Set(['dt', 'dd'])],
    ['dd', new Set(['dt', 'dd'])],
    [
        'p',
        new Set([
            'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer', 'form',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
            'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
        ]),
    ],
    ['rb', new Set(['rb', 'rt', 'rtc', 'rp'])],
    ['rt', new Set(['rb', 'rt', 'rtc', 'rp'])],
    ['rtc', new Set(['rb', 'rtc', 'rp'])],
    ['rp', new Set(['rb', 'rt', 'rtc', 'rp'])],
    ['optgroup', new Set(['optgroup'])],
    ['option', new Set(['option', 'optgroup'])],
    ['colgroup', new Set(['colgroup'])],
    ['thead', new Set(['tbody', 'tfoot'])],
    ['tbody', new Set(['tbody', 'tfoot'])],
    ['tfoot', new Set(['tbody'])],
    ['tr', new Set(['tr'])],
    ['td', new Set(['td', 'th'])],
    ['th', new Set(['td', 'th'])],
]);
class Token {
    value;
    type;
    startOffset;
    endOffset;
    constructor(value, type, startOffset, endOffset) {
        this.value = value;
        this.type = type;
        this.startOffset = startOffset;
        this.endOffset = endOffset;
    }
}
class Tag {
    name;
    startOffset;
    endOffset;
    attributes;
    isOpenTag;
    selfClosingTag;
    constructor(name, startOffset, endOffset, attributes, isOpenTag, selfClosingTag) {
        this.name = name;
        this.startOffset = startOffset;
        this.endOffset = endOffset;
        this.attributes = attributes;
        this.isOpenTag = isOpenTag;
        this.selfClosingTag = selfClosingTag;
    }
}
class FormatterElement {
    name;
    children = [];
    parent = null;
    openTag = null;
    closeTag = null;
    hasComments = false;
    hasContent = false;
    constructor(name) {
        this.name = name;
    }
}
//# sourceMappingURL=HTMLFormatter.js.map