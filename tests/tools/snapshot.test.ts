/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {takeSnapshot, waitFor} from '../../src/tools/snapshot.js';
import {createHandlerMocks} from '../mocks.js';

describe('snapshot', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('take_snapshot', () => {
    it('includes a snapshot', async () => {
      const {page, context, response} = createHandlerMocks();
      await takeSnapshot.handler({params: {}, page}, response, context);
      sinon.assert.calledOnceWithExactly(response.includeSnapshot, {
        verbose: false,
        filePath: undefined,
      });
    });

    it('includes a snapshot with parameters', async () => {
      const {page, context, response} = createHandlerMocks();
      await takeSnapshot.handler(
        {params: {verbose: true, filePath: 'custom/path.txt'}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(response.includeSnapshot, {
        verbose: true,
        filePath: 'custom/path.txt',
      });
    });
  });

  describe('wait_for', () => {
    it('waits for text and appends response line', async () => {
      const {page, context, response} = createHandlerMocks();
      await waitFor.handler(
        {params: {text: ['Hello']}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(
        page.waitForTextOnPage,
        ['Hello'],
        undefined,
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Element matching one of ["Hello"] found.',
      );
      sinon.assert.calledOnceWithExactly(response.includeSnapshot);
    });

    it('waits for text with timeout', async () => {
      const {page, context, response} = createHandlerMocks();
      await waitFor.handler(
        {params: {text: ['Complete', 'Error'], timeout: 5000}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(
        page.waitForTextOnPage,
        ['Complete', 'Error'],
        5000,
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Element matching one of ["Complete","Error"] found.',
      );
      sinon.assert.calledOnceWithExactly(response.includeSnapshot);
    });
  });
});
