// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../text_utils/text_utils.js';
import { CSSQuery } from './CSSQuery.js';
export class CSSMediaQuery {
    #active;
    #expressions;
    constructor(payload) {
        this.#active = payload.active;
        this.#expressions = [];
        for (let j = 0; j < payload.expressions.length; ++j) {
            this.#expressions.push(CSSMediaQueryExpression.parsePayload(payload.expressions[j]));
        }
    }
    static parsePayload(payload) {
        return new CSSMediaQuery(payload);
    }
    active() {
        return this.#active;
    }
    expressions() {
        return this.#expressions;
    }
}
export class CSSMediaQueryExpression {
    #value;
    #unit;
    #feature;
    #valueRange;
    #computedLength;
    constructor(payload) {
        this.#value = payload.value;
        this.#unit = payload.unit;
        this.#feature = payload.feature;
        this.#valueRange = payload.valueRange ? TextUtils.TextRange.TextRange.fromObject(payload.valueRange) : null;
        this.#computedLength = payload.computedLength || null;
    }
    static parsePayload(payload) {
        return new CSSMediaQueryExpression(payload);
    }
    value() {
        return this.#value;
    }
    unit() {
        return this.#unit;
    }
    feature() {
        return this.#feature;
    }
    valueRange() {
        return this.#valueRange;
    }
    computedLength() {
        return this.#computedLength;
    }
}
export class CSSMedia extends CSSQuery {
    source;
    sourceURL;
    mediaList;
    static parseMediaArrayPayload(cssModel, payload) {
        return payload.map(mq => new CSSMedia(cssModel, mq));
    }
    constructor(cssModel, payload) {
        super(cssModel);
        this.reinitialize(payload);
    }
    reinitialize(payload) {
        this.text = payload.text;
        this.source = payload.source;
        this.sourceURL = payload.sourceURL || '';
        this.range = payload.range ? TextUtils.TextRange.TextRange.fromObject(payload.range) : null;
        this.styleSheetId = payload.styleSheetId;
        this.mediaList = null;
        if (payload.mediaList) {
            this.mediaList = [];
            for (let i = 0; i < payload.mediaList.length; ++i) {
                this.mediaList.push(CSSMediaQuery.parsePayload(payload.mediaList[i]));
            }
        }
    }
    active() {
        if (!this.mediaList) {
            return true;
        }
        for (let i = 0; i < this.mediaList.length; ++i) {
            if (this.mediaList[i].active()) {
                return true;
            }
        }
        return false;
    }
}
export const Source = {
    LINKED_SHEET: 'linkedSheet',
    INLINE_SHEET: 'inlineSheet',
    MEDIA_RULE: 'mediaRule',
    IMPORT_RULE: 'importRule',
};
//# sourceMappingURL=CSSMedia.js.map