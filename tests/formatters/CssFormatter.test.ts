/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import {CssFormatter} from '../../src/formatters/CssFormatter.js';
import {DevTools} from '../../src/third_party/index.js';
import type {MatchedStyles} from '../../src/tools/ToolDefinition.js';

type NodeStyle = DevTools.CSSStyleDeclaration.CSSStyleDeclaration;
type StyleProperty = DevTools.CSSProperty.CSSProperty;

describe('CssFormatter', () => {
  function createMockNode(selector = 'button'): DevTools.DOMModel.DOMNode {
    return {
      simpleSelector: () => selector,
    } as unknown as DevTools.DOMModel.DOMNode;
  }

  interface MockRuleOptions {
    sourceURL?: string;
    lineNumber?: number;
    columnNumber?: number;
    origin?: 'regular' | 'user-agent' | 'injected' | 'inspector';
    isConstructed?: boolean;
    nestingSelectors?: string[];
    selectors?: Array<{text: string}>;
  }

  function createMockRule(
    selector: string,
    options: MockRuleOptions = {},
  ): DevTools.CSSRule.CSSStyleRule {
    const mock = Object.create(DevTools.CSSRule.CSSStyleRule.prototype);
    Object.defineProperty(mock, 'sourceURL', {
      value: options.sourceURL,
      writable: true,
      configurable: true,
    });
    const origin = options.origin ?? 'regular';
    return Object.assign(mock, {
      origin,
      isUserAgent: () => origin === 'user-agent',
      isInjected: () => origin === 'injected',
      isViaInspector: () => origin === 'inspector',
      header:
        options.isConstructed !== undefined
          ? {isConstructedByNew: () => options.isConstructed}
          : null,
      selectorText: () => selector,
      lineNumberInSource: () => options.lineNumber ?? 0,
      columnNumberInSource: () => options.columnNumber ?? 0,
      selectors: options.selectors ?? [{text: selector}],
      nestingSelectors: options.nestingSelectors,
    });
  }

  function createMockProperty(name: string, value: string, important = false) {
    return {
      name,
      value,
      important,
    } as unknown as StyleProperty;
  }

  function createMockStyle(
    properties: StyleProperty[],
    rule?: unknown,
    type = DevTools.CSSStyleDeclaration.Type.Regular,
  ): NodeStyle {
    return {
      type,
      allProperties: () => properties,
      leadingProperties: () => properties,
      parentRule: rule ?? null,
    } as unknown as NodeStyle;
  }

  function createMockInlineStyle(properties: StyleProperty[]): NodeStyle {
    return createMockStyle(
      properties,
      undefined,
      DevTools.CSSStyleDeclaration.Type.Inline,
    );
  }

  interface MockMatchedStylesParams {
    node?: string | DevTools.DOMModel.DOMNode;
    nodeStyles?: NodeStyle[];
    inheritedStyles?: NodeStyle[];
    parentNode?: string | DevTools.DOMModel.DOMNode;
    nodeForStyleMap?: Map<NodeStyle, DevTools.DOMModel.DOMNode>;
    pseudoStyles?: Map<DevTools.Protocol.DOM.PseudoType, NodeStyle[]>;
    propertyStates?: Map<StyleProperty, string>;
  }

  function createMockMatchedStyles(
    params: MockMatchedStylesParams = {},
  ): MatchedStyles {
    const mockNode =
      typeof params.node === 'string'
        ? createMockNode(params.node)
        : (params.node ?? createMockNode());

    const inheritedStyles = params.inheritedStyles ?? [];
    const nodeStyles = params.nodeStyles
      ? [...params.nodeStyles, ...inheritedStyles]
      : inheritedStyles;

    const defaultParentNode =
      typeof params.parentNode === 'string'
        ? createMockNode(params.parentNode)
        : params.parentNode;
    const nodeForStyleMap = params.nodeForStyleMap ?? new Map();

    const pseudoStylesMap = params.pseudoStyles ?? new Map();
    const pseudoTypes = new Set(pseudoStylesMap.keys());
    const propertyStates = params.propertyStates ?? new Map();

    const mockMatchedStyles = {
      node: () => mockNode,
      nodeStyles: () => nodeStyles,
      inheritedStyles: () => inheritedStyles,
      nodeForStyle: (style: NodeStyle) =>
        nodeForStyleMap.get(style) ?? defaultParentNode ?? null,
      isInherited: (style: NodeStyle) => inheritedStyles.includes(style),
      pseudoTypes: () => pseudoTypes,
      pseudoStyles: (type: DevTools.Protocol.DOM.PseudoType) =>
        pseudoStylesMap.get(type) ?? [],
      propertyState: (prop: StyleProperty) =>
        propertyStates.get(prop) ?? 'Active',
      getMatchingSelectors: () => [],
    };

    return mockMatchedStyles as unknown as MatchedStyles;
  }

  function formatterTest(
    label: string,
    setup: (t: it.TestContext) => CssFormatter,
  ) {
    it(label + ' toString', t => {
      const formatter = setup(t);
      t.assert.snapshot(formatter.toString());
    });
    it(label + ' toJSON', t => {
      const formatter = setup(t);
      t.assert.snapshot(JSON.stringify(formatter.toJSON(), null, 2));
    });
  }

  formatterTest(
    'formats element label with id, class, and uid and no styles',
    () => {
      const matchedStyles = createMockMatchedStyles({node: 'div#main'});
      return new CssFormatter(matchedStyles, {uid: '1_1'});
    },
  );

  formatterTest(
    'formats inline styles with active and overloaded properties',
    () => {
      const prop1 = createMockProperty('color', 'red');
      const prop2 = createMockProperty('font-size', '14px', true);

      const matchedStyles = createMockMatchedStyles({
        nodeStyles: [createMockInlineStyle([prop1, prop2])],
        propertyStates: new Map([[prop1, 'Overloaded']]),
      });

      return new CssFormatter(matchedStyles, {uid: '1_2'});
    },
  );

  describe('rule subsets', () => {
    function createMatchedStylesForRuleSubsets() {
      return createMockMatchedStyles({
        nodeStyles: [
          createMockStyle(
            [createMockProperty('color', 'red')],
            createMockRule('.rule-1', {sourceURL: 'app.css', lineNumber: 10}),
          ),
          createMockStyle(
            [createMockProperty('color', 'blue')],
            createMockRule('.rule-2', {sourceURL: 'app.css', lineNumber: 20}),
          ),
          createMockStyle(
            [createMockProperty('color', 'green')],
            createMockRule('.rule-3', {sourceURL: 'app.css', lineNumber: 30}),
          ),
        ],
      });
    }

    formatterTest('matched rules all 3 rules', () => {
      return new CssFormatter(createMatchedStylesForRuleSubsets(), {
        uid: 'btn-1',
      });
    });

    formatterTest('matched rules subset - first 2 rules', () => {
      const matchedStyles = createMatchedStylesForRuleSubsets();
      const fullFormatter = new CssFormatter(matchedStyles, {uid: 'btn-1'});
      return new CssFormatter(
        matchedStyles,
        {uid: 'btn-1'},
        fullFormatter.rules.slice(0, 2),
      );
    });

    formatterTest('matched rules subset - last rule', () => {
      const matchedStyles = createMatchedStylesForRuleSubsets();
      const fullFormatter = new CssFormatter(matchedStyles, {uid: 'btn-1'});
      return new CssFormatter(
        matchedStyles,
        {uid: 'btn-1'},
        fullFormatter.rules.slice(2, 3),
      );
    });
  });

  formatterTest('formats data: and blob: stylesheet URLs correctly', () => {
    const matchedStyles = createMockMatchedStyles({
      nodeStyles: [
        createMockStyle(
          [createMockProperty('color', 'blue')],
          createMockRule('.data-rule', {
            sourceURL: 'data:text/css;base64,LmRhdGEte30=',
          }),
        ),
        createMockStyle(
          [createMockProperty('color', 'green')],
          createMockRule('.blob-rule', {
            sourceURL: 'blob:http://example.com/1234-5678-90ab',
          }),
        ),
      ],
    });

    return new CssFormatter(matchedStyles, {uid: 'data-elem'});
  });

  formatterTest('formats empty matched styles', () => {
    const matchedStyles = createMockMatchedStyles({node: 'div'});
    return new CssFormatter(matchedStyles, {
      uid: 'empty-1',
      pageSize: 5,
    });
  });

  formatterTest('formats mixed inline and matched rules', () => {
    const matchedStyles = createMockMatchedStyles({
      node: 'button#btn-id',
      nodeStyles: [
        createMockInlineStyle([createMockProperty('color', 'red')]),
        createMockStyle(
          [createMockProperty('font-size', '16px')],
          createMockRule('.btn', {sourceURL: 'style.css', lineNumber: 5}),
        ),
      ],
    });

    return new CssFormatter(matchedStyles, {uid: '1_1'});
  });

  formatterTest(
    'formats inherited styles from ancestors and ignores non-inheritable ones',
    () => {
      const inhStyle = createMockStyle(
        [
          createMockProperty('color', 'black'),
          createMockProperty('margin', '20px'),
          createMockProperty('--custom-var', '10px'),
        ],
        createMockRule('.parent-style'),
      );

      const matchedStyles = createMockMatchedStyles({
        inheritedStyles: [inhStyle],
        parentNode: 'section#parent-sec',
      });

      return new CssFormatter(matchedStyles, {uid: 'child-1'});
    },
  );

  formatterTest('formats pseudo-elements like ::before and ::after', () => {
    const matchedStyles = createMockMatchedStyles({
      pseudoStyles: new Map([
        [
          DevTools.Protocol.DOM.PseudoType.Before,
          [createMockStyle([createMockProperty('content', '"*"')])],
        ],
      ]),
    });

    return new CssFormatter(matchedStyles, {uid: 'elem-1'});
  });

  formatterTest('formats nested CSS rules with resolvedSelector', () => {
    const matchedStyles = createMockMatchedStyles({
      nodeStyles: [
        createMockStyle(
          [createMockProperty('color', 'blue')],
          createMockRule('& .child', {
            sourceURL: 'styles.css',
            lineNumber: 15,
            columnNumber: 2,
            nestingSelectors: ['.card'],
          }),
        ),
      ],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-child'});
  });

  formatterTest('formats constructed stylesheet rules', () => {
    const matchedStyles = createMockMatchedStyles({
      nodeStyles: [
        createMockStyle(
          [createMockProperty('color', 'purple')],
          createMockRule('.constructed-btn', {isConstructed: true}),
        ),
      ],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-constructed'});
  });

  formatterTest('formats constructed stylesheet with sourceURL pragma', () => {
    const matchedStyles = createMockMatchedStyles({
      nodeStyles: [
        createMockStyle(
          [createMockProperty('color', 'orange')],
          createMockRule('.themed-btn', {
            sourceURL: 'theme.css',
            lineNumber: 10,
            columnNumber: 5,
            isConstructed: false,
          }),
        ),
      ],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-themed'});
  });

  formatterTest('formats injected stylesheet rules', () => {
    const matchedStyles = createMockMatchedStyles({
      nodeStyles: [
        createMockStyle(
          [createMockProperty('display', 'none')],
          createMockRule('.extension-override', {origin: 'injected'}),
        ),
      ],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-injected'});
  });

  formatterTest('formats inspector stylesheet rules', () => {
    const matchedStyles = createMockMatchedStyles({
      nodeStyles: [
        createMockStyle(
          [createMockProperty('outline', '2px solid red')],
          createMockRule('#interactive-test', {
            sourceURL: 'inspector-stylesheet',
            origin: 'inspector',
          }),
        ),
      ],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-inspector'});
  });
});
