import * as i18n from '../../../core/i18n/i18n.js';
import type * as Platform from '../../../core/platform/platform.js';
import type * as Handlers from '../handlers/handlers.js';
import type * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that recommends ways to reduce the size of images downloaded and used on the page.
     */
    readonly title: 'Improve image delivery';
    /**
     * @description Description of an insight that recommends ways to reduce the size of images downloaded and used on the page.
     */
    readonly description: 'Reducing the download time of images can improve the perceived load time of the page and LCP. [Learn more about optimizing image size](https://developer.chrome.com/docs/performance/insights/image-delivery).';
    /**
     * @description Message displayed in a chip explaining that an image file size is large for the # of pixels it has and recommends possible adjustments to improve the image size.
     */
    readonly useCompression: 'Increasing the image compression factor could improve this image’s download size';
    /**
     * @description Message displayed in a chip explaining that an image file size is large for the # of pixels it has and recommends possible adjustments to improve the image size.
     */
    readonly useModernFormat: 'Using a modern image format (WebP, AVIF) or increasing the image compression could improve this image’s download size';
    /**
     * @description Message displayed in a chip advising the user to use video formats instead of GIFs because videos generally have smaller file sizes.
     */
    readonly useVideoFormat: 'Using video formats instead of GIFs can improve the download size of animated content';
    /**
     * @description Message displayed in a chip explaining that an image was displayed on the page with dimensions much smaller than the image file dimensions.
     * @example {1000x500} PH1
     * @example {100x50} PH2
     */
    readonly useResponsiveSize: 'This image file is larger than it needs to be ({PH1}) for its displayed dimensions ({PH2}). Use responsive images to reduce the image download size.';
    /**
     * @description Column header for a table column containing network requests for images which can improve their file size (e.g. use a different format, increase compression, etc).
     */
    readonly optimizeFile: 'Optimize file size';
    /**
     * @description Table row value representing the remaining items not shown in the table due to size constraints. This row will always represent at least 2 items.
     * @example {5} PH1
     */
    readonly others: '{PH1} others';
    /**
     * @description Text status indicating that no potential optimizations were found for any image file.
     */
    readonly noOptimizableImages: 'No optimizable images';
    /**
     * @description Text describing the estimated number of bytes that an image file optimization can save. This text is appended to another block of text describing the image optimization in more detail. "Est" means "Estimated".
     * @example {Use the correct image dimensions to reduce the image file size.} PH1
     * @example {50 MB} PH2
     */
    readonly estimatedSavings: '{PH1} (Est {PH2})';
};
export declare const i18nString: i18n.LocalizeString;
export declare enum ImageOptimizationType {
    ADJUST_COMPRESSION = "ADJUST_COMPRESSION",
    MODERN_FORMAT_OR_COMPRESSION = "MODERN_FORMAT_OR_COMPRESSION",
    VIDEO_FORMAT = "VIDEO_FORMAT",
    RESPONSIVE_SIZE = "RESPONSIVE_SIZE"
}
export type ImageOptimization = {
    type: Exclude<ImageOptimizationType, ImageOptimizationType.RESPONSIVE_SIZE>;
    byteSavings: number;
} | {
    type: ImageOptimizationType.RESPONSIVE_SIZE;
    byteSavings: number;
    fileDimensions: {
        width: number;
        height: number;
    };
    displayDimensions: {
        width: number;
        height: number;
    };
};
export interface OptimizableImage {
    request: Types.Events.SyntheticNetworkRequest;
    optimizations: ImageOptimization[];
    byteSavings: number;
    /**
     * If the an image resource has multiple `PaintImage`s, we compare its intrinsic size to the largest of the displayed sizes.
     *
     * It is theoretically possible for `PaintImage` events with the same URL to have different intrinsic sizes.
     * However, this should be rare because it requires serving different images from the same URL.
     */
    largestImagePaint: Types.Events.PaintImage;
}
export type ImageDeliveryInsightModel = InsightModel<typeof UIStrings, {
    /** Sorted by potential byte savings, then by size of image. */
    optimizableImages: OptimizableImage[];
    wastedBytes: number;
}>;
export declare function isImageDeliveryInsight(model: InsightModel): model is ImageDeliveryInsightModel;
export declare function getOptimizationMessage(optimization: ImageOptimization): Platform.UIString.LocalizedString;
export declare function getOptimizationMessageWithBytes(optimization: ImageOptimization): Platform.UIString.LocalizedString;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): ImageDeliveryInsightModel;
export declare function createOverlayForRequest(request: Types.Events.SyntheticNetworkRequest): Types.Overlays.EntryOutline;
export declare function createOverlays(model: ImageDeliveryInsightModel): Types.Overlays.Overlay[];
