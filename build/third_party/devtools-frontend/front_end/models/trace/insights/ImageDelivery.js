// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as Helpers from '../helpers/helpers.js';
import { metricSavingsForWastedBytes } from './Common.js';
import { InsightCategory, InsightKeys, } from './types.js';
export const UIStrings = {
    /**
     * @description Title of an insight that recommends ways to reduce the size of images downloaded and used on the page.
     */
    title: 'Improve image delivery',
    /**
     * @description Description of an insight that recommends ways to reduce the size of images downloaded and used on the page.
     */
    description: 'Reducing the download time of images can improve the perceived load time of the page and LCP. [Learn more about optimizing image size](https://developer.chrome.com/docs/performance/insights/image-delivery).',
    /**
     * @description Message displayed in a chip explaining that an image file size is large for the # of pixels it has and recommends possible adjustments to improve the image size.
     */
    useCompression: 'Increasing the image compression factor could improve this image’s download size',
    /**
     * @description Message displayed in a chip explaining that an image file size is large for the # of pixels it has and recommends possible adjustments to improve the image size.
     */
    useModernFormat: 'Using a modern image format (WebP, AVIF) or increasing the image compression could improve this image’s download size',
    /**
     * @description Message displayed in a chip advising the user to use video formats instead of GIFs because videos generally have smaller file sizes.
     */
    useVideoFormat: 'Using video formats instead of GIFs can improve the download size of animated content',
    /**
     * @description Message displayed in a chip explaining that an image was displayed on the page with dimensions much smaller than the image file dimensions.
     * @example {1000x500} PH1
     * @example {100x50} PH2
     */
    useResponsiveSize: 'This image file is larger than it needs to be ({PH1}) for its displayed dimensions ({PH2}). Use responsive images to reduce the image download size.',
    /**
     * @description Column header for a table column containing network requests for images which can improve their file size (e.g. use a different format, increase compression, etc).
     */
    optimizeFile: 'Optimize file size',
    /**
     * @description Table row value representing the remaining items not shown in the table due to size constraints. This row will always represent at least 2 items.
     * @example {5} PH1
     */
    others: '{PH1} others',
    /**
     * @description Text status indicating that no potential optimizations were found for any image file.
     */
    noOptimizableImages: 'No optimizable images',
    /**
     * @description Text describing the estimated number of bytes that an image file optimization can save. This text is appended to another block of text describing the image optimization in more detail. "Est" means "Estimated".
     * @example {Use the correct image dimensions to reduce the image file size.} PH1
     * @example {50 MB} PH2
     */
    estimatedSavings: '{PH1} (Est {PH2})',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/insights/ImageDelivery.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/**
 * Even JPEGs with lots of detail can usually be compressed down to <1 byte per pixel
 * Using 4:2:2 subsampling already gets an uncompressed bitmap to 2 bytes per pixel.
 * The compression ratio for JPEG is usually somewhere around 10:1 depending on content, so
 * 8:1 is a reasonable expectation for web content which is 1.5MB for a 6MP image.
 *
 * WebP usually gives ~20% additional savings on top of that, so we will assume 10:1 for WebP.
 * This is quite pessimistic as their study shows a photographic compression ratio of ~29:1.
 * https://developers.google.com/speed/webp/docs/webp_lossless_alpha_study#results
 *
 * AVIF usually gives ~20% additional savings on top of WebP, so we will use 12:1 for AVIF.
 * This is quite pessimistic as Netflix study shows a photographic compression ratio of ~40:1
 * (0.4 *bits* per pixel at SSIM 0.97).
 * https://netflixtechblog.com/avif-for-next-generation-image-coding-b1d75675fe4
 */
const TARGET_BYTES_PER_PIXEL_AVIF = 2 * 1 / 12;
/**
 * If GIFs are above this size, we'll flag them
 * See https://github.com/GoogleChrome/lighthouse/pull/4885#discussion_r178406623 and https://github.com/GoogleChrome/lighthouse/issues/4696#issuecomment-370979920
 */
const GIF_SIZE_THRESHOLD = 100 * 1024;
const BYTE_SAVINGS_THRESHOLD = 4096;
// Ignore up to 12KB of waste for responsive images if an effort was made with breakpoints.
const BYTE_SAVINGS_THRESHOLD_RESPONSIVE_BREAKPOINTS = 12288;
export var ImageOptimizationType;
(function (ImageOptimizationType) {
    ImageOptimizationType["ADJUST_COMPRESSION"] = "ADJUST_COMPRESSION";
    ImageOptimizationType["MODERN_FORMAT_OR_COMPRESSION"] = "MODERN_FORMAT_OR_COMPRESSION";
    ImageOptimizationType["VIDEO_FORMAT"] = "VIDEO_FORMAT";
    ImageOptimizationType["RESPONSIVE_SIZE"] = "RESPONSIVE_SIZE";
})(ImageOptimizationType || (ImageOptimizationType = {}));
export function isImageDeliveryInsight(model) {
    return model.insightKey === 'ImageDelivery';
}
export function getOptimizationMessage(optimization) {
    switch (optimization.type) {
        case ImageOptimizationType.ADJUST_COMPRESSION:
            return i18nString(UIStrings.useCompression);
        case ImageOptimizationType.MODERN_FORMAT_OR_COMPRESSION:
            return i18nString(UIStrings.useModernFormat);
        case ImageOptimizationType.VIDEO_FORMAT:
            return i18nString(UIStrings.useVideoFormat);
        case ImageOptimizationType.RESPONSIVE_SIZE:
            return i18nString(UIStrings.useResponsiveSize, {
                PH1: `${optimization.fileDimensions.width}x${optimization.fileDimensions.height}`,
                PH2: `${optimization.displayDimensions.width}x${optimization.displayDimensions.height}`,
            });
    }
}
export function getOptimizationMessageWithBytes(optimization) {
    const byteSavingsText = i18n.ByteUtilities.bytesToString(optimization.byteSavings);
    const optimizationMessage = getOptimizationMessage(optimization);
    return i18nString(UIStrings.estimatedSavings, { PH1: optimizationMessage, PH2: byteSavingsText });
}
function finalize(partialModel) {
    return {
        insightKey: InsightKeys.IMAGE_DELIVERY,
        strings: UIStrings,
        title: i18nString(UIStrings.title),
        description: i18nString(UIStrings.description),
        docs: 'https://developer.chrome.com/docs/performance/insights/image-delivery',
        category: InsightCategory.LCP,
        state: partialModel.optimizableImages.length > 0 ? 'fail' : 'pass',
        ...partialModel,
        relatedEvents: new Map(partialModel.optimizableImages.map(image => [image.request, image.optimizations.map(getOptimizationMessageWithBytes)])),
    };
}
/**
 * Calculate rough savings percentage based on 1000 real gifs transcoded to video
 * https://github.com/GoogleChrome/lighthouse/issues/4696#issuecomment-380296510
 */
function estimateGIFPercentSavings(request) {
    return Math.round((29.1 * Math.log10(request.args.data.decodedBodyLength) - 100.7)) / 100;
}
function getDisplayedSize(data, paintImage) {
    // Note: for traces made prior to metadata.hostDPR (which means no data in
    // paintEventToCorrectedDisplaySize), the displayed size unexpectedly ignores any
    // emulated DPR and so the results may be very misleading.
    return data.ImagePainting.paintEventToCorrectedDisplaySize.get(paintImage) ?? {
        width: paintImage.args.data.width,
        height: paintImage.args.data.height,
    };
}
function getPixelCounts(data, paintImage) {
    const { width, height } = getDisplayedSize(data, paintImage);
    return {
        filePixels: paintImage.args.data.srcWidth * paintImage.args.data.srcHeight,
        displayedPixels: width * height,
    };
}
export function generateInsight(data, context) {
    const isWithinContext = (event) => Helpers.Timing.eventIsInBounds(event, context.bounds);
    const contextRequests = data.NetworkRequests.byTime.filter(isWithinContext);
    const optimizableImages = [];
    for (const request of contextRequests) {
        if (request.args.data.resourceType !== 'Image') {
            continue;
        }
        if (request.args.data.mimeType === 'image/svg+xml') {
            continue;
        }
        // If the request was redirected, the image paints will have the pre-redirect URL.
        const url = request.args.data.redirects[0]?.url ?? request.args.data.url;
        const imagePaints = data.ImagePainting.paintImageEventForUrl.get(url)?.filter(isWithinContext);
        // This will filter out things like preloaded image requests where an image file is downloaded
        // but never rendered on the page.
        if (!imagePaints?.length) {
            continue;
        }
        const largestImagePaint = imagePaints.reduce((prev, curr) => {
            const prevPixels = getPixelCounts(data, prev).displayedPixels;
            const currPixels = getPixelCounts(data, curr).displayedPixels;
            return prevPixels > currPixels ? prev : curr;
        });
        const { filePixels: imageFilePixels, displayedPixels: largestImageDisplayPixels, } = getPixelCounts(data, largestImagePaint);
        // Decoded body length is almost always the right one to be using because of the below:
        //     `encodedDataLength = decodedBodyLength + headers`.
        // HOWEVER, there are some cases where an image is compressed again over the network and transfer size
        // is smaller (see https://github.com/GoogleChrome/lighthouse/pull/4968).
        // Use the min of the two numbers to be safe.
        const imageBytes = Math.min(request.args.data.decodedBodyLength, request.args.data.encodedDataLength);
        const bytesPerPixel = imageBytes / imageFilePixels;
        let optimizations = [];
        if (request.args.data.mimeType === 'image/gif') {
            if (imageBytes > GIF_SIZE_THRESHOLD) {
                const percentSavings = estimateGIFPercentSavings(request);
                const byteSavings = Math.round(imageBytes * percentSavings);
                optimizations.push({ type: ImageOptimizationType.VIDEO_FORMAT, byteSavings });
            }
        }
        else if (bytesPerPixel > TARGET_BYTES_PER_PIXEL_AVIF) {
            const idealAvifImageSize = Math.round(TARGET_BYTES_PER_PIXEL_AVIF * imageFilePixels);
            const byteSavings = imageBytes - idealAvifImageSize;
            if (request.args.data.mimeType !== 'image/webp' && request.args.data.mimeType !== 'image/avif') {
                optimizations.push({ type: ImageOptimizationType.MODERN_FORMAT_OR_COMPRESSION, byteSavings });
            }
            else {
                optimizations.push({ type: ImageOptimizationType.ADJUST_COMPRESSION, byteSavings });
            }
        }
        // At this point (before looking at image size), the # of optimizations should only ever be 1 or 0
        // Math.max handles both cases correctly, and is defensive against future patches that would add
        // more than 1 format-specific optimization by this point.
        const imageByteSavingsFromFormat = Math.max(0, ...optimizations.map(o => o.byteSavings));
        let imageByteSavings = imageByteSavingsFromFormat;
        const wastedPixelRatio = 1 - (largestImageDisplayPixels / imageFilePixels);
        // Ignore CSS images because it's difficult to determine what is a spritesheet,
        // and the reward-to-effort ratio for responsive CSS images is quite low https://css-tricks.com/responsive-images-css/.
        if (wastedPixelRatio > 0 && !largestImagePaint.args.data.isCSS) {
            const byteSavings = Math.round(wastedPixelRatio * imageBytes);
            const hadBreakpoints = largestImagePaint.args.data.isPicture || largestImagePaint.args.data.srcsetAttribute;
            if (!hadBreakpoints || byteSavings > BYTE_SAVINGS_THRESHOLD_RESPONSIVE_BREAKPOINTS) {
                // This will compound the byte savings from any potential format changes with the image size
                // optimization added here.
                imageByteSavings += Math.round(wastedPixelRatio * (imageBytes - imageByteSavingsFromFormat));
                const { width, height } = getDisplayedSize(data, largestImagePaint);
                optimizations.push({
                    type: ImageOptimizationType.RESPONSIVE_SIZE,
                    byteSavings,
                    fileDimensions: {
                        width: Math.round(largestImagePaint.args.data.srcWidth),
                        height: Math.round(largestImagePaint.args.data.srcHeight),
                    },
                    displayDimensions: {
                        width: Math.round(width),
                        height: Math.round(height),
                    },
                });
            }
        }
        optimizations = optimizations.filter(optimization => optimization.byteSavings > BYTE_SAVINGS_THRESHOLD);
        if (optimizations.length > 0) {
            optimizableImages.push({
                request,
                largestImagePaint,
                optimizations,
                byteSavings: imageByteSavings,
            });
        }
    }
    const wastedBytesByRequestId = new Map();
    for (const image of optimizableImages) {
        wastedBytesByRequestId.set(image.request.args.data.requestId, image.byteSavings);
    }
    // Sort by savings, then by size of image.
    optimizableImages.sort((a, b) => {
        if (b.byteSavings !== a.byteSavings) {
            return b.byteSavings - a.byteSavings;
        }
        return b.request.args.data.decodedBodyLength - a.request.args.data.decodedBodyLength;
    });
    return finalize({
        optimizableImages,
        metricSavings: metricSavingsForWastedBytes(wastedBytesByRequestId, context),
        wastedBytes: optimizableImages.reduce((total, img) => total + img.byteSavings, 0),
    });
}
export function createOverlayForRequest(request) {
    return {
        type: 'ENTRY_OUTLINE',
        entry: request,
        outlineReason: 'ERROR',
    };
}
export function createOverlays(model) {
    return model.optimizableImages.map(image => createOverlayForRequest(image.request));
}
//# sourceMappingURL=ImageDelivery.js.map