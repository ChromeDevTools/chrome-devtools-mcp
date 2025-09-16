/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {describe, it} from 'node:test';
import assert from 'assert';

import {screenshot} from '../../src/tools/screenshot.js';

import {withBrowser} from '../utils.js';
import {screenshots} from '../snapshot.js';

describe('screenshot', () => {
  describe('browser_take_screenshot', () => {
    it('with default options', async () => {
      await withBrowser(async (response, context) => {
        const fixture = screenshots.basic;
        const page = context.getSelectedPage();
        await page.setContent(fixture.html);
        await screenshot.handler({params: {format: 'png'}}, response, context);

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/png');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('with jpeg', async () => {
      await withBrowser(async (response, context) => {
        await screenshot.handler({params: {format: 'jpeg'}}, response, context);

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/jpeg');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('with full page', async () => {
      await withBrowser(async (response, context) => {
        const fixture = screenshots.viewportOverflow;
        const page = context.getSelectedPage();
        await page.setContent(fixture.html);
        await screenshot.handler(
          {params: {format: 'png', fullPage: true}},
          response,
          context,
        );

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/png');
        assert.equal(
          response.responseLines.at(0),
          'Took a screenshot of the full current page.',
        );
      });
    });

    it('with full page resulting in a large screenshot', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          `<div style="color:blue;">test</div>`.repeat(5_000),
        );
        await screenshot.handler(
          {params: {format: 'png', fullPage: true}},
          response,
          context,
        );

        assert.equal(response.images.length, 0);
        assert.equal(
          response.responseLines.at(0),
          'Took a screenshot of the full current page.',
        );
        assert.ok(
          response.responseLines.at(1)?.match(/Saved screenshot to.*\.png/),
        );
      });
    });

    it('with element uid', async () => {
      await withBrowser(async (response, context) => {
        const fixture = screenshots.button;

        const page = context.getSelectedPage();
        await page.setContent(fixture.html);
        await context.createTextSnapshot();
        await screenshot.handler(
          {
            params: {
              format: 'png',
              uid: '1_1',
            },
          },
          response,
          context,
        );

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/png');
        assert.equal(
          response.responseLines.at(0),
          'Took a screenshot of node with uid "1_1".',
        );
      });
    });
  });
});
