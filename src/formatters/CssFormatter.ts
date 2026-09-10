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

export type CascadeRule =
  NodeStyleRule | AnimationRule | MatchedRule | InheritedRule;

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
 */
function getInheritableProperties(
  properties: DevTools.CSSProperty.CSSProperty[],
  matchedStyles: MatchedStyles,
): DevTools.CSSProperty.CSSProperty[] {
  return properties.filter(prop => {
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
      selector = rule.selector;
      break;
    case 'inherited':
      selector = rule.selector ?? 'element.style';
      break;
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
  rule: CascadeRule,
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
