import * as i18n from '../../../core/i18n/i18n.js';
import type * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type Checklist, type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides a breakdown for how long it took to download the main document.
     */
    readonly title: 'Document request latency';
    /**
     * @description Description of an insight that provides a breakdown for how long it took to download the main document.
     */
    readonly description: 'Your first network request is the most important. [Reduce its latency](https://developer.chrome.com/docs/performance/insights/document-latency) by avoiding redirects, ensuring a fast server response, and enabling text compression.';
    /**
     * @description Text to tell the user that the document request does not have redirects.
     */
    readonly passingRedirects: 'Avoids redirects';
    /**
     * @description Text to tell the user that the document request had redirects.
     * @example {3} PH1
     * @example {1000 ms} PH2
     */
    readonly failedRedirects: 'Had redirects ({PH1} redirects, +{PH2})';
    /**
     * @description Text to tell the user that the time starting the document request to when the server started responding is acceptable.
     * @example {600 ms} PH1
     */
    readonly passingServerResponseTime: 'Server responds quickly (observed {PH1})';
    /**
     * @description Text to tell the user that the time starting the document request to when the server started responding is not acceptable.
     * @example {601 ms} PH1
     */
    readonly failedServerResponseTime: 'Server responded slowly (observed {PH1})';
    /**
     * @description Text to tell the user that text compression (like gzip) was applied.
     */
    readonly passingTextCompression: 'Applies text compression';
    /**
     * @description Text to tell the user that text compression (like gzip) was not applied.
     */
    readonly failedTextCompression: 'No compression applied';
    /**
     * @description Text for a label describing a network request event as having redirects.
     */
    readonly redirectsLabel: 'Redirects';
    /**
     * @description Text for a label describing a network request event as taking too long to start delivery by the server.
     */
    readonly serverResponseTimeLabel: 'Server response time';
    /**
     * @description Text for a label describing a network request event as taking longer to download because it wasn't compressed.
     */
    readonly uncompressedDownload: 'Uncompressed download';
};
export declare const i18nString: i18n.LocalizeString;
export declare function isDocumentLatencyInsight(x: InsightModel): x is DocumentLatencyInsightModel;
export type DocumentLatencyInsightModel = InsightModel<typeof UIStrings, {
    data?: {
        serverResponseTime: Types.Timing.Milli;
        redirectDuration: Types.Timing.Milli;
        uncompressedResponseBytes: number;
        checklist: Checklist<'noRedirects' | 'serverResponseIsFast' | 'usesCompression'>;
        documentRequest?: Types.Events.SyntheticNetworkRequest;
    };
}>;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): DocumentLatencyInsightModel;
export declare function createOverlays(model: DocumentLatencyInsightModel): Types.Overlays.Overlay[];
