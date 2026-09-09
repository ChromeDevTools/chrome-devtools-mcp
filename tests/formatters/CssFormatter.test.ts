/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {afterEach, describe, it} from 'node:test';
import sinon from 'sinon';

import {CssFormatter} from '../../src/formatters/CssFormatter.js';
import {DevTools} from '../../src/third_party/index.js';
import {
  createMockCSSInlineStyle,
  createMockCSSMatchedStyles,
  createMockCSSProperty,
  createMockCSSStyleDeclaration,
  createMockDOMNode,
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
});
