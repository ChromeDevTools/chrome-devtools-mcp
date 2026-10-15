// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../text_utils/text_utils.js';
import { CSSQuery } from './CSSQuery.js';
export class CSSScope extends CSSQuery {
    static parseScopesPayload(cssModel, payload) {
        return payload.map(scope => new CSSScope(cssModel, scope));
    }
    constructor(cssModel, payload) {
        super(cssModel);
        this.reinitialize(payload);
    }
    reinitialize(payload) {
        this.text = payload.text;
        this.range = payload.range ? TextUtils.TextRange.TextRange.fromObject(payload.range) : null;
        this.styleSheetId = payload.styleSheetId;
    }
    active() {
        return true;
    }
}
//# sourceMappingURL=CSSScope.js.map