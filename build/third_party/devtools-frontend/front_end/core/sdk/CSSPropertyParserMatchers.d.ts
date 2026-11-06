import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import type * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import type { CSSMatchedStyles, CSSValueSource, CSSVariableValue } from './CSSMatchedStyles.js';
import { type CSSWideKeyword } from './CSSMetadata.js';
import type { CSSProperty } from './CSSProperty.js';
import { type BottomUpTreeMatching, type Match, type MatcherClass } from './CSSPropertyParser.js';
import type { CSSStyleDeclaration } from './CSSStyleDeclaration.js';
export declare class BaseVariableMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly name: string;
    readonly fallback: CodeMirror.SyntaxNode[] | undefined;
    readonly matching: BottomUpTreeMatching;
    readonly computedTextCallback: (match: BaseVariableMatch, matching: BottomUpTreeMatching) => string | null;
    constructor(text: string, node: CodeMirror.SyntaxNode, name: string, fallback: CodeMirror.SyntaxNode[] | undefined, matching: BottomUpTreeMatching, computedTextCallback: (match: BaseVariableMatch, matching: BottomUpTreeMatching) => string | null);
    computedText(): string | null;
    fallbackValue(): string | null;
}
declare const BaseVariableMatcherBase: MatcherClass<BaseVariableMatch>;
export declare class BaseVariableMatcher extends BaseVariableMatcherBase {
    #private;
    constructor(computedTextCallback: (match: BaseVariableMatch, matching: BottomUpTreeMatching) => string | null);
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): BaseVariableMatch | null;
}
export declare class VariableMatch extends BaseVariableMatch {
    readonly matchedStyles: CSSMatchedStyles;
    readonly style: CSSStyleDeclaration;
    constructor(text: string, node: CodeMirror.SyntaxNode, name: string, fallback: CodeMirror.SyntaxNode[] | undefined, matching: BottomUpTreeMatching, matchedStyles: CSSMatchedStyles, style: CSSStyleDeclaration);
    resolveVariable(): CSSVariableValue | null;
}
declare const VariableMatcherBase: MatcherClass<VariableMatch>;
export declare class VariableMatcher extends VariableMatcherBase {
    readonly matchedStyles: CSSMatchedStyles;
    readonly style: CSSStyleDeclaration;
    constructor(matchedStyles: CSSMatchedStyles, style: CSSStyleDeclaration);
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): VariableMatch | null;
}
export declare class VariableNameMatch implements Match {
    readonly node: CodeMirror.SyntaxNode;
    readonly text: string;
    readonly matchedStyles: CSSMatchedStyles;
    readonly style: CSSStyleDeclaration;
    constructor(node: CodeMirror.SyntaxNode, text: string, matchedStyles: CSSMatchedStyles, style: CSSStyleDeclaration);
    resolveVariable(): CSSVariableValue | null;
}
declare const VariableNameMatcherBase: MatcherClass<VariableNameMatch>;
export declare class VariableNameMatcher extends VariableNameMatcherBase {
    readonly matchedStyles: CSSMatchedStyles;
    readonly style: CSSStyleDeclaration;
    constructor(matchedStyles: CSSMatchedStyles, style: CSSStyleDeclaration);
    accepts(): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): VariableNameMatch | null;
}
export declare class AttributeMatch extends BaseVariableMatch {
    readonly type: string | null;
    readonly isCSSTokens: boolean;
    readonly isValidType: boolean;
    readonly rawValue: string | null;
    readonly substitutionText: string | null;
    readonly matchedStyles: CSSMatchedStyles;
    readonly style: CSSStyleDeclaration;
    constructor(text: string, node: CodeMirror.SyntaxNode, name: string, fallback: CodeMirror.SyntaxNode[] | undefined, matching: BottomUpTreeMatching, type: string | null, isCSSTokens: boolean, isValidType: boolean, rawValue: string | null, substitutionText: string | null, matchedStyles: CSSMatchedStyles, style: CSSStyleDeclaration, computedTextCallback: (match: AttributeMatch, matching: BottomUpTreeMatching) => string | null);
    rawAttributeValue(): string | null;
    cssType(): string;
    resolveAttributeValue(): string | null;
}
/**
 * These functions use an element in the frontend to evaluate CSS. The advantage
 * of this is that it is synchronous and doesn't require a CDP method. The
 * disadvantage is it lacks context that would allow substitutions such as
 * `var()` and `calc()` to be resolved correctly, and if the user is doing
 * remote debugging there is a possibility that the CSS behavior is different
 * between the two browser versions. We use it for type checking after
 * substitutions (but not for actual evaluation) and for applying units.
 **/
export declare function localEvalCSS(value: string, type: string): string | null;
/**
 * It is important to establish whether a type is valid, because if it is not,
 * the current behavior of blink is to ignore the fallback and parse as a
 * raw string, returning '' if the attribute is not set.
 **/
export declare function isValidCSSType(type: string): boolean;
export declare function defaultValueForCSSType(type: string | null): string | null;
export declare const RAW_STRING_TYPE = "raw-string";
declare const AttributeMatcherBase: MatcherClass<AttributeMatch>;
export declare class AttributeMatcher extends AttributeMatcherBase {
    private readonly matchedStyles;
    private readonly style;
    private readonly computedTextCallback?;
    constructor(matchedStyles: CSSMatchedStyles, style: CSSStyleDeclaration, computedTextCallback?: ((match: AttributeMatch, matching: BottomUpTreeMatching) => string | null) | undefined);
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): AttributeMatch | null;
}
export declare class BinOpMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    constructor(text: string, node: CodeMirror.SyntaxNode);
}
declare const BinOpMatcherBase: MatcherClass<BinOpMatch>;
export declare class BinOpMatcher extends BinOpMatcherBase {
    accepts(): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): BinOpMatch | null;
}
export declare class TextMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    computedText?: () => string;
    constructor(text: string, node: CodeMirror.SyntaxNode);
}
declare const TextMatcherBase: MatcherClass<TextMatch>;
export declare class TextMatcher extends TextMatcherBase {
    accepts(): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): TextMatch | null;
}
export declare class ImportantMatch extends TextMatch {
    computedText: () => string;
}
declare const ImportantMatcherBase: MatcherClass<ImportantMatch>;
export declare class ImportantMatcher extends ImportantMatcherBase {
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): ImportantMatch | null;
}
export declare class AngleMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    constructor(text: string, node: CodeMirror.SyntaxNode);
    computedText(): string;
}
declare const AngleMatcherBase: MatcherClass<AngleMatch>;
export declare class AngleMatcher extends AngleMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): AngleMatch | null;
}
export declare class ColorMixMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly space: CodeMirror.SyntaxNode[];
    readonly color1: CodeMirror.SyntaxNode[];
    readonly color2: CodeMirror.SyntaxNode[];
    constructor(text: string, node: CodeMirror.SyntaxNode, space: CodeMirror.SyntaxNode[], color1: CodeMirror.SyntaxNode[], color2: CodeMirror.SyntaxNode[]);
}
declare const ColorMixMatcherBase: MatcherClass<ColorMixMatch>;
export declare class ColorMixMatcher extends ColorMixMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): ColorMixMatch | null;
}
export declare class ContrastColorMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly color: CodeMirror.SyntaxNode[];
    constructor(text: string, node: CodeMirror.SyntaxNode, color: CodeMirror.SyntaxNode[]);
}
declare const ContrastColorMatcherBase: MatcherClass<ContrastColorMatch>;
export declare class ContrastColorMatcher extends ContrastColorMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): ContrastColorMatch | null;
}
export declare class URLMatch implements Match {
    readonly url: Platform.DevToolsPath.UrlString;
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    constructor(url: Platform.DevToolsPath.UrlString, text: string, node: CodeMirror.SyntaxNode);
}
declare const URLMatcherBase: MatcherClass<URLMatch>;
export declare class URLMatcher extends URLMatcherBase {
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): URLMatch | null;
}
export declare class LinearGradientMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    constructor(text: string, node: CodeMirror.SyntaxNode);
}
declare const LinearGradientMatcherBase: MatcherClass<LinearGradientMatch>;
export declare class LinearGradientMatcher extends LinearGradientMatcherBase {
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): Match | null;
    accepts(propertyName: string): boolean;
}
interface RelativeColor {
    colorSpace: Common.Color.Format;
    baseColor: ColorMatch;
}
export declare class ColorMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    private readonly currentColorCallback?;
    readonly relativeColor?: RelativeColor | undefined;
    computedText: (() => string | null) | undefined;
    constructor(text: string, node: CodeMirror.SyntaxNode, currentColorCallback?: (() => string | null) | undefined, relativeColor?: RelativeColor | undefined);
}
declare const ColorMatcherBase: MatcherClass<ColorMatch>;
export declare class ColorMatcher extends ColorMatcherBase {
    private readonly currentColorCallback?;
    constructor(currentColorCallback?: (() => string | null) | undefined);
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): ColorMatch | null;
}
export declare class RelativeColorChannelMatch implements Match {
    readonly text: Common.Color.ColorChannel;
    readonly node: CodeMirror.SyntaxNode;
    constructor(text: Common.Color.ColorChannel, node: CodeMirror.SyntaxNode);
    getColorChannelValue(relativeColor: RelativeColor): number | null;
    computedText(): string;
}
declare const RelativeColorChannelMatcherBase: MatcherClass<RelativeColorChannelMatch>;
export declare class RelativeColorChannelMatcher extends RelativeColorChannelMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): RelativeColorChannelMatch | null;
}
export declare class LightDarkColorMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly light: CodeMirror.SyntaxNode[];
    readonly dark: CodeMirror.SyntaxNode[];
    readonly style: CSSStyleDeclaration;
    constructor(text: string, node: CodeMirror.SyntaxNode, light: CodeMirror.SyntaxNode[], dark: CodeMirror.SyntaxNode[], style: CSSStyleDeclaration);
}
declare const LightDarkColorMatcherBase: MatcherClass<LightDarkColorMatch>;
export declare class LightDarkColorMatcher extends LightDarkColorMatcherBase {
    readonly style: CSSStyleDeclaration;
    constructor(style: CSSStyleDeclaration);
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): LightDarkColorMatch | null;
}
export declare class AutoBaseMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly auto: CodeMirror.SyntaxNode[];
    readonly base: CodeMirror.SyntaxNode[];
    constructor(text: string, node: CodeMirror.SyntaxNode, auto: CodeMirror.SyntaxNode[], base: CodeMirror.SyntaxNode[]);
}
declare const AutoBaseMatcherBase: MatcherClass<AutoBaseMatch>;
export declare class AutoBaseMatcher extends AutoBaseMatcherBase {
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): AutoBaseMatch | null;
}
export declare const enum LinkableNameProperties {
    ANIMATION = "animation",
    ANIMATION_NAME = "animation-name",
    FONT_PALETTE = "font-palette",
    LIST_STYLE = "list-style",
    LIST_STYLE_TYPE = "list-style-type",
    POSITION_TRY = "position-try",
    POSITION_TRY_FALLBACKS = "position-try-fallbacks"
}
declare const enum AnimationLonghandPart {
    DIRECTION = "direction",
    FILL_MODE = "fill-mode",
    PLAY_STATE = "play-state",
    ITERATION_COUNT = "iteration-count",
    EASING_FUNCTION = "easing-function"
}
export declare class LinkableNameMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly propertyName: LinkableNameProperties;
    constructor(text: string, node: CodeMirror.SyntaxNode, propertyName: LinkableNameProperties);
}
declare const LinkableNameMatcherBase: MatcherClass<LinkableNameMatch>;
export declare class LinkableNameMatcher extends LinkableNameMatcherBase {
    private static isLinkableNameProperty;
    static readonly identifierAnimationLonghandMap: Map<string, AnimationLonghandPart>;
    private matchAnimationNameInShorthand;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): LinkableNameMatch | null;
}
export declare class BezierMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    constructor(text: string, node: CodeMirror.SyntaxNode);
}
declare const BezierMatcherBase: MatcherClass<BezierMatch>;
export declare class BezierMatcher extends BezierMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): Match | null;
}
export declare class StringMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    constructor(text: string, node: CodeMirror.SyntaxNode);
}
declare const StringMatcherBase: MatcherClass<StringMatch>;
export declare class StringMatcher extends StringMatcherBase {
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): Match | null;
}
export declare const enum ShadowType {
    BOX_SHADOW = "boxShadow",
    TEXT_SHADOW = "textShadow"
}
export declare class ShadowMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly shadowType: ShadowType;
    constructor(text: string, node: CodeMirror.SyntaxNode, shadowType: ShadowType);
}
declare const ShadowMatcherBase: MatcherClass<ShadowMatch>;
export declare class ShadowMatcher extends ShadowMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): ShadowMatch | null;
}
export declare class LengthMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly unit: string;
    constructor(text: string, node: CodeMirror.SyntaxNode, unit: string);
}
declare const LengthMatcherBase: MatcherClass<LengthMatch>;
export declare class LengthMatcher extends LengthMatcherBase {
    static readonly LENGTH_UNITS: Set<string>;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): LengthMatch | null;
}
export declare const enum SelectFunction {
    MIN = "min",
    MAX = "max",
    CLAMP = "clamp"
}
export declare const enum ArithmeticFunction {
    CALC = "calc",
    SIBLING_COUNT = "sibling-count",
    SIBLING_INDEX = "sibling-index",
    ROUND = "round",
    MOD = "mod",
    REM = "rem"
}
type MathFunction = SelectFunction | ArithmeticFunction;
export declare class BaseFunctionMatch<T extends string> implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly func: T;
    readonly args: CodeMirror.SyntaxNode[][];
    constructor(text: string, node: CodeMirror.SyntaxNode, func: T, args: CodeMirror.SyntaxNode[][]);
}
export declare class MathFunctionMatch extends BaseFunctionMatch<MathFunction> {
    isArithmeticFunctionCall(): boolean;
}
declare const MathFunctionMatcherBase: MatcherClass<MathFunctionMatch>;
export declare class MathFunctionMatcher extends MathFunctionMatcherBase {
    private static getFunctionType;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): MathFunctionMatch | null;
}
export declare class CustomFunctionMatch extends BaseFunctionMatch<string> {
}
declare const CustomFunctionMatcherBase: MatcherClass<CustomFunctionMatch>;
export declare class CustomFunctionMatcher extends CustomFunctionMatcherBase {
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): CustomFunctionMatch | null;
}
export declare const enum LayoutType {
    FLEX = "flex",
    GRID = "grid",
    GRID_LANES = "grid-lanes"
}
export declare class FlexGridGridLanesMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly layoutType: LayoutType;
    constructor(text: string, node: CodeMirror.SyntaxNode, layoutType: LayoutType);
}
declare const FlexGridGridLanesMatcherBase: MatcherClass<FlexGridGridLanesMatch>;
export declare class FlexGridGridLanesMatcher extends FlexGridGridLanesMatcherBase {
    static readonly FLEX: string[];
    static readonly GRID: string[];
    static readonly GRID_LANES: string[];
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): FlexGridGridLanesMatch | null;
}
export declare class GridTemplateMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly lines: CodeMirror.SyntaxNode[][];
    constructor(text: string, node: CodeMirror.SyntaxNode, lines: CodeMirror.SyntaxNode[][]);
}
declare const GridTemplateMatcherBase: MatcherClass<GridTemplateMatch>;
export declare class GridTemplateMatcher extends GridTemplateMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): GridTemplateMatch | null;
}
export declare class AnchorFunctionMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly functionName: string | null;
    constructor(text: string, node: CodeMirror.SyntaxNode, functionName: string | null);
}
declare const AnchorFunctionMatcherBase: MatcherClass<AnchorFunctionMatch>;
export declare class AnchorFunctionMatcher extends AnchorFunctionMatcherBase {
    anchorFunction(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): string | null;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): AnchorFunctionMatch | null;
}
/** For linking `position-anchor: --anchor-name`. **/
export declare class PositionAnchorMatch implements Match {
    readonly text: string;
    readonly matching: BottomUpTreeMatching;
    readonly node: CodeMirror.SyntaxNode;
    constructor(text: string, matching: BottomUpTreeMatching, node: CodeMirror.SyntaxNode);
}
declare const PositionAnchorMatcherBase: MatcherClass<PositionAnchorMatch>;
export declare class PositionAnchorMatcher extends PositionAnchorMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): PositionAnchorMatch | null;
}
export declare class CSSWideKeywordMatch implements Match {
    readonly text: CSSWideKeyword;
    readonly node: CodeMirror.SyntaxNode;
    readonly property: CSSProperty;
    readonly matchedStyles: CSSMatchedStyles;
    constructor(text: CSSWideKeyword, node: CodeMirror.SyntaxNode, property: CSSProperty, matchedStyles: CSSMatchedStyles);
    resolveProperty(): CSSValueSource | null;
    computedText?(): string | null;
}
declare const CSSWideKeywordMatcherBase: MatcherClass<CSSWideKeywordMatch>;
export declare class CSSWideKeywordMatcher extends CSSWideKeywordMatcherBase {
    readonly property: CSSProperty;
    readonly matchedStyles: CSSMatchedStyles;
    constructor(property: CSSProperty, matchedStyles: CSSMatchedStyles);
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): CSSWideKeywordMatch | null;
}
export declare class PositionTryMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly preamble: CodeMirror.SyntaxNode[];
    readonly fallbacks: CodeMirror.SyntaxNode[][];
    constructor(text: string, node: CodeMirror.SyntaxNode, preamble: CodeMirror.SyntaxNode[], fallbacks: CodeMirror.SyntaxNode[][]);
}
declare const PositionTryMatcherBase: MatcherClass<PositionTryMatch>;
export declare class PositionTryMatcher extends PositionTryMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): PositionTryMatch | null;
}
export declare class EnvFunctionMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    readonly varName: string;
    readonly value: string | null;
    readonly varNameIsValid: boolean;
    constructor(text: string, node: CodeMirror.SyntaxNode, varName: string, value: string | null, varNameIsValid: boolean);
    computedText(): string | null;
}
declare const EnvFunctionMatcherBase: MatcherClass<EnvFunctionMatch>;
export declare class EnvFunctionMatcher extends EnvFunctionMatcherBase {
    readonly matchedStyles: CSSMatchedStyles;
    constructor(matchedStyles: CSSMatchedStyles);
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): EnvFunctionMatch | null;
}
export declare class PositionAreaMatch implements Match {
    readonly text: string;
    readonly node: CodeMirror.SyntaxNode;
    constructor(text: string, node: CodeMirror.SyntaxNode);
}
declare const PositionAreaMatcherBase: MatcherClass<PositionAreaMatch>;
export declare class PositionAreaMatcher extends PositionAreaMatcherBase {
    accepts(propertyName: string): boolean;
    matches(node: CodeMirror.SyntaxNode, matching: BottomUpTreeMatching): PositionAreaMatch | null;
}
export {};
