/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools } from '../third_party/index.js';
import type { MatchedStyles } from '../tools/ToolDefinition.js';
export type UidResolver = (backendNodeId: number) => string | undefined;
export type ContainerQuery = DevTools.CSSRule.CSSStyleRule['containerQueries'][number];
export interface ResolvedContainerDetails {
    container?: {
        selector: string;
        uid?: string;
    };
}
export interface CssFormatterOptions {
    uid: string;
    resolveUid?: UidResolver;
    containerDetails?: Map<ContainerQuery, ResolvedContainerDetails>;
}
/**
 * Status of a CSS property in the cascade:
 * - `active`: Winning declaration for this property name (printed without prefix tag).
 * - `overloaded`: Overridden by a more specific or later CSS rule (`[overloaded]`).
 * - `invalid`: Property name or value failed CSS parsing (`[invalid]`).
 * - `disabled`: Commented out or programmatically disabled (`[disabled]`).
 */
export type CssPropertyStatus = 'active' | 'overloaded' | 'invalid' | 'disabled';
export type AncestorCSSRule = {
    type: 'layer';
    name?: string;
} | {
    type: 'media' | 'supports' | 'navigation';
    query: string;
} | {
    type: 'scope';
    query?: string;
} | {
    type: 'container';
    query: string;
    name?: string;
    container?: {
        selector: string;
        uid?: string;
    };
} | {
    type: 'starting-style';
} | {
    type: 'nesting';
    selector: string;
} | {
    type: 'at-rule';
    atRuleType: string;
    name?: string;
};
export interface StructuredCssProperty {
    name: string;
    value: string;
    status: CssPropertyStatus;
    important?: boolean;
}
export interface NodeStyleRule {
    type: 'inline' | 'attributes' | 'transition';
    selector: string;
    properties: StructuredCssProperty[];
}
export interface AnimationRule {
    type: 'animation';
    name?: string;
    selector: string;
    properties: StructuredCssProperty[];
}
export interface MatchedRule {
    type: 'matched';
    selector: string;
    matchingSelectors?: string[];
    source?: string;
    isUserAgent?: boolean;
    ancestors?: AncestorCSSRule[];
    properties: StructuredCssProperty[];
}
export interface InheritedRule {
    type: 'inherited';
    node: {
        selector: string;
        uid?: string;
    };
    selector?: string;
    matchingSelectors?: string[];
    source?: string;
    ancestors?: AncestorCSSRule[];
    properties: StructuredCssProperty[];
}
export interface PseudoElementRule {
    type: 'pseudo';
    pseudoType: string;
    node?: {
        selector: string;
        uid?: string;
    };
    selector?: string;
    matchingSelectors?: string[];
    source?: string;
    ancestors?: AncestorCSSRule[];
    properties: StructuredCssProperty[];
}
export interface KeyframeStep {
    keyText: string;
    source?: string;
    properties: StructuredCssProperty[];
}
export interface KeyframesRule {
    type: 'keyframes';
    name: string;
    selector: string;
    source?: string;
    keyframes: KeyframeStep[];
}
export interface AtRule {
    type: 'at-rule';
    atRuleType: string;
    name?: string;
    subsection?: string;
    selector: string;
    source?: string;
    ancestors?: AncestorCSSRule[];
    properties: StructuredCssProperty[];
}
export interface PositionTryRule {
    type: 'position-try';
    name: string;
    active: boolean;
    selector: string;
    source?: string;
    ancestors?: AncestorCSSRule[];
    properties: StructuredCssProperty[];
}
export interface PropertyRule {
    type: 'property';
    name: string;
    selector: string;
    source?: string;
    properties: StructuredCssProperty[];
}
export interface FunctionRule {
    type: 'function';
    name: string;
    selector: string;
    source?: string;
    properties: StructuredCssProperty[];
}
export type CascadeRule = NodeStyleRule | AnimationRule | MatchedRule | InheritedRule | PseudoElementRule | KeyframesRule | AtRule | PositionTryRule | PropertyRule | FunctionRule;
export interface StructuredCssStyles {
    element: {
        uid: string;
        selector: string;
    };
    rules: CascadeRule[];
}
export declare class CssFormatter {
    #private;
    /**
     * Aggregates all cascading rules impacting the target node.
     */
    static collectRules(matchedStyles: MatchedStyles, options: CssFormatterOptions): CascadeRule[];
    constructor(matchedStyles: MatchedStyles, options: CssFormatterOptions, cascadeRules?: readonly CascadeRule[]);
    get rules(): readonly CascadeRule[];
    toString(): string;
    toJSON(): StructuredCssStyles;
}
/**
 * Resolves container element details for all `@container` queries impacting the node.
 *
 * Container queries evaluate against an ancestor container element in the DOM tree.
 * The DevTools SDK performs an asynchronous CDP request (`CSS.getContainerForNode`)
 * to discover the concrete container node for each query.
 *
 * Resolving these upfront in parallel allows `CssFormatter` methods to remain purely
 * synchronous while providing container selectors and UIDs in headers and comments.
 */
export declare function resolveContainerQueries(matchedStyles: MatchedStyles, resolveUid?: UidResolver): Promise<Map<ContainerQuery, ResolvedContainerDetails>>;
