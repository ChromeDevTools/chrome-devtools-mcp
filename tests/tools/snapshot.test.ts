/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {takeSnapshot, waitFor} from '../../src/tools/snapshot.js';
import {html, withMcpContext} from '../utils.js';

describe('snapshot', () => {
  describe('browser_snapshot', () => {
    it('includes a snapshot', async () => {
      await withMcpContext(async (response, context) => {
        await takeSnapshot.handler(
          {params: {}, page: context.getSelectedPage()},
          response,
          context,
        );
        assert.ok(response.includeSnapshot);
      });
    });
  });
  describe('browser_wait_for', () => {
    it('should work', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();

        await page.setContent(
          html`<main><span>Hello</span><span> </span><div>World</div></main>`,
        );
        await waitFor.handler(
          {
            params: {
              text: ['Hello'],
            },
            page,
          },
          response,
          context,
        );

        assert.equal(
          response.responseLines[0],
          'Element matching one of ["Hello"] found.',
        );
        assert.ok(response.includeSnapshot);
      });
    });

    it('should work with any-match array', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();

        await page.setContent(
          html`<main><span>Status</span><div>Error</div></main>`,
        );
        await waitFor.handler(
          {
            params: {
              text: ['Complete', 'Error'],
            },
            page,
          },
          response,
          context,
        );

        assert.equal(
          response.responseLines[0],
          'Element matching one of ["Complete","Error"] found.',
        );
        assert.ok(response.includeSnapshot);
      });
    });

    it('should work with any-match array when element shows up later', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();

        const handlePromise = waitFor.handler(
          {
            params: {
              text: ['Complete', 'Error'],
            },
            page,
          },
          response,
          context,
        );

        await page.setContent(
          html`<main
            ><span>Hello</span><span> </span><div>Complete</div></main
          >`,
        );

        await handlePromise;

        assert.equal(
          response.responseLines[0],
          'Element matching one of ["Complete","Error"] found.',
        );
        assert.ok(response.includeSnapshot);
      });
    });

    it('should work with element that show up later', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();

        const handlePromise = waitFor.handler(
          {
            params: {
              text: ['Hello World'],
            },
            page,
          },
          response,
          context,
        );

        await page.setContent(
          html`<main><span>Hello</span><span> </span><div>World</div></main>`,
        );

        await handlePromise;

        assert.equal(
          response.responseLines[0],
          'Element matching one of ["Hello World"] found.',
        );
        assert.ok(response.includeSnapshot);
      });
    });
    it('should work with aria elements', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();

        await page.setContent(
          html`<main><h1>Header</h1><div>Text</div></main>`,
        );

        await waitFor.handler(
          {
            params: {
              text: ['Header'],
            },
            page,
          },
          response,
          context,
        );

        assert.equal(
          response.responseLines[0],
          'Element matching one of ["Header"] found.',
        );
        assert.ok(response.includeSnapshot);
      });
    });

    it('should work with iframe content', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();

        await page.setContent(
          html`<h1>Top level</h1>
            <iframe srcdoc="<p>Hello iframe</p>"></iframe>`,
        );

        await waitFor.handler(
          {
            params: {
              text: ['Hello iframe'],
            },
            page,
          },
          response,
          context,
        );

        assert.equal(
          response.responseLines[0],
          'Element matching one of ["Hello iframe"] found.',
        );
        assert.ok(response.includeSnapshot);
      });
    });
  });
});
