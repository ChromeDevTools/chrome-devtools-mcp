/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools} from '../third_party/index.js';
import type {MatchedStyles} from '../tools/ToolDefinition.js';
import type {PaginationOptions} from '../types.js';

export interface CssFormatterOptions extends PaginationOptions {
  uid: string;
}

export type CssPropertyStatus = 'active' | 'overloaded' | 'inactive';

export interface StructuredCssProperty {
  name: string;
  value: string;
  status: CssPropertyStatus;
  important?: boolean;
}

export interface InlineRule {
  type: 'inline';
  properties: StructuredCssProperty[];
}

export interface MatchedRule {
  type: 'matched';
  selector: string;
  resolvedSelector?: string;
  matchingSelectors?: string[];
  source?: string;
  isUserAgent?: boolean;
  properties: StructuredCssProperty[];
}

export interface InheritedRule {
  type: 'inherited';
  node: {
    selector: string;
  };
  selector?: string;
  resolvedSelector?: string;
  properties: StructuredCssProperty[];
}

export interface PseudoElementRule {
  type: 'pseudo';
  pseudoType: string;
  properties: StructuredCssProperty[];
}

export type CascadeRule =
  InlineRule | MatchedRule | InheritedRule | PseudoElementRule;

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

function getFilenameFromUrl(sheetUrl: string): string {
  const parsed = new DevTools.Common.ParsedURL.ParsedURL(sheetUrl);
  if (parsed.isDataURL()) {
    return '(data-uri)';
  }
  if (parsed.isBlobURL()) {
    return '(blob)';
  }
  return parsed.lastPathComponent || '(inline)';
}

function getSourceLocation(rule: DevTools.CSSRule.CSSStyleRule): string {
  // 1. Check special stylesheet origins first
  if (rule.isUserAgent()) {
    return 'user agent stylesheet';
  }
  if (rule.isInjected()) {
    return 'injected stylesheet';
  }
  if (rule.isViaInspector()) {
    return 'via inspector';
  }
  if (rule.header?.isConstructedByNew()) {
    return 'constructed stylesheet';
  }

  // 2. Compute 1-based source coordinates
  const lineNum = rule.lineNumberInSource(0) + 1;
  const col = rule.columnNumberInSource(0);
  const colNum = col !== undefined ? col + 1 : 1;
  const locSuffix = `:${lineNum}:${colNum}`;

  // 3. Inline <style> tags
  const sheetUrl = rule.sourceURL;
  if (!sheetUrl) {
    return `<style>${locSuffix}`;
  }

  // 4. External stylesheets
  return `${getFilenameFromUrl(sheetUrl)}${locSuffix}`;
}

function getMatchingSelectors(
  matchedStyles: MatchedStyles,
  rule: DevTools.CSSRule.CSSStyleRule,
): string[] | undefined {
  if (!rule.selectors || rule.selectors.length <= 1) {
    return undefined;
  }
  if (typeof matchedStyles.getMatchingSelectors !== 'function') {
    return undefined;
  }
  const indexes = matchedStyles.getMatchingSelectors(rule);
  if (!indexes || indexes.length === 0) {
    return undefined;
  }
  const matching = rule.selectors
    .filter((_, idx) => indexes.includes(idx))
    .map(s => s.text);
  return matching.length > 0 ? matching : undefined;
}

function constructResolvedSelector(
  rule: DevTools.CSSRule.CSSStyleRule,
  nestingIndex?: number,
): string | undefined {
  const nestingSelectors = rule.nestingSelectors;
  if (!nestingSelectors || nestingSelectors.length === 0) {
    return nestingIndex === undefined ? rule.selectorText() : undefined;
  }

  if (nestingIndex !== undefined && (nestingIndex < 0 || nestingIndex >= nestingSelectors.length)) {
    return undefined;
  }

  const selectorText = nestingIndex !== undefined ? nestingSelectors[nestingIndex] : rule.selectorText();

  const parentIndex = nestingIndex !== undefined ? nestingIndex + 1 : 0;
  const parentSelector = constructResolvedSelector(rule, parentIndex);

  if (!parentSelector) {
    return selectorText;
  }

  const sanitizedParent = parentSelector.replace(/::[a-zA-Z-]+/g, '').trim();

  if (selectorText?.includes('&')) {
    return selectorText.replaceAll('&', `:is(${sanitizedParent})`);
  }

  return `:is(${sanitizedParent}) ${selectorText?.trim() ?? ''}`;
}

function getResolvedSelector(
  rule: DevTools.CSSRule.CSSStyleRule,
): string | undefined {
  if (!rule.nestingSelectors || rule.nestingSelectors.length === 0) {
    return undefined;
  }
  return constructResolvedSelector(rule);
}

function formatPropertyLine(prop: StructuredCssProperty, indent = 4): string {
  const stateStr =
    prop.status === 'active'
      ? '[active] '
      : prop.status === 'overloaded'
        ? '[overloaded] '
        : '';
  const imp = prop.important ? ' !important' : '';
  const spaces = ' '.repeat(indent);
  return `${spaces}${stateStr}${prop.name}: ${prop.value}${imp};`;
}

function isPropertyInherited(
  name: string,
  matchedStyles: MatchedStyles,
): boolean {
  if (name.startsWith('--')) {
    const registered = matchedStyles.getRegisteredProperty?.(name);
    if (registered) {
      return registered.inherits();
    }
  }
  return DevTools.CSSMetadata.cssMetadata().isPropertyInherited(name);
}

function appendRuleBlock(
  lines: string[],
  header: string,
  properties: StructuredCssProperty[],
  indent = 2,
  precedingComment?: string,
): void {
  const outer = ' '.repeat(indent);
  if (precedingComment) {
    lines.push(`${outer}/* ${precedingComment} */`);
  }
  lines.push(`${outer}${header} {`);
  for (const prop of properties) {
    lines.push(formatPropertyLine(prop, indent + 2));
  }
  lines.push(`${outer}}`);
}

function appendCssSectionsToString(
  lines: string[],
  styles: StructuredCssStyles,
): void {
  let lastInheritedSelector: string | null = null;

  for (const rule of styles.rules) {
    lines.push('');
    switch (rule.type) {
      case 'inline': {
        appendRuleBlock(lines, 'element.style', rule.properties);
        break;
      }
      case 'matched': {
        const sourceLoc = rule.source ? ` (${rule.source})` : '';
        const comment = rule.resolvedSelector ?? `resolved: ${rule.resolvedSelector}`;
        appendRuleBlock(lines, `${rule.selector}${sourceLoc}`, rule.properties, 2, comment);
        break;
      }
      case 'inherited': {
        if (lastInheritedSelector !== rule.node.selector) {
          lastInheritedSelector = rule.node.selector;
          lines.push(`  Inherited from ${rule.node.selector}:`);
        }
        const comment = rule.resolvedSelector ?? `resolved: ${rule.resolvedSelector}`;
        appendRuleBlock(lines, rule.selector ?? 'element.style', rule.properties, 4, comment);
        break;
      }
      case 'pseudo': {
        appendRuleBlock(lines, rule.pseudoType, rule.properties);
        break;
      }
    }
  }
}

export class CssFormatter {
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
    this.#cascadeRules = cascadeRules ?? this.#collectRules();
  }

  get rules(): readonly CascadeRule[] {
    return this.#cascadeRules;
  }

  #collectRules(): CascadeRule[] {
    const rules: CascadeRule[] = [];

    for (const style of this.#matchedStyles.nodeStyles()) {
      const properties = style.leadingProperties?.() ?? style.allProperties();
      if (style.type === DevTools.CSSStyleDeclaration.Type.Inline) {
        if (properties.length > 0) {
          rules.push({
            type: 'inline',
            properties: this.#formatProperties(properties),
          });
        }
      } else if (!this.#matchedStyles.isInherited(style)) {
        const rule = style.parentRule;
        if (rule instanceof DevTools.CSSRule.CSSStyleRule) {
          const matchingSelectors = getMatchingSelectors(
            this.#matchedStyles,
            rule,
          );
          const resolvedSelector = getResolvedSelector(rule);
          rules.push({
            type: 'matched',
            selector: rule.selectorText(),
            ...(resolvedSelector ? {resolvedSelector} : {}),
            ...(matchingSelectors ? {matchingSelectors} : {}),
            source: getSourceLocation(rule),
            ...(rule.isUserAgent() ? {isUserAgent: true} : {}),
            properties: this.#formatProperties(properties),
          });
        }
      } else {
        const parentNode = this.#matchedStyles.nodeForStyle(style);
        if (!parentNode) {
          continue;
        }
        const inheritableProps = properties.filter(prop =>
          isPropertyInherited(prop.name, this.#matchedStyles),
        );
        if (!inheritableProps.length) {
          continue;
        }
        const rule =
          style.parentRule instanceof DevTools.CSSRule.CSSStyleRule
            ? style.parentRule
            : undefined;
        const resolvedSelector = rule ? getResolvedSelector(rule) : undefined;

        rules.push({
          type: 'inherited',
          node: {
            selector: parentNode.simpleSelector(),
          },
          selector: rule ? rule.selectorText() : undefined,
          ...(resolvedSelector ? {resolvedSelector} : {}),
          properties: this.#formatProperties(inheritableProps),
        });
      }
    }

    for (const pseudoType of this.#matchedStyles.pseudoTypes()) {
      const allPseudoProps = this.#matchedStyles
        .pseudoStyles(pseudoType)
        .flatMap(ps => ps.leadingProperties?.() ?? ps.allProperties());
      if (!allPseudoProps.length) {
        continue;
      }

      rules.push({
        type: 'pseudo',
        pseudoType: `::${pseudoType}`,
        properties: this.#formatProperties(allPseudoProps),
      });
    }

    return rules;
  }

  #formatProperties(props: DevTools.CSSProperty.CSSProperty[]): StructuredCssProperty[] {
    return props.map(p => this.#formatStructuredProperty(p));
  }

  #formatStructuredProperty(
    prop: DevTools.CSSProperty.CSSProperty,
  ): StructuredCssProperty {
    const state = this.#matchedStyles.propertyState(prop);
    const status =
      (state ? PROPERTY_STATE_MAP[state] : undefined) ?? 'inactive';
    return {
      name: prop.name,
      value: prop.value,
      status,
      ...(prop.important ? {important: true} : {}),
    };
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

    appendCssSectionsToString(lines, json);
    return lines.join('\n');
  }

  toJSON(): StructuredCssStyles {
    return {
      element: {
        uid: this.#options.uid,
        selector: this.#matchedStyles.node().simpleSelector(),
      },
      rules: [...this.#cascadeRules],
    };
  }
}
