/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {DevTools, zod} from '../../src/third_party/index.js';
import {getCssStyles} from '../../src/tools/css.js';
import {createHandlerMocks} from '../mocks.js';

describe('get_css_styles', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('defaults pagination to the first page of 10 rules', () => {
    const {args} = createHandlerMocks();

    const params = zod
      .object(getCssStyles(args).schema)
      .parse({uid: 'element-1', pageId: 1});

    assert.strictEqual(params.pageSize, 10);
    assert.strictEqual(params.pageIdx, 0);
  });

  it('retrieves matched styles for a uid and passes to response', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const mockStyles = sinon.createStubInstance(
      DevTools.CSSMatchedStyles.CSSMatchedStyles,
    );
    page.getMatchedStylesForUid.resolves(mockStyles);

    await getCssStyles(args).handler(
      {params: {uid: 'element-1', pageSize: 10, pageIdx: 0}, page},
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(
      page.getMatchedStylesForUid,
      'element-1',
    );
    sinon.assert.calledOnceWithExactly(
      response.setIncludeCssStyles,
      mockStyles,
      {
        uid: 'element-1',
        pageSize: 10,
        pageIdx: 0,
      },
    );
  });

  it('passes pagination options to response', async () => {
    const {page, context, response, args} = createHandlerMocks();
    const mockStyles = sinon.createStubInstance(
      DevTools.CSSMatchedStyles.CSSMatchedStyles,
    );
    page.getMatchedStylesForUid.resolves(mockStyles);

    await getCssStyles(args).handler(
      {params: {uid: 'element-1', pageSize: 10, pageIdx: 2}, page},
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(
      page.getMatchedStylesForUid,
      'element-1',
    );
    sinon.assert.calledOnceWithExactly(
      response.setIncludeCssStyles,
      mockStyles,
      {
        uid: 'element-1',
        pageSize: 10,
        pageIdx: 2,
      },
    );
  });
});
