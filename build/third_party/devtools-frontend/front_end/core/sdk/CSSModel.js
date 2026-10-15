// Copyright 2010 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { CSSFontFace } from './CSSFontFace.js';
import { CSSLocation } from './CSSLocation.js';
import { CSSMatchedStyles } from './CSSMatchedStyles.js';
import { CSSMedia } from './CSSMedia.js';
import { cssMetadata } from './CSSMetadata.js';
import { CSSStyleRule } from './CSSRule.js';
import { CSSStyleDeclaration, Type } from './CSSStyleDeclaration.js';
import { CSSStyleSheetHeader } from './CSSStyleSheetHeader.js';
import { DOMModel } from './DOMModel.js';
import { Events as ResourceTreeModelEvents, ResourceTreeModel, } from './ResourceTreeModel.js';
import { SDKModel } from './SDKModel.js';
import { cssSourceMapsEnabledSettingDescriptor } from './SDKSettings.js';
import { SourceMapManager } from './SourceMapManager.js';
function isAnchorPositioned(computedStyle, matchedStyles) {
    const position = computedStyle.get('position');
    if (position !== 'absolute' && position !== 'fixed') {
        return false;
    }
    const positionAnchor = computedStyle.get('position-anchor');
    if (positionAnchor && positionAnchor !== 'none') {
        return true;
    }
    const positionArea = computedStyle.get('position-area');
    if (positionArea && positionArea !== 'none') {
        return true;
    }
    const anchorProperties = [
        'top',
        'right',
        'bottom',
        'left',
        'inset',
        'inset-block',
        'inset-inline',
        'inset-block-start',
        'inset-block-end',
        'inset-inline-start',
        'inset-inline-end',
        'width',
        'height',
        'min-width',
        'min-height',
        'max-width',
        'max-height',
    ];
    if (anchorProperties.some(prop => {
        const val = computedStyle.get(prop);
        return Boolean(val && (val.includes('anchor(') || val.includes('anchor-size(')));
    })) {
        return true;
    }
    if (matchedStyles) {
        for (const style of matchedStyles.nodeStyles()) {
            for (const property of style.allProperties()) {
                if (!property.activeInStyle() || !matchedStyles.propertyState(property)) {
                    continue;
                }
                if (property.value.includes('anchor(') || property.value.includes('anchor-size(')) {
                    return true;
                }
            }
        }
    }
    return false;
}
export class CSSModel extends SDKModel {
    agent;
    #domModel;
    #fontFaces = new Map();
    #originalStyleSheetText = new Map();
    #resourceTreeModel;
    #sourceMapManager;
    #styleLoader;
    #stylePollingThrottler = new Common.Throttler.Throttler(StylePollingInterval);
    #styleSheetIdsForURL = new Map();
    #styleSheetIdToHeader = new Map();
    #cachedMatchedCascadeNode = null;
    #cachedMatchedCascadePromise = null;
    #cssPropertyTracker = null;
    #isCSSPropertyTrackingEnabled = false;
    #isEnabled = false;
    #isRuleUsageTrackingEnabled = false;
    #isTrackingRequestPending = false;
    #colorScheme;
    constructor(target) {
        super(target);
        this.#domModel = target.model(DOMModel);
        this.#sourceMapManager = new SourceMapManager(target);
        this.agent = target.cssAgent();
        this.#styleLoader = new ComputedStyleLoader(this);
        this.#resourceTreeModel = target.model(ResourceTreeModel);
        if (this.#resourceTreeModel) {
            this.#resourceTreeModel.addEventListener(ResourceTreeModelEvents.PrimaryPageChanged, this.onPrimaryPageChanged, this);
        }
        target.registerCSSDispatcher(new CSSDispatcher(this));
        if (!target.suspended()) {
            void this.enable();
        }
        const settings = this.target().targetManager().settings;
        this.#sourceMapManager.setEnabled(settings.resolve(cssSourceMapsEnabledSettingDescriptor).get());
        settings.resolve(cssSourceMapsEnabledSettingDescriptor)
            .addChangeListener(event => this.#sourceMapManager.setEnabled(event.data));
    }
    async colorScheme() {
        if (!this.#colorScheme) {
            const colorSchemeResponse = await this.domModel()?.target().runtimeAgent().invoke_evaluate({ expression: 'window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches' });
            if (colorSchemeResponse && !colorSchemeResponse.exceptionDetails && !colorSchemeResponse.getError()) {
                this.#colorScheme = colorSchemeResponse.result.value ? "dark" /* ColorScheme.DARK */ : "light" /* ColorScheme.LIGHT */;
            }
        }
        return this.#colorScheme;
    }
    async resolveValues(propertyName, nodeId, ...values) {
        if (propertyName && cssMetadata().getLonghands(propertyName)?.length) {
            return null;
        }
        const response = await this.agent.invoke_resolveValues({ values, nodeId, propertyName });
        if (response.getError()) {
            return null;
        }
        return response.results;
    }
    headersForSourceURL(sourceURL) {
        const headers = [];
        for (const headerId of this.getStyleSheetIdsForURL(sourceURL)) {
            const header = this.styleSheetHeaderForId(headerId);
            if (header) {
                headers.push(header);
            }
        }
        return headers;
    }
    createRawLocationsByURL(sourceURL, lineNumber, columnNumber = 0) {
        const headers = this.headersForSourceURL(sourceURL);
        headers.sort(stylesheetComparator);
        const endIndex = Platform.ArrayUtilities.upperBound(headers, undefined, (_, header) => lineNumber - header.startLine || columnNumber - header.startColumn);
        if (!endIndex) {
            return [];
        }
        const locations = [];
        const last = headers[endIndex - 1];
        for (let index = endIndex - 1; index >= 0 && headers[index].startLine === last.startLine && headers[index].startColumn === last.startColumn; --index) {
            if (headers[index].containsLocation(lineNumber, columnNumber)) {
                locations.push(new CSSLocation(headers[index], lineNumber, columnNumber));
            }
        }
        return locations;
        function stylesheetComparator(a, b) {
            return a.startLine - b.startLine || a.startColumn - b.startColumn || a.id.localeCompare(b.id);
        }
    }
    sourceMapManager() {
        return this.#sourceMapManager;
    }
    static readableLayerName(text) {
        return text || '<anonymous>';
    }
    static trimSourceURL(text) {
        let sourceURLIndex = text.lastIndexOf('/*# sourceURL=');
        if (sourceURLIndex === -1) {
            sourceURLIndex = text.lastIndexOf('/*@ sourceURL=');
            if (sourceURLIndex === -1) {
                return text;
            }
        }
        const sourceURLLineIndex = text.lastIndexOf('\n', sourceURLIndex);
        if (sourceURLLineIndex === -1) {
            return text;
        }
        const sourceURLLine = text.substr(sourceURLLineIndex + 1).split('\n', 1)[0];
        const sourceURLRegex = /[\x20\t]*\/\*[#@] sourceURL=[\x20\t]*([^\s]*)[\x20\t]*\*\/[\x20\t]*$/;
        if (sourceURLLine.search(sourceURLRegex) === -1) {
            return text;
        }
        return text.substr(0, sourceURLLineIndex) + text.substr(sourceURLLineIndex + sourceURLLine.length + 1);
    }
    domModel() {
        return this.#domModel;
    }
    async trackComputedStyleUpdatesForNode(nodeId) {
        await this.agent.invoke_trackComputedStyleUpdatesForNode({ nodeId });
    }
    async setStyleText(styleSheetId, range, text, majorChange) {
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { styles } = await this.agent.invoke_setStyleTexts({ edits: [{ styleSheetId, range: range.serializeToObject(), text }] });
            if (styles?.length !== 1) {
                return false;
            }
            this.#domModel.markUndoableState(!majorChange);
            const edit = new Edit(styleSheetId, range, text, styles[0]);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async setSelectorText(styleSheetId, range, text) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { selectorList } = await this.agent.invoke_setRuleSelector({ styleSheetId, range, selector: text });
            if (!selectorList) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, text, selectorList);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async setPropertyRulePropertyName(styleSheetId, range, text) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { propertyName } = await this.agent.invoke_setPropertyRulePropertyName({ styleSheetId, range, propertyName: text });
            if (!propertyName) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, text, propertyName);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async setKeyframeKey(styleSheetId, range, text) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { keyText } = await this.agent.invoke_setKeyframeKey({ styleSheetId, range, keyText: text });
            if (!keyText) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, text, keyText);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    startCoverage() {
        this.#isRuleUsageTrackingEnabled = true;
        return this.agent.invoke_startRuleUsageTracking();
    }
    async takeCoverageDelta() {
        const r = await this.agent.invoke_takeCoverageDelta();
        const timestamp = (r?.timestamp) || 0;
        const coverage = (r?.coverage) || [];
        return { timestamp, coverage };
    }
    setLocalFontsEnabled(enabled) {
        return this.agent.invoke_setLocalFontsEnabled({
            enabled,
        });
    }
    async stopCoverage() {
        this.#isRuleUsageTrackingEnabled = false;
        await this.agent.invoke_stopRuleUsageTracking();
    }
    async getMediaQueries() {
        const { medias } = await this.agent.invoke_getMediaQueries();
        return medias ? CSSMedia.parseMediaArrayPayload(this, medias) : [];
    }
    async getRootLayer(nodeId) {
        const { rootLayer } = await this.agent.invoke_getLayersForNode({ nodeId });
        return rootLayer;
    }
    isEnabled() {
        return this.#isEnabled;
    }
    async enable() {
        await this.agent.invoke_enable();
        this.#isEnabled = true;
        if (this.#isRuleUsageTrackingEnabled) {
            await this.startCoverage();
        }
        this.dispatchEventToListeners(Events.ModelWasEnabled);
    }
    async getAnimatedStylesForNode(nodeId) {
        const response = await this.agent.invoke_getAnimatedStylesForNode({ nodeId });
        if (response.getError()) {
            return null;
        }
        return response;
    }
    async getMatchedStyles(nodeId) {
        const node = this.#domModel.nodeForId(nodeId);
        if (!node) {
            return null;
        }
        const shouldGetAnimatedStyles = Root.Runtime.hostConfig.devToolsAnimationStylesInStylesTab?.enabled;
        const [matchedStylesResponse, animatedStylesResponse] = await Promise.all([
            this.agent.invoke_getMatchedStylesForNode({ nodeId }),
            shouldGetAnimatedStyles ? this.agent.invoke_getAnimatedStylesForNode({ nodeId }) : undefined,
        ]);
        if (matchedStylesResponse.getError()) {
            return null;
        }
        const payload = {
            cssModel: this,
            node,
            inlinePayload: matchedStylesResponse.inlineStyle || null,
            attributesPayload: matchedStylesResponse.attributesStyle || null,
            matchedPayload: matchedStylesResponse.matchedCSSRules || [],
            pseudoPayload: matchedStylesResponse.pseudoElements || [],
            inheritedPayload: matchedStylesResponse.inherited || [],
            inheritedPseudoPayload: matchedStylesResponse.inheritedPseudoElements || [],
            animationsPayload: matchedStylesResponse.cssKeyframesRules || [],
            parentLayoutNodeId: matchedStylesResponse.parentLayoutNodeId,
            positionTryRules: matchedStylesResponse.cssPositionTryRules || [],
            propertyRules: matchedStylesResponse.cssPropertyRules ?? [],
            functionRules: matchedStylesResponse.cssFunctionRules ?? [],
            cssPropertyRegistrations: matchedStylesResponse.cssPropertyRegistrations ?? [],
            atRules: matchedStylesResponse.cssAtRules ?? [],
            activePositionFallbackIndex: matchedStylesResponse.activePositionFallbackIndex ?? -1,
            animationStylesPayload: animatedStylesResponse?.animationStyles || [],
            inheritedAnimatedPayload: animatedStylesResponse?.inherited || [],
            transitionsStylePayload: animatedStylesResponse?.transitionsStyle || null,
        };
        return await CSSMatchedStyles.create(payload);
    }
    async getClassNames(styleSheetId) {
        const { classNames } = await this.agent.invoke_collectClassNames({ styleSheetId });
        return classNames || [];
    }
    async getComputedStyle(nodeId) {
        if (!this.isEnabled()) {
            await this.enable();
        }
        return await this.#styleLoader.computedStylePromise(nodeId);
    }
    async getComputedStyleExtraFields(nodeId) {
        if (!this.isEnabled()) {
            await this.enable();
        }
        return await this.#styleLoader.extraFieldsPromise(nodeId);
    }
    async getLayoutPropertiesFromComputedStyle(nodeId) {
        const styles = await this.getComputedStyle(nodeId);
        if (!styles) {
            return null;
        }
        const display = styles.get('display');
        const isContents = display === 'contents';
        const isFlex = display === 'flex' || display === 'inline-flex';
        const isGrid = display === 'grid' || display === 'inline-grid';
        const isSubgrid = (isGrid &&
            (styles.get('grid-template-columns')?.startsWith('subgrid') ||
                styles.get('grid-template-rows')?.startsWith('subgrid'))) ??
            false;
        const isGridLanes = display === 'grid-lanes' || display === 'inline-grid-lanes';
        const containerType = styles.get('container-type');
        const isContainer = Boolean(containerType) && containerType !== '' && containerType !== 'normal';
        const hasScroll = Boolean(styles.get('scroll-snap-type')) && styles.get('scroll-snap-type') !== 'none';
        const isAnchored = isAnchorPositioned(styles);
        return {
            isFlex,
            isGrid,
            isSubgrid,
            isGridLanes,
            isContents,
            containerType: isContainer ? containerType : undefined,
            hasScroll,
            isAnchorPositioned: isAnchored,
        };
    }
    async getEnvironmentVariables() {
        const response = await this.agent.invoke_getEnvironmentVariables();
        if (response.getError()) {
            return {};
        }
        return response.environmentVariables;
    }
    async getBackgroundColors(nodeId) {
        const response = await this.agent.invoke_getBackgroundColors({ nodeId });
        if (response.getError()) {
            return null;
        }
        return {
            backgroundColors: response.backgroundColors || null,
            computedFontSize: response.computedFontSize || '',
            computedFontWeight: response.computedFontWeight || '',
        };
    }
    async getPlatformFonts(nodeId) {
        const { fonts } = await this.agent.invoke_getPlatformFontsForNode({ nodeId });
        return fonts;
    }
    allStyleSheets() {
        const values = [...this.#styleSheetIdToHeader.values()];
        function styleSheetComparator(a, b) {
            if (a.sourceURL < b.sourceURL) {
                return -1;
            }
            if (a.sourceURL > b.sourceURL) {
                return 1;
            }
            return a.startLine - b.startLine || a.startColumn - b.startColumn;
        }
        values.sort(styleSheetComparator);
        return values;
    }
    async getInlineStyles(nodeId) {
        const response = await this.agent.invoke_getInlineStylesForNode({ nodeId });
        if (response.getError() || !response.inlineStyle) {
            return null;
        }
        const inlineStyle = new CSSStyleDeclaration(this, null, response.inlineStyle, Type.Inline);
        const attributesStyle = response.attributesStyle ?
            new CSSStyleDeclaration(this, null, response.attributesStyle, Type.Attributes) :
            null;
        return new InlineStyleResult(inlineStyle, attributesStyle);
    }
    forceStartingStyle(node, forced) {
        void this.agent.invoke_forceStartingStyle({ nodeId: node.id, forced });
        this.dispatchEventToListeners(Events.StartingStylesStateForced, node);
        return true;
    }
    forcePositionTryOption(node, index) {
        const currentForcedIndex = node.marker(PositionTryOptionMarker) ?? undefined;
        if (currentForcedIndex === index) {
            return false;
        }
        node.setMarker(PositionTryOptionMarker, index ?? null);
        if (node.id === undefined) {
            return false;
        }
        void this.agent.invoke_forcePositionTryOption({ nodeId: node.id, index });
        this.dispatchEventToListeners(Events.PositionTryOptionForced, node);
        return true;
    }
    forcedPositionTryOption(node) {
        return node.marker(PositionTryOptionMarker) ?? undefined;
    }
    forcePseudoState(node, pseudoClass, enable) {
        const forcedPseudoClasses = node.marker(PseudoStateMarker) || [];
        const hasPseudoClass = forcedPseudoClasses.includes(pseudoClass);
        if (enable) {
            if (hasPseudoClass) {
                return false;
            }
            forcedPseudoClasses.push(pseudoClass);
            node.setMarker(PseudoStateMarker, forcedPseudoClasses);
        }
        else {
            if (!hasPseudoClass) {
                return false;
            }
            Platform.ArrayUtilities.removeElement(forcedPseudoClasses, pseudoClass);
            if (forcedPseudoClasses.length) {
                node.setMarker(PseudoStateMarker, forcedPseudoClasses);
            }
            else {
                node.setMarker(PseudoStateMarker, null);
            }
        }
        if (node.id === undefined) {
            return false;
        }
        void this.agent.invoke_forcePseudoState({ nodeId: node.id, forcedPseudoClasses });
        this.dispatchEventToListeners(Events.PseudoStateForced, { node, pseudoClass, enable });
        return true;
    }
    pseudoState(node) {
        return node.marker(PseudoStateMarker) || [];
    }
    async setMediaText(styleSheetId, range, newMediaText) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { media } = await this.agent.invoke_setMediaText({ styleSheetId, range, text: newMediaText });
            if (!media) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, newMediaText, media);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async setContainerQueryText(styleSheetId, range, newContainerQueryText) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { containerQuery } = await this.agent.invoke_setContainerQueryText({ styleSheetId, range, text: newContainerQueryText });
            if (!containerQuery) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, newContainerQueryText, containerQuery);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async setContainerQueryConditionText(styleSheetId, range, newContainerQueryConditionText) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { containerQuery } = await this.agent.invoke_setContainerQueryConditionText({ styleSheetId, range, text: newContainerQueryConditionText });
            if (!containerQuery) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, newContainerQueryConditionText, containerQuery);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async setSupportsText(styleSheetId, range, newSupportsText) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { supports } = await this.agent.invoke_setSupportsText({ styleSheetId, range, text: newSupportsText });
            if (!supports) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, newSupportsText, supports);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async setNavigationText(styleSheetId, range, newNavigationText) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { navigation } = await this.agent.invoke_setNavigationText({ styleSheetId, range, text: newNavigationText });
            if (!navigation) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, newNavigationText, navigation);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async setScopeText(styleSheetId, range, newScopeText) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { scope } = await this.agent.invoke_setScopeText({ styleSheetId, range, text: newScopeText });
            if (!scope) {
                return false;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, range, newScopeText, scope);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
    async addRule(styleSheetId, ruleText, ruleLocation) {
        try {
            await this.ensureOriginalStyleSheetText(styleSheetId);
            const { rule } = await this.agent.invoke_addRule({ styleSheetId, ruleText, location: ruleLocation });
            if (!rule) {
                return null;
            }
            this.#domModel.markUndoableState();
            const edit = new Edit(styleSheetId, ruleLocation, ruleText, rule);
            this.fireStyleSheetChanged(styleSheetId, edit);
            return new CSSStyleRule(this, rule);
        }
        catch (e) {
            console.error(e);
            return null;
        }
    }
    async requestViaInspectorStylesheet(maybeFrameId) {
        const frameId = maybeFrameId ||
            (this.#resourceTreeModel && this.#resourceTreeModel.mainFrame ? this.#resourceTreeModel.mainFrame.id : null);
        const headers = [...this.#styleSheetIdToHeader.values()];
        const styleSheetHeader = headers.find(header => header.frameId === frameId && header.isViaInspector());
        if (styleSheetHeader) {
            return styleSheetHeader;
        }
        if (!frameId) {
            return null;
        }
        try {
            return await this.createInspectorStylesheet(frameId);
        }
        catch (e) {
            console.error(e);
            return null;
        }
    }
    async createInspectorStylesheet(frameId, force = false) {
        const result = await this.agent.invoke_createStyleSheet({ frameId, force });
        if (result.getError()) {
            throw new Error(result.getError());
        }
        return this.#styleSheetIdToHeader.get(result.styleSheetId) || null;
    }
    mediaQueryResultChanged() {
        this.#colorScheme = undefined;
        this.dispatchEventToListeners(Events.MediaQueryResultChanged);
    }
    fontsUpdated(fontFace) {
        if (fontFace) {
            this.#fontFaces.set(fontFace.src, new CSSFontFace(fontFace));
        }
        this.dispatchEventToListeners(Events.FontsUpdated);
    }
    fontFaces() {
        return [...this.#fontFaces.values()];
    }
    fontFaceForSource(src) {
        return this.#fontFaces.get(src);
    }
    styleSheetHeaderForId(id) {
        return this.#styleSheetIdToHeader.get(id) || null;
    }
    styleSheetHeaders() {
        return [...this.#styleSheetIdToHeader.values()];
    }
    fireStyleSheetChanged(styleSheetId, edit) {
        this.dispatchEventToListeners(Events.StyleSheetChanged, { styleSheetId, edit });
    }
    ensureOriginalStyleSheetText(styleSheetId) {
        const header = this.styleSheetHeaderForId(styleSheetId);
        if (!header) {
            return Promise.resolve(null);
        }
        let promise = this.#originalStyleSheetText.get(header);
        if (!promise) {
            promise = this.getStyleSheetText(header.id);
            this.#originalStyleSheetText.set(header, promise);
            this.originalContentRequestedForTest(header);
        }
        return promise;
    }
    originalContentRequestedForTest(_header) {
    }
    originalStyleSheetText(header) {
        return this.ensureOriginalStyleSheetText(header.id);
    }
    getAllStyleSheetHeaders() {
        return this.#styleSheetIdToHeader.values();
    }
    computedStyleUpdated(nodeId) {
        this.dispatchEventToListeners(Events.ComputedStyleUpdated, { nodeId });
    }
    styleSheetAdded(header) {
        console.assert(!this.#styleSheetIdToHeader.get(header.styleSheetId));
        if (header.loadingFailed) {
            // When the stylesheet fails to load, treat it as a constructed stylesheet. Failed sheets can still be modified
            // from JS, in which case CSS.styleSheetChanged events are sent. So as to not confuse CSSModel clients we don't
            // just discard the failed sheet here. Treating the failed sheet as a constructed stylesheet lets us keep track
            // of it cleanly.
            header.hasSourceURL = false;
            header.isConstructed = true;
            header.isInline = false;
            header.isMutable = false;
            header.sourceURL = '';
            header.sourceMapURL = undefined;
        }
        const styleSheetHeader = new CSSStyleSheetHeader(this, header);
        this.#styleSheetIdToHeader.set(header.styleSheetId, styleSheetHeader);
        const url = styleSheetHeader.resourceURL();
        let frameIdToStyleSheetIds = this.#styleSheetIdsForURL.get(url);
        if (!frameIdToStyleSheetIds) {
            frameIdToStyleSheetIds = new Map();
            this.#styleSheetIdsForURL.set(url, frameIdToStyleSheetIds);
        }
        if (frameIdToStyleSheetIds) {
            let styleSheetIds = frameIdToStyleSheetIds.get(styleSheetHeader.frameId);
            if (!styleSheetIds) {
                styleSheetIds = new Set();
                frameIdToStyleSheetIds.set(styleSheetHeader.frameId, styleSheetIds);
            }
            styleSheetIds.add(styleSheetHeader.id);
        }
        this.#sourceMapManager.attachSourceMap(styleSheetHeader, styleSheetHeader.sourceURL, styleSheetHeader.sourceMapURL, "cdp" /* SourceMapProvenance.CDP */);
        this.dispatchEventToListeners(Events.StyleSheetAdded, styleSheetHeader);
    }
    styleSheetRemoved(id) {
        const header = this.#styleSheetIdToHeader.get(id);
        console.assert(Boolean(header));
        if (!header) {
            return;
        }
        this.#styleSheetIdToHeader.delete(id);
        const url = header.resourceURL();
        const frameIdToStyleSheetIds = this.#styleSheetIdsForURL.get(url);
        console.assert(Boolean(frameIdToStyleSheetIds), 'No frameId to styleSheetId map is available for given style sheet URL.');
        if (frameIdToStyleSheetIds) {
            const stylesheetIds = frameIdToStyleSheetIds.get(header.frameId);
            if (stylesheetIds) {
                stylesheetIds.delete(id);
                if (!stylesheetIds.size) {
                    frameIdToStyleSheetIds.delete(header.frameId);
                    if (!frameIdToStyleSheetIds.size) {
                        this.#styleSheetIdsForURL.delete(url);
                    }
                }
            }
        }
        this.#originalStyleSheetText.delete(header);
        this.#sourceMapManager.detachSourceMap(header);
        this.dispatchEventToListeners(Events.StyleSheetRemoved, header);
    }
    getStyleSheetIdsForURL(url) {
        const frameIdToStyleSheetIds = this.#styleSheetIdsForURL.get(url);
        if (!frameIdToStyleSheetIds) {
            return [];
        }
        const result = [];
        for (const styleSheetIds of frameIdToStyleSheetIds.values()) {
            result.push(...styleSheetIds);
        }
        return result;
    }
    async setStyleSheetText(styleSheetId, newText, majorChange) {
        const header = this.#styleSheetIdToHeader.get(styleSheetId);
        if (!header) {
            return 'Unknown stylesheet in CSS.setStyleSheetText';
        }
        newText = CSSModel.trimSourceURL(newText);
        if (header.hasSourceURL) {
            newText += '\n/*# sourceURL=' + header.sourceURL + ' */';
        }
        await this.ensureOriginalStyleSheetText(styleSheetId);
        const response = await this.agent.invoke_setStyleSheetText({ styleSheetId: header.id, text: newText });
        const sourceMapURL = response.sourceMapURL;
        this.#sourceMapManager.detachSourceMap(header);
        header.setSourceMapURL(sourceMapURL);
        this.#sourceMapManager.attachSourceMap(header, header.sourceURL, header.sourceMapURL, "cdp" /* SourceMapProvenance.CDP */);
        if (sourceMapURL === null) {
            return 'Error in CSS.setStyleSheetText';
        }
        this.#domModel.markUndoableState(!majorChange);
        this.fireStyleSheetChanged(styleSheetId);
        return null;
    }
    async getStyleSheetText(styleSheetId) {
        const response = await this.agent.invoke_getStyleSheetText({ styleSheetId });
        if (response.getError()) {
            return null;
        }
        const { text } = response;
        return text && CSSModel.trimSourceURL(text);
    }
    async onPrimaryPageChanged(event) {
        // If the main frame was restored from the back-forward cache, the order of CDP
        // is different from the regular navigations. In this case, events about CSS
        // stylesheet has already been received and they are mixed with the previous page
        // stylesheets. Therefore, we re-enable the CSS agent to get fresh events.
        // For the regular navigations, we can just clear the local data because events about
        // stylesheets will arrive later.
        if (event.data.frame.backForwardCacheDetails.restoredFromCache) {
            await this.suspendModel();
            await this.resumeModel();
        }
        else if (event.data.type !== "Activation" /* PrimaryPageChangeType.ACTIVATION */) {
            this.resetStyleSheets();
            this.resetFontFaces();
        }
    }
    resetStyleSheets() {
        const headers = [...this.#styleSheetIdToHeader.values()];
        this.#styleSheetIdsForURL.clear();
        this.#styleSheetIdToHeader.clear();
        for (const header of headers) {
            this.#sourceMapManager.detachSourceMap(header);
            this.dispatchEventToListeners(Events.StyleSheetRemoved, header);
        }
    }
    resetFontFaces() {
        this.#fontFaces.clear();
    }
    async suspendModel() {
        this.#isEnabled = false;
        await this.agent.invoke_disable();
        this.resetStyleSheets();
        this.resetFontFaces();
    }
    async resumeModel() {
        return await this.enable();
    }
    setEffectivePropertyValueForNode(nodeId, propertyName, value) {
        void this.agent.invoke_setEffectivePropertyValueForNode({ nodeId, propertyName, value });
    }
    cachedMatchedCascadeForNode(node) {
        if (this.#cachedMatchedCascadeNode !== node) {
            this.discardCachedMatchedCascade();
        }
        this.#cachedMatchedCascadeNode = node;
        if (!this.#cachedMatchedCascadePromise) {
            if (node.id) {
                this.#cachedMatchedCascadePromise = this.getMatchedStyles(node.id);
            }
            else {
                return Promise.resolve(null);
            }
        }
        return this.#cachedMatchedCascadePromise;
    }
    discardCachedMatchedCascade() {
        this.#cachedMatchedCascadeNode = null;
        this.#cachedMatchedCascadePromise = null;
    }
    createCSSPropertyTracker(propertiesToTrack) {
        const cssPropertyTracker = new CSSPropertyTracker(this, propertiesToTrack);
        return cssPropertyTracker;
    }
    enableCSSPropertyTracker(cssPropertyTracker) {
        const propertiesToTrack = cssPropertyTracker.getTrackedProperties();
        if (propertiesToTrack.length === 0) {
            return;
        }
        void this.agent.invoke_trackComputedStyleUpdates({ propertiesToTrack });
        this.#isCSSPropertyTrackingEnabled = true;
        this.#cssPropertyTracker = cssPropertyTracker;
        void this.pollComputedStyleUpdates();
    }
    // Since we only support one tracker at a time, this call effectively disables
    // style tracking.
    disableCSSPropertyTracker() {
        this.#isCSSPropertyTrackingEnabled = false;
        this.#cssPropertyTracker = null;
        // Sending an empty list to the backend signals the close of style tracking
        void this.agent.invoke_trackComputedStyleUpdates({ propertiesToTrack: [] });
    }
    async pollComputedStyleUpdates() {
        if (this.#isTrackingRequestPending) {
            return;
        }
        if (this.#isCSSPropertyTrackingEnabled) {
            this.#isTrackingRequestPending = true;
            const result = await this.agent.invoke_takeComputedStyleUpdates();
            this.#isTrackingRequestPending = false;
            if (result.getError() || !result.nodeIds || !this.#isCSSPropertyTrackingEnabled) {
                return;
            }
            if (this.#cssPropertyTracker) {
                this.#cssPropertyTracker.dispatchEventToListeners("TrackedCSSPropertiesUpdated" /* CSSPropertyTrackerEvents.TRACKED_CSS_PROPERTIES_UPDATED */, result.nodeIds.map(nodeId => this.#domModel.nodeForId(nodeId)));
            }
        }
        if (this.#isCSSPropertyTrackingEnabled) {
            void this.#stylePollingThrottler.schedule(this.pollComputedStyleUpdates.bind(this));
        }
    }
    dispose() {
        this.disableCSSPropertyTracker();
        super.dispose();
        this.dispatchEventToListeners(Events.ModelDisposed, this);
    }
    getAgent() {
        return this.agent;
    }
}
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["FontsUpdated"] = "FontsUpdated";
    Events["MediaQueryResultChanged"] = "MediaQueryResultChanged";
    Events["ModelWasEnabled"] = "ModelWasEnabled";
    Events["ModelDisposed"] = "ModelDisposed";
    Events["PositionTryOptionForced"] = "PositionTryOptionForced";
    Events["PseudoStateForced"] = "PseudoStateForced";
    Events["StartingStylesStateForced"] = "StartingStylesStateForced";
    Events["StyleSheetAdded"] = "StyleSheetAdded";
    Events["StyleSheetChanged"] = "StyleSheetChanged";
    Events["StyleSheetRemoved"] = "StyleSheetRemoved";
    Events["ComputedStyleUpdated"] = "ComputedStyleUpdated";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
const PseudoStateMarker = 'pseudo-state-marker';
const PositionTryOptionMarker = 'position-try-option-marker';
export class Edit {
    styleSheetId;
    oldRange;
    newRange;
    newText;
    payload;
    constructor(styleSheetId, oldRange, newText, payload) {
        this.styleSheetId = styleSheetId;
        this.oldRange = oldRange;
        this.newRange = TextUtils.TextRange.TextRange.fromEdit(oldRange, newText);
        this.newText = newText;
        this.payload = payload;
    }
}
export { CSSLocation };
class CSSDispatcher {
    #cssModel;
    constructor(cssModel) {
        this.#cssModel = cssModel;
    }
    mediaQueryResultChanged() {
        this.#cssModel.mediaQueryResultChanged();
    }
    fontsUpdated({ font }) {
        this.#cssModel.fontsUpdated(font);
    }
    styleSheetChanged({ styleSheetId }) {
        this.#cssModel.fireStyleSheetChanged(styleSheetId);
    }
    styleSheetAdded({ header }) {
        this.#cssModel.styleSheetAdded(header);
    }
    styleSheetRemoved({ styleSheetId }) {
        this.#cssModel.styleSheetRemoved(styleSheetId);
    }
    computedStyleUpdated({ nodeId }) {
        this.#cssModel.computedStyleUpdated(nodeId);
    }
}
class ComputedStyleLoader {
    #cssModel;
    #nodeIdToPromise = new Map();
    constructor(cssModel) {
        this.#cssModel = cssModel;
    }
    #getResponsePromise(nodeId) {
        let promise = this.#nodeIdToPromise.get(nodeId);
        if (promise) {
            return promise;
        }
        promise =
            this.#cssModel.getAgent().invoke_getComputedStyleForNode({ nodeId }).then(({ computedStyle, extraFields }) => {
                this.#nodeIdToPromise.delete(nodeId);
                if (!computedStyle?.length) {
                    return { style: null, extraFields };
                }
                const result = new Map();
                for (const property of computedStyle) {
                    result.set(property.name, property.value);
                }
                return { style: result, extraFields };
            });
        this.#nodeIdToPromise.set(nodeId, promise);
        return promise;
    }
    async computedStylePromise(nodeId) {
        const computedStyleWithExtraFields = await this.#getResponsePromise(nodeId);
        return computedStyleWithExtraFields.style;
    }
    async extraFieldsPromise(nodeId) {
        const computedStyleWithExtraFields = await this.#getResponsePromise(nodeId);
        return computedStyleWithExtraFields.extraFields;
    }
}
export class InlineStyleResult {
    inlineStyle;
    attributesStyle;
    constructor(inlineStyle, attributesStyle) {
        this.inlineStyle = inlineStyle;
        this.attributesStyle = attributesStyle;
    }
}
export class CSSPropertyTracker extends Common.ObjectWrapper.ObjectWrapper {
    #cssModel;
    #properties;
    constructor(cssModel, propertiesToTrack) {
        super();
        this.#cssModel = cssModel;
        this.#properties = propertiesToTrack;
    }
    start() {
        this.#cssModel.enableCSSPropertyTracker(this);
    }
    stop() {
        this.#cssModel.disableCSSPropertyTracker();
    }
    getTrackedProperties() {
        return this.#properties;
    }
}
const StylePollingInterval = 1000; // throttling interval for style polling, in milliseconds
SDKModel.register(CSSModel, { capabilities: 2 /* Capability.DOM */, autostart: true });
//# sourceMappingURL=CSSModel.js.map