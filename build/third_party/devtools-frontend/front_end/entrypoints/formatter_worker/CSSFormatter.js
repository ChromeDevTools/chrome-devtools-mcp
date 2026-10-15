// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { createTokenizer } from './FormatterWorker.js';
const cssTrimEnd = (tokenValue) => {
    // https://drafts.csswg.org/css-syntax/#whitespace
    const re = /(?:\r?\n|[\t\f\r ])+$/g;
    return tokenValue.replace(re, '');
};
export class CSSFormatter {
    #builder;
    #text;
    #toOffset;
    #fromOffset;
    #lineEndings;
    #lastLine = -1;
    #currentLineIndex = 0;
    #state = {};
    constructor(builder) {
        this.#builder = builder;
    }
    format(text, lineEndings, fromOffset, toOffset) {
        this.#text = text;
        this.#lineEndings = lineEndings;
        this.#fromOffset = fromOffset;
        this.#toOffset = toOffset;
        this.#state = {};
        this.#lastLine = -1;
        this.#currentLineIndex = 0;
        const tokenize = createTokenizer('text/css');
        const oldEnforce = this.#builder.setEnforceSpaceBetweenWords(false);
        tokenize(text.substring(this.#fromOffset, this.#toOffset), this.#tokenCallback.bind(this));
        this.#builder.setEnforceSpaceBetweenWords(oldEnforce);
    }
    #isSelectorPseudoColon(colonOffset) {
        let parenDepth = 0;
        for (let i = colonOffset + 1; i < this.#toOffset; ++i) {
            const ch = this.#text[i];
            if (ch === '/' && this.#text[i + 1] === '*') {
                const commentEnd = this.#text.indexOf('*/', i + 2);
                if (commentEnd === -1) {
                    break;
                }
                i = commentEnd + 1;
                continue;
            }
            if (ch === '\'' || ch === '"') {
                const quote = ch;
                for (++i; i < this.#toOffset; ++i) {
                    if (this.#text[i] === '\\') {
                        ++i;
                    }
                    else if (this.#text[i] === quote) {
                        break;
                    }
                }
                continue;
            }
            if (ch === '(') {
                ++parenDepth;
            }
            else if (ch === ')') {
                if (parenDepth === 0) {
                    return false;
                }
                --parenDepth;
            }
            else if (parenDepth === 0) {
                if (ch === '{') {
                    return true;
                }
                if (ch === ';' || ch === '}') {
                    return false;
                }
            }
        }
        return false;
    }
    #tokenCallback(token, type, startPosition) {
        // startPosition is relative to the start of the CSS block.
        // Convert it to an absolute document offset to match this.#lineEndings.
        startPosition += this.#fromOffset;
        // Find the line index containing startPosition.
        // Since CodeMirror processes tokens sequentially in increasing order of their offset,
        // we can perform an amortized O(1) linear scan forward by tracking the current index.
        while (this.#currentLineIndex < this.#lineEndings.length &&
            this.#lineEndings[this.#currentLineIndex] < startPosition) {
            this.#currentLineIndex++;
        }
        const startLine = this.#currentLineIndex;
        if (startLine !== this.#lastLine) {
            this.#state.eatWhitespace = true;
        }
        if (type && (/^property/.test(type) || /^variable-2/.test(type)) && !this.#state.inPropertyValue) {
            this.#state.seenProperty = true;
        }
        this.#lastLine = startLine;
        // https://drafts.csswg.org/css-syntax/#whitespace
        const isWhitespace = /^(?:\r?\n|[\t\f\r ])+$/.test(token);
        if (isWhitespace) {
            if (!this.#state.eatWhitespace) {
                this.#builder.addSoftSpace();
            }
            return;
        }
        this.#state.eatWhitespace = false;
        if (token === '\n') {
            return;
        }
        if (token !== '}') {
            if (this.#state.afterClosingBrace) {
                this.#builder.addNewLine(true);
            }
            this.#state.afterClosingBrace = false;
        }
        if (token === '}') {
            if (this.#state.inPropertyValue) {
                this.#builder.addNewLine();
            }
            this.#builder.decreaseNestingLevel();
            this.#state.afterClosingBrace = true;
            this.#state.inPropertyValue = false;
            this.#state.seenProperty = false;
        }
        else if (token === ':' && !this.#state.inPropertyValue && this.#state.seenProperty) {
            if (this.#isSelectorPseudoColon(startPosition)) {
                this.#state.seenProperty = false;
            }
            else {
                this.#builder.addToken(token, startPosition);
                this.#builder.addSoftSpace();
                this.#state.eatWhitespace = true;
                this.#state.inPropertyValue = true;
                this.#state.seenProperty = false;
                return;
            }
        }
        else if (token === '{') {
            this.#state.seenProperty = false;
            this.#builder.addSoftSpace();
            this.#builder.addToken(token, startPosition);
            this.#builder.addNewLine();
            this.#builder.increaseNestingLevel();
            return;
        }
        this.#builder.addToken(cssTrimEnd(token), startPosition);
        if (type === 'comment' && !this.#state.inPropertyValue && !this.#state.seenProperty) {
            this.#builder.addNewLine();
        }
        if (token === ';' && this.#state.inPropertyValue) {
            this.#state.inPropertyValue = false;
            this.#builder.addNewLine();
        }
        else if (token === '}') {
            this.#builder.addNewLine();
        }
    }
}
//# sourceMappingURL=CSSFormatter.js.map