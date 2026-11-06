import { type Color3D, type Color4D, type Color4DOr3D } from './ColorUtils.js';
/** Returns the `Format` equivalent from the format text **/
export declare function getFormat(formatText: string): Format | null;
type ColorSpace = Format.SRGB | Format.SRGB_LINEAR | Format.DISPLAY_P3 | Format.DISPLAY_P3_LINEAR | Format.A98_RGB | Format.PROPHOTO_RGB | Format.REC_2020 | Format.XYZ | Format.XYZ_D50 | Format.XYZ_D65;
export declare const enum ColorChannel {
    A = "a",
    ALPHA = "alpha",
    B = "b",
    C = "c",
    G = "g",
    H = "h",
    L = "l",
    R = "r",
    S = "s",
    W = "w",
    X = "x",
    Y = "y",
    Z = "z"
}
export declare function parse(text: string): Color | null;
export declare function parseHueNumeric(value: string): number | null;
export declare function hsl2rgb(hsl: Color4D): Color4D;
export declare function hsva2rgba(hsva: Color4D): Color4D;
export declare function rgb2hsv(rgba: Color3D): Color3D;
/**
 * Compute a desired luminance given a given luminance and a desired contrast
 * ratio.
 */
export declare function desiredLuminance(luminance: number, contrast: number, lighter: boolean): number;
/**
 * Approach a value of the given component of `candidateHSVA` such that the
 * calculated luminance of `candidateHSVA` approximates `desiredLuminance`.
 */
export declare function approachColorValue(candidateHSVA: Color4D, index: number, desiredLuminance: number, candidateLuminance: (arg0: Color4D) => number): number | null;
export declare function findFgColorForContrast(fgColor: Legacy, bgColor: Legacy, requiredContrast: number): Legacy | null;
export declare function findFgColorForContrastAPCA(fgColor: Legacy, bgColor: Legacy, requiredContrast: number): Legacy | null;
type ColorParameterSpec = [string, string, string, string | undefined];
interface ColorConversions<T = void> {
    [Format.HEX](self: T): Legacy;
    [Format.HEXA](self: T): Legacy;
    [Format.RGB](self: T): Legacy;
    [Format.RGBA](self: T): Legacy;
    [Format.HSL](self: T): HSL;
    [Format.HSLA](self: T): HSL;
    [Format.HWB](self: T): HWB;
    [Format.HWBA](self: T): HWB;
    [Format.LCH](self: T): LCH;
    [Format.OKLCH](self: T): Oklch;
    [Format.LAB](self: T): Lab;
    [Format.OKLAB](self: T): Oklab;
    [Format.SRGB](self: T): ColorFunction;
    [Format.SRGB_LINEAR](self: T): ColorFunction;
    [Format.DISPLAY_P3](self: T): ColorFunction;
    [Format.DISPLAY_P3_LINEAR](self: T): ColorFunction;
    [Format.A98_RGB](self: T): ColorFunction;
    [Format.PROPHOTO_RGB](self: T): ColorFunction;
    [Format.REC_2020](self: T): ColorFunction;
    [Format.XYZ](self: T): ColorFunction;
    [Format.XYZ_D50](self: T): ColorFunction;
    [Format.XYZ_D65](self: T): ColorFunction;
}
export interface Color {
    readonly alpha: number | null;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    equal(color: Color): boolean;
    asString(format?: Format): string;
    setAlpha(alpha: number): Color;
    format(): Format;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    asLegacyColor(): Legacy;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
}
export declare const enum Format {
    HEX = "hex",
    HEXA = "hexa",
    RGB = "rgb",
    RGBA = "rgba",
    HSL = "hsl",
    HSLA = "hsla",
    HWB = "hwb",
    HWBA = "hwba",
    LCH = "lch",
    OKLCH = "oklch",
    LAB = "lab",
    OKLAB = "oklab",
    SRGB = "srgb",
    SRGB_LINEAR = "srgb-linear",
    DISPLAY_P3 = "display-p3",
    DISPLAY_P3_LINEAR = "display-p3-linear",
    A98_RGB = "a98-rgb",
    PROPHOTO_RGB = "prophoto-rgb",
    REC_2020 = "rec2020",
    XYZ = "xyz",
    XYZ_D50 = "xyz-d50",
    XYZ_D65 = "xyz-d65"
}
export declare class Lab implements Color {
    #private;
    readonly l: number;
    readonly a: number;
    readonly b: number;
    readonly alpha: number | null;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    constructor(l: number, a: number, b: number, alpha: number | null, authoredText?: string);
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    asLegacyColor(): Legacy;
    equal(color: Color): boolean;
    format(): Format;
    setAlpha(alpha: number): Lab;
    asString(format?: Format): string;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
    static fromSpec(spec: ColorParameterSpec, text: string): Lab | null;
}
export declare class LCH implements Color {
    #private;
    readonly l: number;
    readonly c: number;
    readonly h: number;
    readonly alpha: number | null;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    constructor(l: number, c: number, h: number, alpha: number | null, authoredText?: string);
    asLegacyColor(): Legacy;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    equal(color: Color): boolean;
    format(): Format;
    setAlpha(alpha: number): Color;
    asString(format?: Format): string;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
    isHuePowerless(): boolean;
    static fromSpec(spec: ColorParameterSpec, text: string): LCH | null;
}
export declare class Oklab implements Color {
    #private;
    readonly l: number;
    readonly a: number;
    readonly b: number;
    readonly alpha: number | null;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    constructor(l: number, a: number, b: number, alpha: number | null, authoredText?: string);
    asLegacyColor(): Legacy;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    equal(color: Color): boolean;
    format(): Format;
    setAlpha(alpha: number): Color;
    asString(format?: Format): string;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
    static fromSpec(spec: ColorParameterSpec, text: string): Oklab | null;
}
export declare class Oklch implements Color {
    #private;
    readonly l: number;
    readonly c: number;
    readonly h: number;
    readonly alpha: number | null;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    constructor(l: number, c: number, h: number, alpha: number | null, authoredText?: string);
    asLegacyColor(): Legacy;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    equal(color: Color): boolean;
    format(): Format;
    setAlpha(alpha: number): Color;
    asString(format?: Format): string;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
    static fromSpec(spec: ColorParameterSpec, text: string): Oklch | null;
}
export declare class ColorFunction implements Color {
    #private;
    readonly p0: number;
    readonly p1: number;
    readonly p2: number;
    readonly alpha: number | null;
    readonly colorSpace: ColorSpace;
    get channels(): [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    constructor(colorSpace: ColorSpace, p0: number, p1: number, p2: number, alpha: number | null, authoredText?: string);
    asLegacyColor(): Legacy;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    equal(color: Color): boolean;
    format(): Format;
    setAlpha(alpha: number): Color;
    asString(format?: Format): string;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
    isXYZ(): boolean;
    /**
     * Parses given `color()` function definition and returns the `Color` object.
     * We want to special case its parsing here because it's a bit different
     * than other color functions: rgb, lch etc. accepts 3 arguments with
     * optional alpha. This accepts 4 arguments with optional alpha.
     *
     * Instead of making `splitColorFunctionParameters` work for this case too
     * I've decided to implement it specifically.
     * @param authoredText Original definition of the color with `color`
     * @param parametersText Inside of the `color()` function. ex, `display-p3 0.1 0.2 0.3 / 0%`
     * @returns `Color` object
     */
    static fromSpec(authoredText: string, parametersWithAlphaText: string): ColorFunction | null;
}
export declare class HSL implements Color {
    #private;
    readonly h: number;
    readonly s: number;
    readonly l: number;
    readonly alpha: number | null;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    constructor(h: number, s: number, l: number, alpha?: number | null, authoredText?: string);
    equal(color: Color): boolean;
    asString(format?: Format): string;
    setAlpha(alpha: number): HSL;
    format(): Format;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    asLegacyColor(): Legacy;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
    static fromSpec(spec: ColorParameterSpec, text: string): HSL | null;
    hsva(): Color4D;
    canonicalHSLA(): number[];
}
export declare class HWB implements Color {
    #private;
    readonly h: number;
    readonly w: number;
    readonly b: number;
    readonly alpha: number | null;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    constructor(h: number, w: number, b: number, alpha: number | null, authoredText?: string);
    equal(color: Color): boolean;
    asString(format?: Format): string;
    setAlpha(alpha: number): HWB;
    format(): Format;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    asLegacyColor(): Legacy;
    getAuthoredText(): string | null;
    canonicalHWBA(): number[];
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
    static fromSpec(spec: ColorParameterSpec, text: string): HWB | null;
}
type LegacyColor = Format.HEX | Format.HEXA | Format.RGB | Format.RGBA;
declare abstract class ShortFormatColorBase implements Color {
    protected readonly color: Legacy;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    constructor(color: Legacy);
    get alpha(): number | null;
    rgba(): Color4D;
    equal(color: Color): boolean;
    setAlpha(alpha: number): Color;
    format(): Format;
    as<T extends Format>(format: T): ReturnType<ColorConversions<void>[T]>;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions<void>[T]>;
    asLegacyColor(): Legacy;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    isGamutClipped(): boolean;
    asString(format?: Format): string;
    getAsRawString(format?: Format): string;
    protected abstract stringify(r: number, g: number, b: number): string;
}
export declare class ShortHex extends ShortFormatColorBase {
    setAlpha(alpha: number): Color;
    asString(format?: Format): string;
    protected stringify(r: number, g: number, b: number): string;
}
export declare class Nickname extends ShortFormatColorBase {
    readonly nickname: string;
    constructor(nickname: string, color: Legacy);
    static fromName(name: string, text: string): Nickname | null;
    protected stringify(): string;
    getAsRawString(format?: Format): string;
}
export declare class Legacy implements Color {
    #private;
    readonly channels: [ColorChannel, ColorChannel, ColorChannel, ColorChannel];
    get alpha(): number | null;
    asLegacyColor(): Legacy;
    nickname(): Nickname | null;
    shortHex(): ShortHex | null;
    constructor(rgba: Color3D | Color4DOr3D, format: LegacyColor, authoredText?: string);
    static fromHex(hex: string, text: string): Legacy | ShortHex;
    static fromRGBAFunction(r: string, g: string, b: string, alpha: string, text: string): Legacy | null;
    static fromRGBA(rgba: number[], authoredText?: string): Legacy;
    static fromHSVA(hsva: Color4D): Legacy;
    is<T extends Format>(format: T): this is ReturnType<ColorConversions[T]>;
    as<T extends Format>(format: T): ReturnType<ColorConversions[T]>;
    format(): LegacyColor;
    hasAlpha(): boolean;
    detectHEXFormat(): Format;
    asString(format?: Format): string;
    getAuthoredText(): string | null;
    getRawParameters(): Color3D;
    getAsRawString(format?: Format): string;
    isGamutClipped(): boolean;
    rgba(): Color4D;
    canonicalRGBA(): Color4D;
    toProtocolRGBA(): {
        r: number;
        g: number;
        b: number;
        a?: number;
    };
    invert(): Legacy;
    /**
     * Returns a new color using the NTSC formula for making a RGB color grayscale.
     * Note: We override with an alpha of 50% to enhance the dimming effect.
     */
    grayscale(): Legacy;
    setAlpha(alpha: number): Legacy;
    blendWith(fgColor: Legacy): Legacy;
    blendWithAlpha(alpha: number): Legacy;
    setFormat(format: LegacyColor): void;
    equal(other: Color): boolean;
}
export declare const Nicknames: Map<string, number[]>;
export declare const PageHighlight: Record<string, Legacy>;
export declare const SourceOrderHighlight: Record<string, Legacy>;
export declare const IsolationModeHighlight: Record<string, Legacy>;
type Space = number | {
    min: number;
    max: number;
    count?: number;
};
export declare class Generator {
    #private;
    constructor(hueSpace?: Space, satSpace?: Space, lightnessSpace?: Space, alphaSpace?: Space);
    setColorForID(id: string, color: string): void;
    colorForID(id: string): string;
    private generateColorForID;
    private indexToValueInSpace;
}
export {};
