// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as Deprecation from '../../generated/Deprecation.js';
import { Issue } from './Issue.js';
import { resolveLazyDescription } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
     * @description This links to the Chrome feature status page when one exists.
     */
    feature: 'Check the feature status page for more details',
    /**
     * @description This links to the Chromium Dash schedule when a milestone is set.
     * @example {100} milestone
     */
    milestone: 'This change will go into effect with milestone {milestone}',
    /**
     * @description Title of issue raised when a deprecated feature is used.
     */
    title: 'Deprecated feature used',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/DeprecationIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
// eslint-disable-next-line @devtools/l10n-filename-matches
const strDeprecation = i18n.i18n.registerUIStrings('generated/Deprecation.ts', Deprecation.UIStrings);
const i18nLazyDeprecationString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, strDeprecation);
export class DeprecationIssue extends Issue {
    constructor(issueDetails, issuesModel) {
        const issueCode = [
            "DeprecationIssue" /* Protocol.Audits.InspectorIssueCode.DeprecationIssue */,
            issueDetails.type,
        ].join('::');
        super({ code: issueCode, umaCode: 'DeprecationIssue' }, issueDetails, issuesModel);
    }
    getCategory() {
        return "Other" /* IssueCategory.OTHER */;
    }
    getDescription() {
        let messageFunction = () => '';
        const maybeEnglishMessage = Deprecation.UIStrings[this.details().type];
        if (maybeEnglishMessage) {
            messageFunction = i18nLazyDeprecationString(maybeEnglishMessage);
        }
        const links = [];
        const deprecationMeta = Deprecation.DEPRECATIONS_METADATA[this.details().type];
        const feature = deprecationMeta?.chromeStatusFeature ?? 0;
        if (feature !== 0) {
            links.push({
                link: `https://chromestatus.com/feature/${feature}`,
                linkTitle: i18nLazyString(UIStrings.feature),
            });
        }
        const milestone = deprecationMeta?.milestone ?? 0;
        if (milestone !== 0) {
            links.push({
                link: 'https://chromiumdash.appspot.com/schedule',
                linkTitle: i18nLazyString(UIStrings.milestone, { milestone }),
            });
        }
        return resolveLazyDescription({
            file: 'deprecation.md',
            title: i18nLazyString(UIStrings.title),
            substitutions: new Map([
                ['PLACEHOLDER_message', messageFunction],
            ]),
            links,
        });
    }
    sources() {
        if (this.details().sourceCodeLocation) {
            return [this.details().sourceCodeLocation];
        }
        return [];
    }
    primaryKey() {
        return JSON.stringify(this.details());
    }
    getKind() {
        return "BreakingChange" /* IssueKind.BREAKING_CHANGE */;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.deprecationIssueDetails;
        if (!details) {
            console.warn('Deprecation issue without details received.');
            return [];
        }
        return [new DeprecationIssue(details, issuesModel)];
    }
}
//# sourceMappingURL=DeprecationIssue.js.map