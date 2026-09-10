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
} from '../../src/formatters/CssFormatter.js';
import {DevTools} from '../../src/third_party/index.js';
import {
  createMockCSSInlineStyle,
  createMockCSSMatchedStyles,
  createMockCSSProperty,
  createMockCSSStyleDeclaration,
  createMockDOMNode,
  createMockCSSStyleRule,
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
});
