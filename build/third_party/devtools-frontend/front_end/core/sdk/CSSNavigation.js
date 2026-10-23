// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../text_utils/text_utils.js';
import { CSSQuery } from './CSSQuery.js';
export class CSSNavigation extends CSSQuery {
    static parseNavigationPayload(cssModel, payload) {
        return payload.map(navigation => new CSSNavigation(cssModel, navigation));
    }
    #active = true;
    constructor(cssModel, payload) {
        super(cssModel);
        this.reinitialize(payload);
    }
    reinitialize(payload) {
        this.text = payload.text;
        this.range = payload.range ? TextUtils.TextRange.TextRange.fromObject(payload.range) : null;
        this.styleSheetId = payload.styleSheetId;
        this.#active = payload.active ?? true;
    }
    active() {
        return this.#active;
    }
}
//# sourceMappingURL=CSSNavigation.js.map