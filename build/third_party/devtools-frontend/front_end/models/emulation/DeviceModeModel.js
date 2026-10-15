// Copyright 2015 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import { Horizontal, HorizontalSpanned, Vertical, VerticalSpanned, } from './EmulatedDevices.js';
const UIStrings = {
    /**
     * @description Error message shown on the Devices settings tab when the user enters an empty
     * width for a custom device.
     */
    widthCannotBeEmpty: 'Width can’t be empty',
    /**
     * @description Error message shown on the Devices settings tab when the user enters an invalid
     * width for a custom device.
     */
    widthMustBeANumber: 'Width must be a number',
    /**
     * @description Error message shown on the Devices settings tab when the user has entered a width
     * for a custom device that is too large.
     * @example {9999} PH1
     */
    widthMustBeLessThanOrEqualToS: 'Width must be less than or equal to {PH1}',
    /**
     * @description Error message shown on the Devices settings tab when the user has entered a width
     * for a custom device that is too small.
     * @example {50} PH1
     */
    widthMustBeGreaterThanOrEqualToS: 'Width must be greater than or equal to {PH1}',
    /**
     * @description Error message shown on the Devices settings tab when the user enters an empty
     * height for a custom device.
     */
    heightCannotBeEmpty: 'Height can’t be empty',
    /**
     * @description Error message shown on the Devices settings tab when the user enters an invalid
     * height for a custom device.
     */
    heightMustBeANumber: 'Height must be a number',
    /**
     * @description Error message shown on the Devices settings tab when the user has entered a height
     * for a custom device that is too large.
     * @example {9999} PH1
     */
    heightMustBeLessThanOrEqualToS: 'Height must be less than or equal to {PH1}',
    /**
     * @description Error message shown on the Devices settings tab when the user has entered a height
     * for a custom device that is too small.
     * @example {50} PH1
     */
    heightMustBeGreaterThanOrEqualTo: 'Height must be greater than or equal to {PH1}',
    /**
     * @description Error message shown on the Devices settings tab when the user enters an invalid
     * device pixel ratio for a custom device.
     */
    devicePixelRatioMustBeANumberOr: 'Device pixel ratio must be a number or blank',
    /**
     * @description Error message shown on the Devices settings tab when the user enters a device
     * pixel ratio for a custom device that is too large.
     * @example {10} PH1
     */
    devicePixelRatioMustBeLessThanOr: 'Device pixel ratio must be less than or equal to {PH1}',
    /**
     * @description Error message shown on the Devices settings tab when the user enters a device
     * pixel ratio for a custom device that is too small.
     * @example {0} PH1
     */
    devicePixelRatioMustBeGreater: 'Device pixel ratio must be greater than or equal to {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('models/emulation/DeviceModeModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const CUTOUT_SHAPE_TO_PROTOCOL = {
    ["pill" /* CutoutShape.PILL */]: "pill" /* Protocol.Overlay.DisplayCutoutShape.Pill */,
    ["notch" /* CutoutShape.NOTCH */]: "notch" /* Protocol.Overlay.DisplayCutoutShape.Notch */,
    ["circle" /* CutoutShape.CIRCLE */]: "circle" /* Protocol.Overlay.DisplayCutoutShape.Circle */,
    ["rectangle" /* CutoutShape.RECTANGLE */]: "rectangle" /* Protocol.Overlay.DisplayCutoutShape.Rectangle */,
};
export class DeviceModeModel extends Common.ObjectWrapper.ObjectWrapper {
    #screenRect;
    #visiblePageRect;
    #availableSize;
    #preferredSize;
    #initialized;
    #autoFitScaleOnInitialize;
    #appliedDeviceSize;
    #appliedDeviceScaleFactor;
    #appliedUserAgentType;
    #scaleSetting;
    #scale;
    #autoAdjustScaleSetting;
    #deviceScaleMapSetting;
    #isApplyingDeviceScale = false;
    #widthSetting;
    #heightSetting;
    #uaSetting;
    #deviceScaleFactorSetting;
    #toolbarControlsEnabledSetting;
    #type;
    #device;
    #mode;
    #fitScale;
    #touchEnabled;
    #touchMobile;
    #emulationModel;
    #onModelAvailable;
    #screenOrientationLocked;
    #targetManager;
    #settings;
    #multitargetNetworkManager;
    constructor(targetManager, settings, multitargetNetworkManager) {
        super();
        this.#targetManager = targetManager;
        this.#settings = settings;
        this.#multitargetNetworkManager = multitargetNetworkManager;
        this.#screenRect = new Rect(0, 0, 1, 1);
        this.#visiblePageRect = new Rect(0, 0, 1, 1);
        this.#availableSize = new Platform.Size(1, 1);
        this.#preferredSize = new Platform.Size(1, 1);
        this.#initialized = false;
        this.#autoFitScaleOnInitialize = false;
        this.#appliedDeviceSize = new Platform.Size(1, 1);
        this.#appliedDeviceScaleFactor = Platform.HostRuntime.HOST_RUNTIME.getDevicePixelRatio();
        this.#appliedUserAgentType = "Desktop" /* UA.DESKTOP */;
        this.#scaleSetting = this.#settings.createSetting('emulation.device-scale', 1);
        // We've used to allow zero before.
        if (!this.#scaleSetting.get()) {
            this.#scaleSetting.set(1);
        }
        this.#scaleSetting.addChangeListener(this.scaleSettingChanged, this);
        this.#scale = 1;
        this.#autoAdjustScaleSetting = this.#settings.createSetting('emulation.auto-adjust-scale', true);
        this.#deviceScaleMapSetting = this.#settings.createSetting('emulation.device-scale-map', {});
        this.#scaleSetting.addChangeListener(this.#saveScaleForCurrentDevice, this);
        this.#autoAdjustScaleSetting.addChangeListener(this.#saveScaleForCurrentDevice, this);
        this.#widthSetting = this.#settings.createSetting('emulation.device-width', 400);
        if (this.#widthSetting.get() < MinDeviceSize) {
            this.#widthSetting.set(MinDeviceSize);
        }
        if (this.#widthSetting.get() > MaxDeviceSize) {
            this.#widthSetting.set(MaxDeviceSize);
        }
        this.#widthSetting.addChangeListener(this.widthSettingChanged, this);
        this.#heightSetting = this.#settings.createSetting('emulation.device-height', 0);
        if (this.#heightSetting.get() && this.#heightSetting.get() < MinDeviceSize) {
            this.#heightSetting.set(MinDeviceSize);
        }
        if (this.#heightSetting.get() > MaxDeviceSize) {
            this.#heightSetting.set(MaxDeviceSize);
        }
        this.#heightSetting.addChangeListener(this.heightSettingChanged, this);
        this.#uaSetting = this.#settings.createSetting('emulation.device-ua', "Mobile" /* UA.MOBILE */);
        this.#uaSetting.addChangeListener(this.uaSettingChanged, this);
        this.#deviceScaleFactorSetting = this.#settings.createSetting('emulation.device-scale-factor', 0);
        this.#deviceScaleFactorSetting.addChangeListener(this.deviceScaleFactorSettingChanged, this);
        this.#toolbarControlsEnabledSetting = this.#settings.createSetting('emulation.toolbar-controls-enabled', true, "Session" /* Common.Settings.SettingStorageType.SESSION */);
        this.#type = Type.None;
        this.#device = null;
        this.#mode = null;
        this.#fitScale = 1;
        this.#touchEnabled = false;
        this.#touchMobile = false;
        this.#emulationModel = null;
        this.#onModelAvailable = null;
        this.#screenOrientationLocked = false;
        this.#targetManager.observeModels(SDK.EmulationModel.EmulationModel, this);
    }
    static instance(opts) {
        if (!Root.DevToolsContext.globalInstance().has(DeviceModeModel) || opts?.forceNew) {
            Root.DevToolsContext.globalInstance().set(DeviceModeModel, new DeviceModeModel(
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            SDK.TargetManager.TargetManager.instance(), 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            Common.Settings.Settings.instance(), 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            SDK.NetworkManager.MultitargetNetworkManager.instance()));
        }
        return Root.DevToolsContext.globalInstance().get(DeviceModeModel);
    }
    /**
     * This wraps `instance()` in a try/catch because in some DevTools entry points
     * (such as worker_app.ts) the Emulation panel is not included and as such
     * the below code fails; it tries to instantiate the model which requires
     * reading the value of a setting which has not been registered.
     * See crbug.com/361515458 for an example bug that this resolves.
     */
    static tryInstance(opts) {
        try {
            return this.instance(opts);
        }
        catch {
            return null;
        }
    }
    static removeInstance() {
        if (Root.DevToolsContext.globalInstance().has(DeviceModeModel)) {
            Root.DevToolsContext.globalInstance().get(DeviceModeModel).dispose();
        }
        Root.DevToolsContext.globalInstance().delete(DeviceModeModel);
    }
    dispose() {
        this.#targetManager.unobserveModels(SDK.EmulationModel.EmulationModel, this);
        this.#revokeLastScreenshotBlobUrl();
    }
    static widthValidator(value) {
        let valid = false;
        let errorMessage;
        if (!value) {
            errorMessage = i18nString(UIStrings.widthCannotBeEmpty);
        }
        else if (!/^[\d]+$/.test(value)) {
            errorMessage = i18nString(UIStrings.widthMustBeANumber);
        }
        else if (Number(value) > MaxDeviceSize) {
            errorMessage = i18nString(UIStrings.widthMustBeLessThanOrEqualToS, { PH1: MaxDeviceSize });
        }
        else if (Number(value) < MinDeviceSize) {
            errorMessage = i18nString(UIStrings.widthMustBeGreaterThanOrEqualToS, { PH1: MinDeviceSize });
        }
        else {
            valid = true;
        }
        return { valid, errorMessage };
    }
    static heightValidator(value) {
        let valid = false;
        let errorMessage;
        if (!value) {
            errorMessage = i18nString(UIStrings.heightCannotBeEmpty);
        }
        else if (!/^[\d]+$/.test(value)) {
            errorMessage = i18nString(UIStrings.heightMustBeANumber);
        }
        else if (Number(value) > MaxDeviceSize) {
            errorMessage = i18nString(UIStrings.heightMustBeLessThanOrEqualToS, { PH1: MaxDeviceSize });
        }
        else if (Number(value) < MinDeviceSize) {
            errorMessage = i18nString(UIStrings.heightMustBeGreaterThanOrEqualTo, { PH1: MinDeviceSize });
        }
        else {
            valid = true;
        }
        return { valid, errorMessage };
    }
    static scaleValidator(value) {
        let valid = false;
        let errorMessage;
        const parsedValue = Number(value.trim());
        if (!value) {
            valid = true;
        }
        else if (Number.isNaN(parsedValue)) {
            errorMessage = i18nString(UIStrings.devicePixelRatioMustBeANumberOr);
        }
        else if (Number(value) > MaxDeviceScaleFactor) {
            errorMessage = i18nString(UIStrings.devicePixelRatioMustBeLessThanOr, { PH1: MaxDeviceScaleFactor });
        }
        else if (Number(value) < MinDeviceScaleFactor) {
            errorMessage = i18nString(UIStrings.devicePixelRatioMustBeGreater, { PH1: MinDeviceScaleFactor });
        }
        else {
            valid = true;
        }
        return { valid, errorMessage };
    }
    get scaleSettingInternal() {
        return this.#scaleSetting;
    }
    #updateFitScale() {
        if (this.#type === Type.Device && this.#device && this.#mode) {
            const orientation = this.#device.orientationByName(this.#mode.orientation);
            this.#scaleSetting.set(this.calculateFitScale(orientation.width, orientation.height));
        }
        else if (this.#type === Type.Responsive) {
            this.#scaleSetting.set(this.calculateFitScale(this.#widthSetting.get(), this.#heightSetting.get()));
        }
    }
    #saveScaleForCurrentDevice() {
        // The scale settings don't reflect the current device yet while emulate() is applying them or while the fit
        // scale is pending.
        if (this.#isApplyingDeviceScale || this.#autoFitScaleOnInitialize) {
            return;
        }
        let key;
        if (this.#type === Type.Device && this.#device) {
            key = this.#device.title;
        }
        else if (this.#type === Type.Responsive) {
            key = 'Responsive';
        }
        else {
            return;
        }
        const scale = this.#scaleSetting.get();
        const autoAdjust = this.#autoAdjustScaleSetting.get();
        const map = this.#deviceScaleMapSetting.get();
        if (map[key]?.scale === scale && map[key]?.autoAdjust === autoAdjust) {
            return;
        }
        map[key] = { scale, autoAdjust };
        this.#deviceScaleMapSetting.set(map);
    }
    setAvailableSize(availableSize, preferredSize) {
        this.#availableSize = availableSize;
        this.#preferredSize = preferredSize;
        this.#initialized = true;
        if (this.#autoFitScaleOnInitialize) {
            this.#autoFitScaleOnInitialize = false;
            this.#updateFitScale();
        }
        this.calculateAndEmulate(false);
    }
    emulate(type, device, mode, scale) {
        const resetPageScaleFactor = this.#type !== type || this.#device !== device || this.#mode !== mode;
        const deviceChanged = this.#type !== type || this.#device !== device;
        this.#type = type;
        // Save the resulting scale settings once rather than every intermediate change.
        this.#isApplyingDeviceScale = true;
        try {
            if (type === Type.Device && device && mode) {
                console.assert(Boolean(device) && Boolean(mode), 'Must pass device and mode for device emulation');
                this.#mode = mode;
                this.#device = device;
                if (deviceChanged) {
                    const map = this.#deviceScaleMapSetting.get();
                    const savedDevice = map[device.title];
                    if (savedDevice) {
                        this.#autoAdjustScaleSetting.set(savedDevice.autoAdjust);
                        // An explicitly requested scale takes precedence over the saved one.
                        if (scale === undefined && !savedDevice.autoAdjust && savedDevice.scale > 0) {
                            scale = savedDevice.scale;
                        }
                    }
                    else {
                        this.#autoAdjustScaleSetting.set(scale === undefined);
                    }
                }
                if (scale !== undefined) {
                    this.#autoFitScaleOnInitialize = false;
                    this.#scaleSetting.set(scale);
                }
                else if (this.#initialized) {
                    this.#autoFitScaleOnInitialize = false;
                    this.#updateFitScale();
                }
                else {
                    this.#autoFitScaleOnInitialize = true;
                }
            }
            else {
                this.#device = null;
                this.#mode = null;
                this.#autoFitScaleOnInitialize = false;
                if (deviceChanged && type === Type.Responsive) {
                    const map = this.#deviceScaleMapSetting.get();
                    const savedDevice = map['Responsive'];
                    if (savedDevice) {
                        this.#autoAdjustScaleSetting.set(savedDevice.autoAdjust);
                        if (!savedDevice.autoAdjust && savedDevice.scale > 0) {
                            this.#scaleSetting.set(savedDevice.scale);
                        }
                        else if (this.#initialized) {
                            this.#updateFitScale();
                        }
                        else {
                            // Defer fit-scale calculation until setAvailableSize() initializes #preferredSize.
                            this.#autoFitScaleOnInitialize = true;
                        }
                    }
                    else {
                        this.#autoAdjustScaleSetting.set(true);
                        this.#scaleSetting.set(1);
                    }
                }
            }
        }
        finally {
            this.#isApplyingDeviceScale = false;
        }
        this.#saveScaleForCurrentDevice();
        if (type !== Type.None) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.DeviceModeEnabled);
        }
        else {
            this.#revokeLastScreenshotBlobUrl();
        }
        this.calculateAndEmulate(resetPageScaleFactor);
    }
    setWidth(width) {
        const max = Math.min(MaxDeviceSize, this.preferredScaledWidth());
        width = Math.max(Math.min(width, max), 1);
        this.#widthSetting.set(width);
    }
    setWidthAndScaleToFit(width) {
        width = Math.max(Math.min(width, MaxDeviceSize), 1);
        this.#scaleSetting.set(this.calculateFitScale(width, this.#heightSetting.get()));
        this.#widthSetting.set(width);
    }
    setHeight(height) {
        const max = Math.min(MaxDeviceSize, this.preferredScaledHeight());
        height = Math.max(Math.min(height, max), 0);
        if (height === this.preferredScaledHeight()) {
            height = 0;
        }
        this.#heightSetting.set(height);
    }
    setHeightAndScaleToFit(height) {
        height = Math.max(Math.min(height, MaxDeviceSize), 0);
        this.#scaleSetting.set(this.calculateFitScale(this.#widthSetting.get(), height));
        this.#heightSetting.set(height);
    }
    setScale(scale) {
        this.#scaleSetting.set(scale);
    }
    device() {
        return this.#device;
    }
    mode() {
        return this.#mode;
    }
    type() {
        return this.#type;
    }
    screenRect() {
        return this.#screenRect;
    }
    visiblePageRect() {
        return this.#visiblePageRect;
    }
    scale() {
        return this.#scale;
    }
    fitScale() {
        return this.#fitScale;
    }
    appliedDeviceSize() {
        return this.#appliedDeviceSize;
    }
    appliedDeviceScaleFactor() {
        return this.#appliedDeviceScaleFactor;
    }
    appliedUserAgentType() {
        return this.#appliedUserAgentType;
    }
    isFullHeight() {
        return !this.#heightSetting.get();
    }
    isMobile() {
        switch (this.#type) {
            case Type.Device:
                return this.#device ? this.#device.mobile() : false;
            case Type.None:
                return false;
            case Type.Responsive:
                return this.#uaSetting.get() === "Mobile" /* UA.MOBILE */ || this.#uaSetting.get() === "Mobile (no touch)" /* UA.MOBILE_NO_TOUCH */;
        }
        return false;
    }
    enabledSetting() {
        return this.#settings.createSetting('emulation.show-device-mode', false);
    }
    isDeviceModeOn() {
        return this.enabledSetting().get();
    }
    toggleDeviceMode() {
        this.enabledSetting().set(!this.enabledSetting().get());
    }
    scaleSetting() {
        return this.#scaleSetting;
    }
    uaSetting() {
        return this.#uaSetting;
    }
    deviceScaleFactorSetting() {
        return this.#deviceScaleFactorSetting;
    }
    toolbarControlsEnabledSetting() {
        return this.#toolbarControlsEnabledSetting;
    }
    reset() {
        this.#deviceScaleFactorSetting.set(0);
        this.#scaleSetting.set(1);
        this.setWidth(400);
        this.setHeight(0);
        this.#uaSetting.set("Mobile" /* UA.MOBILE */);
    }
    modelAdded(emulationModel) {
        if (emulationModel.target() === this.#targetManager.primaryPageTarget() &&
            emulationModel.supportsDeviceEmulation()) {
            this.#emulationModel = emulationModel;
            if (this.#onModelAvailable) {
                const callback = this.#onModelAvailable;
                this.#onModelAvailable = null;
                callback();
            }
            emulationModel.addEventListener("ScreenOrientationLockChanged" /* SDK.EmulationModel.EmulationModelEvents.SCREEN_ORIENTATION_LOCK_CHANGED */, this.onScreenOrientationLockChanged, this);
            const resourceTreeModel = emulationModel.target().model(SDK.ResourceTreeModel.ResourceTreeModel);
            if (resourceTreeModel) {
                resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameResized, this.onFrameChange, this);
                resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameNavigated, this.onFrameNavigated, this);
            }
        }
        else {
            void emulationModel.emulateTouch(this.#touchEnabled, this.#touchMobile);
        }
    }
    modelRemoved(emulationModel) {
        if (this.#emulationModel === emulationModel) {
            emulationModel.removeEventListener("ScreenOrientationLockChanged" /* SDK.EmulationModel.EmulationModelEvents.SCREEN_ORIENTATION_LOCK_CHANGED */, this.onScreenOrientationLockChanged, this);
            const resourceTreeModel = emulationModel.target().model(SDK.ResourceTreeModel.ResourceTreeModel);
            if (resourceTreeModel) {
                resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.FrameResized, this.onFrameChange, this);
                resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.FrameNavigated, this.onFrameNavigated, this);
            }
            this.#emulationModel = null;
            this.#screenOrientationLocked = false;
            this.#revokeLastScreenshotBlobUrl();
            this.dispatchEventToListeners("Updated" /* Events.UPDATED */);
        }
    }
    inspectedURL() {
        return this.#emulationModel ? this.#emulationModel.target().inspectedURL() : null;
    }
    onFrameChange() {
        const overlayModel = this.#emulationModel ? this.#emulationModel.overlayModel() : null;
        if (!overlayModel) {
            return;
        }
        this.showDeviceOverlaysIfApplicable(overlayModel);
    }
    onFrameNavigated(event) {
        if (event.data.isMainFrame()) {
            this.#revokeLastScreenshotBlobUrl();
        }
        this.onFrameChange();
    }
    onScreenOrientationLockChanged(event) {
        this.#screenOrientationLocked = event.data.locked;
        if (event.data.locked && event.data.orientation) {
            this.applyOrientationLock(event.data.orientation);
        }
        this.dispatchEventToListeners("Updated" /* Events.UPDATED */);
    }
    applyOrientationLock(orientation) {
        const wantsLandscape = orientation.type === "landscapePrimary" /* Protocol.Emulation.ScreenOrientationType.LandscapePrimary */ ||
            orientation.type === "landscapeSecondary" /* Protocol.Emulation.ScreenOrientationType.LandscapeSecondary */;
        if (this.#type === Type.Device && this.#device && this.#mode) {
            // For device emulation, switch to the matching orientation mode.
            const isCurrentlyLandscape = this.#mode.orientation === Horizontal || this.#mode.orientation === HorizontalSpanned;
            if (wantsLandscape !== isCurrentlyLandscape) {
                const rotationPartner = this.#device.getRotationPartner(this.#mode);
                if (rotationPartner) {
                    this.emulate(this.#type, this.#device, rotationPartner);
                }
            }
        }
        else if (this.#type === Type.Responsive) {
            // For responsive mode, swap width/height if orientation doesn't match.
            const appliedSize = this.appliedDeviceSize();
            const isCurrentlyLandscape = appliedSize.width > appliedSize.height;
            if (wantsLandscape !== isCurrentlyLandscape) {
                this.setSizeAndScaleToFit(appliedSize.height, appliedSize.width);
            }
        }
    }
    isScreenOrientationLocked() {
        return this.#screenOrientationLocked;
    }
    scaleSettingChanged() {
        this.calculateAndEmulate(false);
    }
    widthSettingChanged() {
        this.calculateAndEmulate(false);
    }
    heightSettingChanged() {
        this.calculateAndEmulate(false);
    }
    uaSettingChanged() {
        this.calculateAndEmulate(true);
    }
    deviceScaleFactorSettingChanged() {
        this.calculateAndEmulate(false);
    }
    preferredScaledWidth() {
        return Math.floor(this.#preferredSize.width / (this.#scaleSetting.get() || 1));
    }
    preferredScaledHeight() {
        return Math.floor(this.#preferredSize.height / (this.#scaleSetting.get() || 1));
    }
    currentSafeAreaInsets() {
        if (!Root.Runtime.hostConfig.devToolsMobileSafeAreaEmulation?.enabled) {
            return null;
        }
        if (this.#type !== Type.Device || !this.#mode) {
            return null;
        }
        return this.#mode.safeAreaInsets ?? null;
    }
    applySafeAreaInsets(insets) {
        if (!this.#emulationModel) {
            return;
        }
        if (insets && Root.Runtime.hostConfig.devToolsMobileSafeAreaEmulation?.enabled) {
            void this.#emulationModel.setSafeAreaInsets({ top: insets.top, left: insets.left, bottom: insets.bottom, right: insets.right });
        }
        else {
            void this.#emulationModel.setSafeAreaInsets({});
        }
    }
    getScreenOrientationType() {
        if (!this.#mode) {
            throw new Error('Mode required to get orientation type.');
        }
        switch (this.#mode.orientation) {
            case VerticalSpanned:
            case Vertical:
                return "portraitPrimary" /* Protocol.Emulation.ScreenOrientationType.PortraitPrimary */;
            case HorizontalSpanned:
            case Horizontal:
            default:
                return "landscapePrimary" /* Protocol.Emulation.ScreenOrientationType.LandscapePrimary */;
        }
    }
    calculateAndEmulate(resetPageScaleFactor) {
        if (!this.#emulationModel) {
            this.#onModelAvailable = this.calculateAndEmulate.bind(this, resetPageScaleFactor);
        }
        const mobile = this.isMobile();
        const overlayModel = this.#emulationModel ? this.#emulationModel.overlayModel() : null;
        if (overlayModel) {
            this.showDeviceOverlaysIfApplicable(overlayModel);
        }
        if (this.#type === Type.Device && this.#device && this.#mode) {
            const orientation = this.#device.orientationByName(this.#mode.orientation);
            this.#fitScale = this.calculateFitScale(orientation.width, orientation.height);
            if (mobile) {
                this.#appliedUserAgentType = this.#device.touch() ? "Mobile" /* UA.MOBILE */ : "Mobile (no touch)" /* UA.MOBILE_NO_TOUCH */;
            }
            else {
                this.#appliedUserAgentType = this.#device.touch() ? "Desktop (touch)" /* UA.DESKTOP_TOUCH */ : "Desktop" /* UA.DESKTOP */;
            }
            this.applyDeviceMetrics(new Platform.Size(orientation.width, orientation.height), this.#scaleSetting.get(), this.#device.deviceScaleFactor, mobile, this.getScreenOrientationType(), resetPageScaleFactor);
            this.applyUserAgent(this.#device.userAgent, this.#device.userAgentMetadata);
            this.applyTouch(this.#device.touch(), mobile);
        }
        else if (this.#type === Type.None) {
            this.#fitScale = this.calculateFitScale(this.#availableSize.width, this.#availableSize.height);
            this.#appliedUserAgentType = "Desktop" /* UA.DESKTOP */;
            this.applyDeviceMetrics(this.#availableSize, 1, 0, mobile, null, resetPageScaleFactor);
            this.applyUserAgent('', null);
            this.applyTouch(false, false);
        }
        else if (this.#type === Type.Responsive) {
            let screenWidth = this.#widthSetting.get();
            if (!screenWidth || screenWidth > this.preferredScaledWidth()) {
                screenWidth = this.preferredScaledWidth();
            }
            let screenHeight = this.#heightSetting.get();
            if (!screenHeight || screenHeight > this.preferredScaledHeight()) {
                screenHeight = this.preferredScaledHeight();
            }
            const defaultDeviceScaleFactor = mobile ? defaultMobileScaleFactor : 0;
            this.#fitScale = this.calculateFitScale(this.#widthSetting.get(), this.#heightSetting.get());
            this.#appliedUserAgentType = this.#uaSetting.get();
            this.applyDeviceMetrics(new Platform.Size(screenWidth, screenHeight), this.#scaleSetting.get(), this.#deviceScaleFactorSetting.get() || defaultDeviceScaleFactor, mobile, screenHeight >= screenWidth ? "portraitPrimary" /* Protocol.Emulation.ScreenOrientationType.PortraitPrimary */ : "landscapePrimary" /* Protocol.Emulation.ScreenOrientationType.LandscapePrimary */, resetPageScaleFactor);
            this.applyUserAgent(mobile ? DeviceModeModel.defaultMobileUserAgent() : '', mobile ? DeviceModeModel.defaultMobileUserAgentMetadata() : null);
            this.applyTouch(this.#uaSetting.get() === "Desktop (touch)" /* UA.DESKTOP_TOUCH */ || this.#uaSetting.get() === "Mobile" /* UA.MOBILE */, this.#uaSetting.get() === "Mobile" /* UA.MOBILE */);
        }
        if (overlayModel) {
            overlayModel.setShowViewportSizeOnResize(this.#type === Type.None);
        }
        this.applySafeAreaInsets(this.currentSafeAreaInsets());
        this.dispatchEventToListeners("Updated" /* Events.UPDATED */);
    }
    calculateFitScale(screenWidth, screenHeight) {
        const scaleW = screenWidth ? Math.floor(this.#preferredSize.width * 100 / screenWidth) : 100;
        const scaleH = screenHeight ? Math.floor(this.#preferredSize.height * 100 / screenHeight) : 100;
        const scale = Math.min(scaleW, scaleH, 100);
        return Math.max(scale, 1) / 100;
    }
    setSizeAndScaleToFit(width, height) {
        this.#scaleSetting.set(this.calculateFitScale(width, height));
        this.setWidth(width);
        this.setHeight(height);
    }
    applyUserAgent(userAgent, userAgentMetadata) {
        // When the user agent string is empty (e.g. custom desktop device without
        // a UA override), metadata must also be cleared. The backend rejects
        // setUserAgentOverride calls that provide metadata without a UA string.
        this.#multitargetNetworkManager.setUserAgentOverride(userAgent, userAgent ? userAgentMetadata : null);
    }
    applyDeviceMetrics(screenSize, scale, deviceScaleFactor, mobile, screenOrientation, resetPageScaleFactor) {
        screenSize.width = Math.max(1, Math.floor(screenSize.width));
        screenSize.height = Math.max(1, Math.floor(screenSize.height));
        let pageWidth = screenSize.width;
        let pageHeight = screenSize.height;
        const positionX = 0;
        const positionY = 0;
        const screenOrientationAngle = screenOrientation === "landscapePrimary" /* Protocol.Emulation.ScreenOrientationType.LandscapePrimary */ ? 90 : 0;
        this.#appliedDeviceSize = screenSize;
        this.#appliedDeviceScaleFactor = deviceScaleFactor || Platform.HostRuntime.HOST_RUNTIME.getDevicePixelRatio();
        this.#screenRect = new Rect(Math.max(0, (this.#availableSize.width - screenSize.width * scale) / 2), 0, screenSize.width * scale, screenSize.height * scale);
        this.#visiblePageRect = new Rect(positionX * scale, positionY * scale, Math.min(pageWidth * scale, this.#availableSize.width - this.#screenRect.left - positionX * scale), Math.min(pageHeight * scale, this.#availableSize.height - this.#screenRect.top - positionY * scale));
        this.#scale = scale;
        const displayFeature = this.getDisplayFeature();
        if (!displayFeature) {
            // When sending displayFeature, we cannot use the optimization below due to backend restrictions.
            if (scale === 1 && this.#availableSize.width >= screenSize.width &&
                this.#availableSize.height >= screenSize.height) {
                // When we have enough space, no page size override is required. This will speed things up and remove lag.
                pageWidth = 0;
                pageHeight = 0;
            }
            if (this.#visiblePageRect.width === pageWidth * scale && this.#visiblePageRect.height === pageHeight * scale &&
                Number.isInteger(pageWidth * scale) && Number.isInteger(pageHeight * scale)) {
                // When we only have to apply scale, do not resize the page. This will speed things up and remove lag.
                pageWidth = 0;
                pageHeight = 0;
            }
        }
        if (!this.#emulationModel) {
            return;
        }
        if (resetPageScaleFactor) {
            void this.#emulationModel.resetPageScaleFactor();
        }
        if (pageWidth || pageHeight || mobile || deviceScaleFactor || scale !== 1 || screenOrientation || displayFeature) {
            const metrics = {
                width: pageWidth,
                height: pageHeight,
                deviceScaleFactor,
                mobile,
                scale,
                screenWidth: screenSize.width,
                screenHeight: screenSize.height,
                positionX,
                positionY,
                dontSetVisibleSize: true,
            };
            if (displayFeature) {
                metrics.displayFeature = displayFeature;
                metrics.devicePosture = { type: "folded" /* Protocol.Emulation.DevicePostureType.Folded */ };
            }
            else {
                metrics.devicePosture = { type: "continuous" /* Protocol.Emulation.DevicePostureType.Continuous */ };
            }
            if (screenOrientation) {
                metrics.screenOrientation = { type: screenOrientation, angle: screenOrientationAngle };
            }
            void this.#emulationModel.emulateDevice(metrics);
        }
        else {
            void this.#emulationModel.emulateDevice(null);
        }
    }
    exitHingeMode() {
        const overlayModel = this.#emulationModel ? this.#emulationModel.overlayModel() : null;
        if (overlayModel) {
            overlayModel.showHingeForDualScreen(null);
        }
    }
    async #captureScreenshot(fullSize, clip) {
        const screenCaptureModel = this.#emulationModel ? this.#emulationModel.target().model(SDK.ScreenCaptureModel.ScreenCaptureModel) : null;
        if (!screenCaptureModel) {
            return null;
        }
        let screenshotMode;
        if (clip) {
            screenshotMode = "fromClip" /* SDK.ScreenCaptureModel.ScreenshotMode.FROM_CLIP */;
        }
        else if (fullSize) {
            screenshotMode = "fullpage" /* SDK.ScreenCaptureModel.ScreenshotMode.FULLPAGE */;
        }
        else {
            screenshotMode = "fromViewport" /* SDK.ScreenCaptureModel.ScreenshotMode.FROM_VIEWPORT */;
        }
        const overlayModel = this.#emulationModel ? this.#emulationModel.overlayModel() : null;
        if (overlayModel) {
            overlayModel.setShowViewportSizeOnResize(false);
        }
        if (this.#emulationModel && this.#device && this.#mode) {
            const orientation = this.#device.orientationByName(this.#mode.orientation);
            const deviceMetrics = {
                width: orientation.width,
                height: orientation.height,
                deviceScaleFactor: this.#device.deviceScaleFactor,
                mobile: this.isMobile(),
            };
            const dispFeature = this.getDisplayFeature();
            if (dispFeature) {
                deviceMetrics.displayFeature = dispFeature;
            }
            await this.#emulationModel.emulateDevice(deviceMetrics);
        }
        try {
            const screenshot = await screenCaptureModel.captureScreenshot("png" /* Protocol.Page.CaptureScreenshotRequestFormat.Png */, 100, screenshotMode, clip);
            return screenshot;
        }
        finally {
            await this.#emulationModel?.emulateDevice(null);
            overlayModel?.setShowViewportSizeOnResize(this.#type === Type.None);
            this.calculateAndEmulate(false);
        }
    }
    getScreenshotFileName() {
        const url = this.inspectedURL();
        let fileName = '';
        if (url) {
            const withoutFragment = Platform.StringUtilities.removeURLFragment(url);
            fileName = Platform.StringUtilities.trimURL(withoutFragment);
        }
        const device = this.device();
        if (device && this.type() === Type.Device) {
            fileName += `(${device.title})`;
        }
        return fileName;
    }
    async captureScreenshot() {
        const screenshot = await this.#captureScreenshot(false);
        if (screenshot === null) {
            return;
        }
        await Platform.HostRuntime.HOST_RUNTIME.saveScreenshot({
            base64Png: screenshot,
            fileName: this.getScreenshotFileName(),
            clip: {
                screenRectWidth: this.screenRect().width,
                screenRectHeight: this.screenRect().height,
                visiblePageRectLeft: this.visiblePageRect().left,
                visiblePageRectTop: this.visiblePageRect().top,
            },
        });
    }
    async captureFullSizeScreenshot() {
        const screenshot = await this.#captureScreenshot(true);
        if (screenshot === null) {
            return;
        }
        await this.saveScreenshot(screenshot);
    }
    async captureAreaScreenshot(clip) {
        const screenshot = await this.#captureScreenshot(false, clip);
        if (screenshot === null) {
            return;
        }
        await this.saveScreenshot(screenshot);
    }
    async saveScreenshot(screenshot) {
        await Platform.HostRuntime.HOST_RUNTIME.saveScreenshot({
            base64Png: screenshot,
            fileName: this.getScreenshotFileName(),
        });
    }
    #revokeLastScreenshotBlobUrl() {
        Platform.HostRuntime.HOST_RUNTIME.revokeLastScreenshotUrl();
    }
    applyTouch(touchEnabled, mobile) {
        this.#touchEnabled = touchEnabled;
        this.#touchMobile = mobile;
        for (const emulationModel of this.#targetManager.models(SDK.EmulationModel.EmulationModel)) {
            void emulationModel.emulateTouch(touchEnabled, mobile);
        }
    }
    showDeviceOverlaysIfApplicable(overlayModel) {
        const orientation = (this.#device && this.#mode) ? this.#device.orientationByName(this.#mode.orientation) : null;
        if (orientation?.hinge) {
            overlayModel.showHingeForDualScreen(orientation.hinge);
        }
        else {
            overlayModel.showHingeForDualScreen(null);
        }
        overlayModel.showDisplayCutout(Root.Runtime.hostConfig.devToolsMobileSafeAreaEmulation?.enabled ? this.currentDisplayCutout() : null);
    }
    currentDisplayCutout() {
        if (!Root.Runtime.hostConfig.devToolsMobileSafeAreaEmulation?.enabled) {
            return null;
        }
        const device = this.#device;
        const mode = this.#mode;
        if (!device || !mode || !device.modes.includes(mode)) {
            return null;
        }
        const cutout = mode.cutout;
        if (cutout) {
            return this.toDisplayCutout(cutout);
        }
        if (mode.orientation !== Horizontal) {
            return null;
        }
        const rotationPartner = device.getRotationPartner(mode);
        const rotatedCutout = rotationPartner?.cutout;
        if (rotationPartner?.orientation !== Vertical || !rotatedCutout) {
            return null;
        }
        const orientation = device.orientationByName(mode.orientation);
        if (rotatedCutout.shape === "circle" /* CutoutShape.CIRCLE */) {
            return this.toDisplayCutout({
                ...rotatedCutout,
                x: orientation.width - rotatedCutout.y - rotatedCutout.height,
                y: rotatedCutout.x,
                width: rotatedCutout.height,
                height: rotatedCutout.width,
                cx: orientation.width - rotatedCutout.cy,
                cy: rotatedCutout.cx,
            });
        }
        return this.toDisplayCutout({
            ...rotatedCutout,
            x: orientation.width - rotatedCutout.y - rotatedCutout.height,
            y: rotatedCutout.x,
            width: rotatedCutout.height,
            height: rotatedCutout.width,
        });
    }
    toDisplayCutout(cutout) {
        const { shape, ...rest } = cutout;
        return {
            ...rest,
            shape: CUTOUT_SHAPE_TO_PROTOCOL[shape],
            contentColor: { r: 0, g: 0, b: 0, a: 1 },
        };
    }
    getDisplayFeatureOrientation() {
        if (!this.#mode) {
            throw new Error('Mode required to get display feature orientation.');
        }
        switch (this.#mode.orientation) {
            case VerticalSpanned:
            case Vertical:
                return "vertical" /* Protocol.Emulation.DisplayFeatureOrientation.Vertical */;
            case HorizontalSpanned:
            case Horizontal:
            default:
                return "horizontal" /* Protocol.Emulation.DisplayFeatureOrientation.Horizontal */;
        }
    }
    getDisplayFeature() {
        if (!this.#device || !this.#mode ||
            (this.#mode.orientation !== VerticalSpanned && this.#mode.orientation !== HorizontalSpanned)) {
            return null;
        }
        const orientation = this.#device.orientationByName(this.#mode.orientation);
        if (!orientation?.hinge) {
            return null;
        }
        const hinge = orientation.hinge;
        return {
            orientation: this.getDisplayFeatureOrientation(),
            offset: (this.#mode.orientation === VerticalSpanned) ? hinge.x : hinge.y,
            maskLength: (this.#mode.orientation === VerticalSpanned) ? hinge.width : hinge.height,
        };
    }
    /**
     * Heuristic to keep the default mobile User Agent fresh and aligned with the adoption bell curve.
     * Android: We target N-1 versions (where N is the latest) to represent the plurality of global users.
     * iOS: We follow the calendar year (starting from the 2025 shift to year-based versioning).
     * Data sources:
     * - StatCounter Global Stats: https://gs.statcounter.com/os-version-market-share/android
     * - Android adoption typically lags by ~12-18 months for plurality.
     * - iOS adoption typically reaches majority within ~3-6 months.
     */
    static getDynamicMobileUA() {
        const androidVersion = DeviceModeModel.getDynamicAndroidVersion();
        const pixelModel = androidVersion - 6;
        const ua = `Mozilla/5.0 (Linux; Android ${androidVersion}; Pixel ${pixelModel}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36`;
        const metadata = {
            platform: 'Android',
            platformVersion: androidVersion.toString(),
            architecture: '',
            model: `Pixel ${pixelModel}`,
            mobile: true,
        };
        return { userAgent: ua, metadata };
    }
    static getDynamicAndroidVersion() {
        const now = new Date();
        const year = now.getFullYear();
        const isLateInYear = now.getMonth() >= 9; // Oct, Nov, Dec
        // Android: Released in late summer/fall. plurality is usually Year - 2011 (e.g. Android 15 in early 2026).
        return isLateInYear ? (year - 2010) : (year - 2011);
    }
    static defaultMobileUserAgent() {
        return SDK.NetworkManager.MultitargetNetworkManager.patchUserAgentWithChromeVersion(DeviceModeModel.getDynamicMobileUA().userAgent);
    }
    static defaultMobileUserAgentMetadata() {
        return DeviceModeModel.getDynamicMobileUA().metadata;
    }
}
export class Insets {
    left;
    top;
    right;
    bottom;
    constructor(left, top, right, bottom) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
    }
    isEqual(insets) {
        return insets !== null && this.left === insets.left && this.top === insets.top && this.right === insets.right &&
            this.bottom === insets.bottom;
    }
}
export class Rect {
    left;
    top;
    width;
    height;
    constructor(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }
    isEqual(rect) {
        return rect !== null && this.left === rect.left && this.top === rect.top && this.width === rect.width &&
            this.height === rect.height;
    }
    scale(scale) {
        return new Rect(this.left * scale, this.top * scale, this.width * scale, this.height * scale);
    }
    relativeTo(origin) {
        return new Rect(this.left - origin.left, this.top - origin.top, this.width, this.height);
    }
    rebaseTo(origin) {
        return new Rect(this.left + origin.left, this.top + origin.top, this.width, this.height);
    }
}
export var Type;
(function (Type) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Type["None"] = "None";
    Type["Responsive"] = "Responsive";
    Type["Device"] = "Device";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Type || (Type = {}));
export const MinDeviceSize = 50;
export const MaxDeviceSize = 9999;
export const MinDeviceScaleFactor = 0;
export const MaxDeviceScaleFactor = 10;
export const MaxDeviceNameLength = 50;
export const defaultMobileScaleFactor = 2;
//# sourceMappingURL=DeviceModeModel.js.map