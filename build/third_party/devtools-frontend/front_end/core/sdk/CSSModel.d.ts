import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { CSSFontFace } from './CSSFontFace.js';
import { CSSLocation } from './CSSLocation.js';
import { CSSMatchedStyles } from './CSSMatchedStyles.js';
import { CSSMedia } from './CSSMedia.js';
import { CSSStyleRule } from './CSSRule.js';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.js';
import { CSSStyleSheetHeader } from './CSSStyleSheetHeader.js';
import { DOMModel, type DOMNode } from './DOMModel.js';
import { SDKModel } from './SDKModel.js';
import { SourceMapManager } from './SourceMapManager.js';
import { type Target } from './Target.js';
export declare const enum ColorScheme {
    LIGHT = "light",
    DARK = "dark"
}
export interface LayoutProperties {
    isFlex: boolean;
    isGrid: boolean;
    isSubgrid: boolean;
    isGridLanes: boolean;
    isContents?: boolean;
    containerType?: string;
    hasScroll: boolean;
    isAnchorPositioned?: boolean;
}
export declare class CSSModel extends SDKModel<EventTypes> {
    #private;
    readonly agent: ProtocolProxyApi.CSSApi;
    constructor(target: Target);
    colorScheme(): Promise<ColorScheme | undefined>;
    resolveValues(propertyName: string | undefined, nodeId: Protocol.DOM.NodeId, ...values: string[]): Promise<string[] | null>;
    headersForSourceURL(sourceURL: Platform.DevToolsPath.UrlString): CSSStyleSheetHeader[];
    createRawLocationsByURL(sourceURL: Platform.DevToolsPath.UrlString, lineNumber: number, columnNumber?: number | undefined): CSSLocation[];
    sourceMapManager(): SourceMapManager<CSSStyleSheetHeader>;
    static readableLayerName(text: string): string;
    static trimSourceURL(text: string): string;
    domModel(): DOMModel;
    trackComputedStyleUpdatesForNode(nodeId: Protocol.DOM.NodeId | undefined): Promise<void>;
    setStyleText(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, text: string, majorChange: boolean): Promise<boolean>;
    setSelectorText(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, text: string): Promise<boolean>;
    setPropertyRulePropertyName(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, text: string): Promise<boolean>;
    setKeyframeKey(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, text: string): Promise<boolean>;
    startCoverage(): Promise<Protocol.ProtocolResponseWithError>;
    takeCoverageDelta(): Promise<{
        timestamp: number;
        coverage: Protocol.CSS.RuleUsage[];
    }>;
    setLocalFontsEnabled(enabled: boolean): Promise<Protocol.ProtocolResponseWithError>;
    stopCoverage(): Promise<void>;
    getMediaQueries(): Promise<CSSMedia[]>;
    getRootLayer(nodeId: Protocol.DOM.NodeId): Promise<Protocol.CSS.CSSLayerData>;
    isEnabled(): boolean;
    private enable;
    getAnimatedStylesForNode(nodeId: Protocol.DOM.NodeId): Promise<Protocol.CSS.GetAnimatedStylesForNodeResponse | null>;
    getMatchedStyles(nodeId: Protocol.DOM.NodeId): Promise<CSSMatchedStyles | null>;
    getClassNames(styleSheetId: Protocol.DOM.StyleSheetId): Promise<string[]>;
    getComputedStyle(nodeId: Protocol.DOM.NodeId): Promise<Map<string, string> | null>;
    getComputedStyleExtraFields(nodeId: Protocol.DOM.NodeId): Promise<Protocol.CSS.ComputedStyleExtraFields>;
    getLayoutPropertiesFromComputedStyle(nodeId: Protocol.DOM.NodeId): Promise<LayoutProperties | null>;
    getEnvironmentVariables(): Promise<Record<string, string>>;
    getBackgroundColors(nodeId: Protocol.DOM.NodeId): Promise<ContrastInfo | null>;
    getPlatformFonts(nodeId: Protocol.DOM.NodeId): Promise<Protocol.CSS.PlatformFontUsage[] | null>;
    allStyleSheets(): CSSStyleSheetHeader[];
    getInlineStyles(nodeId: Protocol.DOM.NodeId): Promise<InlineStyleResult | null>;
    forceStartingStyle(node: DOMNode, forced: boolean): boolean;
    forcePositionTryOption(node: DOMNode, index?: number): boolean;
    forcedPositionTryOption(node: DOMNode): number | undefined;
    forcePseudoState(node: DOMNode, pseudoClass: string, enable: boolean): boolean;
    pseudoState(node: DOMNode): string[] | null;
    setMediaText(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, newMediaText: string): Promise<boolean>;
    setContainerQueryText(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, newContainerQueryText: string): Promise<boolean>;
    setContainerQueryConditionText(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, newContainerQueryConditionText: string): Promise<boolean>;
    setSupportsText(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, newSupportsText: string): Promise<boolean>;
    setNavigationText(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, newNavigationText: string): Promise<boolean>;
    setScopeText(styleSheetId: Protocol.DOM.StyleSheetId, range: TextUtils.TextRange.TextRange, newScopeText: string): Promise<boolean>;
    addRule(styleSheetId: Protocol.DOM.StyleSheetId, ruleText: string, ruleLocation: TextUtils.TextRange.TextRange): Promise<CSSStyleRule | null>;
    requestViaInspectorStylesheet(maybeFrameId?: Protocol.Page.FrameId | null): Promise<CSSStyleSheetHeader | null>;
    createInspectorStylesheet(frameId: Protocol.Page.FrameId, force?: boolean): Promise<CSSStyleSheetHeader | null>;
    mediaQueryResultChanged(): void;
    fontsUpdated(fontFace?: Protocol.CSS.FontFace | null): void;
    fontFaces(): CSSFontFace[];
    fontFaceForSource(src: string): CSSFontFace | undefined;
    styleSheetHeaderForId(id: Protocol.DOM.StyleSheetId): CSSStyleSheetHeader | null;
    styleSheetHeaders(): CSSStyleSheetHeader[];
    fireStyleSheetChanged(styleSheetId: Protocol.DOM.StyleSheetId, edit?: Edit): void;
    private ensureOriginalStyleSheetText;
    private originalContentRequestedForTest;
    originalStyleSheetText(header: CSSStyleSheetHeader): Promise<string | null>;
    getAllStyleSheetHeaders(): Iterable<CSSStyleSheetHeader>;
    computedStyleUpdated(nodeId: Protocol.DOM.NodeId): void;
    styleSheetAdded(header: Protocol.CSS.CSSStyleSheetHeader): void;
    styleSheetRemoved(id: Protocol.DOM.StyleSheetId): void;
    getStyleSheetIdsForURL(url: Platform.DevToolsPath.UrlString): Protocol.DOM.StyleSheetId[];
    setStyleSheetText(styleSheetId: Protocol.DOM.StyleSheetId, newText: string, majorChange: boolean): Promise<string | null>;
    getStyleSheetText(styleSheetId: Protocol.DOM.StyleSheetId): Promise<string | null>;
    private onPrimaryPageChanged;
    private resetStyleSheets;
    private resetFontFaces;
    suspendModel(): Promise<void>;
    resumeModel(): Promise<void>;
    setEffectivePropertyValueForNode(nodeId: Protocol.DOM.NodeId, propertyName: string, value: string): void;
    cachedMatchedCascadeForNode(node: DOMNode): Promise<CSSMatchedStyles | null>;
    discardCachedMatchedCascade(): void;
    createCSSPropertyTracker(propertiesToTrack: Protocol.CSS.CSSComputedStyleProperty[]): CSSPropertyTracker;
    enableCSSPropertyTracker(cssPropertyTracker: CSSPropertyTracker): void;
    disableCSSPropertyTracker(): void;
    private pollComputedStyleUpdates;
    dispose(): void;
    getAgent(): ProtocolProxyApi.CSSApi;
}
export declare enum Events {
    FontsUpdated = "FontsUpdated",
    MediaQueryResultChanged = "MediaQueryResultChanged",
    ModelWasEnabled = "ModelWasEnabled",
    ModelDisposed = "ModelDisposed",
    PositionTryOptionForced = "PositionTryOptionForced",
    PseudoStateForced = "PseudoStateForced",
    StartingStylesStateForced = "StartingStylesStateForced",
    StyleSheetAdded = "StyleSheetAdded",
    StyleSheetChanged = "StyleSheetChanged",
    StyleSheetRemoved = "StyleSheetRemoved",
    ComputedStyleUpdated = "ComputedStyleUpdated"
}
export interface StyleSheetChangedEvent {
    styleSheetId: Protocol.DOM.StyleSheetId;
    edit?: Edit;
}
export interface PseudoStateForcedEvent {
    node: DOMNode;
    pseudoClass: string;
    enable: boolean;
}
export interface ComputedStyleUpdatedEvent {
    nodeId: Protocol.DOM.NodeId;
}
export interface EventTypes {
    [Events.FontsUpdated]: void;
    [Events.MediaQueryResultChanged]: void;
    [Events.ModelWasEnabled]: void;
    [Events.ModelDisposed]: CSSModel;
    [Events.PositionTryOptionForced]: DOMNode;
    [Events.PseudoStateForced]: PseudoStateForcedEvent;
    [Events.StartingStylesStateForced]: DOMNode;
    [Events.StyleSheetAdded]: CSSStyleSheetHeader;
    [Events.StyleSheetChanged]: StyleSheetChangedEvent;
    [Events.StyleSheetRemoved]: CSSStyleSheetHeader;
    [Events.ComputedStyleUpdated]: ComputedStyleUpdatedEvent;
}
export declare class Edit {
    styleSheetId: string;
    oldRange: TextUtils.TextRange.TextRange;
    newRange: TextUtils.TextRange.TextRange;
    newText: string;
    payload: Object | null;
    constructor(styleSheetId: string, oldRange: TextUtils.TextRange.TextRange, newText: string, payload: Object | null);
}
export { CSSLocation };
export declare class InlineStyleResult {
    inlineStyle: CSSStyleDeclaration | null;
    attributesStyle: CSSStyleDeclaration | null;
    constructor(inlineStyle: CSSStyleDeclaration | null, attributesStyle: CSSStyleDeclaration | null);
}
export declare class CSSPropertyTracker extends Common.ObjectWrapper.ObjectWrapper<CSSPropertyTrackerEventTypes> {
    #private;
    constructor(cssModel: CSSModel, propertiesToTrack: Protocol.CSS.CSSComputedStyleProperty[]);
    start(): void;
    stop(): void;
    getTrackedProperties(): Protocol.CSS.CSSComputedStyleProperty[];
}
export declare const enum CSSPropertyTrackerEvents {
    TRACKED_CSS_PROPERTIES_UPDATED = "TrackedCSSPropertiesUpdated"
}
export interface CSSPropertyTrackerEventTypes {
    [CSSPropertyTrackerEvents.TRACKED_CSS_PROPERTIES_UPDATED]: Array<DOMNode | null>;
}
export interface ContrastInfo {
    backgroundColors: string[] | null;
    computedFontSize: string;
    computedFontWeight: string;
}
