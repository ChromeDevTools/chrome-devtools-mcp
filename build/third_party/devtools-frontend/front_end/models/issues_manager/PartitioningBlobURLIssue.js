// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue } from './Issue.js';
const UIStrings = {
    /**
     * @description Title for Partitioning BlobURL explainer URL link.
     */
    partitioningBlobURL: 'Partitioning BlobURL',
    /**
     * @description Title for Chrome Status entry URL link.
     */
    chromeStatusEntry: 'Chrome Status entry',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/PartitioningBlobURLIssue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class PartitioningBlobURLIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        super("PartitioningBlobURLIssue" /* Protocol.Audits.InspectorIssueCode.PartitioningBlobURLIssue */, issueDetails, issuesModel);
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        const fileName = this.details().partitioningBlobURLInfo === "BlockedCrossPartitionFetching" /* Protocol.Audits.PartitioningBlobURLInfo.BlockedCrossPartitionFetching */ ?
            'fetchingPartitionedBlobURL.md' :
            'navigatingPartitionedBlobURL.md';
        return {
            file: fileName,
            links: [
                {
                    link: 'https://developers.google.com/privacy-sandbox/cookies/storage-partitioning',
                    linkTitle: i18nString(UIStrings.partitioningBlobURL),
                },
                {
                    link: 'https://chromestatus.com/feature/5130361898795008',
                    linkTitle: i18nString(UIStrings.chromeStatusEntry),
                },
            ],
        };
    }
    getKind() {
        return "BreakingChange" /* IssueKind.BREAKING_CHANGE */;
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.partitioningBlobURLIssueDetails;
        if (!details) {
            console.warn('Partitioning BlobURL issue without details received.');
            return [];
        }
        return [new PartitioningBlobURLIssue(details, issuesModel)];
    }
}
//# sourceMappingURL=PartitioningBlobURLIssue.js.map