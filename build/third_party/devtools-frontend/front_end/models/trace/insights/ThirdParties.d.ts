import * as i18n from '../../../core/i18n/i18n.js';
import * as Extras from '../extras/extras.js';
import * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides details about the code on a web page that the user doesn't control (referred to as "third-party code").
     */
    readonly title: '3rd parties';
    /**
     * @description Description of a DevTools insight that identifies the code on the page that the user doesn't control.
     * This is displayed after a user expands the section to see more. No character length limits.
     */
    readonly description: `3rd party code can significantly impact load performance. [Reduce and defer loading of 3rd party code](https://developer.chrome.com/docs/performance/insights/third-parties) to prioritize your page’s content.`;
    /**
     * @description Label for a table column that displays the name of a third-party provider.
     */
    readonly columnThirdParty: '3rd party';
    /**
     * @description Label for a column in a data table; entries will be the download size of a web resource in kilobytes.
     */
    readonly columnTransferSize: 'Transfer size';
    /**
     * @description Label for a table column that displays how much time each row spent running on the main thread, entries will be the number of milliseconds spent.
     */
    readonly columnMainThreadTime: 'Main thread time';
    /**
     * @description Text block indicating that no third party content was detected on the page.
     */
    readonly noThirdParties: 'No third parties found';
};
export declare const i18nString: i18n.LocalizeString;
export type ThirdPartiesInsightModel = InsightModel<typeof UIStrings, {
    /** The entity for this navigation's URL. Any other entity is from a third party. */
    entitySummaries: Extras.ThirdParties.EntitySummary[];
    firstPartyEntity?: Extras.ThirdParties.Entity;
}>;
export declare function isThirdPartyInsight(model: InsightModel): model is ThirdPartiesInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): ThirdPartiesInsightModel;
export declare function createOverlaysForSummary(summary: Extras.ThirdParties.EntitySummary): Types.Overlays.Overlay[];
export declare function createOverlays(model: ThirdPartiesInsightModel): Types.Overlays.Overlay[];
