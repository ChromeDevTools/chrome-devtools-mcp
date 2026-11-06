import * as Protocol from '../../generated/protocol.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { CSSContainerQuery } from './CSSContainerQuery.js';
import { CSSLayer } from './CSSLayer.js';
import { CSSMedia } from './CSSMedia.js';
import type { CSSModel, Edit } from './CSSModel.js';
import { CSSNavigation } from './CSSNavigation.js';
import { CSSScope } from './CSSScope.js';
import { CSSStartingStyle } from './CSSStartingStyle.js';
import { CSSStyleDeclaration } from './CSSStyleDeclaration.js';
import type { CSSStyleSheetHeader } from './CSSStyleSheetHeader.js';
import { CSSSupports } from './CSSSupports.js';
export declare class CSSRule {
    readonly cssModelInternal: CSSModel;
    readonly origin: Protocol.CSS.StyleSheetOrigin;
    readonly style: CSSStyleDeclaration;
    readonly header: CSSStyleSheetHeader | null;
    readonly treeScope: Protocol.DOM.BackendNodeId | undefined;
    constructor(cssModel: CSSModel, payload: {
        style: Protocol.CSS.CSSStyle;
        origin: Protocol.CSS.StyleSheetOrigin;
        header: CSSStyleSheetHeader | null;
        originTreeScopeNodeId?: Protocol.DOM.BackendNodeId;
    });
    get sourceURL(): string | undefined;
    rebase(edit: Edit): void;
    resourceURL(): Platform.DevToolsPath.UrlString;
    isUserAgent(): boolean;
    isInjected(): boolean;
    isViaInspector(): boolean;
    isRegular(): boolean;
    isKeyframeRule(): boolean;
    cssModel(): CSSModel;
}
declare class CSSValue {
    text: string;
    range?: TextUtils.TextRange.TextRange;
    specificity?: Protocol.CSS.Specificity;
    constructor(payload: Protocol.CSS.Value);
    rebase(edit: Edit): void;
}
export declare class CSSStyleRule extends CSSRule {
    selectors: CSSValue[];
    nestingSelectors?: string[];
    media: CSSMedia[];
    containerQueries: CSSContainerQuery[];
    supports: CSSSupports[];
    scopes: CSSScope[];
    layers: CSSLayer[];
    ruleTypes: Protocol.CSS.CSSRuleType[];
    startingStyles: CSSStartingStyle[];
    navigations: CSSNavigation[];
    wasUsed: boolean;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSRule, wasUsed?: boolean);
    static createDummyRule(cssModel: CSSModel, selectorText: string): CSSStyleRule;
    private reinitializeSelectors;
    setSelectorText(newSelector: string): Promise<boolean>;
    selectorText(): string;
    selectorRange(): TextUtils.TextRange.TextRange | null;
    lineNumberInSource(selectorIndex: number): number;
    columnNumberInSource(selectorIndex: number): number | undefined;
    rebase(edit: Edit): void;
    constructResolvedSelector(nestingIndex?: number): string | undefined;
}
export declare class CSSPropertyRule extends CSSRule {
    #private;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSPropertyRule);
    propertyName(): CSSValue;
    initialValue(): string | null;
    syntax(): string;
    inherits(): boolean;
    setPropertyName(newPropertyName: string): Promise<boolean>;
}
export declare class CSSAtRule extends CSSRule {
    #private;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSAtRule);
    name(): CSSValue | null;
    type(): string;
    subsection(): string | null;
}
export declare class CSSKeyframesRule {
    #private;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSKeyframesRule);
    name(): CSSValue;
    keyframes(): CSSKeyframeRule[];
}
export declare class CSSKeyframeRule extends CSSRule {
    #private;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSKeyframeRule, parentRuleName: string);
    parentRuleName(): string;
    key(): CSSValue;
    private reinitializeKey;
    rebase(edit: Edit): void;
    isKeyframeRule(): boolean;
    setKeyText(newKeyText: string): Promise<boolean>;
}
export declare class CSSPositionTryRule extends CSSRule {
    #private;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSPositionTryRule);
    name(): CSSValue;
    active(): boolean;
}
export interface CSSNestedStyleLeaf {
    style: CSSStyleDeclaration;
}
export type CSSNestedStyleCondition = {
    children: CSSNestedStyle[];
} & ({
    media: CSSMedia;
} | {
    container: CSSContainerQuery;
} | {
    supports: CSSSupports;
} | {
    navigation: CSSNavigation;
});
export type CSSNestedStyle = CSSNestedStyleLeaf | CSSNestedStyleCondition;
export declare class CSSFunctionRule extends CSSRule {
    #private;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSFunctionRule);
    functionName(): CSSValue;
    parameters(): string[];
    children(): CSSNestedStyle[];
    nameWithParameters(): string;
    protocolNodesToNestedStyles(nodes: Protocol.CSS.CSSFunctionNode[]): CSSNestedStyle[];
    protocolNodeToNestedStyle(node: Protocol.CSS.CSSFunctionNode): CSSNestedStyle | undefined;
    rebase(edit: Edit): void;
    rebaseChildren(children: CSSNestedStyle[], edit: Edit): void;
    static mergeRanges(nodes: Protocol.CSS.CSSFunctionNode[]): Protocol.CSS.SourceRange | undefined;
}
export {};
