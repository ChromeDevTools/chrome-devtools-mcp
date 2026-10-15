// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import { DebuggerModel, Events as DebuggerModelEvents } from './DebuggerModel.js';
import { DeferredDOMNode, DOMModel, DOMNodeEvents, Events as DOMModelEvents } from './DOMModel.js';
import { OverlayPersistentHighlighter } from './OverlayPersistentHighlighter.js';
import { SDKModel } from './SDKModel.js';
import { apcaSettingDescriptor, disablePausedStateOverlaySettingDescriptor, showAdHighlightsSettingDescriptor, showDebugBordersSettingDescriptor, showFPSCounterSettingDescriptor, showLayoutShiftRegionsSettingDescriptor, showMetricsRulersSettingDescriptor, showPaintRectsSettingDescriptor, showScrollBottleneckRectsSettingDescriptor, } from './SDKSettings.js';
const UIStrings = {
    /**
     * @description Overlay message indicating that execution is paused in the debugger.
     */
    pausedInDebugger: 'Paused in debugger',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/OverlayModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const platformOverlayDimensions = {
    mac: { x: 85, y: 0, width: 185, height: 40 },
    linux: { x: 0, y: 0, width: 196, height: 34 },
    windows: { x: 0, y: 0, width: 238, height: 33 },
};
export class OverlayModel extends SDKModel {
    #domModel;
    overlayAgent;
    #debuggerModel;
    #inspectModeEnabled = false;
    #hideHighlightTimeout;
    #defaultHighlighter;
    #highlighter;
    #showPaintRectsSetting;
    #showLayoutShiftRegionsSetting;
    #showAdHighlightsSetting;
    #showDebugBordersSetting;
    #showFPSCounterSetting;
    #showScrollBottleneckRectsSetting;
    #registeredListeners = [];
    #showViewportSizeOnResize = true;
    #persistentHighlighter;
    #sourceOrderHighlighter;
    #sourceOrderModeActive = false;
    #windowControls;
    constructor(target) {
        super(target);
        this.#domModel = target.model(DOMModel);
        target.registerOverlayDispatcher(this);
        this.overlayAgent = target.overlayAgent();
        const settings = this.target().targetManager().settings;
        this.#debuggerModel = target.model(DebuggerModel);
        if (this.#debuggerModel) {
            settings.resolve(disablePausedStateOverlaySettingDescriptor)
                .addChangeListener(this.updatePausedInDebuggerMessage, this);
            this.#debuggerModel.addEventListener(DebuggerModelEvents.DebuggerPaused, this.updatePausedInDebuggerMessage, this);
            this.#debuggerModel.addEventListener(DebuggerModelEvents.DebuggerResumed, this.updatePausedInDebuggerMessage, this);
            // TODO(dgozman): we should get DebuggerResumed on navigations instead of listening to GlobalObjectCleared.
            this.#debuggerModel.addEventListener(DebuggerModelEvents.GlobalObjectCleared, this.updatePausedInDebuggerMessage, this);
        }
        this.#defaultHighlighter = new DefaultHighlighter(this);
        this.#highlighter = this.#defaultHighlighter;
        this.#showPaintRectsSetting = settings.resolve(showPaintRectsSettingDescriptor);
        this.#showLayoutShiftRegionsSetting = settings.resolve(showLayoutShiftRegionsSettingDescriptor);
        this.#showAdHighlightsSetting = settings.resolve(showAdHighlightsSettingDescriptor);
        this.#showDebugBordersSetting = settings.resolve(showDebugBordersSettingDescriptor);
        this.#showFPSCounterSetting = settings.resolve(showFPSCounterSettingDescriptor);
        this.#showScrollBottleneckRectsSetting = settings.resolve(showScrollBottleneckRectsSettingDescriptor);
        if (!target.suspended()) {
            void this.overlayAgent.invoke_enable();
            void this.wireAgentToSettings();
        }
        this.#persistentHighlighter = new OverlayPersistentHighlighter(this, settings, {
            onGridOverlayStateChanged: ({ nodeId, enabled }) => {
                this.#domModel.nodeForId(nodeId)?.dispatchEventToListeners(DOMNodeEvents.GRID_OVERLAY_STATE_CHANGED, { enabled });
                this.dispatchEventToListeners("PersistentGridOverlayStateChanged" /* Events.PERSISTENT_GRID_OVERLAY_STATE_CHANGED */, { nodeId, enabled });
            },
            onFlexOverlayStateChanged: ({ nodeId, enabled }) => {
                this.#domModel.nodeForId(nodeId)?.dispatchEventToListeners(DOMNodeEvents.FLEX_CONTAINER_OVERLAY_STATE_CHANGED, { enabled });
                this.dispatchEventToListeners("PersistentFlexContainerOverlayStateChanged" /* Events.PERSISTENT_FLEX_CONTAINER_OVERLAY_STATE_CHANGED */, { nodeId, enabled });
            },
            onContainerQueryOverlayStateChanged: ({ nodeId, enabled }) => {
                this.#domModel.nodeForId(nodeId)?.dispatchEventToListeners(DOMNodeEvents.CONTAINER_QUERY_OVERLAY_STATE_CHANGED, { enabled });
                this.dispatchEventToListeners("PersistentContainerQueryOverlayStateChanged" /* Events.PERSISTENT_CONTAINER_QUERY_OVERLAY_STATE_CHANGED */, { nodeId, enabled });
            },
            onScrollSnapOverlayStateChanged: ({ nodeId, enabled }) => {
                this.#domModel.nodeForId(nodeId)?.dispatchEventToListeners(DOMNodeEvents.SCROLL_SNAP_OVERLAY_STATE_CHANGED, { enabled });
                this.dispatchEventToListeners("PersistentScrollSnapOverlayStateChanged" /* Events.PERSISTENT_SCROLL_SNAP_OVERLAY_STATE_CHANGED */, { nodeId, enabled });
            },
        });
        this.#domModel.addEventListener(DOMModelEvents.NodeRemoved, () => {
            if (!this.#persistentHighlighter) {
                return;
            }
            this.#persistentHighlighter.refreshHighlights();
        });
        this.#domModel.addEventListener(DOMModelEvents.DocumentUpdated, () => {
            if (!this.#persistentHighlighter) {
                return;
            }
            // Hide all the overlays initially after document update
            this.#persistentHighlighter.hideAllInOverlayWithoutSave();
            if (!target.suspended()) {
                void this.#persistentHighlighter.restoreHighlightsForDocument();
            }
        });
        this.#sourceOrderHighlighter = new SourceOrderHighlighter(this);
        this.#windowControls = new WindowControls(this.#domModel.cssModel());
    }
    static highlightObjectAsDOMNode(object) {
        const domModel = object.runtimeModel().target().model(DOMModel);
        if (domModel) {
            domModel.overlayModel().highlightInOverlay({ object, selectorList: undefined });
        }
    }
    static hideDOMNodeHighlight(targetManager) {
        for (const overlayModel of targetManager.models(OverlayModel)) {
            overlayModel.delayedHideHighlight(0);
        }
    }
    static async muteHighlight(targetManager) {
        return await Promise.all(targetManager.models(OverlayModel).map(model => model.suspendModel()));
    }
    static async unmuteHighlight(targetManager) {
        return await Promise.all(targetManager.models(OverlayModel).map(model => model.resumeModel()));
    }
    static highlightRect(rect, targetManager) {
        for (const overlayModel of targetManager.models(OverlayModel)) {
            void overlayModel.highlightRect(rect);
        }
    }
    static clearHighlight(targetManager) {
        for (const overlayModel of targetManager.models(OverlayModel)) {
            void overlayModel.clearHighlight();
        }
    }
    getDOMModel() {
        return this.#domModel;
    }
    highlightRect({ x, y, width, height, color, outlineColor }) {
        const highlightColor = color || { r: 255, g: 0, b: 255, a: 0.3 };
        const highlightOutlineColor = outlineColor || { r: 255, g: 0, b: 255, a: 0.5 };
        return this.overlayAgent.invoke_highlightRect({ x, y, width, height, color: highlightColor, outlineColor: highlightOutlineColor });
    }
    clearHighlight() {
        return this.overlayAgent.invoke_hideHighlight();
    }
    async wireAgentToSettings() {
        this.#registeredListeners = [
            this.#showPaintRectsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowPaintRects({ result: this.#showPaintRectsSetting.get() })),
            this.#showLayoutShiftRegionsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowLayoutShiftRegions({ result: this.#showLayoutShiftRegionsSetting.get() })),
            this.#showAdHighlightsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowAdHighlights({ show: this.#showAdHighlightsSetting.get() })),
            this.#showDebugBordersSetting.addChangeListener(() => this.overlayAgent.invoke_setShowDebugBorders({ show: this.#showDebugBordersSetting.get() })),
            this.#showFPSCounterSetting.addChangeListener(() => this.overlayAgent.invoke_setShowFPSCounter({ show: this.#showFPSCounterSetting.get() })),
            this.#showScrollBottleneckRectsSetting.addChangeListener(() => this.overlayAgent.invoke_setShowScrollBottleneckRects({ show: this.#showScrollBottleneckRectsSetting.get() })),
        ];
        if (this.#showPaintRectsSetting.get()) {
            void this.overlayAgent.invoke_setShowPaintRects({ result: true });
        }
        if (this.#showLayoutShiftRegionsSetting.get()) {
            void this.overlayAgent.invoke_setShowLayoutShiftRegions({ result: true });
        }
        if (this.#showAdHighlightsSetting.get()) {
            void this.overlayAgent.invoke_setShowAdHighlights({ show: true });
        }
        if (this.#showDebugBordersSetting.get()) {
            void this.overlayAgent.invoke_setShowDebugBorders({ show: true });
        }
        if (this.#showFPSCounterSetting.get()) {
            void this.overlayAgent.invoke_setShowFPSCounter({ show: true });
        }
        if (this.#showScrollBottleneckRectsSetting.get()) {
            void this.overlayAgent.invoke_setShowScrollBottleneckRects({ show: true });
        }
        if (this.#debuggerModel && this.#debuggerModel.isPaused()) {
            this.updatePausedInDebuggerMessage();
        }
        await this.overlayAgent.invoke_setShowViewportSizeOnResize({ show: this.#showViewportSizeOnResize });
        this.#persistentHighlighter?.resetOverlay();
    }
    async suspendModel() {
        Common.EventTarget.removeEventListeners(this.#registeredListeners);
        await this.overlayAgent.invoke_disable();
    }
    async resumeModel() {
        await Promise.all([this.overlayAgent.invoke_enable(), this.wireAgentToSettings()]);
    }
    setShowViewportSizeOnResize(show) {
        if (this.#showViewportSizeOnResize === show) {
            return;
        }
        this.#showViewportSizeOnResize = show;
        if (this.target().suspended()) {
            return;
        }
        void this.overlayAgent.invoke_setShowViewportSizeOnResize({ show });
    }
    updatePausedInDebuggerMessage() {
        if (this.target().suspended()) {
            return;
        }
        const settings = this.target().targetManager().settings;
        const message = this.#debuggerModel && this.#debuggerModel.isPaused() &&
            !settings.resolve(disablePausedStateOverlaySettingDescriptor).get() ?
            i18nString(UIStrings.pausedInDebugger) :
            undefined;
        void this.overlayAgent.invoke_setPausedInDebuggerMessage({ message });
    }
    setHighlighter(highlighter) {
        this.#highlighter = highlighter || this.#defaultHighlighter;
    }
    async setInspectMode(mode, showDetailedTooltip = true) {
        await this.#domModel.requestDocument();
        this.#inspectModeEnabled = mode !== "none" /* Protocol.Overlay.InspectMode.None */;
        this.dispatchEventToListeners("InspectModeWillBeToggled" /* Events.INSPECT_MODE_WILL_BE_TOGGLED */, this);
        void this.#highlighter.setInspectMode(mode, this.buildHighlightConfig('all', showDetailedTooltip));
    }
    inspectModeEnabled() {
        return this.#inspectModeEnabled;
    }
    highlightInOverlay(data, mode, showInfo) {
        if (this.#sourceOrderModeActive) {
            // Return early if the source order is currently being shown the in the
            // overlay, so that it is not cleared by the highlight
            return;
        }
        clearTimeout(this.#hideHighlightTimeout);
        this.#hideHighlightTimeout = undefined;
        const highlightConfig = this.buildHighlightConfig(mode);
        if (typeof showInfo !== 'undefined') {
            highlightConfig.showInfo = showInfo;
        }
        this.#highlighter.highlightInOverlay(data, highlightConfig);
    }
    highlightInOverlayForTwoSeconds(data) {
        this.highlightInOverlay(data);
        this.delayedHideHighlight(2000);
    }
    highlightGridInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightGridInOverlay(nodeId);
    }
    isHighlightedGridInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isGridHighlighted(nodeId);
    }
    hideGridInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideGridInOverlay(nodeId);
    }
    highlightScrollSnapInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightScrollSnapInOverlay(nodeId);
    }
    isHighlightedScrollSnapInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isScrollSnapHighlighted(nodeId);
    }
    hideScrollSnapInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideScrollSnapInOverlay(nodeId);
    }
    highlightFlexContainerInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightFlexInOverlay(nodeId);
    }
    isHighlightedFlexContainerInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isFlexHighlighted(nodeId);
    }
    hideFlexContainerInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideFlexInOverlay(nodeId);
    }
    highlightContainerQueryInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.highlightContainerQueryInOverlay(nodeId);
    }
    isHighlightedContainerQueryInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return false;
        }
        return this.#persistentHighlighter.isContainerQueryHighlighted(nodeId);
    }
    hideContainerQueryInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return;
        }
        this.#persistentHighlighter.hideContainerQueryInOverlay(nodeId);
    }
    highlightSourceOrderInOverlay(node) {
        const sourceOrderConfig = {
            parentOutlineColor: Common.Color.SourceOrderHighlight.ParentOutline.toProtocolRGBA(),
            childOutlineColor: Common.Color.SourceOrderHighlight.ChildOutline.toProtocolRGBA(),
        };
        this.#sourceOrderHighlighter.highlightSourceOrderInOverlay(node, sourceOrderConfig);
    }
    colorOfGridInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return null;
        }
        return this.#persistentHighlighter.colorOfGrid(nodeId).asString("hex" /* Common.Color.Format.HEX */);
    }
    setColorOfGridInPersistentOverlay(nodeId, colorStr) {
        if (!this.#persistentHighlighter) {
            return;
        }
        const color = Common.Color.parse(colorStr);
        if (!color) {
            return;
        }
        this.#persistentHighlighter.setColorOfGrid(nodeId, color);
        this.#persistentHighlighter.resetOverlay();
    }
    colorOfFlexInPersistentOverlay(nodeId) {
        if (!this.#persistentHighlighter) {
            return null;
        }
        return this.#persistentHighlighter.colorOfFlex(nodeId).asString("hex" /* Common.Color.Format.HEX */);
    }
    setColorOfFlexInPersistentOverlay(nodeId, colorStr) {
        if (!this.#persistentHighlighter) {
            return;
        }
        const color = Common.Color.parse(colorStr);
        if (!color) {
            return;
        }
        this.#persistentHighlighter.setColorOfFlex(nodeId, color);
        this.#persistentHighlighter.resetOverlay();
    }
    hideSourceOrderInOverlay() {
        this.#sourceOrderHighlighter.hideSourceOrderHighlight();
    }
    setSourceOrderActive(isActive) {
        this.#sourceOrderModeActive = isActive;
    }
    delayedHideHighlight(delay) {
        clearTimeout(this.#hideHighlightTimeout);
        this.#hideHighlightTimeout = globalThis.setTimeout(() => this.highlightInOverlay({ clear: true }), delay);
    }
    highlightFrame(frameId) {
        clearTimeout(this.#hideHighlightTimeout);
        this.#hideHighlightTimeout = undefined;
        this.#highlighter.highlightFrame(frameId);
    }
    showHingeForDualScreen(hinge) {
        if (hinge) {
            const { x, y, width, height, contentColor, outlineColor } = hinge;
            void this.overlayAgent.invoke_setShowHinge({
                hingeConfig: { rect: { x, y, width, height }, contentColor, outlineColor },
            });
        }
        else {
            void this.overlayAgent.invoke_setShowHinge({});
        }
    }
    showDisplayCutout(cutout) {
        if (cutout) {
            const { x, y, width, height, shape, contentColor } = cutout;
            const displayCutoutConfig = {
                rect: { x, y, width, height },
                shape,
                contentColor,
            };
            if (shape === "pill" /* Protocol.Overlay.DisplayCutoutShape.Pill */) {
                displayCutoutConfig.borderRadius = cutout.borderRadius;
            }
            else if (shape === "notch" /* Protocol.Overlay.DisplayCutoutShape.Notch */) {
                displayCutoutConfig.upperRadius = cutout.upperRadius;
                displayCutoutConfig.lowerRadius = cutout.lowerRadius;
            }
            else if (shape === "circle" /* Protocol.Overlay.DisplayCutoutShape.Circle */) {
                displayCutoutConfig.cx = cutout.cx;
                displayCutoutConfig.cy = cutout.cy;
                displayCutoutConfig.radius = cutout.radius;
            }
            void this.overlayAgent.invoke_setShowDisplayCutout({
                displayCutoutConfig,
            });
        }
        else {
            void this.overlayAgent.invoke_setShowDisplayCutout({});
        }
    }
    setWindowControlsPlatform(selectedPlatform) {
        this.#windowControls.selectedPlatform = selectedPlatform;
    }
    setWindowControlsThemeColor(themeColor) {
        this.#windowControls.themeColor = themeColor;
    }
    getWindowControlsConfig() {
        return this.#windowControls.config;
    }
    async toggleWindowControlsToolbar(show) {
        const wcoConfigObj = show ? { windowControlsOverlayConfig: this.#windowControls.config } : {};
        const setWindowControlsOverlayOperation = this.overlayAgent.invoke_setShowWindowControlsOverlay(wcoConfigObj);
        const toggleStylesheetOperation = this.#windowControls.toggleEmulatedOverlay(show);
        await Promise.all([setWindowControlsOverlayOperation, toggleStylesheetOperation]);
        this.setShowViewportSizeOnResize(!show);
    }
    buildHighlightConfig(mode = 'all', showDetailedToolip = false) {
        const settings = this.target().targetManager().settings;
        const showRulers = settings.resolve(showMetricsRulersSettingDescriptor).get();
        const highlightConfig = {
            showInfo: mode === 'all' || mode === 'container-outline',
            showRulers,
            showStyles: showDetailedToolip,
            showAccessibilityInfo: showDetailedToolip,
            showExtensionLines: showRulers,
            gridHighlightConfig: {},
            flexContainerHighlightConfig: {},
            flexItemHighlightConfig: {},
            contrastAlgorithm: settings.resolve(apcaSettingDescriptor).get() ? "apca" /* Protocol.Overlay.ContrastAlgorithm.Apca */ : "aa" /* Protocol.Overlay.ContrastAlgorithm.Aa */,
        };
        if (mode === 'all' || mode === 'content') {
            highlightConfig.contentColor = Common.Color.PageHighlight.Content.toProtocolRGBA();
        }
        if (mode === 'all' || mode === 'padding') {
            highlightConfig.paddingColor = Common.Color.PageHighlight.Padding.toProtocolRGBA();
        }
        if (mode === 'all' || mode === 'border') {
            highlightConfig.borderColor = Common.Color.PageHighlight.Border.toProtocolRGBA();
        }
        if (mode === 'all' || mode === 'margin') {
            highlightConfig.marginColor = Common.Color.PageHighlight.Margin.toProtocolRGBA();
        }
        if (mode === 'all') {
            highlightConfig.eventTargetColor = Common.Color.PageHighlight.EventTarget.toProtocolRGBA();
            highlightConfig.shapeColor = Common.Color.PageHighlight.Shape.toProtocolRGBA();
            highlightConfig.shapeMarginColor = Common.Color.PageHighlight.ShapeMargin.toProtocolRGBA();
            highlightConfig.gridHighlightConfig = {
                rowGapColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                rowHatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                columnGapColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                columnHatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                rowLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                columnLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                rowLineDash: true,
                columnLineDash: true,
            };
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
                },
                itemSeparator: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dotted" /* Protocol.Overlay.LineStylePattern.Dotted */,
                },
                lineSeparator: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
                },
                mainDistributedSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
                crossDistributedSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
                rowGapSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
                columnGapSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
            };
            highlightConfig.flexItemHighlightConfig = {
                baseSizeBox: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                },
                baseSizeBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dotted" /* Protocol.Overlay.LineStylePattern.Dotted */,
                },
                flexibilityArrow: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                },
            };
            highlightConfig.imcbHighlightConfig = {
                imcbBorderColor: Common.Color.PageHighlight.AnchorIMCB.toProtocolRGBA(),
                imcbBackgroundColor: Common.Color.PageHighlight.AnchorIMCBBackground.toProtocolRGBA(),
                insetsBackgroundColor: Common.Color.PageHighlight.AnchorInsetsBackground.toProtocolRGBA(),
                insetsHatchColor: Common.Color.PageHighlight.AnchorInsetsHatch.toProtocolRGBA(),
                anchorBorderColor: Common.Color.PageHighlight.AnchorTarget.toProtocolRGBA(),
                anchorBackgroundColor: Common.Color.PageHighlight.AnchorTargetBackground.toProtocolRGBA(),
                showPositionAreaGrid: true,
                positionAreaGridLineColor: Common.Color.PageHighlight.AnchorTarget.toProtocolRGBA(),
                positionAreaActiveRegionColor: Common.Color.PageHighlight.AnchorTargetBackground.toProtocolRGBA(),
            };
        }
        if (mode.endsWith('gap')) {
            highlightConfig.gridHighlightConfig = {
                gridBorderColor: Common.Color.PageHighlight.GridBorder.toProtocolRGBA(),
                gridBorderDash: true,
            };
            if (mode === 'gap' || mode === 'row-gap') {
                highlightConfig.gridHighlightConfig.rowGapColor = Common.Color.PageHighlight.GapBackground.toProtocolRGBA();
                highlightConfig.gridHighlightConfig.rowHatchColor = Common.Color.PageHighlight.GapHatch.toProtocolRGBA();
            }
            if (mode === 'gap' || mode === 'column-gap') {
                highlightConfig.gridHighlightConfig.columnGapColor = Common.Color.PageHighlight.GapBackground.toProtocolRGBA();
                highlightConfig.gridHighlightConfig.columnHatchColor = Common.Color.PageHighlight.GapHatch.toProtocolRGBA();
            }
        }
        if (mode.endsWith('gap')) {
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
                },
            };
            if (mode === 'gap' || mode === 'row-gap') {
                highlightConfig.flexContainerHighlightConfig.rowGapSpace = {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                };
            }
            if (mode === 'gap' || mode === 'column-gap') {
                highlightConfig.flexContainerHighlightConfig.columnGapSpace = {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                };
            }
        }
        if (mode === 'grid-areas') {
            highlightConfig.gridHighlightConfig = {
                rowLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                columnLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                rowLineDash: true,
                columnLineDash: true,
                showAreaNames: true,
                areaBorderColor: Common.Color.PageHighlight.GridAreaBorder.toProtocolRGBA(),
            };
        }
        if (mode === 'grid-template-columns') {
            highlightConfig.contentColor = Common.Color.PageHighlight.Content.toProtocolRGBA();
            highlightConfig.gridHighlightConfig = {
                columnLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                columnLineDash: true,
            };
        }
        if (mode === 'grid-template-rows') {
            highlightConfig.contentColor = Common.Color.PageHighlight.Content.toProtocolRGBA();
            highlightConfig.gridHighlightConfig = {
                rowLineColor: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                rowLineDash: true,
            };
        }
        if (mode === 'justify-content') {
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
                },
                mainDistributedSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
            };
        }
        if (mode === 'align-content') {
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
                },
                crossDistributedSpace: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                    fillColor: Common.Color.PageHighlight.GapBackground.toProtocolRGBA(),
                },
            };
        }
        if (mode === 'align-items') {
            highlightConfig.flexContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
                },
                lineSeparator: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
                },
                crossAlignment: { color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA() },
            };
        }
        if (mode === 'flexibility') {
            highlightConfig.flexItemHighlightConfig = {
                baseSizeBox: {
                    hatchColor: Common.Color.PageHighlight.GapHatch.toProtocolRGBA(),
                },
                baseSizeBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dotted" /* Protocol.Overlay.LineStylePattern.Dotted */,
                },
                flexibilityArrow: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                },
            };
        }
        if (mode === 'container-outline') {
            highlightConfig.containerQueryContainerHighlightConfig = {
                containerBorder: {
                    color: Common.Color.PageHighlight.LayoutLine.toProtocolRGBA(),
                    pattern: "dashed" /* Protocol.Overlay.LineStylePattern.Dashed */,
                },
            };
        }
        const baseImcbHighlightConfig = {
            imcbBorderColor: Common.Color.PageHighlight.AnchorIMCB.toProtocolRGBA(),
            imcbBackgroundColor: Common.Color.PageHighlight.AnchorIMCBBackground.toProtocolRGBA(),
            anchorBorderColor: Common.Color.PageHighlight.AnchorTarget.toProtocolRGBA(),
            anchorBackgroundColor: Common.Color.PageHighlight.AnchorTargetBackground.toProtocolRGBA(),
        };
        if (mode === 'anchor-positioning') {
            highlightConfig.imcbHighlightConfig = {
                ...baseImcbHighlightConfig,
                insetsBackgroundColor: Common.Color.PageHighlight.AnchorInsetsBackground.toProtocolRGBA(),
                insetsHatchColor: Common.Color.PageHighlight.AnchorInsetsHatch.toProtocolRGBA(),
                showPositionAreaGrid: true,
                positionAreaGridLineColor: Common.Color.PageHighlight.AnchorTarget.toProtocolRGBA(),
                positionAreaActiveRegionColor: Common.Color.PageHighlight.AnchorTargetBackground.toProtocolRGBA(),
            };
        }
        if (mode === 'position-area') {
            highlightConfig.imcbHighlightConfig = {
                ...baseImcbHighlightConfig,
                showPositionAreaGrid: true,
                positionAreaGridLineColor: Common.Color.PageHighlight.AnchorTarget.toProtocolRGBA(),
                positionAreaActiveRegionColor: Common.Color.PageHighlight.AnchorTargetBackground.toProtocolRGBA(),
            };
        }
        if (mode === 'insets') {
            highlightConfig.imcbHighlightConfig = {
                ...baseImcbHighlightConfig,
                insetsBackgroundColor: Common.Color.PageHighlight.AnchorInsetsBackground.toProtocolRGBA(),
                insetsHatchColor: Common.Color.PageHighlight.AnchorInsetsHatch.toProtocolRGBA(),
            };
        }
        return highlightConfig;
    }
    nodeHighlightRequested({ nodeId }) {
        const node = this.#domModel.nodeForId(nodeId);
        if (node) {
            this.dispatchEventToListeners("HighlightNodeRequested" /* Events.HIGHLIGHT_NODE_REQUESTED */, node);
        }
    }
    static setInspectNodeHandler(handler) {
        OverlayModel.inspectNodeHandler = handler;
    }
    inspectNodeRequested({ backendNodeId }) {
        const deferredNode = new DeferredDOMNode(this.target(), backendNodeId);
        if (OverlayModel.inspectNodeHandler) {
            void deferredNode.resolvePromise().then(node => {
                if (node && OverlayModel.inspectNodeHandler) {
                    void OverlayModel.inspectNodeHandler(node);
                }
            });
        }
        else {
            void Common.Revealer.reveal(deferredNode);
        }
        this.dispatchEventToListeners("InspectModeExited" /* Events.EXITED_INSPECT_MODE */);
    }
    screenshotRequested({ viewport }) {
        this.dispatchEventToListeners("ScreenshotRequested" /* Events.SCREENSHOT_REQUESTED */, viewport);
        this.dispatchEventToListeners("InspectModeExited" /* Events.EXITED_INSPECT_MODE */);
    }
    inspectModeCanceled() {
        this.dispatchEventToListeners("InspectModeExited" /* Events.EXITED_INSPECT_MODE */);
    }
    static inspectNodeHandler = null;
    getOverlayAgent() {
        return this.overlayAgent;
    }
    async hasStyleSheetText(url) {
        return await this.#windowControls.initializeStyleSheetText(url);
    }
    inspectPanelShowRequested({ backendNodeId }) {
        this.dispatchEventToListeners("InspectPanelShowRequested" /* Events.INSPECT_PANEL_SHOW_REQUESTED */, backendNodeId);
    }
    inspectedElementWindowRestored({ backendNodeId }) {
        this.dispatchEventToListeners("InspectedElementWindowRestored" /* Events.INSPECTED_ELEMENT_WINDOW_RESTORED */, backendNodeId);
    }
}
export class WindowControls {
    #cssModel;
    #originalStylesheetText;
    #stylesheetId;
    #currentUrl;
    #config = {
        showCSS: false,
        selectedPlatform: "Windows" /* EmulatedOSType.WINDOWS */,
        themeColor: '#ffffff',
    };
    constructor(cssModel) {
        this.#cssModel = cssModel;
    }
    get selectedPlatform() {
        return this.#config.selectedPlatform;
    }
    set selectedPlatform(osType) {
        this.#config.selectedPlatform = osType;
    }
    get themeColor() {
        return this.#config.themeColor;
    }
    set themeColor(color) {
        this.#config.themeColor = color;
    }
    get config() {
        return this.#config;
    }
    async initializeStyleSheetText(url) {
        if (this.#originalStylesheetText && url === this.#currentUrl) {
            return true;
        }
        const cssSourceUrl = this.#fetchCssSourceUrl(url);
        if (!cssSourceUrl) {
            return false;
        }
        this.#stylesheetId = this.#fetchCurrentStyleSheet(cssSourceUrl);
        if (!this.#stylesheetId) {
            return false;
        }
        const stylesheetText = await this.#cssModel.getStyleSheetText(this.#stylesheetId);
        if (!stylesheetText) {
            return false;
        }
        this.#originalStylesheetText = stylesheetText;
        this.#currentUrl = url;
        return true;
    }
    async toggleEmulatedOverlay(showOverlay) {
        if (!this.#stylesheetId || !this.#originalStylesheetText) {
            return;
        }
        if (showOverlay) {
            const styleSheetText = WindowControls.#getStyleSheetForPlatform(this.#config.selectedPlatform.toLowerCase(), this.#originalStylesheetText);
            if (styleSheetText) {
                await this.#cssModel.setStyleSheetText(this.#stylesheetId, styleSheetText, false);
            }
        }
        else {
            // Restore the original stylesheet
            await this.#cssModel.setStyleSheetText(this.#stylesheetId, this.#originalStylesheetText, false);
        }
    }
    static #getStyleSheetForPlatform(platform, originalStyleSheet) {
        const overlayDimensions = platformOverlayDimensions[platform];
        return WindowControls.#transformStyleSheet(overlayDimensions.x, overlayDimensions.y, overlayDimensions.width, overlayDimensions.height, originalStyleSheet);
    }
    #fetchCssSourceUrl(url) {
        const parentURL = Common.ParsedURL.ParsedURL.extractOrigin(url);
        const cssHeaders = this.#cssModel.styleSheetHeaders();
        const header = cssHeaders.find(header => header.sourceURL && header.sourceURL.includes(parentURL));
        return header?.sourceURL;
    }
    #fetchCurrentStyleSheet(cssSourceUrl) {
        const stylesheetIds = this.#cssModel.getStyleSheetIdsForURL(cssSourceUrl);
        return stylesheetIds.length > 0 ? stylesheetIds[0] : undefined;
    }
    // The primary objective of this function is to adjust certain CSS environment variables within the existing stylesheet
    // and provide it as the style sheet for the emulated overlay.
    static #transformStyleSheet(x, y, width, height, originalStyleSheet) {
        if (!originalStyleSheet) {
            return undefined;
        }
        const stylesheetText = originalStyleSheet;
        const updatedStylesheet = stylesheetText.replace(/: env\(titlebar-area-x(?:,[^)]*)?\);/g, `: env(titlebar-area-x, ${x}px);`)
            .replace(/: env\(titlebar-area-y(?:,[^)]*)?\);/g, `: env(titlebar-area-y, ${y}px);`)
            .replace(/: env\(titlebar-area-width(?:,[^)]*)?\);/g, `: env(titlebar-area-width, calc(100% - ${width}px));`)
            .replace(/: env\(titlebar-area-height(?:,[^)]*)?\);/g, `: env(titlebar-area-height, ${height}px);`);
        return updatedStylesheet;
    }
    transformStyleSheetforTesting(x, y, width, height, originalStyleSheet) {
        return WindowControls.#transformStyleSheet(x, y, width, height, originalStyleSheet);
    }
}
class DefaultHighlighter {
    #model;
    constructor(model) {
        this.#model = model;
    }
    highlightInOverlay(data, highlightConfig) {
        const { node, deferredNode, object, selectorList } = { node: undefined, deferredNode: undefined, object: undefined, selectorList: undefined, ...data };
        const nodeId = node ? node.id : undefined;
        const backendNodeId = deferredNode ? deferredNode.backendNodeId() : undefined;
        const objectId = object ? object.objectId : undefined;
        if (nodeId || backendNodeId || objectId) {
            void this.#model.target().overlayAgent().invoke_highlightNode({ highlightConfig, nodeId, backendNodeId, objectId, selector: selectorList });
        }
        else {
            void this.#model.target().overlayAgent().invoke_hideHighlight();
        }
    }
    async setInspectMode(mode, highlightConfig) {
        await this.#model.target().overlayAgent().invoke_setInspectMode({ mode, highlightConfig });
    }
    highlightFrame(frameId) {
        void this.#model.target().overlayAgent().invoke_highlightFrame({
            frameId,
            contentColor: Common.Color.PageHighlight.Content.toProtocolRGBA(),
            contentOutlineColor: Common.Color.PageHighlight.ContentOutline.toProtocolRGBA(),
        });
    }
}
export class SourceOrderHighlighter {
    #model;
    constructor(model) {
        this.#model = model;
    }
    highlightSourceOrderInOverlay(node, sourceOrderConfig) {
        this.#model.setSourceOrderActive(true);
        this.#model.setShowViewportSizeOnResize(false);
        void this.#model.getOverlayAgent().invoke_highlightSourceOrder({ sourceOrderConfig, nodeId: node.id });
    }
    hideSourceOrderHighlight() {
        this.#model.setSourceOrderActive(false);
        this.#model.setShowViewportSizeOnResize(true);
        void this.#model.clearHighlight();
    }
}
SDKModel.register(OverlayModel, { capabilities: 2 /* Capability.DOM */, autostart: true });
//# sourceMappingURL=OverlayModel.js.map