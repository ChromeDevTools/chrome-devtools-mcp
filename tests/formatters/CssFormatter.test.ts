/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {afterEach, describe, it} from 'node:test';
import sinon from 'sinon';

import {
  type ContainerQuery,
  CssFormatter,
  type ResolvedContainerDetails,
  type UidResolver,
} from '../../src/formatters/CssFormatter.js';
import {DevTools} from '../../src/third_party/index.js';
import {
  createMockCSSAtRule,
  createMockCSSInlineStyle,
  createMockCSSMatchedStyles,
  createMockCSSProperty,
  createMockCSSStyleDeclaration,
  createMockDOMNode,
  createMockCSSStyleRule,
  createMockCSSPositionTryRule,
  createMockCSSRegisteredProperty,
  createMockCSSFunctionRule,
  createMockCSSKeyframesRule,
} from '../mocks.js';

describe('CssFormatter', () => {
  afterEach(() => {
    sinon.restore();
  });

  function formatterTest(
    label: string,
    setup: (t: it.TestContext) => CssFormatter | Promise<CssFormatter>,
  ) {
    it(label + ' toString', async t => {
      const formatter = await setup(t);
      t.assert.snapshot(formatter.toString());
    });
    it(label + ' toJSON', async t => {
      const formatter = await setup(t);
      t.assert.snapshot(JSON.stringify(formatter.toJSON(), null, 2));
    });
  }

  formatterTest(
    'formats element label with id, class, and uid and no styles',
    () => {
      const matchedStyles = createMockCSSMatchedStyles({node: 'div#main'});
      return new CssFormatter(matchedStyles, {uid: '1_1'});
    },
  );

  formatterTest(
    'formats inline styles with active and overloaded properties',
    () => {
      const prop1 = createMockCSSProperty('color', 'red');
      const prop2 = createMockCSSProperty('font-size', '14px', {
        important: true,
      });

      const matchedStyles = createMockCSSMatchedStyles({
        nodeStyles: [createMockCSSInlineStyle([prop1, prop2])],
        propertyStates: new Map([[prop1, 'Overloaded']]),
      });

      return new CssFormatter(matchedStyles, {uid: '1_2'});
    },
  );

  formatterTest('formats transition, animation, and attributes styles', () => {
    const transitionStyle = createMockCSSStyleDeclaration(
      [createMockCSSProperty('opacity', '1')],
      {type: DevTools.CSSStyleDeclaration.Type.Transition},
    );
    const animationStyle = createMockCSSStyleDeclaration(
      [createMockCSSProperty('transform', 'scale(1.2)')],
      {
        type: DevTools.CSSStyleDeclaration.Type.Animation,
        animationName: 'pulse',
      },
    );
    const tableNode = createMockDOMNode({selector: 'table#data'});
    const attributesStyle = createMockCSSStyleDeclaration(
      [createMockCSSProperty('border', '1px')],
      {type: DevTools.CSSStyleDeclaration.Type.Attributes},
    );

    const matchedStyles = createMockCSSMatchedStyles({
      node: tableNode,
      nodeStyles: [transitionStyle, animationStyle, attributesStyle],
      nodeForStyleMap: new Map([[attributesStyle, tableNode]]),
    });

    return new CssFormatter(matchedStyles, {uid: 'table-1'});
  });

  describe('rule subsets', () => {
    function createMatchedStylesForRuleSubsets() {
      return createMockCSSMatchedStyles({
        nodeStyles: [
          createMockCSSStyleDeclaration(
            [createMockCSSProperty('color', 'red')],
            {
              rule: createMockCSSStyleRule('.rule-1', {
                sourceURL: 'app.css',
                lineNumber: 10,
              }),
            },
          ),
          createMockCSSStyleDeclaration(
            [createMockCSSProperty('color', 'blue')],
            {
              rule: createMockCSSStyleRule('.rule-2', {
                sourceURL: 'app.css',
                lineNumber: 20,
              }),
            },
          ),
          createMockCSSStyleDeclaration(
            [createMockCSSProperty('color', 'green')],
            {
              rule: createMockCSSStyleRule('.rule-3', {
                sourceURL: 'app.css',
                lineNumber: 30,
              }),
            },
          ),
        ],
      });
    }

    formatterTest('matched rules all 3 rules', () => {
      return new CssFormatter(createMatchedStylesForRuleSubsets(), {
        uid: 'btn-1',
      });
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
    const matchedStyles = createMockCSSMatchedStyles({
      nodeStyles: [
        createMockCSSStyleDeclaration(
          [createMockCSSProperty('color', 'blue')],
          {
            rule: createMockCSSStyleRule('.data-rule', {
              sourceURL: 'data:text/css;base64,LmRhdGEte30=',
            }),
          },
        ),
        createMockCSSStyleDeclaration(
          [createMockCSSProperty('color', 'green')],
          {
            rule: createMockCSSStyleRule('.blob-rule', {
              sourceURL: 'blob:http://example.com/1234-5678-90ab',
            }),
          },
        ),
      ],
    });

    return new CssFormatter(matchedStyles, {uid: 'data-elem'});
  });

  formatterTest('formats mixed inline and matched rules', () => {
    const matchedStyles = createMockCSSMatchedStyles({
      node: 'button#btn-id',
      nodeStyles: [
        createMockCSSInlineStyle([createMockCSSProperty('color', 'red')]),
        createMockCSSStyleDeclaration(
          [createMockCSSProperty('font-size', '16px')],
          {
            rule: createMockCSSStyleRule('.btn', {
              sourceURL: 'style.css',
              lineNumber: 5,
            }),
          },
        ),
      ],
    });

    return new CssFormatter(matchedStyles, {uid: '1_1'});
  });

  formatterTest('formats nested CSS rules with nesting ancestors', () => {
    const matchedStyles = createMockCSSMatchedStyles({
      nodeStyles: [
        createMockCSSStyleDeclaration(
          [createMockCSSProperty('color', 'blue')],
          {
            rule: createMockCSSStyleRule('& .child', {
              sourceURL: 'styles.css',
              lineNumber: 15,
              columnNumber: 2,
              nestingSelectors: ['.card'],
            }),
          },
        ),
      ],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-child'});
  });

  formatterTest(
    'formats constructed stylesheets with and without sourceURL pragma',
    () => {
      const matchedStyles = createMockCSSMatchedStyles({
        nodeStyles: [
          createMockCSSStyleDeclaration(
            [createMockCSSProperty('color', 'purple')],
            {
              rule: createMockCSSStyleRule('.constructed-btn', {
                isConstructed: true,
              }),
            },
          ),
          createMockCSSStyleDeclaration(
            [createMockCSSProperty('color', 'orange')],
            {
              rule: createMockCSSStyleRule('.themed-btn', {
                sourceURL: 'theme.css',
                lineNumber: 10,
                columnNumber: 5,
                isConstructed: true,
              }),
            },
          ),
        ],
      });
      return new CssFormatter(matchedStyles, {uid: 'elem-constructed'});
    },
  );

  formatterTest('formats injected stylesheet rules', () => {
    const matchedStyles = createMockCSSMatchedStyles({
      nodeStyles: [
        createMockCSSStyleDeclaration(
          [createMockCSSProperty('display', 'none')],
          {
            rule: createMockCSSStyleRule('.extension-override', {
              origin: 'injected',
            }),
          },
        ),
      ],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-injected'});
  });

  formatterTest('formats inspector stylesheet rules', () => {
    const matchedStyles = createMockCSSMatchedStyles({
      nodeStyles: [
        createMockCSSStyleDeclaration(
          [createMockCSSProperty('outline', '2px solid red')],
          {
            rule: createMockCSSStyleRule('#interactive-test', {
              sourceURL: 'inspector-stylesheet',
              origin: 'inspector',
            }),
          },
        ),
      ],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-inspector'});
  });

  formatterTest('formats @navigation ancestor rule', () => {
    const rule = createMockCSSStyleRule('.nav-link', {
      navigations: [{text: 'same-document'}],
    });
    const style = createMockCSSStyleDeclaration(
      [createMockCSSProperty('color', 'navy')],
      {rule},
    );
    const matchedStyles = createMockCSSMatchedStyles({nodeStyles: [style]});

    return new CssFormatter(matchedStyles, {uid: 'elem-nav'});
  });

  formatterTest('resolves container queries with node uid', async () => {
    const containerNode = createMockDOMNode({
      selector: 'aside#sidebar',
      backendNodeId: 42,
    });
    const query = {
      text: '(min-width: 300px)',
      name: 'sidebar-cq',
      getContainerForNode: async () => ({
        containerNode,
        getContainerSizeDetails: async () => ({
          queryAxis: 'inline-size',
          width: '350px',
        }),
      }),
    };
    const rule = createMockCSSStyleRule('.widget', {
      containerQueries: [query],
    });
    const style = createMockCSSStyleDeclaration(
      [createMockCSSProperty('padding', '10px')],
      {rule},
    );
    const matchedStyles = createMockCSSMatchedStyles({nodeStyles: [style]});

    const containerDetails = new Map<
      ContainerQuery,
      ResolvedContainerDetails
    >();
    containerDetails.set(query as unknown as ContainerQuery, {
      container: {
        uid: `uid-42`,
        selector: 'aside#sidebar',
      },
    });

    return new CssFormatter(matchedStyles, {
      uid: 'elem-widget',
      containerDetails,
    });
  });

  formatterTest('maps invalid and disabled property statuses', () => {
    const validProp = createMockCSSProperty('color', 'red');
    const invalidProp = createMockCSSProperty('background', 'invalid-val', {
      parsedOk: false,
    });
    const disabledProp = createMockCSSProperty('opacity', '0.5', {
      disabled: true,
    });

    const style = createMockCSSInlineStyle([
      validProp,
      invalidProp,
      disabledProp,
    ]);
    const matchedStyles = createMockCSSMatchedStyles({nodeStyles: [style]});

    return new CssFormatter(matchedStyles, {uid: 'elem-diag'});
  });

  formatterTest(
    'formats @layer, @media, @supports, and @starting-style ancestor rules',
    () => {
      const rule = createMockCSSStyleRule('.test-btn', {
        layers: [{text: 'base'}],
        media: [{text: '(min-width: 500px)'}],
        supports: [{text: '(display: flex)'}],
        startingStyles: [{}],
      });
      const style = createMockCSSStyleDeclaration(
        [createMockCSSProperty('display', 'flex')],
        {rule},
      );
      const matchedStyles = createMockCSSMatchedStyles({nodeStyles: [style]});
      return new CssFormatter(matchedStyles, {uid: 'btn-1'});
    },
  );

  formatterTest('formats @scope ancestor rule', () => {
    const rule = createMockCSSStyleRule('.scoped-item', {
      scopes: [{text: '(:root)'}],
    });
    const style = createMockCSSStyleDeclaration(
      [createMockCSSProperty('color', 'blue')],
      {rule},
    );
    const matchedStyles = createMockCSSMatchedStyles({nodeStyles: [style]});
    return new CssFormatter(matchedStyles, {uid: 'item-1'});
  });

  formatterTest(
    'formats inherited styles from ancestors and ignores non-inheritable ones',
    () => {
      const inhStyle = createMockCSSStyleDeclaration(
        [
          createMockCSSProperty('color', 'black'),
          createMockCSSProperty('margin', '20px'),
          createMockCSSProperty('--custom-var', '10px'),
        ],
        {rule: createMockCSSStyleRule('.parent-style')},
      );

      const matchedStyles = createMockCSSMatchedStyles({
        inheritedStyles: [inhStyle],
        parentNode: 'section#parent-sec',
      });

      return new CssFormatter(matchedStyles, {uid: 'child-1'});
    },
  );

  formatterTest(
    'formats inherited transition and animation styles with parent node',
    () => {
      const inhTransition = createMockCSSStyleDeclaration(
        [createMockCSSProperty('color', 'purple')],
        {type: DevTools.CSSStyleDeclaration.Type.Transition},
      );
      const inhAnimation = createMockCSSStyleDeclaration(
        [createMockCSSProperty('color', 'orange')],
        {
          type: DevTools.CSSStyleDeclaration.Type.Animation,
          animationName: 'pulse',
        },
      );

      const matchedStyles = createMockCSSMatchedStyles({
        inheritedStyles: [inhTransition, inhAnimation],
        parentNode: 'div#wrapper',
      });

      return new CssFormatter(matchedStyles, {uid: 'child-elem'});
    },
  );

  formatterTest(
    'formats pseudo-elements with rules and inline pseudo styles',
    () => {
      const pseudoRule = createMockCSSStyleRule('button.btn::before', {
        sourceURL: 'styles.css',
        lineNumber: 20,
        columnNumber: 4,
        selectors: [{text: 'button.btn::before'}, {text: 'a.link::before'}],
        nestingSelectors: ['.btn-group'],
      });
      const beforeStyle = createMockCSSStyleDeclaration(
        [
          createMockCSSProperty('content', '"→"'),
          createMockCSSProperty('color', 'blue'),
        ],
        {rule: pseudoRule},
      );
      const afterStyle = createMockCSSStyleDeclaration([
        createMockCSSProperty('content', '"*"'),
      ]);
      const matchedStyles = createMockCSSMatchedStyles({
        pseudoStyles: new Map([
          [DevTools.Protocol.DOM.PseudoType.Before, [beforeStyle]],
          [DevTools.Protocol.DOM.PseudoType.After, [afterStyle]],
        ]),
        matchingSelectorsMap: new Map([[pseudoRule, [0]]]),
      });
      return new CssFormatter(matchedStyles, {uid: 'btn-pseudo'});
    },
  );

  formatterTest(
    'formats inherited pseudo-elements with ancestor node and resolves uid',
    () => {
      const selectionRule = createMockCSSStyleRule('div.container::selection', {
        sourceURL: 'theme.css',
        lineNumber: 5,
        columnNumber: 1,
      });
      const inheritedSelectionStyle = createMockCSSStyleDeclaration(
        [
          createMockCSSProperty('color', 'white'),
          createMockCSSProperty('background-color', 'navy'),
          createMockCSSProperty('--selection-var', 'red'),
        ],
        {rule: selectionRule},
      );

      const inheritedHighlightStyle = createMockCSSStyleDeclaration([
        createMockCSSProperty('color', 'yellow'),
        createMockCSSProperty('--highlight-color', 'gold'),
      ]);

      const inheritedMarkerStyle = createMockCSSStyleDeclaration([
        createMockCSSProperty('color', 'green'),
        createMockCSSProperty('padding', '5px'),
      ]);

      const directMarkerStyle = createMockCSSStyleDeclaration([
        createMockCSSProperty('content', '"•"'),
      ]);

      const parentNode = createMockDOMNode({
        selector: 'div.container',
        backendNodeId: 10,
      });
      const matchedStyles = createMockCSSMatchedStyles({
        node: createMockDOMNode({selector: 'p.paragraph', backendNodeId: 1}),
        parentNode,
        inheritedStyles: [
          inheritedSelectionStyle,
          inheritedHighlightStyle,
          inheritedMarkerStyle,
        ],
        pseudoStyles: new Map([
          [
            DevTools.Protocol.DOM.PseudoType.Selection,
            [inheritedSelectionStyle],
          ],
          [
            DevTools.Protocol.DOM.PseudoType.Marker,
            [directMarkerStyle, inheritedMarkerStyle],
          ],
        ]),
        customHighlights: new Map([['search', [inheritedHighlightStyle]]]),
      });

      const resolveUid: UidResolver = (backendId: number) =>
        backendId === 10 ? 'cont-10' : undefined;

      return new CssFormatter(matchedStyles, {
        uid: 'para-1',
        resolveUid,
      });
    },
  );

  formatterTest('formats @font-palette-values at-rule with name', () => {
    const atRule = createMockCSSAtRule('font-palette-values', {
      name: '--my-palette',
      properties: [
        createMockCSSProperty('font-family', 'Bixa'),
        createMockCSSProperty('base-palette', '3'),
      ],
      sourceURL: 'https://example.com/fonts.css',
      range: {startLine: 10, startColumn: 0, endLine: 14, endColumn: 1},
    });
    const matchedStyles = createMockCSSMatchedStyles({atRules: [atRule]});
    return new CssFormatter(matchedStyles, {uid: 'elem-at-1'});
  });

  formatterTest('formats @font-face at-rule without name', () => {
    const atRule = createMockCSSAtRule('font-face', {
      properties: [
        createMockCSSProperty('font-family', 'Open Sans'),
        createMockCSSProperty('src', 'url(font.woff2)'),
      ],
    });
    const matchedStyles = createMockCSSMatchedStyles({atRules: [atRule]});
    return new CssFormatter(matchedStyles, {uid: 'elem-at-2'});
  });

  formatterTest('formats at-rule when present in atRules', () => {
    const atRule = createMockCSSAtRule('counter-style', {
      name: 'thumbs',
      properties: [createMockCSSProperty('system', 'cyclic')],
    });
    const matchedStyles = createMockCSSMatchedStyles({
      atRules: [atRule],
    });
    return new CssFormatter(matchedStyles, {uid: 'elem-at-4'});
  });

  formatterTest('formats active and inactive @position-try rules', () => {
    const posActive = createMockCSSPositionTryRule('--bottom', {
      active: true,
      properties: [createMockCSSProperty('top', 'anchor(bottom)')],
      sourceURL: 'anchor.css',
      range: {startLine: 20, startColumn: 0, endLine: 22, endColumn: 1},
    });
    const posInactive = createMockCSSPositionTryRule('--top', {
      active: false,
      properties: [createMockCSSProperty('bottom', 'anchor(top)')],
      sourceURL: 'anchor.css',
      range: {startLine: 25, startColumn: 0, endLine: 27, endColumn: 1},
    });
    const matchedStyles = createMockCSSMatchedStyles({
      positionTryRules: [posActive, posInactive],
    });

    return new CssFormatter(matchedStyles, {uid: 'elem-pos'});
  });

  formatterTest(
    'formats @property rules defined in stylesheets and programmatically',
    () => {
      const propStylesheet = createMockCSSRegisteredProperty('--brand-color', {
        syntax: '"<color>"',
        inherits: false,
        initialValue: '#1a73e8',
        sourceURL: 'theme.css',
        range: {startLine: 10, startColumn: 0, endLine: 14, endColumn: 1},
      });
      const propProgrammatic = createMockCSSRegisteredProperty(
        '--runtime-var',
        {
          syntax: '"<length>"',
          inherits: true,
          initialValue: '10px',
          isProgrammatic: true,
        },
      );
      const matchedStyles = createMockCSSMatchedStyles({
        registeredProperties: [propStylesheet, propProgrammatic],
      });

      return new CssFormatter(matchedStyles, {uid: 'elem-prop'});
    },
  );

  formatterTest(
    'formats @function custom function rule with parameters and declarations',
    () => {
      const funcRule = createMockCSSFunctionRule('--double(--x)', {
        functionName: '--double',
        properties: [createMockCSSProperty('result', 'calc(var(--x) * 2)')],
        sourceURL: 'math.css',
        range: {startLine: 4, startColumn: 0, endLine: 6, endColumn: 1},
      });
      const matchedStyles = createMockCSSMatchedStyles({
        functionRules: [funcRule],
      });

      return new CssFormatter(matchedStyles, {uid: 'elem-func'});
    },
  );

  formatterTest(
    'formats @keyframes rule with multiple steps and source location',
    () => {
      const keyframesRule = createMockCSSKeyframesRule('slideIn', [
        {
          key: 'from',
          properties: [createMockCSSProperty('opacity', '0')],
          sourceURL: 'animations.css',
          range: {startLine: 10, startColumn: 2, endLine: 12, endColumn: 3},
        },
        {
          key: 'to',
          properties: [createMockCSSProperty('opacity', '1')],
          sourceURL: 'animations.css',
          range: {startLine: 13, startColumn: 2, endLine: 15, endColumn: 3},
        },
      ]);
      const matchedStyles = createMockCSSMatchedStyles({
        keyframes: [keyframesRule],
      });

      return new CssFormatter(matchedStyles, {uid: 'elem-kf'});
    },
  );
});
