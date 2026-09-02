/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {DevTools} from '../../src/third_party/index.js';
import {getCssStyles} from '../../src/tools/css.js';
import {createHandlerMocks} from '../mocks.js';

describe('get_css_styles', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('retrieves matched styles for a uid and passes to response', async () => {
    const {page, context, response} = createHandlerMocks();
    const mockStyles = sinon.createStubInstance(
      DevTools.CSSMatchedStyles.CSSMatchedStyles,
    );
    page.getMatchedStylesForUid.resolves(mockStyles);

    await getCssStyles.handler(
      {params: {uid: 'element-1'}, page},
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
        pageSize: undefined,
        pageIdx: undefined,
      },
    );
  });

  it('passes pagination options to response', async () => {
    const {page, context, response} = createHandlerMocks();
    const mockStyles = sinon.createStubInstance(
      DevTools.CSSMatchedStyles.CSSMatchedStyles,
    );
    page.getMatchedStylesForUid.resolves(mockStyles);

    await getCssStyles.handler(
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
