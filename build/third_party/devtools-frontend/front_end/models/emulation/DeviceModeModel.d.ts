import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { type EmulatedDevice, type Mode } from './EmulatedDevices.js';
export declare class DeviceModeModel extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.EmulationModel.EmulationModel> {
    #private;
    constructor(targetManager: SDK.TargetManager.TargetManager, settings: Common.Settings.Settings, multitargetNetworkManager: SDK.NetworkManager.MultitargetNetworkManager);
    static instance(opts?: {
        forceNew: boolean;
    }): DeviceModeModel;
    /**
     * This wraps `instance()` in a try/catch because in some DevTools entry points
     * (such as worker_app.ts) the Emulation panel is not included and as such
     * the below code fails; it tries to instantiate the model which requires
     * reading the value of a setting which has not been registered.
     * See crbug.com/361515458 for an example bug that this resolves.
     */
    static tryInstance(opts?: {
        forceNew: boolean;
    }): DeviceModeModel | null;
    static removeInstance(): void;
    dispose(): void;
    static widthValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static heightValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    static scaleValidator(value: string): {
        valid: boolean;
        errorMessage: (string | undefined);
    };
    get scaleSettingInternal(): Common.Settings.Setting<number>;
    setAvailableSize(availableSize: Platform.Size, preferredSize: Platform.Size): void;
    emulate(type: Type, device: EmulatedDevice | null, mode: Mode | null, scale?: number): void;
    setWidth(width: number): void;
    setWidthAndScaleToFit(width: number): void;
    setHeight(height: number): void;
    setHeightAndScaleToFit(height: number): void;
    setScale(scale: number): void;
    device(): EmulatedDevice | null;
    mode(): Mode | null;
    type(): Type;
    screenRect(): Rect;
    visiblePageRect(): Rect;
    scale(): number;
    fitScale(): number;
    appliedDeviceSize(): Platform.Size;
    appliedDeviceScaleFactor(): number;
    appliedUserAgentType(): UA;
    isFullHeight(): boolean;
    isMobile(): boolean;
    enabledSetting(): Common.Settings.Setting<boolean>;
    isDeviceModeOn(): boolean;
    toggleDeviceMode(): void;
    scaleSetting(): Common.Settings.Setting<number>;
    uaSetting(): Common.Settings.Setting<UA>;
    deviceScaleFactorSetting(): Common.Settings.Setting<number>;
    toolbarControlsEnabledSetting(): Common.Settings.Setting<boolean>;
    reset(): void;
    modelAdded(emulationModel: SDK.EmulationModel.EmulationModel): void;
    modelRemoved(emulationModel: SDK.EmulationModel.EmulationModel): void;
    inspectedURL(): string | null;
    private onFrameChange;
    private onFrameNavigated;
    private onScreenOrientationLockChanged;
    private applyOrientationLock;
    isScreenOrientationLocked(): boolean;
    private scaleSettingChanged;
    private widthSettingChanged;
    private heightSettingChanged;
    private uaSettingChanged;
    private deviceScaleFactorSettingChanged;
    private preferredScaledWidth;
    private preferredScaledHeight;
    private currentSafeAreaInsets;
    private applySafeAreaInsets;
    private getScreenOrientationType;
    private calculateAndEmulate;
    private calculateFitScale;
    setSizeAndScaleToFit(width: number, height: number): void;
    private applyUserAgent;
    private applyDeviceMetrics;
    exitHingeMode(): void;
    private getScreenshotFileName;
    captureScreenshot(): Promise<void>;
    captureFullSizeScreenshot(): Promise<void>;
    captureAreaScreenshot(clip?: Protocol.Page.Viewport): Promise<void>;
    saveScreenshot(screenshot: string): Promise<void>;
    private applyTouch;
    private showDeviceOverlaysIfApplicable;
    private currentDisplayCutout;
    private toDisplayCutout;
    private getDisplayFeatureOrientation;
    private getDisplayFeature;
    /**
     * Heuristic to keep the default mobile User Agent fresh and aligned with the adoption bell curve.
     * Android: We target N-1 versions (where N is the latest) to represent the plurality of global users.
     * iOS: We follow the calendar year (starting from the 2025 shift to year-based versioning).
     * Data sources:
     * - StatCounter Global Stats: https://gs.statcounter.com/os-version-market-share/android
     * - Android adoption typically lags by ~12-18 months for plurality.
     * - iOS adoption typically reaches majority within ~3-6 months.
     */
    static getDynamicMobileUA(): {
        userAgent: string;
        metadata: Protocol.Emulation.UserAgentMetadata;
    };
    static getDynamicAndroidVersion(): number;
    static defaultMobileUserAgent(): string;
    static defaultMobileUserAgentMetadata(): Protocol.Emulation.UserAgentMetadata;
}
export declare class Insets {
    left: number;
    top: number;
    right: number;
    bottom: number;
    constructor(left: number, top: number, right: number, bottom: number);
    isEqual(insets: Insets | null): boolean;
}
export declare class Rect {
    left: number;
    top: number;
    width: number;
    height: number;
    constructor(left: number, top: number, width: number, height: number);
    isEqual(rect: Rect | null): boolean;
    scale(scale: number): Rect;
    relativeTo(origin: Rect): Rect;
    rebaseTo(origin: Rect): Rect;
}
export declare const enum Events {
    UPDATED = "Updated",
    SCREENSHOT_COPIED = "ScreenshotCopied",
    SCREENSHOT_COPY_FAILED = "ScreenshotCopyFailed"
}
export interface EventTypes {
    [Events.UPDATED]: void;
    [Events.SCREENSHOT_COPIED]: void;
    [Events.SCREENSHOT_COPY_FAILED]: void;
}
export declare enum Type {
    None = "None",
    Responsive = "Responsive",
    Device = "Device"
}
export declare const enum UA {
    MOBILE = "Mobile",
    MOBILE_NO_TOUCH = "Mobile (no touch)",
    DESKTOP = "Desktop",
    DESKTOP_TOUCH = "Desktop (touch)"
}
export declare const MinDeviceSize = 50;
export declare const MaxDeviceSize = 9999;
export declare const MinDeviceScaleFactor = 0;
export declare const MaxDeviceScaleFactor = 10;
export declare const MaxDeviceNameLength = 50;
export declare const defaultMobileScaleFactor = 2;
