// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import { Insets, MaxDeviceSize, MinDeviceSize } from './DeviceModeModel.js';
const UIStrings = {
    /**
     * @description Title of the Laptop with touch device.
     */
    laptopWithTouch: 'Laptop with touch',
    /**
     * @description Title of the Laptop with HiDPI screen device.
     */
    laptopWithHiDPIScreen: 'Laptop with HiDPI screen',
    /**
     * @description Title of the Laptop with MDPI screen device.
     */
    laptopWithMDPIScreen: 'Laptop with MDPI screen',
    /**
     * @description Label for mobile category in emulation devices.
     */
    mobileGroup: 'Mobile',
    /**
     * @description Label for foldables category in emulation devices.
     */
    foldablesGroup: 'Foldables',
    /**
     * @description Label for tablets and desktops category in emulation devices.
     */
    tabletsAndDesktopsGroup: 'Tablets & Desktops',
    /**
     * @description Label for smart displays category in emulation devices.
     */
    smartDisplaysGroup: 'Smart Displays',
};
const str_ = i18n.i18n.registerUIStrings('models/emulation/EmulatedDevices.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class EmulatedDevice {
    title = '';
    type = Type.Unknown;
    order;
    vertical = { width: 0, height: 0, hinge: null };
    horizontal = { width: 0, height: 0, hinge: null };
    deviceScaleFactor = 1;
    capabilities = ["touch" /* Capability.TOUCH */, "mobile" /* Capability.MOBILE */];
    userAgent = '';
    userAgentMetadata = null;
    modes = [];
    isDualScreen = false;
    isFoldableScreen = false;
    verticalSpanned = { width: 0, height: 0, hinge: null };
    horizontalSpanned = { width: 0, height: 0, hinge: null };
    #show = Show.Default;
    #showByDefault = true;
    static fromJSONV1(json) {
        try {
            function parseValue(object, key, type, defaultValue) {
                if (typeof object !== 'object' || object === null || !object.hasOwnProperty(key)) {
                    if (typeof defaultValue !== 'undefined') {
                        return defaultValue;
                    }
                    throw new Error('Emulated device is missing required property \'' + key + '\'');
                }
                const value = object[key];
                if (typeof value !== type || value === null) {
                    throw new Error('Emulated device property \'' + key + '\' has wrong type \'' + typeof value + '\'');
                }
                return value;
            }
            function parseIntValue(object, key) {
                const value = parseValue(object, key, 'number');
                if (value !== Math.abs(value)) {
                    throw new Error('Emulated device value \'' + key + '\' must be integer');
                }
                return value;
            }
            function parseInsets(json) {
                return new Insets(parseIntValue(json, 'left'), parseIntValue(json, 'top'), parseIntValue(json, 'right'), parseIntValue(json, 'bottom'));
            }
            function parseCutoutShape(json) {
                const shape = parseValue(json, 'shape', 'string');
                if (shape !== "pill" /* CutoutShape.PILL */ && shape !== "notch" /* CutoutShape.NOTCH */ && shape !== "circle" /* CutoutShape.CIRCLE */ &&
                    shape !== "rectangle" /* CutoutShape.RECTANGLE */) {
                    throw new Error('Emulated device mode has unsupported cutout shape: ' + shape);
                }
                return shape;
            }
            function parseRGBA(json) {
                const result = {};
                result.r = parseIntValue(json, 'r');
                if (result.r < 0 || result.r > 255) {
                    throw new Error('color has wrong r value: ' + result.r);
                }
                result.g = parseIntValue(json, 'g');
                if (result.g < 0 || result.g > 255) {
                    throw new Error('color has wrong g value: ' + result.g);
                }
                result.b = parseIntValue(json, 'b');
                if (result.b < 0 || result.b > 255) {
                    throw new Error('color has wrong b value: ' + result.b);
                }
                result.a = parseValue(json, 'a', 'number');
                if (result.a < 0 || result.a > 1) {
                    throw new Error('color has wrong a value: ' + result.a);
                }
                return result;
            }
            function parseHinge(json) {
                const result = {};
                result.width = parseIntValue(json, 'width');
                if (result.width < 0 || result.width > MaxDeviceSize) {
                    throw new Error('Emulated device has wrong hinge width: ' + result.width);
                }
                result.height = parseIntValue(json, 'height');
                if (result.height < 0 || result.height > MaxDeviceSize) {
                    throw new Error('Emulated device has wrong hinge height: ' + result.height);
                }
                result.x = parseIntValue(json, 'x');
                if (result.x < 0 || result.x > MaxDeviceSize) {
                    throw new Error('Emulated device has wrong x offset: ' + result.height);
                }
                result.y = parseIntValue(json, 'y');
                if (result.x < 0 || result.x > MaxDeviceSize) {
                    throw new Error('Emulated device has wrong y offset: ' + result.height);
                }
                if (json['contentColor']) {
                    result.contentColor = parseRGBA(json['contentColor']);
                }
                if (json['outlineColor']) {
                    result.outlineColor = parseRGBA(json['outlineColor']);
                }
                return result;
            }
            function parseOrientation(json) {
                const result = {};
                result.width = parseIntValue(json, 'width');
                if (result.width < 0 || result.width > MaxDeviceSize || result.width < MinDeviceSize) {
                    throw new Error('Emulated device has wrong width: ' + result.width);
                }
                result.height = parseIntValue(json, 'height');
                if (result.height < 0 || result.height > MaxDeviceSize || result.height < MinDeviceSize) {
                    throw new Error('Emulated device has wrong height: ' + result.height);
                }
                if (json['hinge']) {
                    result.hinge = parseHinge(parseValue(json, 'hinge', 'object', undefined));
                }
                return result;
            }
            const result = new EmulatedDevice();
            result.title = parseValue(json, 'title', 'string');
            const type = parseValue(json, 'type', 'string');
            if (!Object.values(Type).includes(type)) {
                throw new Error('Emulated device has wrong type: ' + type);
            }
            result.type = type;
            result.order = parseValue(json, 'order', 'number', 0);
            const rawUserAgent = parseValue(json, 'user-agent', 'string');
            result.userAgent = SDK.NetworkManager.MultitargetNetworkManager.patchUserAgentWithChromeVersion(rawUserAgent);
            const userAgentMetadata = parseValue(json, 'user-agent-metadata', 'object', null);
            result.userAgentMetadata = result.userAgent ? userAgentMetadata : null;
            const capabilities = parseValue(json, 'capabilities', 'object', []);
            if (!Array.isArray(capabilities)) {
                throw new Error('Emulated device capabilities must be an array');
            }
            result.capabilities = [];
            for (let i = 0; i < capabilities.length; ++i) {
                if (typeof capabilities[i] !== 'string') {
                    throw new Error('Emulated device capability must be a string');
                }
                result.capabilities.push(capabilities[i]);
            }
            result.deviceScaleFactor = parseValue(json['screen'], 'device-pixel-ratio', 'number');
            if (result.deviceScaleFactor < 0 || result.deviceScaleFactor > 100) {
                throw new Error('Emulated device has wrong deviceScaleFactor: ' + result.deviceScaleFactor);
            }
            result.vertical = parseOrientation(parseValue(json['screen'], 'vertical', 'object'));
            result.horizontal = parseOrientation(parseValue(json['screen'], 'horizontal', 'object'));
            result.isDualScreen = parseValue(json, 'dual-screen', 'boolean', false);
            result.isFoldableScreen = parseValue(json, 'foldable-screen', 'boolean', false);
            if (result.isDualScreen || result.isFoldableScreen) {
                result.verticalSpanned = parseOrientation(parseValue(json['screen'], 'vertical-spanned', 'object', null));
                result.horizontalSpanned = parseOrientation(parseValue(json['screen'], 'horizontal-spanned', 'object', null));
            }
            if ((result.isDualScreen || result.isFoldableScreen) && (!result.verticalSpanned || !result.horizontalSpanned)) {
                throw new Error('Emulated device \'' + result.title + '\'has dual screen without spanned orientations');
            }
            const modes = parseValue(json, 'modes', 'object', [
                { title: 'default', orientation: 'vertical' },
                { title: 'default', orientation: 'horizontal' },
            ]);
            if (!Array.isArray(modes)) {
                throw new Error('Emulated device modes must be an array');
            }
            result.modes = [];
            for (let i = 0; i < modes.length; ++i) {
                const mode = {};
                mode.title = parseValue(modes[i], 'title', 'string');
                mode.orientation = parseValue(modes[i], 'orientation', 'string');
                if (mode.orientation !== Vertical && mode.orientation !== Horizontal && mode.orientation !== VerticalSpanned &&
                    mode.orientation !== HorizontalSpanned) {
                    throw new Error('Emulated device mode has wrong orientation \'' + mode.orientation + '\'');
                }
                const safeAreaInsets = parseValue(modes[i], 'safe-area-insets', 'object', null);
                if (safeAreaInsets) {
                    mode.safeAreaInsets = parseInsets(safeAreaInsets);
                }
                const cutout = parseValue(modes[i], 'cutout', 'object', null);
                if (cutout) {
                    const shape = parseCutoutShape(cutout);
                    const baseCutout = {
                        x: parseIntValue(cutout, 'x'),
                        y: parseIntValue(cutout, 'y'),
                        width: parseIntValue(cutout, 'width'),
                        height: parseIntValue(cutout, 'height'),
                    };
                    if (shape === "pill" /* CutoutShape.PILL */) {
                        mode.cutout = { shape, ...baseCutout, borderRadius: parseIntValue(cutout, 'border-radius') };
                    }
                    else if (shape === "notch" /* CutoutShape.NOTCH */) {
                        mode.cutout = {
                            shape,
                            ...baseCutout,
                            upperRadius: parseIntValue(cutout, 'upper-radius'),
                            lowerRadius: parseIntValue(cutout, 'lower-radius'),
                        };
                    }
                    else if (shape === "circle" /* CutoutShape.CIRCLE */) {
                        mode.cutout = {
                            shape,
                            ...baseCutout,
                            cx: parseIntValue(cutout, 'cx'),
                            cy: parseIntValue(cutout, 'cy'),
                            radius: parseIntValue(cutout, 'radius'),
                        };
                    }
                    else {
                        mode.cutout = { shape, ...baseCutout };
                    }
                }
                result.modes.push(mode);
            }
            result.#showByDefault = parseValue(json, 'show-by-default', 'boolean', undefined);
            const show = parseValue(json, 'show', 'string', Show.Default);
            if (!Object.values(Show).includes(show)) {
                throw new Error('Emulated device has wrong show mode: ' + show);
            }
            result.#show = show;
            return result;
        }
        catch {
            return null;
        }
    }
    static deviceComparator(device1, device2) {
        const order1 = device1.order || 0;
        const order2 = device2.order || 0;
        if (order1 > order2) {
            return 1;
        }
        if (order2 > order1) {
            return -1;
        }
        return device1.title < device2.title ? -1 : (device1.title > device2.title ? 1 : 0);
    }
    modesForOrientation(orientation) {
        const result = [];
        for (let index = 0; index < this.modes.length; index++) {
            if (this.modes[index].orientation === orientation) {
                result.push(this.modes[index]);
            }
        }
        return result;
    }
    getSpanPartner(mode) {
        switch (mode.orientation) {
            case Vertical:
                return this.modesForOrientation(VerticalSpanned)[0];
            case Horizontal:
                return this.modesForOrientation(HorizontalSpanned)[0];
            case VerticalSpanned:
                return this.modesForOrientation(Vertical)[0];
            default:
                return this.modesForOrientation(Horizontal)[0];
        }
    }
    getRotationPartner(mode) {
        switch (mode.orientation) {
            case HorizontalSpanned:
                return this.modesForOrientation(VerticalSpanned)[0];
            case VerticalSpanned:
                return this.modesForOrientation(HorizontalSpanned)[0];
            case Horizontal:
                return this.modesForOrientation(Vertical)[0];
            default:
                return this.modesForOrientation(Horizontal)[0];
        }
    }
    toJSON() {
        const json = {};
        json['title'] = this.title;
        json['type'] = this.type;
        json['user-agent'] = this.userAgent;
        json['capabilities'] = this.capabilities;
        json['screen'] = {
            'device-pixel-ratio': this.deviceScaleFactor,
            vertical: this.orientationToJSON(this.vertical),
            horizontal: this.orientationToJSON(this.horizontal),
            'vertical-spanned': undefined,
            'horizontal-spanned': undefined,
        };
        if (this.isDualScreen || this.isFoldableScreen) {
            json['screen']['vertical-spanned'] = this.orientationToJSON(this.verticalSpanned);
            json['screen']['horizontal-spanned'] = this.orientationToJSON(this.horizontalSpanned);
        }
        json['modes'] = [];
        for (let i = 0; i < this.modes.length; ++i) {
            const mode = {
                title: this.modes[i].title,
                orientation: this.modes[i].orientation,
            };
            const safeAreaInsets = this.modes[i].safeAreaInsets;
            if (safeAreaInsets) {
                mode['safe-area-insets'] = {
                    left: safeAreaInsets.left,
                    top: safeAreaInsets.top,
                    right: safeAreaInsets.right,
                    bottom: safeAreaInsets.bottom,
                };
            }
            const cutout = this.modes[i].cutout;
            if (cutout) {
                mode.cutout = {
                    shape: cutout.shape,
                    x: cutout.x,
                    y: cutout.y,
                    width: cutout.width,
                    height: cutout.height,
                };
                if (cutout.shape === "pill" /* CutoutShape.PILL */) {
                    mode.cutout['border-radius'] = cutout.borderRadius;
                }
                else if (cutout.shape === "notch" /* CutoutShape.NOTCH */) {
                    mode.cutout['upper-radius'] = cutout.upperRadius;
                    mode.cutout['lower-radius'] = cutout.lowerRadius;
                }
                else if (cutout.shape === "circle" /* CutoutShape.CIRCLE */) {
                    mode.cutout.cx = cutout.cx;
                    mode.cutout.cy = cutout.cy;
                    mode.cutout.radius = cutout.radius;
                }
            }
            json['modes'].push(mode);
        }
        json['show-by-default'] = this.#showByDefault;
        json['dual-screen'] = this.isDualScreen;
        json['foldable-screen'] = this.isFoldableScreen;
        json['show'] = this.#show;
        if (this.userAgent && this.userAgentMetadata) {
            json['user-agent-metadata'] = this.userAgentMetadata;
        }
        return json;
    }
    orientationToJSON(orientation) {
        const json = {};
        json['width'] = orientation.width;
        json['height'] = orientation.height;
        if (orientation.hinge) {
            json.hinge = {
                width: orientation.hinge.width,
                height: orientation.hinge.height,
                x: orientation.hinge.x,
                y: orientation.hinge.y,
            };
            if (orientation.hinge.contentColor) {
                json.hinge.contentColor = {
                    r: orientation.hinge.contentColor.r,
                    g: orientation.hinge.contentColor.g,
                    b: orientation.hinge.contentColor.b,
                    a: orientation.hinge.contentColor.a,
                };
            }
            if (orientation.hinge.outlineColor) {
                json.hinge.outlineColor = {
                    r: orientation.hinge.outlineColor.r,
                    g: orientation.hinge.outlineColor.g,
                    b: orientation.hinge.outlineColor.b,
                    a: orientation.hinge.outlineColor.a,
                };
            }
        }
        return json;
    }
    orientationByName(name) {
        switch (name) {
            case VerticalSpanned:
                return this.verticalSpanned;
            case HorizontalSpanned:
                return this.horizontalSpanned;
            case Vertical:
                return this.vertical;
            default:
                return this.horizontal;
        }
    }
    show() {
        if (this.#show === Show.Default) {
            return this.#showByDefault;
        }
        return this.#show === Show.Always;
    }
    setShow(show) {
        this.#show = show ? Show.Always : Show.Never;
    }
    copyShowFrom(other) {
        this.#show = other.#show;
    }
    touch() {
        return this.capabilities.indexOf("touch" /* Capability.TOUCH */) !== -1;
    }
    mobile() {
        return this.capabilities.indexOf("mobile" /* Capability.MOBILE */) !== -1;
    }
}
export const Horizontal = 'horizontal';
export const Vertical = 'vertical';
export const HorizontalSpanned = 'horizontal-spanned';
export const VerticalSpanned = 'vertical-spanned';
export var Type;
(function (Type) {
    /* eslint-disable @typescript-eslint/naming-convention -- Indexed access. */
    Type["Phone"] = "phone";
    Type["Tablet"] = "tablet";
    Type["Notebook"] = "notebook";
    Type["Desktop"] = "desktop";
    Type["Foldable"] = "foldable";
    Type["SmartDisplay"] = "smart-display";
    Type["Unknown"] = "unknown";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Type || (Type = {}));
export function deviceCategory(device) {
    if (device.type === Type.Foldable || device.isFoldableScreen || device.isDualScreen) {
        return "foldable" /* Category.FOLDABLE */;
    }
    if (device.type === Type.SmartDisplay) {
        return "smart_display" /* Category.SMART_DISPLAY */;
    }
    if (device.type === Type.Tablet || device.type === Type.Notebook || device.type === Type.Desktop) {
        return "tablet_desktop" /* Category.TABLET_DESKTOP */;
    }
    return "mobile" /* Category.MOBILE */;
}
export const CATEGORY_ORDER = [
    "mobile" /* Category.MOBILE */,
    "foldable" /* Category.FOLDABLE */,
    "tablet_desktop" /* Category.TABLET_DESKTOP */,
    "smart_display" /* Category.SMART_DISPLAY */,
];
export function getCategoryTitle(category) {
    switch (category) {
        case "mobile" /* Category.MOBILE */:
            return i18nString(UIStrings.mobileGroup);
        case "foldable" /* Category.FOLDABLE */:
            return i18nString(UIStrings.foldablesGroup);
        case "tablet_desktop" /* Category.TABLET_DESKTOP */:
            return i18nString(UIStrings.tabletsAndDesktopsGroup);
        case "smart_display" /* Category.SMART_DISPLAY */:
            return i18nString(UIStrings.smartDisplaysGroup);
    }
}
var Show;
(function (Show) {
    /* eslint-disable @typescript-eslint/naming-convention -- Indexed access. */
    Show["Always"] = "Always";
    Show["Default"] = "Default";
    Show["Never"] = "Never";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Show || (Show = {}));
export class EmulatedDevicesList extends Common.ObjectWrapper.ObjectWrapper {
    #standardSetting;
    #standard;
    #customSetting;
    #custom;
    constructor(settings) {
        super();
        this.#standardSetting = settings.createSetting('standard-emulated-device-list', []);
        this.#standard = new Set();
        this.listFromJSONV1(this.#standardSetting.get(), this.#standard);
        this.updateStandardDevices();
        this.#customSetting = settings.createSetting('custom-emulated-device-list', []);
        this.#custom = new Set();
        if (!this.listFromJSONV1(this.#customSetting.get(), this.#custom)) {
            this.saveCustomDevices();
        }
    }
    static instance() {
        if (!Root.DevToolsContext.globalInstance().has(EmulatedDevicesList)) {
            Root.DevToolsContext.globalInstance().set(EmulatedDevicesList, 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            new EmulatedDevicesList(Common.Settings.Settings.instance()));
        }
        return Root.DevToolsContext.globalInstance().get(EmulatedDevicesList);
    }
    updateStandardDevices() {
        const devices = new Set();
        for (const emulatedDevice of emulatedDevices) {
            const device = EmulatedDevice.fromJSONV1(emulatedDevice);
            if (device) {
                devices.add(device);
            }
        }
        this.copyShowValues(this.#standard, devices);
        this.#standard = devices;
        this.saveStandardDevices();
    }
    listFromJSONV1(jsonArray, result) {
        if (!Array.isArray(jsonArray)) {
            return false;
        }
        let success = true;
        for (let i = 0; i < jsonArray.length; ++i) {
            const device = EmulatedDevice.fromJSONV1(jsonArray[i]);
            if (device) {
                result.add(device);
                if (!device.modes.length) {
                    device.modes.push({
                        title: '',
                        orientation: Horizontal,
                    });
                    device.modes.push({
                        title: '',
                        orientation: Vertical,
                    });
                }
            }
            else {
                success = false;
            }
        }
        return success;
    }
    static rawEmulatedDevicesForTest() {
        return emulatedDevices;
    }
    standard() {
        return [...this.#standard];
    }
    custom() {
        return [...this.#custom];
    }
    revealCustomSetting() {
        void Common.Revealer.reveal(this.#customSetting);
    }
    addCustomDevice(device) {
        this.#custom.add(device);
        this.saveCustomDevices();
    }
    removeCustomDevice(device) {
        this.#custom.delete(device);
        this.saveCustomDevices();
    }
    saveCustomDevices() {
        const json = [];
        this.#custom.forEach(device => json.push(device.toJSON()));
        this.#customSetting.set(json);
        this.dispatchEventToListeners("CustomDevicesUpdated" /* Events.CUSTOM_DEVICES_UPDATED */);
    }
    saveStandardDevices() {
        const json = [];
        this.#standard.forEach(device => json.push(device.toJSON()));
        this.#standardSetting.set(json);
        this.dispatchEventToListeners("StandardDevicesUpdated" /* Events.STANDARD_DEVICES_UPDATED */);
    }
    copyShowValues(from, to) {
        const fromDeviceById = new Map();
        for (const device of from) {
            fromDeviceById.set(device.title, device);
        }
        for (const toDevice of to) {
            const fromDevice = fromDeviceById.get(toDevice.title);
            if (fromDevice) {
                toDevice.copyShowFrom(fromDevice);
            }
        }
    }
}
// These props should quoted for the script to work properly
/* eslint-disable @stylistic/quote-props */
// TODO(crbug.com/40718410): Add Android system navigation bar safe areas to the Pixel presets.
const emulatedDevices = [
    // This is used by a python script to keep this list up-to-date with
    // chromedriver native code.
    // See //chrome/test/chromedriver/embed_mobile_devices_in_cpp.py in Chromium.
    // DEVICE-LIST-BEGIN
    {
        'order': 10,
        'show-by-default': true,
        'title': 'iPhone SE',
        'screen': {
            'horizontal': {
                'width': 667,
                'height': 375,
            },
            'device-pixel-ratio': 2,
            'vertical': {
                'width': 375,
                'height': 667,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
    },
    {
        'order': 12,
        'show-by-default': false,
        'title': 'iPhone XR',
        'screen': {
            'horizontal': {
                'width': 896,
                'height': 414,
            },
            'device-pixel-ratio': 2,
            'vertical': {
                'width': 414,
                'height': 896,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 44, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'notch', 'x': 92, 'y': 0, 'width': 231, 'height': 33, 'upper-radius': 6, 'lower-radius': 25 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 44, 'top': 0, 'right': 44, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 14,
        'show-by-default': false,
        'title': 'iPhone 12 Pro',
        'screen': {
            'horizontal': {
                'width': 844,
                'height': 390,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 390,
                'height': 844,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 47, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'notch', 'x': 90, 'y': 0, 'width': 210, 'height': 32, 'upper-radius': 6, 'lower-radius': 23 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 47, 'top': 0, 'right': 47, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 15,
        'show-by-default': false,
        'title': 'iPhone 14',
        'screen': {
            'horizontal': {
                'width': 844,
                'height': 390,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 390,
                'height': 844,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 47, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'notch', 'x': 114, 'y': 0, 'width': 162, 'height': 34, 'upper-radius': 5, 'lower-radius': 22 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 47, 'top': 0, 'right': 47, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 16,
        'show-by-default': false,
        'title': 'iPhone 14 Plus',
        'screen': {
            'horizontal': {
                'width': 926,
                'height': 428,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 428,
                'height': 926,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 47, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'notch', 'x': 133, 'y': 0, 'width': 161, 'height': 34, 'upper-radius': 5, 'lower-radius': 22 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 47, 'top': 0, 'right': 47, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 17,
        'show-by-default': false,
        'title': 'iPhone 14 Pro',
        'screen': {
            'horizontal': {
                'width': 852,
                'height': 393,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 393,
                'height': 852,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 59, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 134, 'y': 11, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 59, 'top': 0, 'right': 59, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 18,
        'show-by-default': false,
        'title': 'iPhone 14 Pro Max',
        'screen': {
            'horizontal': {
                'width': 932,
                'height': 430,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 430,
                'height': 932,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 59, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 153, 'y': 11, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 59, 'top': 0, 'right': 59, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 19,
        'show-by-default': false,
        'title': 'iPhone 15',
        'screen': {
            'horizontal': {
                'width': 852,
                'height': 393,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 393,
                'height': 852,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 59, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 134, 'y': 11, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 59, 'top': 0, 'right': 59, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 20,
        'show-by-default': false,
        'title': 'iPhone 15 Plus',
        'screen': {
            'horizontal': {
                'width': 932,
                'height': 430,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 430,
                'height': 932,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 59, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 153, 'y': 11, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 59, 'top': 0, 'right': 59, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 21,
        'show-by-default': false,
        'title': 'iPhone 15 Pro',
        'screen': {
            'horizontal': {
                'width': 852,
                'height': 393,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 393,
                'height': 852,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 59, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 134, 'y': 11, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 59, 'top': 0, 'right': 59, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 22,
        'show-by-default': false,
        'title': 'iPhone 15 Pro Max',
        'screen': {
            'horizontal': {
                'width': 932,
                'height': 430,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 430,
                'height': 932,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 59, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 153, 'y': 11, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 59, 'top': 0, 'right': 59, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 23,
        'show-by-default': false,
        'title': 'iPhone 16e',
        'screen': {
            'horizontal': {
                'width': 844,
                'height': 390,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 390,
                'height': 844,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 47, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'notch', 'x': 114, 'y': 0, 'width': 162, 'height': 34, 'upper-radius': 5, 'lower-radius': 22 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 47, 'top': 0, 'right': 47, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 24,
        'show-by-default': true,
        'title': 'iPhone 16',
        'screen': {
            'horizontal': {
                'width': 852,
                'height': 393,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 393,
                'height': 852,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 59, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 134, 'y': 11, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 59, 'top': 0, 'right': 59, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 25,
        'show-by-default': false,
        'title': 'iPhone 16 Plus',
        'screen': {
            'horizontal': {
                'width': 932,
                'height': 430,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 430,
                'height': 932,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 59, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 153, 'y': 11, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 59, 'top': 0, 'right': 59, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 26,
        'show-by-default': false,
        'title': 'iPhone 16 Pro',
        'screen': {
            'horizontal': {
                'width': 874,
                'height': 402,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 402,
                'height': 874,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 62, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 139, 'y': 14, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 62, 'top': 0, 'right': 62, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 27,
        'show-by-default': true,
        'title': 'iPhone 16 Pro Max',
        'screen': {
            'horizontal': {
                'width': 956,
                'height': 440,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 440,
                'height': 956,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPhone', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 62, 'right': 0, 'bottom': 34 },
                'cutout': { 'shape': 'pill', 'x': 158, 'y': 14, 'width': 125, 'height': 37, 'border-radius': 19 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 62, 'top': 0, 'right': 62, 'bottom': 21 },
            },
        ],
    },
    {
        'order': 30,
        'show-by-default': false,
        'title': 'Pixel 7',
        'screen': {
            'horizontal': {
                'width': 915,
                'height': 412,
            },
            'device-pixel-ratio': 2.625,
            'vertical': {
                'width': 412,
                'height': 915,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '13', 'architecture': '', 'model': 'Pixel 7', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 52, 'right': 0, 'bottom': 0 },
                'cutout': { 'shape': 'circle', 'x': 183, 'y': 0, 'width': 55, 'height': 52, 'cx': 206, 'cy': 26, 'radius': 13 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 0, 'top': 0, 'right': 52, 'bottom': 0 },
            },
        ],
    },
    {
        'order': 31,
        'show-by-default': false,
        'title': 'Pixel 8',
        'screen': {
            'horizontal': {
                'width': 915,
                'height': 412,
            },
            'device-pixel-ratio': 2.625,
            'vertical': {
                'width': 412,
                'height': 915,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '14', 'architecture': '', 'model': 'Pixel 8', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 50, 'right': 0, 'bottom': 0 },
                'cutout': { 'shape': 'circle', 'x': 182, 'y': 0, 'width': 46, 'height': 50, 'cx': 206, 'cy': 25, 'radius': 14 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 0, 'top': 0, 'right': 50, 'bottom': 0 },
            },
        ],
    },
    {
        'order': 32,
        'show-by-default': false,
        'title': 'Pixel 8 Pro',
        'screen': {
            'horizontal': {
                'width': 997,
                'height': 448,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 448,
                'height': 997,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '14', 'architecture': '', 'model': 'Pixel 8 Pro', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 50, 'right': 0, 'bottom': 0 },
                'cutout': { 'shape': 'circle', 'x': 205, 'y': 0, 'width': 37, 'height': 50, 'cx': 224, 'cy': 25, 'radius': 14 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 0, 'top': 0, 'right': 50, 'bottom': 0 },
            },
        ],
    },
    {
        'order': 33,
        'show-by-default': false,
        'title': 'Pixel 8a',
        'screen': {
            'horizontal': {
                'width': 915,
                'height': 412,
            },
            'device-pixel-ratio': 2.625,
            'vertical': {
                'width': 412,
                'height': 915,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '14', 'architecture': '', 'model': 'Pixel 8a', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 46, 'right': 0, 'bottom': 0 },
                'cutout': { 'shape': 'circle', 'x': 185, 'y': 0, 'width': 42, 'height': 46, 'cx': 206, 'cy': 26, 'radius': 13 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 0, 'top': 0, 'right': 46, 'bottom': 0 },
            },
        ],
    },
    {
        'order': 34,
        'show-by-default': true,
        'title': 'Pixel 9',
        'screen': {
            'horizontal': {
                'width': 924,
                'height': 412,
            },
            'device-pixel-ratio': 2.625,
            'vertical': {
                'width': 412,
                'height': 924,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '14', 'architecture': '', 'model': 'Pixel 9', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 58, 'right': 0, 'bottom': 0 },
                'cutout': { 'shape': 'circle', 'x': 188, 'y': 0, 'width': 37, 'height': 58, 'cx': 206, 'cy': 29, 'radius': 14 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 0, 'top': 0, 'right': 58, 'bottom': 0 },
            },
        ],
    },
    {
        'order': 35,
        'show-by-default': true,
        'title': 'Pixel 9 Pro',
        'screen': {
            'horizontal': {
                'width': 952,
                'height': 427,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 427,
                'height': 952,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '14', 'architecture': '', 'model': 'Pixel 9 Pro', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 68, 'right': 0, 'bottom': 0 },
                'cutout': { 'shape': 'circle', 'x': 195, 'y': 0, 'width': 36, 'height': 68, 'cx': 213, 'cy': 34, 'radius': 16 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 0, 'top': 0, 'right': 68, 'bottom': 0 },
            },
        ],
    },
    {
        'order': 36,
        'show-by-default': false,
        'title': 'Pixel 9 Pro XL',
        'screen': {
            'horizontal': {
                'width': 997,
                'height': 448,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 448,
                'height': 997,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '14', 'architecture': '', 'model': 'Pixel 9 Pro XL', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 66, 'right': 0, 'bottom': 0 },
                'cutout': { 'shape': 'circle', 'x': 205, 'y': 0, 'width': 38, 'height': 66, 'cx': 224, 'cy': 33, 'radius': 16 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 0, 'top': 0, 'right': 66, 'bottom': 0 },
            },
        ],
    },
    {
        'order': 37,
        'show-by-default': true,
        'title': 'Pixel 10',
        'screen': {
            'horizontal': {
                'width': 924,
                'height': 412,
            },
            'device-pixel-ratio': 2.625,
            'vertical': {
                'width': 412,
                'height': 924,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '16', 'architecture': '', 'model': 'Pixel 10', 'mobile': true },
        'type': 'phone',
        'modes': [
            {
                'title': 'default',
                'orientation': 'vertical',
                'safe-area-insets': { 'left': 0, 'top': 58, 'right': 0, 'bottom': 0 },
                'cutout': { 'shape': 'circle', 'x': 188, 'y': 0, 'width': 37, 'height': 58, 'cx': 206, 'cy': 29, 'radius': 14 },
            },
            {
                'title': 'default',
                'orientation': 'horizontal',
                'safe-area-insets': { 'left': 0, 'top': 0, 'right': 58, 'bottom': 0 },
            },
        ],
    },
    {
        'order': 38,
        'show-by-default': false,
        'title': 'Samsung Galaxy S8+',
        'screen': {
            'horizontal': {
                'width': 740,
                'height': 360,
            },
            'device-pixel-ratio': 4,
            'vertical': {
                'width': 360,
                'height': 740,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '8.0.0', 'architecture': '', 'model': 'SM-G955U', 'mobile': true },
        'type': 'phone',
    },
    {
        'order': 39,
        'show-by-default': false,
        'title': 'Samsung Galaxy S20 Ultra',
        'screen': {
            'horizontal': {
                'width': 915,
                'height': 412,
            },
            'device-pixel-ratio': 3.5,
            'vertical': {
                'width': 412,
                'height': 915,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '13', 'architecture': '', 'model': 'SM-G981B', 'mobile': true },
        'type': 'phone',
    },
    {
        'order': 43,
        'show-by-default': false,
        'title': 'Surface Pro 7',
        'screen': {
            'horizontal': {
                'width': 1368,
                'height': 912,
            },
            'device-pixel-ratio': 2,
            'vertical': {
                'width': 912,
                'height': 1368,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Safari/537.36',
        'type': 'tablet',
    },
    {
        'order': 40,
        'show-by-default': true,
        'title': 'iPad Mini',
        'screen': {
            'horizontal': {
                'width': 1024,
                'height': 768,
            },
            'device-pixel-ratio': 2,
            'vertical': {
                'width': 768,
                'height': 1024,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPad', 'mobile': true },
        'type': 'tablet',
    },
    {
        'order': 42,
        'show-by-default': true,
        'title': 'iPad Pro 13',
        'screen': {
            'horizontal': {
                'width': 1376,
                'height': 1032,
            },
            'device-pixel-ratio': 2,
            'vertical': {
                'width': 1032,
                'height': 1376,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
        'user-agent-metadata': { 'platform': 'iOS', 'platformVersion': '18.5', 'architecture': '', 'model': 'iPad', 'mobile': true },
        'type': 'tablet',
    },
    {
        'order': 43,
        'show-by-default': true,
        'title': 'Surface Pro 10',
        'screen': {
            'horizontal': {
                'width': 1440,
                'height': 960,
            },
            'device-pixel-ratio': 2,
            'vertical': {
                'width': 960,
                'height': 1440,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Safari/537.36',
        'type': 'tablet',
    },
    {
        'order': 44,
        'show-by-default': false,
        'dual-screen': true,
        'title': 'Surface Duo',
        'screen': {
            'horizontal': { 'width': 720, 'height': 540 },
            'device-pixel-ratio': 2.5,
            'vertical': { 'width': 540, 'height': 720 },
            'vertical-spanned': {
                'width': 1114,
                'height': 720,
                'hinge': { 'width': 34, 'height': 720, 'x': 540, 'y': 0, 'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 1 } },
            },
            'horizontal-spanned': {
                'width': 720,
                'height': 1114,
                'hinge': { 'width': 720, 'height': 34, 'x': 0, 'y': 540, 'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 1 } },
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 11.0; Surface Duo) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '11.0', 'architecture': '', 'model': 'Surface Duo', 'mobile': true },
        'type': 'phone',
        'modes': [
            { 'title': 'default', 'orientation': 'vertical' },
            { 'title': 'default', 'orientation': 'horizontal' },
            { 'title': 'spanned', 'orientation': 'vertical-spanned' },
            {
                'title': 'spanned',
                'orientation': 'horizontal-spanned',
            },
        ],
    },
    {
        'order': 38,
        'show-by-default': true,
        'title': 'Samsung Galaxy A55',
        'screen': {
            'horizontal': { 'width': 800, 'height': 360 },
            'device-pixel-ratio': 2.25,
            'vertical': { 'width': 360, 'height': 800 },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '14', 'architecture': '', 'model': 'SM-A556B', 'mobile': true },
        'type': 'phone',
    },
    {
        'order': 45,
        'show-by-default': true,
        'foldable-screen': true,
        'title': 'Pixel 9 Pro Fold',
        'screen': {
            'horizontal': { 'width': 922, 'height': 412 },
            'device-pixel-ratio': 2.625,
            'vertical': { 'width': 412, 'height': 922 },
            'vertical-spanned': {
                'width': 836,
                'height': 842,
                'hinge': {
                    'width': 0,
                    'height': 842,
                    'x': 418,
                    'y': 0,
                    'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.2 },
                    'outlineColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.7 },
                },
            },
            'horizontal-spanned': {
                'width': 842,
                'height': 836,
                'hinge': {
                    'width': 842,
                    'height': 0,
                    'x': 0,
                    'y': 418,
                    'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.2 },
                    'outlineColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.7 },
                },
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro Fold) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': {
            'platform': 'Android',
            'platformVersion': '14',
            'architecture': '',
            'model': 'Pixel 9 Pro Fold',
            'mobile': true,
        },
        'type': 'phone',
        'modes': [
            { 'title': 'default', 'orientation': 'vertical' },
            { 'title': 'default', 'orientation': 'horizontal' },
            { 'title': 'spanned', 'orientation': 'vertical-spanned' },
            {
                'title': 'spanned',
                'orientation': 'horizontal-spanned',
            },
        ],
    },
    {
        'order': 46,
        'show-by-default': true,
        'foldable-screen': true,
        'title': 'Galaxy Z Fold 6',
        'screen': {
            'horizontal': { 'width': 968, 'height': 412 },
            'device-pixel-ratio': 2.625,
            'vertical': { 'width': 412, 'height': 968 },
            'vertical-spanned': {
                'width': 744,
                'height': 860,
                'hinge': {
                    'width': 0,
                    'height': 860,
                    'x': 372,
                    'y': 0,
                    'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.2 },
                    'outlineColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.7 },
                },
            },
            'horizontal-spanned': {
                'width': 860,
                'height': 744,
                'hinge': {
                    'width': 860,
                    'height': 0,
                    'x': 0,
                    'y': 372,
                    'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.2 },
                    'outlineColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.7 },
                },
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-F956U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '14', 'architecture': '', 'model': 'SM-F956U', 'mobile': true },
        'type': 'phone',
        'modes': [
            { 'title': 'default', 'orientation': 'vertical' },
            { 'title': 'default', 'orientation': 'horizontal' },
            { 'title': 'spanned', 'orientation': 'vertical-spanned' },
            {
                'title': 'spanned',
                'orientation': 'horizontal-spanned',
            },
        ],
    },
    {
        'order': 46,
        'show-by-default': false,
        'foldable-screen': true,
        'title': 'Galaxy Z Fold 5',
        'screen': {
            'horizontal': { 'width': 882, 'height': 344 },
            'device-pixel-ratio': 2.625,
            'vertical': { 'width': 344, 'height': 882 },
            'vertical-spanned': {
                'width': 690,
                'height': 829,
                'hinge': {
                    'width': 0,
                    'height': 829,
                    'x': 345,
                    'y': 0,
                    'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.2 },
                    'outlineColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.7 },
                },
            },
            'horizontal-spanned': {
                'width': 829,
                'height': 690,
                'hinge': {
                    'width': 829,
                    'height': 0,
                    'x': 0,
                    'y': 345,
                    'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.2 },
                    'outlineColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.7 },
                },
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '10.0', 'architecture': '', 'model': 'SM-F946U', 'mobile': true },
        'type': 'phone',
        'modes': [
            { 'title': 'default', 'orientation': 'vertical' },
            { 'title': 'default', 'orientation': 'horizontal' },
            { 'title': 'spanned', 'orientation': 'vertical-spanned' },
            {
                'title': 'spanned',
                'orientation': 'horizontal-spanned',
            },
        ],
    },
    {
        'order': 47,
        'show-by-default': false,
        'foldable-screen': true,
        'title': 'Asus Zenbook Fold',
        'screen': {
            'horizontal': { 'width': 1280, 'height': 853 },
            'device-pixel-ratio': 1.5,
            'vertical': { 'width': 853, 'height': 1280 },
            'vertical-spanned': {
                'width': 1706,
                'height': 1280,
                'hinge': {
                    'width': 107,
                    'height': 1280,
                    'x': 800,
                    'y': 0,
                    'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.2 },
                    'outlineColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.7 },
                },
            },
            'horizontal-spanned': {
                'width': 1280,
                'height': 1706,
                'hinge': {
                    'width': 1706,
                    'height': 107,
                    'x': 0,
                    'y': 800,
                    'contentColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.2 },
                    'outlineColor': { 'r': 38, 'g': 38, 'b': 38, 'a': 0.7 },
                },
            },
        },
        'capabilities': ['touch'],
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Safari/537.36',
        'user-agent-metadata': { 'platform': 'Windows', 'platformVersion': '11.0', 'architecture': '', 'model': 'UX9702AA', 'mobile': false },
        'type': 'tablet',
        'modes': [
            { 'title': 'default', 'orientation': 'vertical' },
            { 'title': 'default', 'orientation': 'horizontal' },
            {
                'title': 'spanned',
                'orientation': 'vertical-spanned',
            },
            {
                'title': 'spanned',
                'orientation': 'horizontal-spanned',
            },
        ],
    },
    {
        'order': 48,
        'show-by-default': false,
        'title': 'Samsung Galaxy A51/71',
        'screen': {
            'horizontal': {
                'width': 914,
                'height': 412,
            },
            'device-pixel-ratio': 2.625,
            'vertical': {
                'width': 412,
                'height': 914,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '8.0.0', 'architecture': '', 'model': 'SM-G955U', 'mobile': true },
        'type': 'phone',
    },
    {
        'order': 52,
        'show-by-default': true,
        'title': 'Nest Hub Max',
        'screen': {
            'horizontal': {
                'width': 1280,
                'height': 800,
            },
            'device-pixel-ratio': 2,
            'vertical': {
                'width': 1280,
                'height': 800,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Safari/537.36 CrKey/1.54.250320',
        'type': 'smart-display',
        'modes': [{ 'title': 'default', 'orientation': 'horizontal' }],
    },
    {
        'show-by-default': false,
        'title': 'Galaxy Tab S4',
        'screen': {
            'horizontal': { 'width': 1138, 'height': 712 },
            'device-pixel-ratio': 2.25,
            'vertical': { 'width': 712, 'height': 1138 },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 8.1.0; SM-T837A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '8.1.0', 'architecture': '', 'model': 'SM-T837A', 'mobile': false },
        'type': 'phone',
    },
    {
        'order': 1,
        'show-by-default': false,
        'title': 'JioPhone 2',
        'screen': {
            'horizontal': { 'width': 320, 'height': 240 },
            'device-pixel-ratio': 1,
            'vertical': { 'width': 240, 'height': 320 },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Mobile; LYF/F300B/LYF-F300B-001-01-15-130718-i;Android; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.5',
        'user-agent-metadata': {
            'platform': 'Android',
            'platformVersion': '',
            'architecture': '',
            'model': 'LYF/F300B/LYF-F300B-001-01-15-130718-i',
            'mobile': true,
        },
        'type': 'phone',
    },
    {
        'show-by-default': false,
        /* DEVICE-LIST-IF-JS */
        'title': i18nLazyString(UIStrings.laptopWithTouch),
        /* DEVICE-LIST-ELSE
        'title': 'Laptop with touch',
        DEVICE-LIST-END-IF */
        'screen': {
            'horizontal': { 'width': 1280, 'height': 950 },
            'device-pixel-ratio': 1,
            'vertical': { 'width': 950, 'height': 1280 },
        },
        'capabilities': ['touch'],
        'user-agent': '',
        'type': 'notebook',
        'modes': [{ 'title': 'default', 'orientation': 'horizontal' }],
    },
    {
        'show-by-default': false,
        /* DEVICE-LIST-IF-JS */
        'title': i18nLazyString(UIStrings.laptopWithHiDPIScreen),
        /* DEVICE-LIST-ELSE
        'title': 'Laptop with HiDPI screen',
        DEVICE-LIST-END-IF */
        'screen': {
            'horizontal': { 'width': 1440, 'height': 900 },
            'device-pixel-ratio': 2,
            'vertical': { 'width': 900, 'height': 1440 },
        },
        'capabilities': [],
        'user-agent': '',
        'type': 'notebook',
        'modes': [{ 'title': 'default', 'orientation': 'horizontal' }],
    },
    {
        'show-by-default': false,
        /* DEVICE-LIST-IF-JS */
        'title': i18nLazyString(UIStrings.laptopWithMDPIScreen),
        /* DEVICE-LIST-ELSE
        'title': 'Laptop with MDPI screen',
        DEVICE-LIST-END-IF */
        'screen': {
            'horizontal': { 'width': 1280, 'height': 800 },
            'device-pixel-ratio': 1,
            'vertical': { 'width': 800, 'height': 1280 },
        },
        'capabilities': [],
        'user-agent': '',
        'type': 'notebook',
        'modes': [{ 'title': 'default', 'orientation': 'horizontal' }],
    },
    {
        'show-by-default': false,
        'title': 'Moto G4',
        'screen': {
            'horizontal': {
                'width': 640,
                'height': 360,
            },
            'device-pixel-ratio': 3,
            'vertical': {
                'width': 360,
                'height': 640,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '6.0.1', 'architecture': '', 'model': 'Moto G (4)', 'mobile': true },
        'type': 'phone',
    },
    {
        'show-by-default': false,
        'title': 'Moto G Power',
        'screen': {
            'device-pixel-ratio': 1.75,
            'horizontal': {
                'width': 823,
                'height': 412,
            },
            'vertical': {
                'width': 412,
                'height': 823,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36',
        'user-agent-metadata': {
            'platform': 'Android',
            'platformVersion': '11',
            'architecture': '',
            'model': 'moto g power (2022)',
            'mobile': true,
        },
        'type': 'phone',
    },
    {
        'order': 200,
        'show-by-default': false,
        'title': 'Facebook on Android',
        'screen': {
            'horizontal': {
                'width': 892,
                'height': 412,
            },
            'device-pixel-ratio': 3.5,
            'vertical': {
                'width': 412,
                'height': 892,
            },
        },
        'capabilities': ['touch', 'mobile'],
        'user-agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SQ3A.220705.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/%s Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/407.0.0.0.65;]',
        'user-agent-metadata': { 'platform': 'Android', 'platformVersion': '12', 'architecture': '', 'model': 'Pixel 6', 'mobile': true },
        'type': 'phone',
    },
    // DEVICE-LIST-END
];
/* eslint-enable @stylistic/quote-props */
//# sourceMappingURL=EmulatedDevices.js.map