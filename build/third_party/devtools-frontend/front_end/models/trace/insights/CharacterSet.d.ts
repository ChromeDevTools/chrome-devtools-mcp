import * as i18n from '../../../core/i18n/i18n.js';
import type * as Handlers from '../handlers/handlers.js';
import type * as Types from '../types/types.js';
import { type Checklist, type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that checks whether the page declares a character encoding early enough.
     */
    readonly title: 'Declare a character encoding';
    /**
     * @description Description of an insight that checks whether the page has a proper character encoding declaration via HTTP header or early meta tag.
     */
    readonly description: 'A character encoding declaration is required. It can be done with a meta charset tag in the first 1024 bytes of the HTML or in the Content-Type HTTP response header. [Learn more about declaring the character encoding](https://developer.chrome.com/docs/insights/charset/).';
    /**
     * @description Text to tell the user that the charset is declared in the Content-Type HTTP response header.
     */
    readonly passingHttpHeader: 'Declares charset in HTTP header';
    /**
     * @description Text to tell the user that the charset is NOT declared in the Content-Type HTTP response header.
     */
    readonly failedHttpHeader: 'Doesn’t declare charset in HTTP header';
    /**
     * @description Text to tell the user that a meta charset tag was found in the first 1024 bytes of the HTML.
     */
    readonly passingMetaCharsetEarly: 'Declares charset using a meta tag in the first 1024 bytes';
    /**
     * @description Text to tell the user that a meta charset tag was found, but too late in the HTML.
     */
    readonly failedMetaCharsetLate: 'Declares charset using a meta tag after the first 1024 bytes';
    /**
     * @description Text to tell the user that no meta charset tag was found in the HTML.
     */
    readonly failedMetaCharsetMissing: 'Doesn’t declare charset using a meta tag';
    /**
     * @description Text to tell the user that trace data did not include the Blink signal for meta charset.
     */
    readonly failedMetaCharsetUnknown: 'Couldn’t determine meta charset declaration from trace';
};
export declare const i18nString: i18n.LocalizeString;
export type CharacterSetInsightModel = InsightModel<typeof UIStrings, {
    data?: {
        hasHttpCharset: boolean;
        checklist: Checklist<'httpCharset' | 'metaCharset'>;
        metaCharsetDisposition?: Types.Events.MetaCharsetDisposition;
        documentRequest?: Types.Events.SyntheticNetworkRequest;
    };
}>;
export declare function isCharacterSetInsight(model: InsightModel): model is CharacterSetInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): CharacterSetInsightModel;
export declare function createOverlays(model: CharacterSetInsightModel): Types.Overlays.Overlay[];
