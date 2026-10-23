import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import { Insets } from './DeviceModeModel.js';
export declare class EmulatedDevice {
    #private;
    title: string;
    type: Type;
    order: number;
    vertical: Orientation;
    horizontal: Orientation;
    deviceScaleFactor: number;
    capabilities: string[];
    userAgent: string;
    userAgentMetadata: Protocol.Emulation.UserAgentMetadata | null;
    modes: Mode[];
    isDualScreen: boolean;
    isFoldableScreen: boolean;
    verticalSpanned: Orientation;
    horizontalSpanned: Orientation;
    static fromJSONV1(json: any): EmulatedDevice | null;
    static deviceComparator(device1: EmulatedDevice, device2: EmulatedDevice): number;
    modesForOrientation(orientation: string): Mode[];
    getSpanPartner(mode: Mode): Mode | undefined;
    getRotationPartner(mode: Mode): Mode | null;
    toJSON(): any;
    private orientationToJSON;
    orientationByName(name: string): Orientation;
    show(): boolean;
    setShow(show: boolean): void;
    copyShowFrom(other: EmulatedDevice): void;
    touch(): boolean;
    mobile(): boolean;
}
export declare const Horizontal = "horizontal";
export declare const Vertical = "vertical";
export declare const HorizontalSpanned = "horizontal-spanned";
export declare const VerticalSpanned = "vertical-spanned";
export declare enum Type {
    Phone = "phone",
    Tablet = "tablet",
    Notebook = "notebook",
    Desktop = "desktop",
    Foldable = "foldable",
    SmartDisplay = "smart-display",
    Unknown = "unknown"
}
export declare const enum Category {
    MOBILE = "mobile",
    FOLDABLE = "foldable",
    TABLET_DESKTOP = "tablet_desktop",
    SMART_DISPLAY = "smart_display"
}
export declare function deviceCategory(device: EmulatedDevice): Category;
export declare const CATEGORY_ORDER: readonly Category[];
export declare function getCategoryTitle(category: Category): Platform.UIString.LocalizedString;
export declare const enum Capability {
    TOUCH = "touch",
    MOBILE = "mobile"
}
export declare class EmulatedDevicesList extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(settings: Common.Settings.Settings);
    static instance(): EmulatedDevicesList;
    private updateStandardDevices;
    private listFromJSONV1;
    static rawEmulatedDevicesForTest(): ReadonlyArray<{
        'user-agent': string;
    } & Record<string, any>>;
    standard(): EmulatedDevice[];
    custom(): EmulatedDevice[];
    revealCustomSetting(): void;
    addCustomDevice(device: EmulatedDevice): void;
    removeCustomDevice(device: EmulatedDevice): void;
    saveCustomDevices(): void;
    saveStandardDevices(): void;
    private copyShowValues;
}
export declare const enum Events {
    CUSTOM_DEVICES_UPDATED = "CustomDevicesUpdated",
    STANDARD_DEVICES_UPDATED = "StandardDevicesUpdated"
}
export interface EventTypes {
    [Events.CUSTOM_DEVICES_UPDATED]: void;
    [Events.STANDARD_DEVICES_UPDATED]: void;
}
export interface Mode {
    title: string;
    orientation: string;
    safeAreaInsets?: Insets;
    cutout?: Cutout;
}
export declare const enum CutoutShape {
    PILL = "pill",
    NOTCH = "notch",
    CIRCLE = "circle",
    RECTANGLE = "rectangle"
}
export interface BaseCutout {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type Cutout = BaseCutout & ({
    shape: CutoutShape.RECTANGLE;
} | {
    shape: CutoutShape.PILL;
    borderRadius: number;
} | {
    shape: CutoutShape.NOTCH;
    upperRadius: number;
    lowerRadius: number;
} | {
    shape: CutoutShape.CIRCLE;
    cx: number;
    cy: number;
    radius: number;
});
export interface Orientation {
    width: number;
    height: number;
    hinge: SDK.OverlayModel.Hinge | null;
}
export interface JSONMode {
    title: string;
    orientation: string;
    'safe-area-insets'?: {
        left: number;
        right: number;
        top: number;
        bottom: number;
    };
    cutout?: {
        shape: string;
        x: number;
        y: number;
        width: number;
        height: number;
        'border-radius'?: number;
        'upper-radius'?: number;
        'lower-radius'?: number;
        cx?: number;
        cy?: number;
        radius?: number;
    };
}
