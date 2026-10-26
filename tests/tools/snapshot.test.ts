/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {McpResponse} from '../../src/McpResponse.js';
import {TimeoutError} from '../../src/third_party/index.js';
import {takeSnapshot, waitFor} from '../../src/tools/snapshot.js';
import {createHandlerMocks, createMockServerConfig} from '../mocks.js';

describe('snapshot', () => {
  describe('take_snapshot', () => {
    it('includes a snapshot', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await takeSnapshot(args).handler({params: {}, page}, response, context);
      sinon.assert.calledOnceWithExactly(response.includeSnapshot, {
        verbose: false,
        filePath: undefined,
      });
    });

    it('includes a snapshot with parameters', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await takeSnapshot(args).handler(
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
    it('explains whitespace matching when the wait times out', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const error = new TimeoutError('Timed out after waiting 2000ms');
      page.waitForTextOnPage.rejects(error);

      await assert.rejects(
        waitFor(args).handler(
          {params: {text: ['Order confirmed'], timeout: 2000}, page},
          response,
          context,
        ),
        error,
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Text matching is case-sensitive. DOM text must preserve spaces and ' +
          'newlines; snapshot text may have normalized whitespace. Try a ' +
          'shorter distinctive substring or use evaluate_script to inspect ' +
          "the element's textContent.",
      );
      sinon.assert.notCalled(response.includeSnapshot);
    });

    it('includes whitespace advice alongside the formatted timeout', async () => {
      const {page, context, args} = createHandlerMocks();
      const response = new McpResponse(createMockServerConfig());
      const error = new TimeoutError('Timed out after waiting 2000ms');
      page.waitForTextOnPage.rejects(error);
      await assert.rejects(
        waitFor(args).handler(
          {params: {text: ['Order confirmed']}, page},
          response,
          context,
        ),
        error,
      );
      response.setError(error);
      const result = await response.handle(context);
      assert.match(
        JSON.stringify(result.content),
        /Timed out after waiting 2000ms/,
      );
      assert.match(
        JSON.stringify(result.content),
        /preserve spaces and newlines/,
      );
    });

    it('preserves newlines and repeated spaces in the wait pattern', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const text = ['Order\n    confirmed', 'Multi   spaced    words'];
      await waitFor(args).handler({params: {text}, page}, response, context);
      sinon.assert.calledOnceWithExactly(page.waitForTextOnPage, text, {
        timeout: undefined,
        visible: undefined,
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        `Element matching one of ${JSON.stringify(text)} found.`,
      );
    });

    it('does not add whitespace advice for non-timeout errors', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const error = new Error('Target closed');
      page.waitForTextOnPage.rejects(error);
      await assert.rejects(
        waitFor(args).handler(
          {params: {text: ['Order confirmed']}, page},
          response,
          context,
        ),
        error,
      );
      sinon.assert.notCalled(response.appendResponseLine);
      sinon.assert.notCalled(response.includeSnapshot);
    });
    it('waits for text and appends response line', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await waitFor(args).handler(
        {params: {text: ['Hello']}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.waitForTextOnPage, ['Hello'], {
        timeout: undefined,
        visible: undefined,
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Element matching one of ["Hello"] found.',
      );
      sinon.assert.calledOnceWithExactly(response.includeSnapshot);
    });

    it('waits for text with timeout', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await waitFor(args).handler(
        {params: {text: ['Complete', 'Error'], timeout: 5000}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(
        page.waitForTextOnPage,
        ['Complete', 'Error'],
        {timeout: 5000, visible: undefined},
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Element matching one of ["Complete","Error"] found.',
      );
      sinon.assert.calledOnceWithExactly(response.includeSnapshot);
    });

    it('forwards visible:true to the page matcher', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await waitFor(args).handler(
        {params: {text: ['Saved'], timeout: 2000, visible: true}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.waitForTextOnPage, ['Saved'], {
        timeout: 2000,
        visible: true,
      });
    });
  });
});
