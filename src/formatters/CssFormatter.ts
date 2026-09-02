/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools} from '../third_party/index.js';
import type {MatchedStyles} from '../tools/ToolDefinition.js';

export type UidResolver = (backendNodeId: number) => string | undefined;
export type ContainerQuery =
  DevTools.CSSRule.CSSStyleRule['containerQueries'][number];

export interface ResolvedContainerDetails {
  container?: {
    uid?: string;
    selector: string;
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
export type CssPropertyStatus =
  'active' | 'overloaded' | 'invalid' | 'disabled';

export type AncestorCSSRule =
  | {
      type: 'layer';
      name?: string;
    }
  | {
      type: 'media' | 'supports' | 'navigation';
      query: string;
    }
  | {
      type: 'scope';
      query?: string;
    }
  | {
      type: 'container';
      query: string;
      name?: string;
      container?: {
        uid?: string;
        selector: string;
      };
    }
  | {
      type: 'starting-style';
    }
  | {
      type: 'nesting';
      selector: string;
    }
  | {
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
    uid?: string;
    selector: string;
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
    uid?: string;
    selector: string;
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

export type CascadeRule =
  | NodeStyleRule
  | AnimationRule
  | MatchedRule
  | InheritedRule
  | PseudoElementRule
  | KeyframesRule
  | AtRule
  | PositionTryRule
  | PropertyRule
  | FunctionRule;

export interface StructuredCssStyles {
  element: {
    uid: string;
    selector: string;
  };
  rules: CascadeRule[];
}

const PROPERTY_STATE_MAP: Record<string, CssPropertyStatus> = {
  [DevTools.CSSMatchedStyles.PropertyState.ACTIVE]: 'active',
  [DevTools.CSSMatchedStyles.PropertyState.OVERLOADED]: 'overloaded',
};

class IndentedWriter {
  readonly #lines: string[] = [];
  #indent = 0;

  constructor(baseIndent = 0) {
    this.#indent = baseIndent;
  }

  indent(): void {
    this.#indent += 2;
  }

  dedent(): void {
    this.#indent = Math.max(0, this.#indent - 2);
  }

  writeLine(text: string): void {
    this.#lines.push(' '.repeat(this.#indent) + text);
  }

  writeEmptyLine(): void {
    this.#lines.push('');
  }

  writeComment(comment: string): void {
    this.writeLine(`/* ${comment} */`);
  }

  lines(): string[] {
    return this.#lines;
  }
}

function getFilenameFromUrl(sheetUrl: string): string {
  const parsed = new DevTools.Common.ParsedURL.ParsedURL(sheetUrl);
  if (parsed.isDataURL()) {
    return 'data-uri';
  }
  if (parsed.isBlobURL()) {
    return 'blob';
  }
  if (parsed.lastPathComponent) {
    return parsed.lastPathComponent;
  }
  return 'index';
}

/**
 * Resolves the human-readable source location
 *
 * Checks in precedence order:
 * 1. Special origins: 'user agent stylesheet', 'injected stylesheet', 'via inspector', 'constructed stylesheet'.
 * 2. 1-based line coordinates from rule header or style range.
 * 3. File source: `<style>` for inline sheets, `(index)` for root documents, or filename for external stylesheets.
 */
function getSourceLocation(rule: DevTools.CSSRule.CSSRule): string {
  if (rule.isUserAgent?.()) {
    return 'user agent stylesheet';
  }
  if (rule.isInjected?.()) {
    return 'injected stylesheet';
  }
  if (rule.isViaInspector?.()) {
    return 'via inspector';
  }
  if (rule.header?.isConstructedByNew?.() && !rule.sourceURL) {
    return 'constructed stylesheet';
  }

  let locSuffix = '';
  if (rule instanceof DevTools.CSSRule.CSSStyleRule) {
    const lineNum = rule.lineNumberInSource(0);
    if (lineNum >= 0) {
      locSuffix = `:${lineNum + 1}`;
    }
  } else if (rule.header && rule.style?.range) {
    locSuffix = `:${rule.header.lineNumberInSource(rule.style.range.startLine) + 1}`;
  }

  const sheetUrl = rule.sourceURL;
  if (!sheetUrl) {
    return `<style>${locSuffix}`;
  }

  return `${getFilenameFromUrl(sheetUrl)}${locSuffix}`;
}

/**
 * Returns the subset of selectors in a comma-separated selector group that
 * actually matched the target element. Returns undefined if single selector
 * or no filter is available.
 */
function getMatchingSelectors(
  matchedStyles: MatchedStyles,
  rule: DevTools.CSSRule.CSSStyleRule,
): string[] | undefined {
  if (!rule.selectors || rule.selectors.length <= 1) {
    return undefined;
  }
  const indexes = matchedStyles.getMatchingSelectors?.(rule);
  if (!indexes || indexes.length === 0) {
    return undefined;
  }
  const indexSet = new Set(indexes);
  const matching: string[] = [];
  for (const [idx, sel] of rule.selectors.entries()) {
    if (indexSet.has(idx)) {
      matching.push(sel.text);
    }
  }
  return matching.length > 0 ? matching : undefined;
}

function createLayerAncestor(layer?: {
  text?: string;
}): AncestorCSSRule | undefined {
  if (!layer) {
    return undefined;
  }
  return {type: 'layer', ...(layer.text ? {name: layer.text} : {})};
}

function createQueryAncestor(
  type: 'media' | 'scope' | 'supports' | 'navigation',
  query?: {text?: string},
): AncestorCSSRule | undefined {
  if (!query) {
    return undefined;
  }
  if (type === 'scope') {
    return {type, ...(query.text ? {query: query.text} : {})};
  }
  return query.text ? {type, query: query.text} : undefined;
}

function createContainerQueryAncestor(
  containerQuery?: ContainerQuery,
  containerDetails?: Map<ContainerQuery, ResolvedContainerDetails>,
): AncestorCSSRule | undefined {
  if (!containerQuery) {
    return undefined;
  }
  const details = containerDetails?.get(containerQuery);
  return {
    type: 'container',
    query: containerQuery.text ?? '',
    ...(containerQuery.name ? {name: containerQuery.name} : {}),
    ...(details?.container ? {container: details.container} : {}),
  };
}

/**
 * Collects enclosing ancestor rules (@media, @container, @supports, @layer,
 * @scope, @starting-style, @navigation, and CSS nesting) for a style rule.
 */
function collectAncestorRules(
  rule: DevTools.CSSRule.CSSStyleRule,
  containerDetails?: Map<ContainerQuery, ResolvedContainerDetails>,
): AncestorCSSRule[] | undefined {
  if (!rule.ruleTypes || rule.ruleTypes.length === 0) {
    return undefined;
  }

  let mediaIndex = 0;
  let containerIndex = 0;
  let scopeIndex = 0;
  let supportsIndex = 0;
  let nestingIndex = 0;
  let layerIndex = 0;
  let navigationsIndex = 0;

  const ancestors: AncestorCSSRule[] = [];

  for (const ruleType of rule.ruleTypes) {
    let item: AncestorCSSRule | undefined;
    switch (ruleType) {
      case DevTools.Protocol.CSS.CSSRuleType.MediaRule:
        item = createQueryAncestor('media', rule.media?.[mediaIndex++]);
        break;
      case DevTools.Protocol.CSS.CSSRuleType.ContainerRule:
        item = createContainerQueryAncestor(
          rule.containerQueries?.[containerIndex++],
          containerDetails,
        );
        break;
      case DevTools.Protocol.CSS.CSSRuleType.LayerRule:
        item = createLayerAncestor(rule.layers?.[layerIndex++]);
        break;
      case DevTools.Protocol.CSS.CSSRuleType.ScopeRule:
        item = createQueryAncestor('scope', rule.scopes?.[scopeIndex++]);
        break;
      case DevTools.Protocol.CSS.CSSRuleType.SupportsRule:
        item = createQueryAncestor(
          'supports',
          rule.supports?.[supportsIndex++],
        );
        break;
      case DevTools.Protocol.CSS.CSSRuleType.StartingStyleRule:
        item = {type: 'starting-style'};
        break;
      case DevTools.Protocol.CSS.CSSRuleType.StyleRule: {
        const selector = rule.nestingSelectors?.[nestingIndex++];
        if (selector) {
          item = {type: 'nesting', selector};
        }
        break;
      }
      case DevTools.Protocol.CSS.CSSRuleType.NavigationRule:
        item = createQueryAncestor(
          'navigation',
          rule.navigations?.[navigationsIndex++],
        );
        break;
    }
    if (item) {
      ancestors.push(item);
    }
  }

  ancestors.reverse();
  return ancestors.length > 0 ? ancestors : undefined;
}

interface RuleMetadata {
  ancestors?: AncestorCSSRule[];
  matchingSelectors?: string[];
  source?: string;
}

/**
 * Extracts common metadata (`ancestors`, `matchingSelectors`, `source`)
 * uniformly across matched rules, inherited rules, and pseudo-element rules.
 */
function getCSSStyleRuleMetadata(
  rule: DevTools.CSSRule.CSSStyleRule | undefined,
  matchedStyles: MatchedStyles,
  containerDetails?: Map<ContainerQuery, ResolvedContainerDetails>,
): RuleMetadata {
  if (!rule) {
    return {};
  }
  const matchingSelectors = getMatchingSelectors(matchedStyles, rule);
  const ancestors = collectAncestorRules(rule, containerDetails);
  const source = getSourceLocation(rule);
  return {
    ...(ancestors ? {ancestors} : {}),
    ...(matchingSelectors ? {matchingSelectors} : {}),
    ...(source ? {source} : {}),
  };
}

/**
 * Formats a CSS property into standard CSS syntax with optional status tags.
 *
 * Status prefix convention:
 * - 'active': Clean output without tags (e.g. `color: red;`).
 * - 'overloaded' | 'invalid' | 'disabled': Tagged prefix (e.g. `[overloaded] color: blue;`).
 */
function formatPropertyLine(prop: StructuredCssProperty): string {
  const stateStr = prop.status === 'active' ? '' : `[${prop.status}] `;
  const imp =
    prop.important && !/\s*!\s*important$/i.test(prop.value)
      ? ' !important'
      : '';
  return `${stateStr}${prop.name}: ${prop.value}${imp};`;
}

/**
 * Filters properties to only those that can be inherited from an ancestor element.
 *
 * For highlight pseudo-elements, custom properties (`--*`) are not inherited.
 * For other CSS custom properties, check registered @property inheritance
 * rules if available.
 * For all remaining properties, use standard CSSMetadata inheritance check.
 */
function getInheritableProperties(
  properties: DevTools.CSSProperty.CSSProperty[],
  matchedStyles: MatchedStyles,
  isHighlight = false,
): DevTools.CSSProperty.CSSProperty[] {
  return properties.filter(prop => {
    if (isHighlight) {
      return !DevTools.CSSMetadata.cssMetadata().isCustomProperty(prop.name);
    }
    if (DevTools.CSSMetadata.cssMetadata().isCustomProperty(prop.name)) {
      const registered = matchedStyles.getRegisteredProperty?.(prop.name);
      if (registered) {
        return registered.inherits();
      }
    }
    return DevTools.CSSMetadata.cssMetadata().isPropertyInherited(prop.name);
  });
}

/**
 * Resolves DOM ancestor node details when a style declaration is inherited.
 */
function getParentNodeInfo(
  style: DevTools.CSSStyleDeclaration.CSSStyleDeclaration,
  matchedStyles: MatchedStyles,
  resolveUid?: UidResolver,
): {uid?: string; selector: string} | undefined {
  if (!matchedStyles.isInherited?.(style)) {
    return undefined;
  }
  const parentNode = matchedStyles.nodeForStyle?.(style);
  if (!parentNode) {
    return undefined;
  }
  const parentUid = resolveUid?.(parentNode.backendNodeId());
  return {
    ...(parentUid ? {uid: parentUid} : {}),
    selector: parentNode.simpleSelector(),
  };
}

function getCascadeRuleHeader(rule: CascadeRule): string {
  let selector: string;
  switch (rule.type) {
    case 'inline':
    case 'transition':
    case 'animation':
    case 'attributes':
    case 'matched':
    case 'keyframes':
    case 'at-rule':
    case 'property':
    case 'function':
      selector = rule.selector;
      break;
    case 'inherited':
      selector = rule.selector ?? 'element.style';
      break;
    case 'pseudo':
      selector = rule.selector ?? rule.pseudoType;
      break;
    case 'position-try': {
      const statePrefix = rule.active ? '' : '[inactive] ';
      selector = `${statePrefix}${rule.selector}`;
      break;
    }
  }
  const source = 'source' in rule ? rule.source : undefined;
  return source ? `${selector} (${source})` : selector;
}

function formatAncestorRuleHeader(ancestor: AncestorCSSRule): {
  comment?: string;
  header: string;
} {
  switch (ancestor.type) {
    case 'layer':
      return {header: ancestor.name ? `@layer ${ancestor.name}` : '@layer'};
    case 'media':
      return {header: `@media ${ancestor.query}`};
    case 'container': {
      let comment: string | undefined;
      if (ancestor.container?.selector) {
        comment = ancestor.container.selector;
      }
      if (ancestor.container?.uid) {
        const uidStr = `(uid: "${ancestor.container.uid}")`;
        comment = comment ? `${comment} ${uidStr}` : uidStr;
      }
      if (comment) {
        comment = `container: ${comment}`;
      }
      const shouldPrependName =
        ancestor.name && !ancestor.query.startsWith(ancestor.name);
      const nameStr = shouldPrependName ? `${ancestor.name} ` : '';
      return {comment, header: `@container ${nameStr}${ancestor.query}`};
    }
    case 'scope': {
      const queryStr = ancestor.query?.trim();
      return {header: queryStr ? `@scope ${queryStr}` : '@scope'};
    }
    case 'supports':
      return {header: `@supports ${ancestor.query}`};
    case 'starting-style':
      return {header: '@starting-style'};
    case 'nesting':
      return {header: ancestor.selector};
    case 'navigation':
      return {header: `@navigation ${ancestor.query}`};
    case 'at-rule': {
      const nameStr = ancestor.name ? ` ${ancestor.name}` : '';
      return {header: `@${ancestor.atRuleType}${nameStr}`};
    }
  }
}

function appendRuleWithAncestors(
  writer: IndentedWriter,
  rule: Exclude<CascadeRule, KeyframesRule>,
): void {
  const ancestors = 'ancestors' in rule ? rule.ancestors : undefined;
  let ancestorCount = 0;

  if (ancestors && ancestors.length > 0) {
    for (const ancestor of ancestors) {
      const {comment, header} = formatAncestorRuleHeader(ancestor);
      if (comment) {
        writer.writeComment(comment);
      }
      writer.writeLine(`${header} {`);
      writer.indent();
      ancestorCount++;
    }
  }

  const header = getCascadeRuleHeader(rule);
  writer.writeLine(`${header} {`);
  writer.indent();
  for (const prop of rule.properties) {
    writer.writeLine(formatPropertyLine(prop));
  }
  writer.dedent();
  writer.writeLine('}');

  for (let i = 0; i < ancestorCount; i++) {
    writer.dedent();
    writer.writeLine('}');
  }
}

function appendKeyframesRule(
  writer: IndentedWriter,
  rule: KeyframesRule,
): void {
  const header = getCascadeRuleHeader(rule);
  writer.writeLine(`${header} {`);
  writer.indent();
  for (const step of rule.keyframes) {
    writer.writeLine(`${step.keyText} {`);
    writer.indent();
    for (const prop of step.properties) {
      writer.writeLine(formatPropertyLine(prop));
    }
    writer.dedent();
    writer.writeLine('}');
  }
  writer.dedent();
  writer.writeLine('}');
}

function appendCssSectionsToString(
  writer: IndentedWriter,
  styles: StructuredCssStyles,
): void {
  for (const rule of styles.rules) {
    writer.writeEmptyLine();
    if (rule.type === 'inherited') {
      const uidStr = rule.node.uid ? ` (uid: "${rule.node.uid}")` : '';
      writer.writeLine(`Inherited from ${rule.node.selector}${uidStr}:`);
      writer.indent();
      appendRuleWithAncestors(writer, rule);
      writer.dedent();
    } else if (rule.type === 'pseudo') {
      let inheritedStr = '';
      if (rule.node) {
        const uidPart = rule.node.uid ? `, uid: "${rule.node.uid}"` : '';
        inheritedStr = ` (inherited from ${rule.node.selector}${uidPart})`;
      }
      writer.writeComment(`Pseudo ${rule.pseudoType} element${inheritedStr}`);
      appendRuleWithAncestors(writer, rule);
    } else if (rule.type === 'keyframes') {
      appendKeyframesRule(writer, rule);
    } else {
      appendRuleWithAncestors(writer, rule);
    }
  }
}

export class CssFormatter {
  static #getStyleProperties(
    style: DevTools.CSSStyleDeclaration.CSSStyleDeclaration,
  ): DevTools.CSSProperty.CSSProperty[] {
    return style.leadingProperties?.() ?? style.allProperties();
  }

  /**
   * Aggregates all cascading rules impacting the target node.
   */
  static collectRules(
    matchedStyles: MatchedStyles,
    options: CssFormatterOptions,
  ): CascadeRule[] {
    const rules: CascadeRule[] = [];
    CssFormatter.#collectNodeStyles(rules, matchedStyles, options);
    CssFormatter.#collectPseudoStyles(rules, matchedStyles, options);
    CssFormatter.#collectKeyframes(rules, matchedStyles);
    CssFormatter.#collectAtRules(rules, matchedStyles);
    CssFormatter.#collectPositionTryRules(rules, matchedStyles);
    CssFormatter.#collectRegisteredProperties(rules, matchedStyles);
    CssFormatter.#collectFunctionRules(rules, matchedStyles);
    return rules;
  }

  static #collectNodeStyles(
    rules: CascadeRule[],
    matchedStyles: MatchedStyles,
    options: CssFormatterOptions,
  ): void {
    for (const style of matchedStyles.nodeStyles?.() ?? []) {
      const properties = CssFormatter.#getStyleProperties(style);
      if (!properties.length) {
        continue;
      }

      if (matchedStyles.isInherited(style)) {
        const inheritedRule = CssFormatter.#createInheritedRule(
          style,
          properties,
          matchedStyles,
          options,
        );
        if (inheritedRule) {
          rules.push(inheritedRule);
        }
        continue;
      }

      if (style.type === DevTools.CSSStyleDeclaration.Type.Transition) {
        rules.push({
          type: 'transition',
          selector: CssFormatter.#getNodeStyleSelector(style),
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      } else if (style.type === DevTools.CSSStyleDeclaration.Type.Animation) {
        const animName = style.animationName();
        rules.push({
          type: 'animation',
          ...(animName ? {name: animName} : {}),
          selector: CssFormatter.#getNodeStyleSelector(style),
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      } else if (style.type === DevTools.CSSStyleDeclaration.Type.Attributes) {
        rules.push({
          type: 'attributes',
          selector: CssFormatter.#getNodeStyleSelector(style, matchedStyles),
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      } else if (style.type === DevTools.CSSStyleDeclaration.Type.Inline) {
        rules.push({
          type: 'inline',
          selector: CssFormatter.#getNodeStyleSelector(style),
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      } else if (style.parentRule instanceof DevTools.CSSRule.CSSStyleRule) {
        rules.push(
          CssFormatter.#createMatchedRule(
            style.parentRule,
            properties,
            matchedStyles,
            options,
          ),
        );
      }
    }
  }

  static #createMatchedRule(
    rule: DevTools.CSSRule.CSSStyleRule,
    properties: DevTools.CSSProperty.CSSProperty[],
    matchedStyles: MatchedStyles,
    options: CssFormatterOptions,
  ): MatchedRule {
    const meta = getCSSStyleRuleMetadata(
      rule,
      matchedStyles,
      options.containerDetails,
    );
    return {
      type: 'matched',
      selector: rule.selectorText(),
      ...meta,
      ...(rule.isUserAgent?.() ? {isUserAgent: true} : {}),
      properties: CssFormatter.#formatProperties(properties, matchedStyles),
    };
  }

  static #getNodeStyleSelector(
    style: DevTools.CSSStyleDeclaration.CSSStyleDeclaration,
    matchedStyles?: MatchedStyles,
  ): string {
    switch (style.type) {
      case DevTools.CSSStyleDeclaration.Type.Transition:
        return 'transitions style';
      case DevTools.CSSStyleDeclaration.Type.Animation: {
        const animName = style.animationName();
        return animName ? `${animName} animation` : 'animation style';
      }
      case DevTools.CSSStyleDeclaration.Type.Attributes: {
        const node = matchedStyles?.nodeForStyle(style);
        const tag = node ? node.nodeNameInCorrectCase() : '';
        return tag ? `${tag}[attributes style]` : '[attributes style]';
      }
      case DevTools.CSSStyleDeclaration.Type.Inline:
        return 'element.style';
      default:
        if (style.parentRule instanceof DevTools.CSSRule.CSSStyleRule) {
          return style.parentRule.selectorText();
        }
        return '';
    }
  }

  static #createInheritedRule(
    style: DevTools.CSSStyleDeclaration.CSSStyleDeclaration,
    properties: DevTools.CSSProperty.CSSProperty[],
    matchedStyles: MatchedStyles,
    options: CssFormatterOptions,
  ): InheritedRule | undefined {
    const node = getParentNodeInfo(style, matchedStyles, options.resolveUid);
    if (!node) {
      return undefined;
    }
    const inheritableProps = getInheritableProperties(
      properties,
      matchedStyles,
    );
    if (!inheritableProps.length) {
      return undefined;
    }
    const rule =
      style.parentRule instanceof DevTools.CSSRule.CSSStyleRule
        ? style.parentRule
        : undefined;
    const meta = getCSSStyleRuleMetadata(
      rule,
      matchedStyles,
      options.containerDetails,
    );
    const selector =
      CssFormatter.#getNodeStyleSelector(style, matchedStyles) || undefined;

    return {
      type: 'inherited',
      node,
      ...(selector ? {selector} : {}),
      ...meta,
      properties: CssFormatter.#formatProperties(
        inheritableProps,
        matchedStyles,
      ),
    };
  }

  static #collectPseudoStyles(
    rules: CascadeRule[],
    matchedStyles: MatchedStyles,
    options: CssFormatterOptions,
  ): void {
    const customHighlightNames =
      matchedStyles.customHighlightPseudoNames?.() ?? [];
    for (const highlightName of customHighlightNames) {
      const pseudoStyles =
        matchedStyles.customHighlightPseudoStyles?.(highlightName) ?? [];
      CssFormatter.#collectPseudoList(
        rules,
        `::highlight(${highlightName})`,
        pseudoStyles,
        matchedStyles,
        options,
        true,
      );
    }

    // Standard Pseudos (::before, ::after, ::marker, ::selection, etc.)
    const otherPseudoTypes = matchedStyles.pseudoTypes?.() ?? [];
    for (const pseudoType of otherPseudoTypes) {
      const pseudoStyles = matchedStyles.pseudoStyles?.(pseudoType) ?? [];
      CssFormatter.#collectPseudoList(
        rules,
        `::${pseudoType}`,
        pseudoStyles,
        matchedStyles,
        options,
        DevTools.CSSMetadata.cssMetadata().isHighlightPseudoType(pseudoType),
      );
    }
  }

  static #collectPseudoList(
    rules: CascadeRule[],
    pseudoType: string,
    pseudoStyles: DevTools.CSSStyleDeclaration.CSSStyleDeclaration[],
    matchedStyles: MatchedStyles,
    options: CssFormatterOptions,
    isHighlight = false,
  ): void {
    for (const style of pseudoStyles) {
      const allProps = CssFormatter.#getStyleProperties(style);
      if (!allProps.length) {
        continue;
      }
      const node = getParentNodeInfo(style, matchedStyles, options.resolveUid);
      const properties = node
        ? getInheritableProperties(allProps, matchedStyles, isHighlight)
        : allProps;
      if (!properties.length) {
        continue;
      }
      const rule =
        style.parentRule instanceof DevTools.CSSRule.CSSStyleRule
          ? style.parentRule
          : undefined;
      const meta = getCSSStyleRuleMetadata(
        rule,
        matchedStyles,
        options.containerDetails,
      );

      rules.push({
        type: 'pseudo',
        pseudoType,
        ...(node ? {node} : {}),
        ...(rule ? {selector: rule.selectorText()} : {}),
        ...meta,
        properties: CssFormatter.#formatProperties(properties, matchedStyles),
      });
    }
  }

  static #collectKeyframes(
    rules: CascadeRule[],
    matchedStyles: MatchedStyles,
  ): void {
    const keyframesRules = matchedStyles.keyframes?.() ?? [];
    for (const keyframesRule of keyframesRules) {
      const name = keyframesRule.name?.()?.text ?? '';
      const rawKeyframes = keyframesRule.keyframes?.() ?? [];

      const steps: KeyframeStep[] = [];
      let parentSource: string | undefined;

      for (const keyframe of rawKeyframes) {
        const properties = CssFormatter.#getStyleProperties(keyframe.style);
        if (!properties.length) {
          continue;
        }
        const keyText = keyframe.key?.()?.text ?? '';
        const source = getSourceLocation(keyframe);
        if (!parentSource && source) {
          parentSource = source;
        }

        steps.push({
          keyText,
          ...(source ? {source} : {}),
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      }

      if (!steps.length) {
        continue;
      }

      rules.push({
        type: 'keyframes',
        name,
        selector: `@keyframes ${name}`,
        ...(parentSource ? {source: parentSource} : {}),
        keyframes: steps,
      });
    }
  }

  static #collectAtRules(
    rules: CascadeRule[],
    matchedStyles: MatchedStyles,
  ): void {
    const atRules = matchedStyles.atRules?.() ?? [];
    for (const atRule of atRules) {
      const properties = CssFormatter.#getStyleProperties(atRule.style);
      if (!properties.length) {
        continue;
      }
      const subsection = atRule.subsection() ?? undefined;
      const name = atRule.name()?.text;
      const type = atRule.type();
      const selector = subsection
        ? `@${subsection}`
        : name
          ? `@${type} ${name}`
          : `@${type}`;

      const ancestors: AncestorCSSRule[] = [];
      if (subsection) {
        ancestors.push({
          type: 'at-rule',
          atRuleType: type,
          ...(name ? {name} : {}),
        });
      }

      rules.push({
        type: 'at-rule',
        atRuleType: type,
        ...(name ? {name} : {}),
        ...(subsection ? {subsection} : {}),
        selector,
        ...(ancestors.length > 0 ? {ancestors} : {}),
        source: getSourceLocation(atRule),
        properties: CssFormatter.#formatProperties(properties, matchedStyles),
      });
    }
  }

  static #collectPositionTryRules(
    rules: CascadeRule[],
    matchedStyles: MatchedStyles,
  ): void {
    const positionTryRules = matchedStyles.positionTryRules?.() ?? [];
    for (const positionTryRule of positionTryRules) {
      const properties = CssFormatter.#getStyleProperties(
        positionTryRule.style,
      );
      if (!properties.length) {
        continue;
      }
      const name = positionTryRule.name?.()?.text ?? '';
      const active = positionTryRule.active?.() ?? false;
      const source = getSourceLocation(positionTryRule);

      rules.push({
        type: 'position-try',
        name,
        active,
        selector: `@position-try ${name}`,
        ...(source ? {source} : {}),
        properties: CssFormatter.#formatProperties(properties, matchedStyles),
      });
    }
  }

  static #collectRegisteredProperties(
    rules: CascadeRule[],
    matchedStyles: MatchedStyles,
  ): void {
    const registeredProperties = matchedStyles.registeredProperties?.() ?? [];
    for (const propertyRule of registeredProperties) {
      const style = propertyRule.style?.();
      if (!style) {
        continue;
      }
      const properties = CssFormatter.#getStyleProperties(style);
      if (!properties.length) {
        continue;
      }
      const name = propertyRule.propertyName?.() ?? '';
      const parentRule = style.parentRule;
      const source = parentRule
        ? getSourceLocation(parentRule)
        : 'CSS.registerProperty';

      rules.push({
        type: 'property',
        name,
        selector: `@property ${name}`,
        ...(source ? {source} : {}),
        properties: CssFormatter.#formatProperties(properties, matchedStyles),
      });
    }
  }

  static #collectFunctionRules(
    rules: CascadeRule[],
    matchedStyles: MatchedStyles,
  ): void {
    const functionRules = matchedStyles.functionRules?.() ?? [];
    for (const functionRule of functionRules) {
      const properties = CssFormatter.#getStyleProperties(functionRule.style);
      if (!properties.length) {
        continue;
      }
      const name = functionRule.functionName?.()?.text ?? '';
      const nameWithParameters = functionRule.nameWithParameters?.() || name;
      const source = getSourceLocation(functionRule);

      rules.push({
        type: 'function',
        name,
        selector: `@function ${nameWithParameters}`,
        ...(source ? {source} : {}),
        properties: CssFormatter.#formatProperties(properties, matchedStyles),
      });
    }
  }

  static #formatProperties(
    props: DevTools.CSSProperty.CSSProperty[],
    matchedStyles: MatchedStyles,
  ): StructuredCssProperty[] {
    return props.map(p =>
      CssFormatter.#formatStructuredProperty(p, matchedStyles),
    );
  }

  static #formatStructuredProperty(
    prop: DevTools.CSSProperty.CSSProperty,
    matchedStyles: MatchedStyles,
  ): StructuredCssProperty {
    let status: CssPropertyStatus = 'active';
    if (prop.parsedOk === false) {
      status = 'invalid';
    } else if (prop.disabled) {
      status = 'disabled';
    } else {
      const state = matchedStyles.propertyState?.(prop);
      if (state) {
        status = PROPERTY_STATE_MAP[state] ?? 'active';
      }
    }

    let value = prop.value;
    const isImportant = Boolean(prop.important);
    if (isImportant) {
      value = value.replace(/\s*!\s*important$/i, '').trimEnd();
    }

    return {
      name: prop.name,
      value,
      status,
      ...(isImportant ? {important: true} : {}),
    };
  }

  readonly #matchedStyles: MatchedStyles;
  readonly #options: CssFormatterOptions;
  readonly #cascadeRules: readonly CascadeRule[];

  constructor(
    matchedStyles: MatchedStyles,
    options: CssFormatterOptions,
    cascadeRules?: readonly CascadeRule[],
  ) {
    this.#matchedStyles = matchedStyles;
    this.#options = options;
    this.#cascadeRules =
      cascadeRules ?? CssFormatter.collectRules(matchedStyles, options);
  }

  get rules(): readonly CascadeRule[] {
    return this.#cascadeRules;
  }

  toString(): string {
    const json = this.toJSON();
    const lines: string[] = [
      `Styles for ${json.element.selector} (uid: "${json.element.uid}"):`,
    ];

    if (this.#cascadeRules.length === 0) {
      lines.push('', '  (no styles)');
      return lines.join('\n');
    }

    const writer = new IndentedWriter(2);
    appendCssSectionsToString(writer, json);
    lines.push(...writer.lines());
    return lines.join('\n');
  }

  toJSON(): StructuredCssStyles {
    return {
      element: {
        uid: this.#options.uid,
        selector: this.#matchedStyles.node?.()?.simpleSelector() ?? '',
      },
      rules: [...this.#cascadeRules],
    };
  }
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
export async function resolveContainerQueries(
  matchedStyles: MatchedStyles,
  resolveUid?: UidResolver,
): Promise<Map<ContainerQuery, ResolvedContainerDetails>> {
  const resolved = new Map<ContainerQuery, ResolvedContainerDetails>();
  const targetNode = matchedStyles.node?.();
  if (!targetNode) {
    return resolved;
  }
  const queries = new Set<ContainerQuery>();

  const allStyles = [...(matchedStyles.nodeStyles?.() ?? [])];
  for (const name of matchedStyles.customHighlightPseudoNames?.() ?? []) {
    allStyles.push(
      ...(matchedStyles.customHighlightPseudoStyles?.(name) ?? []),
    );
  }
  for (const type of matchedStyles.pseudoTypes?.() ?? []) {
    allStyles.push(...(matchedStyles.pseudoStyles?.(type) ?? []));
  }
  for (const style of allStyles) {
    if (
      style.parentRule instanceof DevTools.CSSRule.CSSStyleRule &&
      style.parentRule.containerQueries
    ) {
      for (const query of style.parentRule.containerQueries) {
        queries.add(query);
      }
    }
  }

  await Promise.all(
    [...queries].map(async query => {
      try {
        const container = await query.getContainerForNode?.(targetNode.id);
        if (!container) {
          return;
        }
        const containerNode = container.containerNode;
        const selector = containerNode.simpleSelector();
        const uid = resolveUid?.(containerNode.backendNodeId());

        resolved.set(query, {
          container: {
            ...(uid ? {uid} : {}),
            selector,
          },
        });
      } catch {
        // Ignore container query resolution errors
      }
    }),
  );

  return resolved;
}
