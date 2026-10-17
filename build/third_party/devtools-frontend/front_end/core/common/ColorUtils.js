// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export function blendColors(fgRGBA, bgRGBA) {
    const alpha = fgRGBA[3];
    return [
        ((1 - alpha) * bgRGBA[0]) + (alpha * fgRGBA[0]),
        ((1 - alpha) * bgRGBA[1]) + (alpha * fgRGBA[1]),
        ((1 - alpha) * bgRGBA[2]) + (alpha * fgRGBA[2]),
        alpha + (bgRGBA[3] * (1 - alpha)),
    ];
}
function rgbToHue([r, g, b]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    let h;
    if (min === max) {
        h = 0;
    }
    else if (r === max) {
        h = ((1 / 6 * (g - b) / diff) + 1) % 1;
    }
    else if (g === max) {
        h = (1 / 6 * (b - r) / diff) + 1 / 3;
    }
    else {
        h = (1 / 6 * (r - g) / diff) + 2 / 3;
    }
    return h;
}
export function rgbToHsl(rgb) {
    const [h, s, l] = rgbaToHsla([...rgb, undefined]);
    return [h, s, l];
}
export function rgbaToHsla([r, g, b, a]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const sum = max + min;
    const h = rgbToHue([r, g, b]);
    const l = 0.5 * sum;
    let s;
    if (l === 0) {
        s = 0;
    }
    else if (l === 1) {
        s = 0;
    }
    else if (l <= 0.5) {
        s = diff / sum;
    }
    else {
        s = diff / (2 - sum);
    }
    return [h, s, l, a];
}
export function rgbToHwb(rgb) {
    const [h, w, b] = rgbaToHwba([...rgb, undefined]);
    return [h, w, b];
}
export function rgbaToHwba([r, g, b, a]) {
    const h = rgbToHue([r, g, b]);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return [h, min, 1 - max, a];
}
/**
 * Calculate the luminance of this color using the WCAG algorithm.
 * See https://www.w3.org/TR/WCAG21/#dfn-relative-luminance.
 */
export function luminance([rSRGB, gSRGB, bSRGB]) {
    const r = rSRGB <= 0.04045 ? rSRGB / 12.92 : Math.pow(((rSRGB + 0.055) / 1.055), 2.4);
    const g = gSRGB <= 0.04045 ? gSRGB / 12.92 : Math.pow(((gSRGB + 0.055) / 1.055), 2.4);
    const b = bSRGB <= 0.04045 ? bSRGB / 12.92 : Math.pow(((bSRGB + 0.055) / 1.055), 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/**
 * Calculate the contrast ratio between a foreground and a background color.
 * Returns the ratio to 1, for example for two two colors with a contrast ratio of 21:1, this function will return 21.
 * See http://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef
 */
export function contrastRatio(fgRGBA, bgRGBA) {
    const blendedFg = blendColors(fgRGBA, bgRGBA);
    const fgLuminance = luminance(blendedFg);
    const bgLuminance = luminance(bgRGBA);
    const contrastRatio = (Math.max(fgLuminance, bgLuminance) + 0.05) / (Math.min(fgLuminance, bgLuminance) + 0.05);
    return contrastRatio;
}
// Constants for basic APCA version.
// See https://github.com/Myndex/SAPC-APCA
const mainTRC = 2.4;
const normBgExp = 0.56;
const normFgExp = 0.57;
const revBgExp = 0.65;
const revFgExp = 0.62;
const blkThrs = 0.022;
const blkClmp = 1.414;
const scaleBoW = 1.14;
const scaleWoB = 1.14;
const loConOffset = 0.027;
const loClip = 0.1;
const deltaLuminanceMin = 0.0005;
/**
 * Calculate relative luminance of a color.
 * See https://github.com/Myndex/SAPC-APCA
 */
export function luminanceAPCA([rSRGB, gSRGB, bSRGB]) {
    const r = Math.pow(rSRGB, mainTRC);
    const g = Math.pow(gSRGB, mainTRC);
    const b = Math.pow(bSRGB, mainTRC);
    return 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
}
/**
 * Calculate the contrast ratio between a foreground and a background color.
 * Returns the percentage of the predicted visual contrast.
 * See https://github.com/Myndex/SAPC-APCA
 */
export function contrastRatioAPCA(fgRGBA, bgRGBA) {
    const blendedFg = blendColors(fgRGBA, bgRGBA);
    return contrastRatioByLuminanceAPCA(luminanceAPCA(blendedFg), luminanceAPCA(bgRGBA));
}
function clampLuminance(value) {
    return value > blkThrs ? value : (value + Math.pow(blkThrs - value, blkClmp));
}
export function contrastRatioByLuminanceAPCA(fgLuminance, bgLuminance) {
    fgLuminance = clampLuminance(fgLuminance);
    bgLuminance = clampLuminance(bgLuminance);
    if (Math.abs(fgLuminance - bgLuminance) < deltaLuminanceMin) {
        return 0;
    }
    let result = 0;
    if (bgLuminance > fgLuminance) { // Black text on white.
        result = (Math.pow(bgLuminance, normBgExp) - Math.pow(fgLuminance, normFgExp)) * scaleBoW;
        result = result < loClip ? 0 : result - loConOffset;
    }
    else {
        // White text on black.
        result = (Math.pow(bgLuminance, revBgExp) - Math.pow(fgLuminance, revFgExp)) * scaleWoB;
        result = result > -loClip ? 0 : result + loConOffset;
    }
    return result * 100;
}
/**
 * Compute a desired luminance given a given luminance and a desired contrast
 * percentage according to APCA.
 */
export function desiredLuminanceAPCA(luminance, contrast, lighter) {
    luminance = clampLuminance(luminance);
    contrast /= 100;
    function computeLuminance() {
        if (!lighter) { // Black text on white.
            return Math.pow(Math.abs(Math.pow(luminance, normBgExp) - (contrast + loConOffset) / scaleBoW), 1 / normFgExp);
        }
        // White text on black.
        return Math.pow(Math.abs(Math.pow(luminance, revBgExp) - (-contrast - loConOffset) / scaleWoB), 1 / revFgExp);
    }
    let desiredLuminance = computeLuminance();
    if (desiredLuminance < 0 || desiredLuminance > 1) {
        lighter = !lighter;
        desiredLuminance = computeLuminance();
    }
    return desiredLuminance;
}
// clang-format off
const contrastAPCALookupTable = [
    // See https://github.com/Myndex/SAPC-APCA
    // font size in px | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 weights
    [12, -1, -1, -1, -1, 100, 90, 80, -1, -1],
    [14, -1, -1, -1, 100, 90, 80, 60, 60, -1],
    [16, -1, -1, 100, 90, 80, 60, 55, 50, 50],
    [18, -1, -1, 90, 80, 60, 55, 50, 40, 40],
    [24, -1, 100, 80, 60, 55, 50, 40, 38, 35],
    [30, -1, 90, 70, 55, 50, 40, 38, 35, 40],
    [36, -1, 80, 60, 50, 40, 38, 35, 30, 25],
    [48, 100, 70, 55, 40, 38, 35, 30, 25, 20],
    [60, 90, 60, 50, 38, 35, 30, 25, 20, 20],
    [72, 80, 55, 40, 35, 30, 25, 20, 20, 20],
    [96, 70, 50, 35, 30, 25, 20, 20, 20, 20],
    [120, 60, 40, 30, 25, 20, 20, 20, 20, 20],
];
// clang-format on
contrastAPCALookupTable.reverse();
export function getAPCAThreshold(fontSize, fontWeight) {
    const size = parseFloat(fontSize.replace('px', ''));
    const weight = parseFloat(fontWeight);
    // Go over the table backwards to find the first matching font size and then the weight.
    // Fonts larger than 96px, use the thresholds for 96px.
    // Fonts smaller than 12px, don't get any threshold meaning the font size needs to be increased.
    for (const [rowSize, ...rowWeights] of contrastAPCALookupTable) {
        if (size >= rowSize) {
            for (const [idx, keywordWeight] of [900, 800, 700, 600, 500, 400, 300, 200, 100].entries()) {
                if (weight >= keywordWeight) {
                    const threshold = rowWeights[rowWeights.length - 1 - idx];
                    return threshold === -1 ? null : threshold;
                }
            }
        }
    }
    return null;
}
export function isLargeFont(fontSize, fontWeight) {
    const boldWeights = ['bold', 'bolder'];
    const fontSizePx = parseFloat(fontSize.replace('px', ''));
    const isBold = isNaN(Number(fontWeight)) ? boldWeights.includes(fontWeight) : Number(fontWeight) >= 600;
    const fontSizePt = fontSizePx * 72 / 96;
    if (isBold) {
        return fontSizePt >= 14;
    }
    return fontSizePt >= 18;
}
const contrastThresholds = {
    largeFont: { aa: 3.0, aaa: 4.5 },
    normalFont: { aa: 4.5, aaa: 7.0 },
};
export function getContrastThreshold(fontSize, fontWeight) {
    if (isLargeFont(fontSize, fontWeight)) {
        return contrastThresholds.largeFont;
    }
    return contrastThresholds.normalFont;
}
//# sourceMappingURL=ColorUtils.js.map