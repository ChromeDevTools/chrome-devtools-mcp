/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {zod} from '../../src/third_party/index.js';
import {DevTools} from '../../src/third_party/browser.js';
import {getCssStyles} from '../../src/tools/css.js';
import {createHandlerMocks} from '../mocks.js';

describe('get_css_styles', () => {
  it('defaults pagination to the first page of 10 rules', () => {
    const {args} = createHandlerMocks();

    const params = zod
      .object(getCssStyles(args).schema)
      .parse({uid: 'element-1', pageId: 1});

    assert.strictEqual(params.pageSize, 10);
    assert.strictEqual(params.pageIdx, 0);
    assert.strictEqual(params.computedProperties, undefined);
  });

  it('retrieves matched and computed styles for a uid and passes to response', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const mockStyles = sinon.createStubInstance(
      DevTools.CSSMatchedStyles.CSSMatchedStyles,
    );
    const mockComputedStyles = new Map([['display', 'block']]);
    const styles = {
      matchedStyles: mockStyles,
      computedStyles: mockComputedStyles,
    };
    page.getCssStylesForUid.resolves(styles);

    await getCssStyles(args).handler(
      {params: {uid: 'element-1', pageSize: 10, pageIdx: 0}, page},
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.getCssStylesForUid, 'element-1');
    sinon.assert.calledOnceWithExactly(response.setIncludeCssStyles, styles, {
      uid: 'element-1',
      pageSize: 10,
      pageIdx: 0,
      computedProperties: undefined,
    });
  });

  it('passes pagination and computedProperties options to response', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const mockStyles = sinon.createStubInstance(
      DevTools.CSSMatchedStyles.CSSMatchedStyles,
    );
    const styles = {
      matchedStyles: mockStyles,
      computedStyles: null,
    };
    page.getCssStylesForUid.resolves(styles);

    await getCssStyles(args).handler(
      {
        params: {
          uid: 'element-1',
          pageSize: 10,
          pageIdx: 2,
          computedProperties: ['position', 'z-index'],
        },
        page,
      },
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.getCssStylesForUid, 'element-1');
    sinon.assert.calledOnceWithExactly(response.setIncludeCssStyles, styles, {
      uid: 'element-1',
      pageSize: 10,
      pageIdx: 2,
      computedProperties: ['position', 'z-index'],
    });
  });
});
