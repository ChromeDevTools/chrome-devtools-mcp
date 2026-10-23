/**
 * Combine the two given colors according to alpha blending.
 */
export type Color4D = [number, number, number, number];
export type Color3D = [number, number, number];
export type Color4DOr3D = [number, number, number, number | undefined];
export declare function blendColors(fgRGBA: Color4D, bgRGBA: Color4D): Color4D;
export declare function rgbToHsl(rgb: Color3D): Color3D;
export declare function rgbaToHsla([r, g, b, a]: Color4DOr3D): Color4DOr3D;
export declare function rgbToHwb(rgb: Color3D): Color3D;
export declare function rgbaToHwba([r, g, b, a]: Color4DOr3D): Color4DOr3D;
/**
 * Calculate the luminance of this color using the WCAG algorithm.
 * See https://www.w3.org/TR/WCAG21/#dfn-relative-luminance.
 */
export declare function luminance([rSRGB, gSRGB, bSRGB]: number[]): number;
/**
 * Calculate the contrast ratio between a foreground and a background color.
 * Returns the ratio to 1, for example for two two colors with a contrast ratio of 21:1, this function will return 21.
 * See http://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef
 */
export declare function contrastRatio(fgRGBA: Color4D, bgRGBA: Color4D): number;
/**
 * Calculate relative luminance of a color.
 * See https://github.com/Myndex/SAPC-APCA
 */
export declare function luminanceAPCA([rSRGB, gSRGB, bSRGB]: number[]): number;
/**
 * Calculate the contrast ratio between a foreground and a background color.
 * Returns the percentage of the predicted visual contrast.
 * See https://github.com/Myndex/SAPC-APCA
 */
export declare function contrastRatioAPCA(fgRGBA: Color4D, bgRGBA: Color4D): number;
export declare function contrastRatioByLuminanceAPCA(fgLuminance: number, bgLuminance: number): number;
/**
 * Compute a desired luminance given a given luminance and a desired contrast
 * percentage according to APCA.
 */
export declare function desiredLuminanceAPCA(luminance: number, contrast: number, lighter: boolean): number;
export declare function getAPCAThreshold(fontSize: string, fontWeight: string): number | null;
export declare function isLargeFont(fontSize: string, fontWeight: string): boolean;
export declare function getContrastThreshold(fontSize: string, fontWeight: string): {
    aa: number;
    aaa: number;
};
