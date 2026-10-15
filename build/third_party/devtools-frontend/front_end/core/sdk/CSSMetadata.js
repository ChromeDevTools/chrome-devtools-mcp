// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SupportedCSSProperties from '../../generated/SupportedCSSProperties.js';
import * as Common from '../common/common.js';
export class CSSMetadata {
    #values = [];
    #longhands = new Map();
    #shorthands = new Map();
    #inherited = new Set();
    #svgProperties = new Set();
    #propertyValues = new Map();
    #aliasesFor = new Map();
    #nameValuePresets = [];
    #nameValuePresetsIncludingSVG = [];
    #valuesSet;
    constructor(properties, aliasesFor) {
        this.#aliasesFor = aliasesFor;
        for (let i = 0; i < properties.length; ++i) {
            const property = properties[i];
            const propertyName = property.name;
            if ('is_descriptor' in property && 'is_property' in property) {
                if (property.is_descriptor && !property.is_property) {
                    continue;
                }
            }
            const runtimeFlagStatus = property.runtime_flag_status;
            if (Boolean(runtimeFlagStatus) && runtimeFlagStatus !== 'stable') {
                continue;
            }
            this.#values.push(propertyName);
            if (property.inherited) {
                this.#inherited.add(propertyName);
            }
            if (property.svg) {
                this.#svgProperties.add(propertyName);
            }
            const longhands = properties[i].longhands;
            if (longhands) {
                this.#longhands.set(propertyName, longhands);
                for (let j = 0; j < longhands.length; ++j) {
                    const longhandName = longhands[j];
                    let shorthands = this.#shorthands.get(longhandName);
                    if (!shorthands) {
                        shorthands = [];
                        this.#shorthands.set(longhandName, shorthands);
                    }
                    shorthands.push(propertyName);
                }
            }
        }
        this.#values.sort(CSSMetadata.sortPrefixesAndCSSWideKeywordsToEnd);
        this.#valuesSet = new Set(this.#values);
        // Reads in auto-generated property names and #values from blink/public/renderer/core/css/css_properties.json5
        // treats _generatedPropertyValues as basis
        const propertyValueSets = new Map();
        for (const [propertyName, basisValueObj] of Object.entries(SupportedCSSProperties.generatedPropertyValues)) {
            propertyValueSets.set(propertyName, new Set(basisValueObj.values));
        }
        // and add manually maintained map of extra prop-value pairs
        for (const [propertyName, extraValues] of extraPropertyValues) {
            const propertyValueSet = propertyValueSets.get(propertyName);
            if (propertyValueSet) {
                propertyValueSets.set(propertyName, propertyValueSet.union(extraValues));
            }
            else {
                propertyValueSets.set(propertyName, extraValues);
            }
        }
        // and add common keywords for shorthands
        const commonKeywordSet = new Set(CommonKeywords);
        for (const propertyName of this.#longhands.keys()) {
            // skip "all" because it is a CSS-wide keyword
            // skip shorthands that are defined in generatedPropertyValues because they have their own value sets
            if (propertyName === 'all' || propertyName in SupportedCSSProperties.generatedPropertyValues) {
                continue;
            }
            const longhands = this.#longhands.get(propertyName);
            if (!longhands) {
                continue;
            }
            const values = new Array();
            const propertyValueSet = propertyValueSets.get(propertyName);
            if (propertyValueSet) {
                values.push(...propertyValueSet);
            }
            for (const longhand of longhands) {
                const longhandValues = propertyValueSets.get(longhand);
                if (!longhandValues) {
                    continue;
                }
                const commonKeywordsInLonghandValues = longhandValues.intersection(commonKeywordSet);
                values.push(...commonKeywordsInLonghandValues);
            }
            propertyValueSets.set(propertyName, new Set(values));
        }
        // finally add keywords from alias property, common keywords to value sets and convert property #values
        // into arrays since callers expect arrays
        for (const [propertyName, values] of propertyValueSets) {
            const aliasFor = this.#aliasesFor.get(propertyName);
            if (aliasFor) {
                const aliasForValues = propertyValueSets.get(aliasFor);
                if (aliasForValues) {
                    for (const val of aliasForValues) {
                        values.add(val);
                    }
                }
            }
            this.#propertyValues.set(propertyName, [...values]);
        }
        for (const name of this.#valuesSet) {
            const values = this.specificPropertyValues(name)
                .filter(value => {
                // Filter out values which are just the function name (e.g. 'url', 'radial-gradient', etc.)
                // The 'preset' is the full function (e.g. 'url(||)').
                const preset = valuePresets.get(name)?.get(value);
                if (preset && preset !== value) {
                    return false;
                }
                if (partialValueKeywordsNoPresets.get(name)?.has(value)) {
                    return false;
                }
                return true;
            })
                .sort(CSSMetadata.sortPrefixesAndCSSWideKeywordsToEnd);
            const presets = values.map(value => `${name}: ${value}`);
            if (!this.isSVGProperty(name)) {
                this.#nameValuePresets.push(...presets);
            }
            this.#nameValuePresetsIncludingSVG.push(...presets);
        }
    }
    static isCSSWideKeyword(a) {
        return CSSWideKeywords.includes(a);
    }
    static isPositionTryOrderKeyword(a) {
        return PositionTryOrderKeywords.includes(a);
    }
    static sortPrefixesAndCSSWideKeywordsToEnd(a, b) {
        const aIsCSSWideKeyword = CSSMetadata.isCSSWideKeyword(a);
        const bIsCSSWideKeyword = CSSMetadata.isCSSWideKeyword(b);
        if (aIsCSSWideKeyword && !bIsCSSWideKeyword) {
            return 1;
        }
        if (!aIsCSSWideKeyword && bIsCSSWideKeyword) {
            return -1;
        }
        const aIsPrefixed = a.startsWith('-webkit-');
        const bIsPrefixed = b.startsWith('-webkit-');
        if (aIsPrefixed && !bIsPrefixed) {
            return 1;
        }
        if (!aIsPrefixed && bIsPrefixed) {
            return -1;
        }
        return a < b ? -1 : (a > b ? 1 : 0);
    }
    allProperties() {
        return this.#values;
    }
    aliasesFor() {
        return this.#aliasesFor;
    }
    nameValuePresets(includeSVG) {
        return includeSVG ? this.#nameValuePresetsIncludingSVG : this.#nameValuePresets;
    }
    isSVGProperty(name) {
        name = name.toLowerCase();
        return this.#svgProperties.has(name);
    }
    getLonghands(shorthand) {
        return this.#longhands.get(shorthand) || null;
    }
    getShorthands(longhand) {
        return this.#shorthands.get(longhand) || null;
    }
    isColorAwareProperty(propertyName) {
        return colorAwareProperties.has(propertyName.toLowerCase()) || this.isCustomProperty(propertyName.toLowerCase());
    }
    isFontFamilyProperty(propertyName) {
        return propertyName.toLowerCase() === 'font-family';
    }
    isAngleAwareProperty(propertyName) {
        const lowerCasedName = propertyName.toLowerCase();
        // TODO: @Yisi, parse hsl(), hsla(), hwb() and lch()
        // See also https://drafts.csswg.org/css-color/#hue-syntax
        return colorAwareProperties.has(lowerCasedName) || angleAwareProperties.has(lowerCasedName);
    }
    isGridAreaDefiningProperty(propertyName) {
        propertyName = propertyName.toLowerCase();
        return propertyName === 'grid' || propertyName === 'grid-template' || propertyName === 'grid-template-areas';
    }
    isGridColumnNameAwareProperty(propertyName) {
        propertyName = propertyName.toLowerCase();
        return ['grid-column', 'grid-column-start', 'grid-column-end'].includes(propertyName);
    }
    isGridRowNameAwareProperty(propertyName) {
        propertyName = propertyName.toLowerCase();
        return ['grid-row', 'grid-row-start', 'grid-row-end'].includes(propertyName);
    }
    isGridAreaNameAwareProperty(propertyName) {
        propertyName = propertyName.toLowerCase();
        return propertyName === 'grid-area';
    }
    isGridNameAwareProperty(propertyName) {
        return this.isGridAreaNameAwareProperty(propertyName) || this.isGridColumnNameAwareProperty(propertyName) ||
            this.isGridRowNameAwareProperty(propertyName);
    }
    isLengthProperty(propertyName) {
        propertyName = propertyName.toLowerCase();
        if (propertyName === 'line-height') {
            return false;
        }
        return distanceProperties.has(propertyName) || propertyName.startsWith('margin') ||
            propertyName.startsWith('padding') || propertyName.indexOf('width') !== -1 ||
            propertyName.indexOf('height') !== -1;
    }
    isBezierAwareProperty(propertyName) {
        propertyName = propertyName.toLowerCase();
        return bezierAwareProperties.has(propertyName) || this.isCustomProperty(propertyName);
    }
    isCustomProperty(propertyName) {
        return propertyName.startsWith('--');
    }
    isShadowProperty(propertyName) {
        propertyName = propertyName.toLowerCase();
        return propertyName === 'box-shadow' || propertyName === 'text-shadow' || propertyName === '-webkit-box-shadow';
    }
    isStringProperty(propertyName) {
        propertyName = propertyName.toLowerCase();
        // TODO(crbug.com/1033910): Generalize this to all CSS properties
        // that accept <string> #values.
        return propertyName === 'content';
    }
    canonicalPropertyName(name) {
        if (this.isCustomProperty(name)) {
            return name;
        }
        name = name.toLowerCase();
        const aliasFor = this.#aliasesFor.get(name);
        if (aliasFor) {
            return aliasFor;
        }
        if (!name || name.length < 9 || name.charAt(0) !== '-') {
            return name;
        }
        const match = name.match(/(?:-webkit-)(.+)/);
        if (!match || !this.#valuesSet.has(match[1])) {
            return name;
        }
        return match[1];
    }
    isCSSPropertyName(propertyName) {
        propertyName = propertyName.toLowerCase();
        if ((propertyName.startsWith('--') && propertyName.length > 2) || propertyName.startsWith('-moz-') ||
            propertyName.startsWith('-ms-') || propertyName.startsWith('-o-') || propertyName.startsWith('-webkit-')) {
            return true;
        }
        return this.#valuesSet.has(propertyName);
    }
    isPropertyInherited(propertyName) {
        propertyName = propertyName.toLowerCase();
        return propertyName.startsWith('--') || this.#inherited.has(this.canonicalPropertyName(propertyName)) ||
            this.#inherited.has(propertyName);
    }
    specificPropertyValues(propertyName) {
        const unprefixedName = propertyName.replace(/^-webkit-/, '');
        const propertyValues = this.#propertyValues;
        // #propertyValues acts like cache; missing properties are added with possible common keywords
        let keywords = propertyValues.get(propertyName) || propertyValues.get(unprefixedName);
        if (!keywords) {
            keywords = [];
            propertyValues.set(propertyName, keywords);
        }
        return keywords;
    }
    getPropertyValues(propertyName) {
        propertyName = propertyName.toLowerCase();
        // Add CSS-wide keywords to all properties.
        const acceptedKeywords = [...this.specificPropertyValues(propertyName), ...CSSWideKeywords];
        if (this.isColorAwareProperty(propertyName)) {
            acceptedKeywords.push('currentColor');
            for (const color of Common.Color.Nicknames.keys()) {
                acceptedKeywords.push(color);
            }
        }
        return acceptedKeywords.sort(CSSMetadata.sortPrefixesAndCSSWideKeywordsToEnd);
    }
    propertyUsageWeight(property) {
        return Weight.get(property) || Weight.get(this.canonicalPropertyName(property)) || 0;
    }
    getValuePreset(key, value) {
        const values = valuePresets.get(key);
        let text = values ? values.get(value) : null;
        if (!text) {
            return null;
        }
        let startColumn = text.length;
        let endColumn = text.length;
        if (text) {
            startColumn = text.indexOf('|');
            endColumn = text.lastIndexOf('|');
            endColumn = startColumn === endColumn ? endColumn : endColumn - 1;
            text = text.replace(/\|/g, '');
        }
        return { text, startColumn, endColumn };
    }
    isHighlightPseudoType(pseudoType) {
        return (pseudoType === "highlight" /* Protocol.DOM.PseudoType.Highlight */ || pseudoType === "selection" /* Protocol.DOM.PseudoType.Selection */ ||
            pseudoType === "target-text" /* Protocol.DOM.PseudoType.TargetText */ || pseudoType === "grammar-error" /* Protocol.DOM.PseudoType.GrammarError */ ||
            pseudoType === "spelling-error" /* Protocol.DOM.PseudoType.SpellingError */);
    }
}
export const CubicBezierKeywordValues = new Map([
    ['linear', 'cubic-bezier(0, 0, 1, 1)'],
    ['ease', 'cubic-bezier(0.25, 0.1, 0.25, 1)'],
    ['ease-in', 'cubic-bezier(0.42, 0, 1, 1)'],
    ['ease-in-out', 'cubic-bezier(0.42, 0, 0.58, 1)'],
    ['ease-out', 'cubic-bezier(0, 0, 0.58, 1)'],
]);
/**
 * Spec: https://drafts.csswg.org/css-cascade/#defaulting-keywords
 * https://drafts.csswg.org/css-cascade-5/#revert-layer
 * https://drafts.csswg.org/css-cascade-6/#revert-rule
 **/
export const CSSWideKeywords = [
    "inherit" /* CSSWideKeyword.INHERIT */,
    "initial" /* CSSWideKeyword.INITIAL */,
    "revert" /* CSSWideKeyword.REVERT */,
    "revert-layer" /* CSSWideKeyword.REVERT_LAYER */,
    "revert-rule" /* CSSWideKeyword.REVERT_RULE */,
    "unset" /* CSSWideKeyword.UNSET */,
];
export const PositionTryOrderKeywords = [
    "normal" /* PositionTryOrderKeyword.NORMAL */,
    "most-height" /* PositionTryOrderKeyword.MOST_HEIGHT */,
    "most-width" /* PositionTryOrderKeyword.MOST_WIDTH */,
    "most-block-size" /* PositionTryOrderKeyword.MOST_BLOCK_SIZE */,
    "most-inline-size" /* PositionTryOrderKeyword.MOST_INLINE_SIZE */,
];
export const VariableNameRegex = /(\s*--.*?)/gs;
export const VariableRegex = /(var\(\s*--.*?\))/gs;
export const CustomVariableRegex = /(var\(*--[\w\d]+-([\w]+-[\w]+)\))/g;
export const URLRegex = /url\(\s*('.+?'|".+?"|[^)]+)\s*\)/g;
/**
 * Matches an instance of a grid area 'row' definition.
 * 'grid-template-areas', e.g.
 *    "a a ."
 *
 * 'grid', 'grid-template', e.g.
 *    [track-#name] "a a ." minmax(50px, auto) [track-#name]
 */
export const GridAreaRowRegex = /((?:\[[\w\- ]+\]\s*)*(?:"[^"]+"|'[^']+'))[^'"\[]*\[?[^'"\[]*/;
let cssMetadataInstance = null;
export function cssMetadata() {
    if (!cssMetadataInstance) {
        const supportedProperties = SupportedCSSProperties.generatedProperties;
        cssMetadataInstance = new CSSMetadata(supportedProperties, SupportedCSSProperties.generatedAliasesFor);
    }
    return cssMetadataInstance;
}
/**
 * The pipe character '|' indicates where text selection should be set.
 *
 * Spec: https://drafts.csswg.org/css-images-4/#image-values
 * <image> = <url> | <image()> | <image-set()> | <cross-fade()> | <element()> | <gradient>
 * <gradient> = [
 * <linear-gradient()> | <repeating-linear-gradient()> |
 * <radial-gradient()> | <repeating-radial-gradient()> |
 * <conic-gradient()>  | <repeating-conic-gradient()> ]
 */
const imageValuePresetMap = new Map([
    ['linear-gradient', 'linear-gradient(|45deg, black, transparent|)'],
    ['radial-gradient', 'radial-gradient(|black, transparent|)'],
    ['conic-gradient', 'conic-gradient(|from 45deg, red, orange, yellow, green, teal, blue, purple|)'],
    ['repeating-linear-gradient', 'repeating-linear-gradient(|45deg, black, transparent 100px|)'],
    ['repeating-radial-gradient', 'repeating-radial-gradient(|black, transparent 100px|)'],
    ['repeating-conic-gradient', 'repeating-conic-gradient(|black 0deg 25%, white 0deg 50%|)'], // Checkerboard
    ['url', 'url(||)'],
    ['image-set', 'image-set(|url("") 1x, url("") 2x|)'],
    ['cross-fade', 'cross-fade(|url("") 50%, url("") 50%|)'],
]);
const filterValuePresetMap = new Map([
    ['blur', 'blur(|1px|)'],
    ['brightness', 'brightness(|0.5|)'],
    ['contrast', 'contrast(|0.5|)'],
    ['drop-shadow', 'drop-shadow(|2px 4px 6px black|)'],
    ['grayscale', 'grayscale(|1|)'],
    ['hue-rotate', 'hue-rotate(|45deg|)'],
    ['invert', 'invert(|1|)'],
    ['opacity', 'opacity(|0.5|)'],
    ['saturate', 'saturate(|0.5|)'],
    ['sepia', 'sepia(|1|)'],
    ['url', 'url(||)'],
]);
const cornerShapeValuePresetMap = new Map([
    ['superellipse(0.5)', 'superellipse(|0.5|)'],
    ['superellipse(infinity)', 'superellipse(|infinity|)'],
]);
const valuePresets = new Map([
    ['filter', filterValuePresetMap],
    ['backdrop-filter', filterValuePresetMap],
    ['background', imageValuePresetMap],
    ['background-image', imageValuePresetMap],
    ['mask-image', imageValuePresetMap],
    ['-webkit-mask-image', imageValuePresetMap],
    ['list-style', imageValuePresetMap],
    ['list-style-image', imageValuePresetMap],
    ['border-image', new Map([...imageValuePresetMap, ['fill', 'fill 10%']])],
    ['border-image-source', imageValuePresetMap],
    [
        'transform',
        new Map([
            ['scale', 'scale(|1.5|)'],
            ['scaleX', 'scaleX(|1.5|)'],
            ['scaleY', 'scaleY(|1.5|)'],
            ['scale3d', 'scale3d(|1.5, 1.5, 1.5|)'],
            ['rotate', 'rotate(|45deg|)'],
            ['rotateX', 'rotateX(|45deg|)'],
            ['rotateY', 'rotateY(|45deg|)'],
            ['rotateZ', 'rotateZ(|45deg|)'],
            ['rotate3d', 'rotate3d(|1, 1, 1, 45deg|)'],
            ['skew', 'skew(|10deg, 10deg|)'],
            ['skewX', 'skewX(|10deg|)'],
            ['skewY', 'skewY(|10deg|)'],
            ['translate', 'translate(|10px, 10px|)'],
            ['translateX', 'translateX(|10px|)'],
            ['translateY', 'translateY(|10px|)'],
            ['translateZ', 'translateZ(|10px|)'],
            ['translate3d', 'translate3d(|10px, 10px, 10px|)'],
            ['matrix', 'matrix(|1, 0, 0, 1, 0, 0|)'],
            ['matrix3d', 'matrix3d(|1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1|)'],
            ['perspective', 'perspective(|10px|)'],
        ]),
    ],
    ['corner-shape', cornerShapeValuePresetMap],
    [
        'font-variant-alternates',
        new Map([
            ['stylistic', 'stylistic(||)'],
            ['styleset', 'styleset(||)'],
            ['character-variant', 'character-variant(||)'],
            ['swash', 'swash(||)'],
            ['ornaments', 'ornaments(||)'],
            ['annotation', 'annotation(||)'],
        ]),
    ],
    [
        'clip-path',
        new Map([
            ['inset', 'inset(|10px|)'],
            ['circle', 'circle(|100px|)'],
            ['ellipse', 'ellipse(|100px 100px|)'],
            ['polygon', 'polygon(|50px 0px, 100px 100px, 0px 100px|)'],
            ['url', 'url(||)'],
        ]),
    ],
    [
        'transition-timing-function',
        new Map([
            ['steps', 'steps(|5, end|)'],
            ['cubic-bezier', 'cubic-bezier(|0.25, 0.1, 0.25, 1|)'],
        ]),
    ],
    [
        'animation-timing-function',
        new Map([
            ['steps', 'steps(|5, end|)'],
            ['cubic-bezier', 'cubic-bezier(|0.25, 0.1, 0.25, 1|)'],
        ]),
    ],
    [
        'box-shadow',
        new Map([
            ['inset', 'inset |0 0 10px black|'],
        ]),
    ],
    [
        'font-size-adjust',
        new Map([
            ['ex-height', 'ex-height |0.5|'],
            ['cap-height', 'cap-height |0.5|'],
            ['ch-width', 'ch-width |0.5|'],
            ['ic-width', 'ic-width |0.5|'],
            ['ic-height', 'ic-height |0.5|'],
        ]),
    ],
    [
        'initial-letter',
        new Map([
            ['drop', 'drop |2|'],
            ['raise', 'raise |2|'],
        ]),
    ],
    [
        'text-box-edge',
        new Map([
            ['cap', 'cap alphabetic'],
            ['ex', 'ex alphabetic'],
        ]),
    ],
    [
        'border-image-slice',
        new Map([
            ['fill', 'fill 10%'],
        ]),
    ],
]);
const partialValueKeywordsNoPresets = new Map([
    ['scroll-snap-type', new Set(['mandatory', 'proximity'])],
    ['scrollbar-gutter', new Set(['both-edges'])],
    ['animation-timing-function', new Set(['jump-both', 'jump-end', 'jump-none', 'jump-start'])],
    ['transition-timing-function', new Set(['jump-both', 'jump-end', 'jump-none', 'jump-start'])],
    [
        'animation-trigger',
        new Set([
            'play',
            'pause',
            'play-once',
            'play-alternate',
            'play-forwards',
            'play-backwards',
            'play-pause',
            'replay',
        ]),
    ],
]);
const distanceProperties = new Set([
    'background-position',
    'border-spacing',
    'bottom',
    'font-size',
    'height',
    'left',
    'letter-spacing',
    'max-height',
    'max-width',
    'min-height',
    'min-width',
    'right',
    'text-indent',
    'top',
    'width',
    'word-spacing',
    'grid-row-gap',
    'grid-column-gap',
    'row-gap',
]);
const bezierAwareProperties = new Set([
    'animation',
    'animation-timing-function',
    'transition',
    'transition-timing-function',
    '-webkit-animation',
    '-webkit-animation-timing-function',
    '-webkit-transition',
    '-webkit-transition-timing-function',
]);
const colorAwareProperties = new Set([
    'accent-color',
    'background',
    'background-color',
    'background-image',
    'border',
    'border-color',
    'border-image',
    'border-image-source',
    'border-bottom',
    'border-bottom-color',
    'border-left',
    'border-left-color',
    'border-right',
    'border-right-color',
    'border-top',
    'border-top-color',
    'border-block',
    'border-block-color',
    'border-block-end',
    'border-block-end-color',
    'border-block-start',
    'border-block-start-color',
    'border-inline',
    'border-inline-color',
    'border-inline-end',
    'border-inline-end-color',
    'border-inline-start',
    'border-inline-start-color',
    'box-shadow',
    'caret-color',
    'color',
    'column-rule',
    'column-rule-color',
    'content',
    'fill',
    'list-style-image',
    'mask',
    'mask-image',
    'mask-border',
    'mask-border-source',
    'outline',
    'outline-color',
    'scrollbar-color',
    'stop-color',
    'stroke',
    'text-decoration-color',
    'text-shadow',
    'text-emphasis',
    'text-emphasis-color',
    '-webkit-border-after',
    '-webkit-border-after-color',
    '-webkit-border-before',
    '-webkit-border-before-color',
    '-webkit-border-end',
    '-webkit-border-end-color',
    '-webkit-border-start',
    '-webkit-border-start-color',
    '-webkit-box-reflect',
    '-webkit-box-shadow',
    '-webkit-column-rule-color',
    '-webkit-mask',
    '-webkit-mask-box-image',
    '-webkit-mask-box-image-source',
    '-webkit-mask-image',
    '-webkit-tap-highlight-color',
    '-webkit-text-emphasis',
    '-webkit-text-emphasis-color',
    '-webkit-text-fill-color',
    '-webkit-text-stroke',
    '-webkit-text-stroke-color',
    // For SVG
    'flood-color',
    'lighting-color',
    'stop-color',
]);
// In addition to `_colorAwareProperties`, the following properties contain CSS <angle> units.
const angleAwareProperties = new Set([
    '-webkit-border-image',
    'transform',
    '-webkit-transform',
    'rotate',
    'filter',
    '-webkit-filter',
    'backdrop-filter',
    'offset',
    'offset-rotate',
    'font-style',
]);
const textEmphasisPosition = new Set([
    'over',
    'under',
    'over right', // Initial value
    'over left',
    'under right',
    'under left',
]);
// https://drafts.csswg.org/css-text-decor/#text-emphasis-style-property
const textEmphasisStyle = new Set([
    'none', 'dot', 'circle', 'double-circle', 'triangle', 'sesame', 'filled', 'open', 'dot open', 'circle open',
    'double-circle open', 'triangle open', 'sesame open',
    '"❤️"', // <string>
]);
const listStyleTypeValues = new Set([
    'disc',
    'circle',
    'square',
    'decimal',
    'decimal-leading-zero',
    'arabic-indic',
    'bengali',
    'cambodian',
    'khmer',
    'devanagari',
    'gujarati',
    'gurmukhi',
    'kannada',
    'lao',
    'malayalam',
    'mongolian',
    'myanmar',
    'oriya',
    'persian',
    'urdu',
    'telugu',
    'tibetan',
    'thai',
    'lower-roman',
    'upper-roman',
    'lower-greek',
    'lower-alpha',
    'lower-latin',
    'upper-alpha',
    'upper-latin',
    'cjk-earthly-branch',
    'cjk-heavenly-stem',
    'ethiopic-halehame',
    'ethiopic-halehame-am',
    'ethiopic-halehame-ti-er',
    'ethiopic-halehame-ti-et',
    'hangul',
    'hangul-consonant',
    'korean-hangul-formal',
    'korean-hanja-formal',
    'korean-hanja-informal',
    'hebrew',
    'armenian',
    'lower-armenian',
    'upper-armenian',
    'georgian',
    'cjk-ideographic',
    'simp-chinese-formal',
    'simp-chinese-informal',
    'trad-chinese-formal',
    'trad-chinese-informal',
    'hiragana',
    'katakana',
    'hiragana-iroha',
    'katakana-iroha',
]);
// manually maintained list of property #values to add into autocomplete list
const extraPropertyValues = new Map([
    ['background-repeat', new Set(['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round'])],
    ['content', new Set(['normal', 'close-quote', 'no-close-quote', 'no-open-quote', 'open-quote'])],
    ['baseline-shift', new Set(['baseline'])],
    ['max-height', new Set(['min-content', 'max-content', '-webkit-fill-available', 'fit-content', 'stretch'])],
    ['color', new Set(['black'])],
    ['background-color', new Set(['white'])],
    ['box-shadow', new Set(['inset'])],
    ['text-shadow', new Set(['0 0 black'])],
    ['-webkit-writing-mode', new Set(['horizontal-tb', 'vertical-rl', 'vertical-lr'])],
    ['writing-mode', new Set(['lr', 'rl', 'tb', 'lr-tb', 'rl-tb', 'tb-rl'])],
    ['page-break-inside', new Set(['avoid'])],
    ['cursor', new Set(['-webkit-zoom-in', '-webkit-zoom-out', '-webkit-grab', '-webkit-grabbing'])],
    ['border-width', new Set(['medium', 'thick', 'thin'])],
    ['border-style', new Set(['hidden', 'inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double'])],
    ['size', new Set(['a3', 'a4', 'a5', 'b4', 'b5', 'landscape', 'ledger', 'legal', 'letter', 'portrait'])],
    ['overflow', new Set(['hidden', 'visible', 'overlay', 'scroll', 'clip'])],
    ['overscroll-behavior', new Set(['contain'])],
    ['text-rendering', new Set(['optimizeSpeed', 'optimizeLegibility', 'geometricPrecision'])],
    ['text-align', new Set(['-webkit-auto', '-webkit-match-parent'])],
    ['clip-path', new Set(['circle', 'ellipse', 'inset', 'polygon', 'url'])],
    ['color-interpolation', new Set(['sRGB', 'linearRGB'])],
    ['word-wrap', new Set(['normal', 'break-word'])],
    ['font-weight', new Set(['100', '200', '300', '400', '500', '600', '700', '800', '900'])],
    ['text-emphasis', textEmphasisStyle],
    ['-webkit-text-emphasis', textEmphasisStyle],
    ['color-rendering', new Set(['optimizeSpeed', 'optimizeQuality'])],
    ['-webkit-text-combine', new Set(['horizontal'])],
    ['text-orientation', new Set(['sideways-right'])],
    [
        'outline',
        new Set(['inset', 'groove', 'ridge', 'outset', 'dotted', 'dashed', 'solid', 'double', 'medium', 'thick', 'thin']),
    ],
    [
        'font',
        new Set([
            'caption',
            'icon',
            'menu',
            'message-box',
            'small-caption',
            '-webkit-mini-control',
            '-webkit-small-control',
            '-webkit-control',
            'status-bar',
        ]),
    ],
    ['dominant-baseline', new Set(['text-before-edge', 'text-after-edge', 'use-script', 'no-change', 'reset-size'])],
    ['text-emphasis-position', textEmphasisPosition],
    ['-webkit-text-emphasis-position', textEmphasisPosition],
    ['alignment-baseline', new Set(['before-edge', 'after-edge', 'text-before-edge', 'text-after-edge', 'hanging'])],
    ['page-break-before', new Set(['left', 'right', 'always', 'avoid'])],
    [
        'border-image',
        new Set([
            'none', // border-image-source
            'repeat',
            'stretch',
            'space',
            'round',
            'fill', // border-image-slice
            'linear-gradient',
            'radial-gradient',
            'conic-gradient',
            'repeating-linear-gradient',
            'repeating-radial-gradient',
            'repeating-conic-gradient',
            'image-set',
            'cross-fade',
            'url',
        ]),
    ],
    ['border-image-width', new Set(['auto'])],
    ['border-image-slice', new Set(['fill'])],
    [
        'border-image-source',
        new Set([
            'none',
            'linear-gradient',
            'radial-gradient',
            'conic-gradient',
            'repeating-linear-gradient',
            'repeating-radial-gradient',
            'repeating-conic-gradient',
            'image-set',
            'cross-fade',
            'url',
        ]),
    ],
    [
        'text-decoration',
        new Set(['blink', 'line-through', 'overline', 'underline', 'wavy', 'double', 'solid', 'dashed', 'dotted']),
    ],
    // List taken from https://drafts.csswg.org/css-fonts-4/#generic-font-families
    [
        'font-family',
        new Set([
            'serif',
            'sans-serif',
            'cursive',
            'fantasy',
            'monospace',
            'system-ui',
            'emoji',
            'math',
            'fangsong',
            'ui-serif',
            'ui-sans-serif',
            'ui-monospace',
            'ui-rounded',
            '-webkit-body',
        ]),
    ],
    ['zoom', new Set(['normal'])],
    ['max-width', new Set(['min-content', 'max-content', '-webkit-fill-available', 'fit-content', 'stretch'])],
    ['-webkit-font-smoothing', new Set(['antialiased', 'subpixel-antialiased'])],
    [
        'border',
        new Set([
            'hidden',
            'inset',
            'groove',
            'ridge',
            'outset',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    [
        'font-variant',
        new Set([
            'small-caps',
            'normal',
            'common-ligatures',
            'no-common-ligatures',
            'discretionary-ligatures',
            'no-discretionary-ligatures',
            'historical-ligatures',
            'no-historical-ligatures',
            'contextual',
            'no-contextual',
            'all-small-caps',
            'petite-caps',
            'all-petite-caps',
            'unicase',
            'titling-caps',
            'lining-nums',
            'oldstyle-nums',
            'proportional-nums',
            'tabular-nums',
            'diagonal-fractions',
            'stacked-fractions',
            'ordinal',
            'slashed-zero',
            'jis78',
            'jis83',
            'jis90',
            'jis04',
            'simplified',
            'traditional',
            'full-width',
            'proportional-width',
            'ruby',
        ]),
    ],
    [
        'font-variant-alternates',
        new Set(['historical-forms', 'stylistic', 'styleset', 'character-variant', 'swash', 'ornaments', 'annotation']),
    ],
    ['vertical-align', new Set(['top', 'bottom', '-webkit-baseline-middle'])],
    ['page-break-after', new Set(['left', 'right', 'always', 'avoid'])],
    ['text-emphasis-style', textEmphasisStyle],
    ['-webkit-text-emphasis-style', textEmphasisStyle],
    [
        'transform',
        new Set([
            'scale', 'scaleX', 'scaleY', 'scale3d', 'rotate', 'rotateX', 'rotateY',
            'rotateZ', 'rotate3d', 'skew', 'skewX', 'skewY', 'translate', 'translateX',
            'translateY', 'translateZ', 'translate3d', 'matrix', 'matrix3d', 'perspective',
        ]),
    ],
    [
        'align-content',
        new Set([
            'normal',
            'baseline',
            'space-between',
            'space-around',
            'space-evenly',
            'stretch',
            'center',
            'start',
            'end',
            'flex-start',
            'flex-end',
        ]),
    ],
    [
        'justify-content',
        new Set([
            'normal',
            'space-between',
            'space-around',
            'space-evenly',
            'stretch',
            'center',
            'start',
            'end',
            'flex-start',
            'flex-end',
            'left',
            'right',
        ]),
    ],
    [
        'place-content',
        new Set([
            'normal',
            'space-between',
            'space-around',
            'space-evenly',
            'stretch',
            'center',
            'start',
            'end',
            'flex-start',
            'flex-end',
            'baseline',
        ]),
    ],
    [
        'align-items',
        new Set([
            'normal',
            'stretch',
            'baseline',
            'center',
            'start',
            'end',
            'self-start',
            'self-end',
            'flex-start',
            'flex-end',
            'anchor-center',
        ]),
    ],
    [
        'justify-items',
        new Set([
            'normal',
            'stretch',
            'baseline',
            'center',
            'start',
            'end',
            'self-start',
            'self-end',
            'flex-start',
            'flex-end',
            'left',
            'right',
            'legacy',
            'anchor-center',
        ]),
    ],
    [
        'place-items',
        new Set([
            'normal',
            'stretch',
            'baseline',
            'center',
            'start',
            'end',
            'self-start',
            'self-end',
            'flex-start',
            'flex-end',
            'anchor-center',
        ]),
    ],
    [
        'align-self',
        new Set([
            'normal',
            'stretch',
            'baseline',
            'center',
            'start',
            'end',
            'self-start',
            'self-end',
            'flex-start',
            'flex-end',
            'anchor-center',
        ]),
    ],
    [
        'justify-self',
        new Set([
            'normal',
            'stretch',
            'baseline',
            'center',
            'start',
            'end',
            'self-start',
            'self-end',
            'flex-start',
            'flex-end',
            'left',
            'right',
            'anchor-center',
        ]),
    ],
    [
        'place-self',
        new Set([
            'normal',
            'stretch',
            'baseline',
            'center',
            'start',
            'end',
            'self-start',
            'self-end',
            'flex-start',
            'flex-end',
            'anchor-center',
        ]),
    ],
    ['perspective-origin', new Set(['left', 'center', 'right', 'top', 'bottom'])],
    ['transform-origin', new Set(['left', 'center', 'right', 'top', 'bottom'])],
    ['transition-timing-function', new Set(['cubic-bezier', 'steps'])],
    ['animation-timing-function', new Set(['cubic-bezier', 'steps'])],
    ['-webkit-backface-visibility', new Set(['visible', 'hidden'])],
    ['-webkit-column-break-after', new Set(['always', 'avoid'])],
    ['-webkit-column-break-before', new Set(['always', 'avoid'])],
    ['-webkit-column-break-inside', new Set(['avoid'])],
    ['-webkit-column-span', new Set(['all'])],
    ['-webkit-column-gap', new Set(['normal'])],
    [
        'filter',
        new Set([
            'url',
            'blur',
            'brightness',
            'contrast',
            'drop-shadow',
            'grayscale',
            'hue-rotate',
            'invert',
            'opacity',
            'saturate',
            'sepia',
        ]),
    ],
    [
        'backdrop-filter',
        new Set([
            'url',
            'blur',
            'brightness',
            'contrast',
            'drop-shadow',
            'grayscale',
            'hue-rotate',
            'invert',
            'opacity',
            'saturate',
            'sepia',
        ]),
    ],
    ['grid-template-columns', new Set(['min-content', 'max-content'])],
    ['grid-template-rows', new Set(['min-content', 'max-content'])],
    ['grid-auto-flow', new Set(['dense'])],
    [
        'background',
        new Set([
            'repeat',
            'repeat-x',
            'repeat-y',
            'no-repeat',
            'top',
            'bottom',
            'left',
            'right',
            'center',
            'fixed',
            'local',
            'scroll',
            'space',
            'round',
            'border-box',
            'content-box',
            'padding-box',
            'text', // background-clip
            'linear-gradient',
            'radial-gradient',
            'conic-gradient',
            'repeating-linear-gradient',
            'repeating-radial-gradient',
            'repeating-conic-gradient',
            'image-set',
            'cross-fade',
            'url',
        ]),
    ],
    [
        'background-image',
        new Set([
            'linear-gradient',
            'radial-gradient',
            'conic-gradient',
            'repeating-linear-gradient',
            'repeating-radial-gradient',
            'repeating-conic-gradient',
            'image-set',
            'cross-fade',
            'url',
        ]),
    ],
    ['background-position', new Set(['top', 'bottom', 'left', 'right', 'center'])],
    ['background-position-x', new Set(['left', 'right', 'center'])],
    ['background-position-y', new Set(['top', 'bottom', 'center'])],
    ['background-repeat-x', new Set(['repeat', 'no-repeat'])],
    ['background-repeat-y', new Set(['repeat', 'no-repeat'])],
    [
        'border-bottom',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    [
        'border-left',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    [
        'border-right',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    [
        'border-top',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    ['buffered-rendering', new Set(['static', 'dynamic'])],
    ['color-interpolation-filters', new Set(['srgb', 'linearrgb'])],
    [
        'column-rule',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    ['flex-flow', new Set(['nowrap', 'row', 'row-reverse', 'column', 'column-reverse', 'wrap', 'wrap-reverse'])],
    ['height', new Set(['-webkit-fill-available', 'stretch'])],
    ['inline-size', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    [
        'list-style',
        new Set([
            'outside',
            'inside',
            ...listStyleTypeValues,
        ]),
    ],
    ['list-style-type', listStyleTypeValues],
    ['max-block-size', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['max-inline-size', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['min-block-size', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['min-height', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content', 'stretch'])],
    ['min-inline-size', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['min-width', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content', 'stretch'])],
    ['object-position', new Set(['top', 'bottom', 'left', 'right', 'center'])],
    ['shape-outside', new Set(['border-box', 'content-box', 'padding-box', 'margin-box'])],
    [
        '-webkit-appearance',
        new Set([
            'checkbox',
            'radio',
            'push-button',
            'square-button',
            'button',
            'inner-spin-button',
            'listbox',
            'media-slider',
            'media-sliderthumb',
            'media-volume-slider',
            'media-volume-sliderthumb',
            'menulist',
            'menulist-button',
            'meter',
            'progress-bar',
            'slider-horizontal',
            'slider-vertical',
            'sliderthumb-horizontal',
            'sliderthumb-vertical',
            'searchfield',
            'searchfield-cancel-button',
            'textfield',
            'textarea',
        ]),
    ],
    [
        '-webkit-border-after',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    [
        '-webkit-border-after-style',
        new Set(['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']),
    ],
    ['-webkit-border-after-width', new Set(['medium', 'thick', 'thin'])],
    [
        '-webkit-border-before',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    [
        '-webkit-border-before-style',
        new Set(['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']),
    ],
    ['-webkit-border-before-width', new Set(['medium', 'thick', 'thin'])],
    [
        '-webkit-border-end',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    [
        '-webkit-border-end-style',
        new Set(['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']),
    ],
    ['-webkit-border-end-width', new Set(['medium', 'thick', 'thin'])],
    [
        '-webkit-border-start',
        new Set([
            'hidden',
            'inset',
            'groove',
            'outset',
            'ridge',
            'dotted',
            'dashed',
            'solid',
            'double',
            'medium',
            'thick',
            'thin',
        ]),
    ],
    [
        '-webkit-border-start-style',
        new Set(['hidden', 'inset', 'groove', 'outset', 'ridge', 'dotted', 'dashed', 'solid', 'double']),
    ],
    ['-webkit-border-start-width', new Set(['medium', 'thick', 'thin'])],
    ['-webkit-logical-height', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['-webkit-logical-width', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['-webkit-mask-box-image', new Set(['repeat', 'stretch', 'space', 'round'])],
    ['-webkit-mask-box-image-repeat', new Set(['repeat', 'stretch', 'space', 'round'])],
    ['-webkit-mask-clip', new Set(['text', 'border', 'border-box', 'content', 'content-box', 'padding', 'padding-box'])],
    [
        '-webkit-mask-composite',
        new Set([
            'clear',
            'copy',
            'source-over',
            'source-in',
            'source-out',
            'source-atop',
            'destination-over',
            'destination-in',
            'destination-out',
            'destination-atop',
            'xor',
            'plus-lighter',
        ]),
    ],
    [
        'mask-image',
        new Set([
            'linear-gradient',
            'radial-gradient',
            'conic-gradient',
            'repeating-linear-gradient',
            'repeating-radial-gradient',
            'repeating-conic-gradient',
            'image-set',
            'cross-fade',
            'url',
        ]),
    ],
    [
        '-webkit-mask-image',
        new Set([
            'linear-gradient',
            'radial-gradient',
            'conic-gradient',
            'repeating-linear-gradient',
            'repeating-radial-gradient',
            'repeating-conic-gradient',
            'image-set',
            'cross-fade',
            'url',
        ]),
    ],
    ['-webkit-mask-origin', new Set(['border', 'border-box', 'content', 'content-box', 'padding', 'padding-box'])],
    ['-webkit-mask-position', new Set(['top', 'bottom', 'left', 'right', 'center'])],
    ['-webkit-mask-position-x', new Set(['left', 'right', 'center'])],
    ['-webkit-mask-position-y', new Set(['top', 'bottom', 'center'])],
    ['-webkit-mask-repeat', new Set(['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round'])],
    ['-webkit-mask-size', new Set(['contain', 'cover'])],
    ['-webkit-max-logical-height', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['-webkit-max-logical-width', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['-webkit-min-logical-height', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['-webkit-min-logical-width', new Set(['-webkit-fill-available', 'min-content', 'max-content', 'fit-content'])],
    ['-webkit-perspective-origin-x', new Set(['left', 'right', 'center'])],
    ['-webkit-perspective-origin-y', new Set(['top', 'bottom', 'center'])],
    ['-webkit-text-decorations-in-effect', new Set(['blink', 'line-through', 'overline', 'underline'])],
    ['-webkit-text-stroke', new Set(['medium', 'thick', 'thin'])],
    ['-webkit-text-stroke-width', new Set(['medium', 'thick', 'thin'])],
    ['-webkit-transform-origin-x', new Set(['left', 'right', 'center'])],
    ['-webkit-transform-origin-y', new Set(['top', 'bottom', 'center'])],
    ['width', new Set(['-webkit-fill-available', 'stretch'])],
    [
        'animation-trigger',
        new Set([
            'play',
            'pause',
            'play-once',
            'play-alternate',
            'play-forwards',
            'play-backwards',
            'play-pause',
            'replay',
        ]),
    ],
    ['timeline-trigger-activation-range-start', new Set(['normal'])],
    ['timeline-trigger-activation-range-end', new Set(['normal'])],
    ['timeline-trigger-active-range-start', new Set(['normal'])],
    ['timeline-trigger-active-range-end', new Set(['normal'])],
    ['contain-intrinsic-width', new Set(['auto none', 'auto 100px'])],
    ['contain-intrinsic-height', new Set(['auto none', 'auto 100px'])],
    ['contain-intrinsic-size', new Set(['auto none', 'auto 100px'])],
    ['contain-intrinsic-inline-size', new Set(['auto none', 'auto 100px'])],
    ['contain-intrinsic-block-size', new Set(['auto none', 'auto 100px'])],
    // Due to some compatibility issues[1] with Chrome's implementation[2],
    // only a few legacy values are added here.
    // [1]: https://github.com/w3c/csswg-drafts/issues/9102#issuecomment-1807453214
    // [2]: https://chromium-review.googlesource.com/c/chromium/src/+/4232738
    [
        'white-space',
        new Set([
            'normal', // equal to: `collapse wrap`
            'pre', // equal to: `preserve nowrap`
            'pre-wrap', // equal to: `preserve wrap`
            'pre-line', // equal to: `preserve-breaks wrap`
            'nowrap', // equal to: `collapse nowrap`
            'break-spaces', // equal to: `break-spaces wrap`, Chrome 76, crbug.com/767634#c28
        ]),
    ],
    // https://drafts.csswg.org/css-inline-3/#text-box-edge
    // Now we're going to allow the following rule:
    // auto | [ text | cap | ex ] [ text | alphabetic ]?
    // ideographic and ideographic-ink are not implemented yet.
    // We don't add values like `cap text` because that is equivalent to `text`.
    [
        'text-box-edge',
        new Set([
            'auto',
            'text',
            'cap',
            'ex',
            'text alphabetic',
            'cap alphabetic',
            'ex alphabetic',
        ]),
    ],
    [
        'text-wrap',
        new Set([
            'auto',
            'wrap',
            'nowrap',
            'balance',
            'pretty',
            'stable',
        ]),
    ],
    [
        'corner-shape',
        new Set([
            'round',
            'scoop',
            'bevel',
            'notch',
            'square',
            'squircle',
            'superellipse(0.5)',
            'superellipse(infinity)',
        ]),
    ],
    ['outline-style', new Set(['auto'])],
    ['overflow-block', new Set(['auto', 'hidden', 'visible', 'overlay', 'scroll', 'clip'])],
    ['overflow-inline', new Set(['auto', 'hidden', 'visible', 'overlay', 'scroll', 'clip'])],
    ['overscroll-behavior-block', new Set(['auto', 'none', 'contain'])],
    ['overscroll-behavior-inline', new Set(['auto', 'none', 'contain'])],
]);
// Weight of CSS properties based on their usage from https://www.chromestatus.com/metrics/css/popularity
const Weight = new Map([
    ['align-content', 57],
    ['align-items', 129],
    ['align-self', 55],
    ['animation', 175],
    ['animation-delay', 114],
    ['animation-direction', 113],
    ['animation-duration', 137],
    ['animation-fill-mode', 132],
    ['animation-iteration-count', 124],
    ['animation-name', 139],
    ['animation-play-state', 104],
    ['animation-timing-function', 141],
    ['backface-visibility', 123],
    ['background', 260],
    ['background-attachment', 119],
    ['background-clip', 165],
    ['background-color', 259],
    ['background-image', 246],
    ['background-origin', 107],
    ['background-position', 237],
    ['background-position-x', 108],
    ['background-position-y', 93],
    ['background-repeat', 234],
    ['background-size', 203],
    ['border', 263],
    ['border-bottom', 233],
    ['border-bottom-color', 190],
    ['border-bottom-left-radius', 186],
    ['border-bottom-right-radius', 185],
    ['border-bottom-style', 150],
    ['border-bottom-width', 179],
    ['border-collapse', 209],
    ['border-color', 226],
    ['border-image', 89],
    ['border-image-outset', 50],
    ['border-image-repeat', 49],
    ['border-image-slice', 58],
    ['border-image-source', 32],
    ['border-image-width', 52],
    ['border-left', 221],
    ['border-left-color', 174],
    ['border-left-style', 142],
    ['border-left-width', 172],
    ['border-radius', 224],
    ['border-right', 223],
    ['border-right-color', 182],
    ['border-right-style', 130],
    ['border-right-width', 178],
    ['border-spacing', 198],
    ['border-style', 206],
    ['border-top', 231],
    ['border-top-color', 192],
    ['border-top-left-radius', 187],
    ['border-top-right-radius', 189],
    ['border-top-style', 152],
    ['border-top-width', 180],
    ['border-width', 214],
    ['bottom', 227],
    ['box-shadow', 213],
    ['box-sizing', 216],
    ['caption-side', 96],
    ['clear', 229],
    ['clip', 173],
    ['clip-rule', 5],
    ['color', 256],
    ['content', 219],
    ['counter-increment', 111],
    ['counter-reset', 110],
    ['cursor', 250],
    ['direction', 176],
    ['display', 262],
    ['empty-cells', 99],
    ['fill', 140],
    ['fill-opacity', 82],
    ['fill-rule', 22],
    ['filter', 160],
    ['flex', 133],
    ['flex-basis', 66],
    ['flex-direction', 85],
    ['flex-flow', 94],
    ['flex-grow', 112],
    ['flex-shrink', 61],
    ['flex-wrap', 68],
    ['float', 252],
    ['font', 211],
    ['font-family', 254],
    ['font-kerning', 18],
    ['font-size', 264],
    ['font-stretch', 77],
    ['font-style', 220],
    ['font-variant', 161],
    ['font-weight', 257],
    ['height', 266],
    ['image-rendering', 90],
    ['justify-content', 127],
    ['left', 248],
    ['letter-spacing', 188],
    ['line-height', 244],
    ['list-style', 215],
    ['list-style-image', 145],
    ['list-style-position', 149],
    ['list-style-type', 199],
    ['margin', 267],
    ['margin-bottom', 241],
    ['margin-left', 243],
    ['margin-right', 238],
    ['margin-top', 253],
    ['mask', 20],
    ['max-height', 205],
    ['max-width', 225],
    ['min-height', 217],
    ['min-width', 218],
    ['object-fit', 33],
    ['opacity', 251],
    ['order', 117],
    ['orphans', 146],
    ['outline', 222],
    ['outline-color', 153],
    ['outline-offset', 147],
    ['outline-style', 151],
    ['outline-width', 148],
    ['overflow', 255],
    ['overflow-wrap', 105],
    ['overflow-x', 184],
    ['overflow-y', 196],
    ['padding', 265],
    ['padding-bottom', 230],
    ['padding-left', 235],
    ['padding-right', 232],
    ['padding-top', 240],
    ['page', 8],
    ['page-break-after', 120],
    ['page-break-before', 69],
    ['page-break-inside', 121],
    ['perspective', 92],
    ['perspective-origin', 103],
    ['pointer-events', 183],
    ['position', 261],
    ['quotes', 158],
    ['resize', 168],
    ['right', 245],
    ['shape-rendering', 38],
    ['size', 64],
    ['speak', 118],
    ['src', 170],
    ['stop-color', 42],
    ['stop-opacity', 31],
    ['stroke', 98],
    ['stroke-dasharray', 36],
    ['stroke-dashoffset', 3],
    ['stroke-linecap', 30],
    ['stroke-linejoin', 21],
    ['stroke-miterlimit', 12],
    ['stroke-opacity', 34],
    ['stroke-width', 87],
    ['table-layout', 171],
    ['tab-size', 46],
    ['text-align', 260],
    ['text-anchor', 35],
    ['text-decoration', 247],
    ['text-indent', 207],
    ['text-overflow', 204],
    ['text-rendering', 155],
    ['text-shadow', 208],
    ['text-transform', 202],
    ['top', 258],
    ['touch-action', 80],
    ['transform', 181],
    ['transform-origin', 162],
    ['transform-style', 86],
    ['transition', 193],
    ['transition-delay', 134],
    ['transition-duration', 135],
    ['transition-property', 131],
    ['transition-timing-function', 122],
    ['unicode-bidi', 156],
    ['unicode-range', 136],
    ['vertical-align', 236],
    ['visibility', 242],
    ['-webkit-appearance', 191],
    ['-webkit-backface-visibility', 154],
    ['-webkit-background-clip', 164],
    ['-webkit-background-origin', 40],
    ['-webkit-background-size', 163],
    ['-webkit-border-end', 9],
    ['-webkit-border-horizontal-spacing', 81],
    ['-webkit-border-image', 75],
    ['-webkit-border-radius', 212],
    ['-webkit-border-start', 10],
    ['-webkit-border-start-color', 16],
    ['-webkit-border-start-width', 13],
    ['-webkit-border-vertical-spacing', 43],
    ['-webkit-box-align', 101],
    ['-webkit-box-direction', 51],
    ['-webkit-box-flex', 128],
    ['-webkit-box-ordinal-group', 91],
    ['-webkit-box-orient', 144],
    ['-webkit-box-pack', 106],
    ['-webkit-box-reflect', 39],
    ['-webkit-box-shadow', 210],
    ['-webkit-column-break-inside', 60],
    ['-webkit-column-count', 84],
    ['-webkit-column-gap', 76],
    ['-webkit-column-rule', 25],
    ['-webkit-column-rule-color', 23],
    ['-webkit-columns', 44],
    ['-webkit-column-span', 29],
    ['-webkit-column-width', 47],
    ['-webkit-filter', 159],
    ['-webkit-font-feature-settings', 59],
    ['-webkit-font-smoothing', 177],
    ['-webkit-line-break', 45],
    ['-webkit-line-clamp', 126],
    ['-webkit-margin-after', 67],
    ['-webkit-margin-before', 70],
    ['-webkit-margin-collapse', 14],
    ['-webkit-margin-end', 65],
    ['-webkit-margin-start', 100],
    ['-webkit-mask', 19],
    ['-webkit-mask-box-image', 72],
    ['-webkit-mask-image', 88],
    ['-webkit-mask-position', 54],
    ['-webkit-mask-repeat', 63],
    ['-webkit-mask-size', 79],
    ['-webkit-padding-after', 15],
    ['-webkit-padding-before', 28],
    ['-webkit-padding-end', 48],
    ['-webkit-padding-start', 73],
    ['-webkit-print-color-adjust', 83],
    ['-webkit-rtl-ordering', 7],
    ['-webkit-tap-highlight-color', 169],
    ['-webkit-text-emphasis-color', 11],
    ['-webkit-text-fill-color', 71],
    ['-webkit-text-security', 17],
    ['-webkit-text-stroke', 56],
    ['-webkit-text-stroke-color', 37],
    ['-webkit-text-stroke-width', 53],
    ['-webkit-user-drag', 95],
    ['-webkit-user-modify', 62],
    ['-webkit-user-select', 194],
    ['-webkit-writing-mode', 4],
    ['white-space', 228],
    ['widows', 115],
    ['width', 268],
    ['will-change', 74],
    ['word-break', 166],
    ['word-spacing', 157],
    ['word-wrap', 197],
    ['writing-mode', 41],
    ['z-index', 239],
    ['zoom', 200],
]);
// Common keywords to CSS properties
const CommonKeywords = ['auto', 'none'];
//# sourceMappingURL=CSSMetadata.js.map