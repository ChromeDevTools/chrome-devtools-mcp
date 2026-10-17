// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import { OverlayColorGenerator } from './OverlayColorGenerator.js';
import { extendGridLinesSettingDescriptor, showGridAreasSettingDescriptor, showGridLineLabelsSettingDescriptor, showGridTrackSizesSettingDescriptor, } from './SDKSettings.js';
export class OverlayPersistentHighlighter {
    #model;
    #colors = new Map();
    #persistentHighlightSetting;
    #gridHighlights = new Map();
    #scrollSnapHighlights = new Map();
    #flexHighlights = new Map();
    #containerQueryHighlights = new Map();
    #isolatedElementHighlights = new Map();
    #gridColorGenerator = new OverlayColorGenerator();
    #flexColorGenerator = new OverlayColorGenerator();
    /**
     * @see `front_end/core/sdk/sdk-meta.ts`
     */
    #showGridLineLabelsSetting;
    #extendGridLinesSetting;
    #showGridAreasSetting;
    #showGridTrackSizesSetting;
    #callbacks;
    constructor(model, settings, callbacks) {
        this.#model = model;
        this.#callbacks = callbacks;
        this.#persistentHighlightSetting =
            settings.createLocalSetting('persistent-highlight-setting', []);
        this.#showGridLineLabelsSetting = settings.resolve(showGridLineLabelsSettingDescriptor);
        this.#extendGridLinesSetting = settings.resolve(extendGridLinesSettingDescriptor);
        this.#showGridAreasSetting = settings.resolve(showGridAreasSettingDescriptor);
        this.#showGridTrackSizesSetting = settings.resolve(showGridTrackSizesSettingDescriptor);
        this.#showGridLineLabelsSetting.addChangeListener(this.onSettingChange, this);
        this.#extendGridLinesSetting.addChangeListener(this.onSettingChange, this);
        this.#showGridAreasSetting.addChangeListener(this.onSettingChange, this);
        this.#showGridTrackSizesSetting.addChangeListener(this.onSettingChange, this);
    }
    onSettingChange() {
        this.resetOverlay();
    }
    buildGridHighlightConfig(nodeId) {
        const mainColor = this.colorOfGrid(nodeId).asLegacyColor();
        const background = mainColor.setAlpha(0.1).asLegacyColor();
        const gapBackground = mainColor.setAlpha(0.3).asLegacyColor();
        const gapHatch = mainColor.setAlpha(0.8).asLegacyColor();
        const showGridExtensionLines = this.#extendGridLinesSetting.get();
        const showPositiveLineNumbers = this.#showGridLineLabelsSetting.get() === 'lineNumbers';
        const showNegativeLineNumbers = showPositiveLineNumbers;
        const showLineNames = this.#showGridLineLabelsSetting.get() === 'lineNames';
        return {
            rowGapColor: gapBackground.toProtocolRGBA(),
            rowHatchColor: gapHatch.toProtocolRGBA(),
            columnGapColor: gapBackground.toProtocolRGBA(),
            columnHatchColor: gapHatch.toProtocolRGBA(),
            gridBorderColor: mainColor.toProtocolRGBA(),
            gridBorderDash: false,
            rowLineColor: mainColor.toProtocolRGBA(),
            columnLineColor: mainColor.toProtocolRGBA(),
            rowLineDash: true,
            columnLineDash: true,
            showGridExtensionLines,
            showPositiveLineNumbers,
            showNegativeLineNumbers,
            showLineNames,
            showAreaNames: this.#showGridAreasSetting.get(),
            showTrackSizes: this.#showGridTrackSizesSetting.get(),
            areaBorderColor: mainColor.toProtocolRGBA(),
            gridBackgroundColor: background.toProtocolRGBA(),
        };
    }
    buildFlexContainerHighlightConfig(nodeId) {
        const mainColor = this.colorOfFlex(nodeId).asLegacyColor();
        return {
            containerBorder: { color: mainColor.toProtocolRGBA(), pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */ },
            itemSeparator: { color: mainColor.toProtocolRGBA(), pattern: "dotted" /* Protocol.Overlay.LineStylePattern.Dotted */ },
            lineSeparator: { color: mainColor.toProtocolRGBA(), pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */ },
            mainDistributedSpace: { hatchColor: mainColor.toProtocolRGBA() },
            crossDistributedSpace: { hatchColor: mainColor.toProtocolRGBA() },
        };
    }
    buildScrollSnapContainerHighlightConfig(_nodeId) {
        return {
            snapAreaBorder: {
                color: Common.Color.PageHighlight.GridBorder.toProtocolRGBA(),
                pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
            },
            snapportBorder: { color: Common.Color.PageHighlight.GridBorder.toProtocolRGBA() },
            scrollMarginColor: Common.Color.PageHighlight.Margin.toProtocolRGBA(),
            scrollPaddingColor: Common.Color.PageHighlight.Padding.toProtocolRGBA(),
        };
    }
    highlightGridInOverlay(nodeId) {
        this.#gridHighlights.set(nodeId, this.buildGridHighlightConfig(nodeId));
        this.updateHighlightsInOverlay();
        this.savePersistentHighlightSetting();
        this.#callbacks.onGridOverlayStateChanged({ nodeId, enabled: true });
    }
    isGridHighlighted(nodeId) {
        return this.#gridHighlights.has(nodeId);
    }
    colorOfGrid(nodeId) {
        let color = this.#colors.get(nodeId);
        if (!color) {
            color = this.#gridColorGenerator.next();
            this.#colors.set(nodeId, color);
        }
        return color;
    }
    setColorOfGrid(nodeId, color) {
        this.#colors.set(nodeId, color);
    }
    hideGridInOverlay(nodeId) {
        if (this.#gridHighlights.has(nodeId)) {
            this.#gridHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
            this.savePersistentHighlightSetting();
            this.#callbacks.onGridOverlayStateChanged({ nodeId, enabled: false });
        }
    }
    highlightScrollSnapInOverlay(nodeId) {
        this.#scrollSnapHighlights.set(nodeId, this.buildScrollSnapContainerHighlightConfig(nodeId));
        this.updateHighlightsInOverlay();
        this.#callbacks.onScrollSnapOverlayStateChanged({ nodeId, enabled: true });
        this.savePersistentHighlightSetting();
    }
    isScrollSnapHighlighted(nodeId) {
        return this.#scrollSnapHighlights.has(nodeId);
    }
    hideScrollSnapInOverlay(nodeId) {
        if (this.#scrollSnapHighlights.has(nodeId)) {
            this.#scrollSnapHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
            this.#callbacks.onScrollSnapOverlayStateChanged({ nodeId, enabled: false });
            this.savePersistentHighlightSetting();
        }
    }
    highlightFlexInOverlay(nodeId) {
        this.#flexHighlights.set(nodeId, this.buildFlexContainerHighlightConfig(nodeId));
        this.updateHighlightsInOverlay();
        this.savePersistentHighlightSetting();
        this.#callbacks.onFlexOverlayStateChanged({ nodeId, enabled: true });
    }
    isFlexHighlighted(nodeId) {
        return this.#flexHighlights.has(nodeId);
    }
    colorOfFlex(nodeId) {
        let color = this.#colors.get(nodeId);
        if (!color) {
            color = this.#flexColorGenerator.next();
            this.#colors.set(nodeId, color);
        }
        return color;
    }
    setColorOfFlex(nodeId, color) {
        this.#colors.set(nodeId, color);
    }
    hideFlexInOverlay(nodeId) {
        if (this.#flexHighlights.has(nodeId)) {
            this.#flexHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
            this.savePersistentHighlightSetting();
            this.#callbacks.onFlexOverlayStateChanged({ nodeId, enabled: false });
        }
    }
    highlightContainerQueryInOverlay(nodeId) {
        this.#containerQueryHighlights.set(nodeId, this.buildContainerQueryContainerHighlightConfig());
        this.updateHighlightsInOverlay();
        this.savePersistentHighlightSetting();
        this.#callbacks.onContainerQueryOverlayStateChanged({ nodeId, enabled: true });
    }
    hideContainerQueryInOverlay(nodeId) {
        if (this.#containerQueryHighlights.has(nodeId)) {
            this.#containerQueryHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
            this.savePersistentHighlightSetting();
            this.#callbacks.onContainerQueryOverlayStateChanged({ nodeId, enabled: false });
        }
    }
    isContainerQueryHighlighted(nodeId) {
        return this.#containerQueryHighlights.has(nodeId);
    }
    buildContainerQueryContainerHighlightConfig() {
        return {
            containerBorder: {
                color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
            },
            descendantBorder: {
                color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
            },
        };
    }
    highlightIsolatedElementInOverlay(nodeId) {
        this.#isolatedElementHighlights.set(nodeId, this.buildIsolationModeHighlightConfig());
        this.updateHighlightsInOverlay();
        this.savePersistentHighlightSetting();
    }
    hideIsolatedElementInOverlay(nodeId) {
        if (this.#isolatedElementHighlights.has(nodeId)) {
            this.#isolatedElementHighlights.delete(nodeId);
            this.updateHighlightsInOverlay();
            this.savePersistentHighlightSetting();
        }
    }
    isIsolatedElementHighlighted(nodeId) {
        return this.#isolatedElementHighlights.has(nodeId);
    }
    buildIsolationModeHighlightConfig() {
        return {
            resizerColor: Common.Color.IsolationModeHighlight.Resizer.toProtocolRGBA(),
            resizerHandleColor: Common.Color.IsolationModeHighlight.ResizerHandle.toProtocolRGBA(),
            maskColor: Common.Color.IsolationModeHighlight.Mask.toProtocolRGBA(),
        };
    }
    hideAllInOverlayWithoutSave() {
        this.#flexHighlights.clear();
        this.#gridHighlights.clear();
        this.#scrollSnapHighlights.clear();
        this.#containerQueryHighlights.clear();
        this.#isolatedElementHighlights.clear();
        this.updateHighlightsInOverlay();
    }
    refreshHighlights() {
        const gridsNeedUpdate = this.updateHighlightsForDeletedNodes(this.#gridHighlights);
        const flexboxesNeedUpdate = this.updateHighlightsForDeletedNodes(this.#flexHighlights);
        const scrollSnapsNeedUpdate = this.updateHighlightsForDeletedNodes(this.#scrollSnapHighlights);
        const containerQueriesNeedUpdate = this.updateHighlightsForDeletedNodes(this.#containerQueryHighlights);
        const isolatedElementsNeedUpdate = this.updateHighlightsForDeletedNodes(this.#isolatedElementHighlights);
        if (flexboxesNeedUpdate || gridsNeedUpdate || scrollSnapsNeedUpdate || containerQueriesNeedUpdate ||
            isolatedElementsNeedUpdate) {
            this.updateHighlightsInOverlay();
            this.savePersistentHighlightSetting();
        }
    }
    updateHighlightsForDeletedNodes(highlights) {
        let needsUpdate = false;
        for (const nodeId of highlights.keys()) {
            if (this.#model.getDOMModel().nodeForId(nodeId) === null) {
                highlights.delete(nodeId);
                needsUpdate = true;
            }
        }
        return needsUpdate;
    }
    resetOverlay() {
        for (const nodeId of this.#gridHighlights.keys()) {
            this.#gridHighlights.set(nodeId, this.buildGridHighlightConfig(nodeId));
        }
        for (const nodeId of this.#flexHighlights.keys()) {
            this.#flexHighlights.set(nodeId, this.buildFlexContainerHighlightConfig(nodeId));
        }
        for (const nodeId of this.#scrollSnapHighlights.keys()) {
            this.#scrollSnapHighlights.set(nodeId, this.buildScrollSnapContainerHighlightConfig(nodeId));
        }
        for (const nodeId of this.#containerQueryHighlights.keys()) {
            this.#containerQueryHighlights.set(nodeId, this.buildContainerQueryContainerHighlightConfig());
        }
        for (const nodeId of this.#isolatedElementHighlights.keys()) {
            this.#isolatedElementHighlights.set(nodeId, this.buildIsolationModeHighlightConfig());
        }
        this.updateHighlightsInOverlay();
    }
    updateHighlightsInOverlay() {
        const hasNodesToHighlight = this.#gridHighlights.size > 0 || this.#flexHighlights.size > 0 ||
            this.#containerQueryHighlights.size > 0 || this.#isolatedElementHighlights.size > 0;
        this.#model.setShowViewportSizeOnResize(!hasNodesToHighlight);
        this.updateGridHighlightsInOverlay();
        this.updateFlexHighlightsInOverlay();
        this.updateScrollSnapHighlightsInOverlay();
        this.updateContainerQueryHighlightsInOverlay();
        this.updateIsolatedElementHighlightsInOverlay();
    }
    updateGridHighlightsInOverlay() {
        const overlayModel = this.#model;
        const gridNodeHighlightConfigs = [];
        for (const [nodeId, gridHighlightConfig] of this.#gridHighlights.entries()) {
            gridNodeHighlightConfigs.push({ nodeId, gridHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowGridOverlays({ gridNodeHighlightConfigs });
    }
    updateFlexHighlightsInOverlay() {
        const overlayModel = this.#model;
        const flexNodeHighlightConfigs = [];
        for (const [nodeId, flexContainerHighlightConfig] of this.#flexHighlights.entries()) {
            flexNodeHighlightConfigs.push({ nodeId, flexContainerHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowFlexOverlays({ flexNodeHighlightConfigs });
    }
    updateScrollSnapHighlightsInOverlay() {
        const overlayModel = this.#model;
        const scrollSnapHighlightConfigs = [];
        for (const [nodeId, scrollSnapContainerHighlightConfig] of this.#scrollSnapHighlights.entries()) {
            scrollSnapHighlightConfigs.push({ nodeId, scrollSnapContainerHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowScrollSnapOverlays({ scrollSnapHighlightConfigs });
    }
    updateContainerQueryHighlightsInOverlay() {
        const overlayModel = this.#model;
        const containerQueryHighlightConfigs = [];
        for (const [nodeId, containerQueryContainerHighlightConfig] of this.#containerQueryHighlights.entries()) {
            containerQueryHighlightConfigs.push({ nodeId, containerQueryContainerHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowContainerQueryOverlays({ containerQueryHighlightConfigs });
    }
    updateIsolatedElementHighlightsInOverlay() {
        const overlayModel = this.#model;
        const isolatedElementHighlightConfigs = [];
        for (const [nodeId, isolationModeHighlightConfig] of this.#isolatedElementHighlights.entries()) {
            isolatedElementHighlightConfigs.push({ nodeId, isolationModeHighlightConfig });
        }
        overlayModel.target().overlayAgent().invoke_setShowIsolatedElements({ isolatedElementHighlightConfigs });
    }
    async restoreHighlightsForDocument() {
        this.#flexHighlights = new Map();
        this.#gridHighlights = new Map();
        this.#scrollSnapHighlights = new Map();
        this.#containerQueryHighlights = new Map();
        this.#isolatedElementHighlights = new Map();
        // this.currentURL() is empty when the page is reloaded because the
        // new document has not been requested yet and the old one has been
        // removed. Therefore, we need to request the document and wait for it.
        // Note that requestDocument() caches the document so that it is requested
        // only once.
        const document = await this.#model.getDOMModel().requestDocument();
        const currentURL = document ? document.documentURL : Platform.DevToolsPath.EmptyUrlString;
        await Promise.all(this.#persistentHighlightSetting.get().map(async (persistentHighlight) => {
            if (persistentHighlight.url === currentURL) {
                return await this.#model.getDOMModel().pushNodeByPathToFrontend(persistentHighlight.path).then(nodeId => {
                    const node = this.#model.getDOMModel().nodeForId(nodeId);
                    if (!node) {
                        return;
                    }
                    switch (persistentHighlight.type) {
                        case "GRID" /* HighlightType.GRID */:
                            this.#gridHighlights.set(node.id, this.buildGridHighlightConfig(node.id));
                            this.#callbacks.onGridOverlayStateChanged({ nodeId: node.id, enabled: true });
                            break;
                        case "FLEX" /* HighlightType.FLEX */:
                            this.#flexHighlights.set(node.id, this.buildFlexContainerHighlightConfig(node.id));
                            this.#callbacks.onFlexOverlayStateChanged({ nodeId: node.id, enabled: true });
                            break;
                        case "CONTAINER_QUERY" /* HighlightType.CONTAINER_QUERY */:
                            this.#containerQueryHighlights.set(node.id, this.buildContainerQueryContainerHighlightConfig());
                            this.#callbacks.onContainerQueryOverlayStateChanged({ nodeId: node.id, enabled: true });
                            break;
                        case "SCROLL_SNAP" /* HighlightType.SCROLL_SNAP */:
                            this.#scrollSnapHighlights.set(node.id, this.buildScrollSnapContainerHighlightConfig(node.id));
                            this.#callbacks.onScrollSnapOverlayStateChanged({ nodeId: node.id, enabled: true });
                            break;
                        case "ISOLATED_ELEMENT" /* HighlightType.ISOLATED_ELEMENT */:
                            this.#isolatedElementHighlights.set(node.id, this.buildIsolationModeHighlightConfig());
                            break;
                    }
                });
            }
        }));
        this.updateHighlightsInOverlay();
    }
    currentUrl() {
        const domDocument = this.#model.getDOMModel().existingDocument();
        return domDocument ? domDocument.documentURL : Platform.DevToolsPath.EmptyUrlString;
    }
    getPersistentHighlightSettingForOneType(highlights, type) {
        const persistentHighlights = [];
        for (const nodeId of highlights.keys()) {
            const node = this.#model.getDOMModel().nodeForId(nodeId);
            if (node) {
                persistentHighlights.push({ url: this.currentUrl(), path: node.path(), type });
            }
        }
        return persistentHighlights;
    }
    savePersistentHighlightSetting() {
        const currentURL = this.currentUrl();
        // Keep the highlights that are not related to this document.
        const highlightsInOtherDocuments = this.#persistentHighlightSetting.get().filter((persistentSetting) => persistentSetting.url !== currentURL);
        const persistentHighlights = [
            ...highlightsInOtherDocuments,
            ...this.getPersistentHighlightSettingForOneType(this.#gridHighlights, "GRID" /* HighlightType.GRID */),
            ...this.getPersistentHighlightSettingForOneType(this.#flexHighlights, "FLEX" /* HighlightType.FLEX */),
            ...this.getPersistentHighlightSettingForOneType(this.#containerQueryHighlights, "CONTAINER_QUERY" /* HighlightType.CONTAINER_QUERY */),
            ...this.getPersistentHighlightSettingForOneType(this.#scrollSnapHighlights, "SCROLL_SNAP" /* HighlightType.SCROLL_SNAP */),
            ...this.getPersistentHighlightSettingForOneType(this.#isolatedElementHighlights, "ISOLATED_ELEMENT" /* HighlightType.ISOLATED_ELEMENT */),
        ];
        this.#persistentHighlightSetting.set(persistentHighlights);
    }
}
//# sourceMappingURL=OverlayPersistentHighlighter.js.map