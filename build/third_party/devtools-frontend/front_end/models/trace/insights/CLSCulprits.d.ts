import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import type * as Protocol from '../../../generated/protocol.js';
import * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
import { type InsightModel, type InsightSetContext } from './types.js';
export declare const UIStrings: {
    /**
     * @description Title of an insight that provides details about why elements shift/move on the page. The causes for these shifts are referred to as culprits ("reasons").
     */
    readonly title: 'Layout shift culprits';
    /**
     * @description Description of a DevTools insight that identifies the reasons that elements shift on the page.
     * This is displayed after a user expands the section to see more. No character length limits.
     */
    readonly description: 'Layout shifts occur when elements move absent any user interaction. [Investigate the causes of layout shifts](https://developer.chrome.com/docs/performance/insights/cls-culprit), such as elements being added, removed, or their fonts changing as the page loads.';
    /**
     * @description Text indicating the worst layout shift cluster.
     */
    readonly worstLayoutShiftCluster: 'Worst layout shift cluster';
    /**
     * @description Text indicating the worst layout shift cluster.
     */
    readonly worstCluster: 'Worst cluster';
    /**
     * @description Text indicating a layout shift cluster and its start time.
     * @example {32 ms} PH1
     */
    readonly layoutShiftCluster: 'Layout shift cluster @ {PH1}';
    /**
     * @description Text indicating the biggest reasons for the layout shifts.
     */
    readonly topCulprits: 'Top layout shift culprits';
    /**
     * @description Text for a culprit type of Injected iframe.
     */
    readonly injectedIframe: 'Injected iframe';
    /**
     * @description Text for a culprit type of web font request.
     */
    readonly webFont: 'Web font';
    /**
     * @description Text for a culprit type of Animation.
     */
    readonly animation: 'Animation';
    /**
     * @description Text for a culprit type of Unsized image.
     */
    readonly unsizedImage: 'Unsized image element';
    /**
     * @description Text status when there were no layout shifts detected.
     */
    readonly noLayoutShifts: 'No layout shifts';
    /**
     * @description Text status when no layout shift culprits or root causes were found.
     */
    readonly noCulprits: 'Couldn’t detect any layout shift culprits';
};
export declare const i18nString: i18n.LocalizeString;
export type CLSCulpritsInsightModel = InsightModel<typeof UIStrings, {
    animationFailures: readonly NoncompositedAnimationFailure[];
    shifts: Map<Types.Events.SyntheticLayoutShift, LayoutShiftRootCausesData>;
    clusters: Types.Events.SyntheticLayoutShiftCluster[];
    worstCluster: Types.Events.SyntheticLayoutShiftCluster | undefined;
    /** The top 3 shift root causes for each cluster. */
    topCulpritsByCluster: Map<Types.Events.SyntheticLayoutShiftCluster, LayoutShiftItem[]>;
}>;
export declare enum AnimationFailureReasons {
    ACCELERATED_ANIMATIONS_DISABLED = "ACCELERATED_ANIMATIONS_DISABLED",
    EFFECT_SUPPRESSED_BY_DEVTOOLS = "EFFECT_SUPPRESSED_BY_DEVTOOLS",
    INVALID_ANIMATION_OR_EFFECT = "INVALID_ANIMATION_OR_EFFECT",
    EFFECT_HAS_UNSUPPORTED_TIMING_PARAMS = "EFFECT_HAS_UNSUPPORTED_TIMING_PARAMS",
    EFFECT_HAS_NON_REPLACE_COMPOSITE_MODE = "EFFECT_HAS_NON_REPLACE_COMPOSITE_MODE",
    TARGET_HAS_INVALID_COMPOSITING_STATE = "TARGET_HAS_INVALID_COMPOSITING_STATE",
    TARGET_HAS_INCOMPATIBLE_ANIMATIONS = "TARGET_HAS_INCOMPATIBLE_ANIMATIONS",
    TARGET_HAS_CSS_OFFSET = "TARGET_HAS_CSS_OFFSET",
    ANIMATION_AFFECTS_NON_CSS_PROPERTIES = "ANIMATION_AFFECTS_NON_CSS_PROPERTIES",
    TRANSFORM_RELATED_PROPERTY_CANNOT_BE_ACCELERATED_ON_TARGET = "TRANSFORM_RELATED_PROPERTY_CANNOT_BE_ACCELERATED_ON_TARGET",
    TRANSFROM_BOX_SIZE_DEPENDENT = "TRANSFROM_BOX_SIZE_DEPENDENT",
    FILTER_RELATED_PROPERTY_MAY_MOVE_PIXELS = "FILTER_RELATED_PROPERTY_MAY_MOVE_PIXELS",
    UNSUPPORTED_CSS_PROPERTY = "UNSUPPORTED_CSS_PROPERTY",
    MIXED_KEYFRAME_VALUE_TYPES = "MIXED_KEYFRAME_VALUE_TYPES",
    TIMELINE_SOURCE_HAS_INVALID_COMPOSITING_STATE = "TIMELINE_SOURCE_HAS_INVALID_COMPOSITING_STATE",
    ANIMATION_HAS_NO_VISIBLE_CHANGE = "ANIMATION_HAS_NO_VISIBLE_CHANGE",
    AFFECTS_IMPORTANT_PROPERTY = "AFFECTS_IMPORTANT_PROPERTY",
    SVG_TARGET_HAS_INDEPENDENT_TRANSFORM_PROPERTY = "SVG_TARGET_HAS_INDEPENDENT_TRANSFORM_PROPERTY"
}
export declare enum LayoutShiftType {
    WEB_FONT = 0,
    IFRAMES = 1,
    ANIMATIONS = 2,
    UNSIZED_IMAGE = 3
}
export type LayoutShiftItem = {
    type: LayoutShiftType.UNSIZED_IMAGE;
    description: Platform.UIString.LocalizedString;
    url: string;
    backendNodeId: Protocol.DOM.BackendNodeId;
    frame: string;
} | {
    type: Exclude<LayoutShiftType, LayoutShiftType.UNSIZED_IMAGE>;
    description: Platform.UIString.LocalizedString;
};
export interface NoncompositedAnimationFailure {
    /**
     * Animation name.
     */
    name?: string;
    /**
     * Failure reason based on mask number defined in
     * https://source.chromium.org/search?q=f:compositor_animations.h%20%22enum%20FailureReason%22.
     */
    failureReasons: AnimationFailureReasons[];
    /**
     * Unsupported properties.
     */
    unsupportedProperties?: Types.Events.Animation['args']['data']['unsupportedProperties'];
    /**
     * Animation event.
     */
    animation?: Types.Events.SyntheticAnimationPair;
}
export interface UnsizedImage {
    backendNodeId: Protocol.DOM.BackendNodeId;
    paintImageEvent: Types.Events.PaintImage;
}
export interface IframeRootCause {
    frame: string;
    url?: string;
}
export interface LayoutShiftRootCausesData {
    iframes: IframeRootCause[];
    webFonts: Types.Events.SyntheticNetworkRequest[];
    nonCompositedAnimations: NoncompositedAnimationFailure[];
    unsizedImages: UnsizedImage[];
}
export declare function getNonCompositedFailure(animationEvent: Types.Events.SyntheticAnimationPair): NoncompositedAnimationFailure[];
export declare function isCLSCulpritsInsight(insight: InsightModel): insight is CLSCulpritsInsightModel;
export declare function generateInsight(data: Handlers.Types.HandlerData, context: InsightSetContext): CLSCulpritsInsightModel;
export declare function createOverlays(model: CLSCulpritsInsightModel): Types.Overlays.Overlay[];
