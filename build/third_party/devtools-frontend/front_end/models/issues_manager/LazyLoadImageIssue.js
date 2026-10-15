// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Link title for the lazy-loaded image with zero size issue in the Issues panel.
     */
    lazyLoadImageZeroSize: 'Lazy-loaded images should have explicit dimensions',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/LazyLoadImageIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class LazyLoadImageIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        const umaCode = ["LazyLoadImageIssue" /* Protocol.Audits.InspectorIssueCode.LazyLoadImageIssue */, 'ZeroSize'].join('::');
        super({ code: "LazyLoadImageIssue" /* Protocol.Audits.InspectorIssueCode.LazyLoadImageIssue */, umaCode }, issueDetails, issuesModel);
    }
    primaryKey() {
        return `${this.code()}-(${this.details().nodeId})-(${this.details().url})`;
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        return {
            file: 'lazyLoadImageZeroSize.md',
            links: [
                {
                    link: 'https://web.dev/articles/browser-level-image-lazy-loading/#dimension-attributes',
                    linkTitle: i18nString(UIStrings.lazyLoadImageZeroSize),
                },
            ],
        };
    }
    elementCount() {
        return this.details().nodeId ? 1 : 0;
    }
    elements() {
        if (this.details().nodeId) {
            const target = this.model()?.target();
            return [{
                    backendNodeId: this.details().nodeId,
                    nodeName: 'img',
                    target: target || null,
                }];
        }
        return [];
    }
    getKind() {
        return "Improvement" /* IssueKind.IMPROVEMENT */;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.lazyLoadImageIssueDetails;
        if (!details) {
            console.warn('Lazy-loaded image issue without details received.');
            return [];
        }
        return [new LazyLoadImageIssue(details, issuesModel)];
    }
}
//# sourceMappingURL=LazyLoadImageIssue.js.map