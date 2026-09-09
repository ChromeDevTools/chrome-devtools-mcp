/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DevTools} from '../third_party/index.js';
import type {MatchedStyles} from '../tools/ToolDefinition.js';

export interface CssFormatterOptions {
  uid: string;
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

export type CascadeRule = NodeStyleRule | AnimationRule;

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

function getCascadeRuleHeader(rule: CascadeRule): string {
  let selector: string;
  switch (rule.type) {
    case 'inline':
    case 'transition':
    case 'animation':
    case 'attributes':
      selector = rule.selector;
      break;
  }
  const source = 'source' in rule ? rule.source : undefined;
  return source ? `${selector} (${source})` : selector;
}

function appendRule(writer: IndentedWriter, rule: CascadeRule): void {
  const header = getCascadeRuleHeader(rule);
  writer.writeLine(`${header} {`);
  writer.indent();
  for (const prop of rule.properties) {
    writer.writeLine(formatPropertyLine(prop));
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
    appendRule(writer, rule);
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
  static collectRules(matchedStyles: MatchedStyles): CascadeRule[] {
    const rules: CascadeRule[] = [];
    CssFormatter.#collectNodeStyles(rules, matchedStyles);
    return rules;
  }

  static #collectNodeStyles(
    rules: CascadeRule[],
    matchedStyles: MatchedStyles,
  ): void {
    for (const style of matchedStyles.nodeStyles?.() ?? []) {
      const properties = CssFormatter.#getStyleProperties(style);
      if (!properties.length) {
        continue;
      }

      if (style.type === DevTools.CSSStyleDeclaration.Type.Transition) {
        rules.push({
          type: 'transition',
          selector: 'transitions style',
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      } else if (style.type === DevTools.CSSStyleDeclaration.Type.Animation) {
        const animName = style.animationName();
        rules.push({
          type: 'animation',
          ...(animName ? {name: animName} : {}),
          selector: animName ? `${animName} animation` : 'animation style',
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      } else if (style.type === DevTools.CSSStyleDeclaration.Type.Attributes) {
        const node = matchedStyles.nodeForStyle(style);
        const tag = node ? node.nodeNameInCorrectCase() : '';
        rules.push({
          type: 'attributes',
          selector: tag ? `${tag}[attributes style]` : '[attributes style]',
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      } else if (style.type === DevTools.CSSStyleDeclaration.Type.Inline) {
        rules.push({
          type: 'inline',
          selector: 'element.style',
          properties: CssFormatter.#formatProperties(properties, matchedStyles),
        });
      }
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
      cascadeRules ?? CssFormatter.collectRules(matchedStyles);
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
