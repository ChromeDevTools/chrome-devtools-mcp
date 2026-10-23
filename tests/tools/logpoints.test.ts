/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {Logpoint} from '../../src/LogpointManager.js';
import {LogpointError} from '../../src/LogpointManager.js';
import {setLogpoints} from '../../src/tools/logpoints.js';
import {createHandlerMocks} from '../mocks.js';

const BOUND_LOGPOINT: Logpoint = {
  url: 'http://127.0.0.1:16552/app.js',
  lineNumber: 2,
  expression: `'greeting for', name`,
  sourceMapped: false,
  generatedLocations: [
    {url: 'http://127.0.0.1:16552/app.js', lineNumber: 2, columnNumber: 3},
  ],
};

const SOURCE_MAPPED_LOGPOINT: Logpoint = {
  url: 'webpack:///src/cart.ts',
  lineNumber: 42,
  columnNumber: 7,
  expression: 'cart.total',
  sourceMapped: true,
  generatedLocations: [
    {url: 'http://127.0.0.1:16552/bundle.js', lineNumber: 17, columnNumber: 25},
  ],
};

describe('set_logpoints', () => {
  it('parses the logpoint strings and passes them to the page', async () => {
    const {page, context, response, args} = createHandlerMocks();
    page.setLogpoints.resolves([BOUND_LOGPOINT]);

    await setLogpoints(args).handler(
      {
        params: {
          logpoints: [`http://127.0.0.1:16552/app.js:2 'greeting for', name`],
        },
        page,
      },
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.setLogpoints, [
      {
        url: 'http://127.0.0.1:16552/app.js',
        lineNumber: 2,
        expression: `'greeting for', name`,
      },
    ]);
    sinon.assert.calledTwice(response.appendResponseLine);
    sinon.assert.calledWithExactly(
      response.appendResponseLine.firstCall,
      [
        '1 logpoint(s) set on the page:',
        "- http://127.0.0.1:16552/app.js:2 logging `'greeting for', name` [bound]",
      ].join('\n'),
    );
    sinon.assert.calledWithExactly(
      response.appendResponseLine.secondCall,
      'Logged output appears in list_console_messages once a line executes.',
    );
  });

  it('passes column numbers and adds the source map note', async () => {
    const {page, context, response, args} = createHandlerMocks();
    page.setLogpoints.resolves([SOURCE_MAPPED_LOGPOINT]);

    await setLogpoints(args).handler(
      {params: {logpoints: ['src/cart.ts:42:7 cart.total']}, page},
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.setLogpoints, [
      {
        url: 'src/cart.ts',
        lineNumber: 42,
        columnNumber: 7,
        expression: 'cart.total',
      },
    ]);
    sinon.assert.calledThrice(response.appendResponseLine);
    sinon.assert.calledWithExactly(
      response.appendResponseLine.firstCall,
      [
        '1 logpoint(s) set on the page:',
        '- webpack:///src/cart.ts:42:7 logging `cart.total` [bound via source map at http://127.0.0.1:16552/bundle.js:17:25]',
      ].join('\n'),
    );
    sinon.assert.calledWithExactly(
      response.appendResponseLine.secondCall,
      'Source-mapped locations are re-resolved automatically when a matching source map loads again (for example after a reload with a regenerated bundle). Note: on the first page load after a rebuild, code that runs during the load itself is not logged yet; if a load-time logpoint stays silent right after a rebuild, reload once more before concluding that the line does not run.',
    );
  });

  it('removes all logpoints with an empty list', async () => {
    const {page, context, response, args} = createHandlerMocks();
    page.setLogpoints.resolves([]);

    await setLogpoints(args).handler(
      {params: {logpoints: []}, page},
      response,
      context,
    );

    sinon.assert.calledOnceWithExactly(page.setLogpoints, []);
    sinon.assert.calledOnceWithExactly(
      response.appendResponseLine,
      'No logpoints are set on the page.',
    );
  });

  it('rejects malformed logpoints before touching the page', async () => {
    const {page, context, response, args} = createHandlerMocks();

    await assert.rejects(
      setLogpoints(args).handler(
        {params: {logpoints: ['src/app.ts cart.total']}, page},
        response,
        context,
      ),
      /Expected the format <url>:<lineNumber>\[:<columnNumber>\] <expression>/,
    );

    sinon.assert.notCalled(page.setLogpoints);
    sinon.assert.notCalled(response.appendResponseLine);
  });

  it('reports the applied logpoints when a location has no code', async () => {
    const {page, context, response, args} = createHandlerMocks();
    page.setLogpoints.rejects(
      new LogpointError('No executable code at app.ts:999', [BOUND_LOGPOINT]),
    );

    await assert.rejects(
      setLogpoints(args).handler(
        {
          params: {
            logpoints: [
              `http://127.0.0.1:16552/app.js:2 'greeting for', name`,
              `app.ts:999 'never'`,
            ],
          },
          page,
        },
        response,
        context,
      ),
      /No executable code at app\.ts:999/,
    );

    sinon.assert.calledOnceWithExactly(
      response.appendResponseLine,
      [
        '1 logpoint(s) set on the page:',
        "- http://127.0.0.1:16552/app.js:2 logging `'greeting for', name` [bound]",
      ].join('\n'),
    );
  });
});
