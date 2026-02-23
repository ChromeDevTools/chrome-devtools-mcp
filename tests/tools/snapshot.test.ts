/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {newPage, selectPage} from '../../src/tools/pages.js';
import {takeSnapshot, waitFor} from '../../src/tools/snapshot.js';
import {html, withMcpContext} from '../utils.js';

describe('snapshot', () => {
  describe('browser_snapshot', () => {
    it('includes a snapshot', async () => {
      await withMcpContext(async (response, context) => {
        await takeSnapshot.handler({params: {}}, response, context);
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
              text: 'Hello',
            },
          },
          response,
          context,
        );

        assert.equal(
          response.responseLines[0],
          'Element with text "Hello" found.',
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
              text: 'Hello World',
            },
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
          'Element with text "Hello World" found.',
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
              text: 'Header',
            },
          },
          response,
          context,
        );

        assert.equal(
          response.responseLines[0],
          'Element with text "Header" found.',
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
              text: 'Hello iframe',
            },
          },
          response,
          context,
        );

        assert.equal(
          response.responseLines[0],
          'Element with text "Hello iframe" found.',
        );
        assert.ok(response.includeSnapshot);
      });
    });
  });

  describe('isolatedContext routing', () => {
    it('take_snapshot returns content from the isolatedContext page, not the global selection', async () => {
      await withMcpContext(async (response, context) => {
        // Create an isolated page with unique content.
        await newPage.handler(
          {
            params: {
              url: 'data:text/html,<h1>Isolated Snapshot Content</h1>',
              isolatedContext: 'snap-ctx',
            },
          },
          response,
          context,
        );

        // Switch global selection back to the default page.
        await selectPage.handler({params: {pageId: 1}}, response, context);

        // Take snapshot using isolatedContext.
        const snapshotResponse = new (await import('../../src/McpResponse.js')).McpResponse();
        await takeSnapshot.handler(
          {params: {isolatedContext: 'snap-ctx'}},
          snapshotResponse,
          context,
        );

        // The snapshot should reflect the isolated page's content.
        const result = await snapshotResponse.handle('take_snapshot', context);
        const text = result.content
          .filter(c => c.type === 'text')
          .map(c => (c as {text: string}).text)
          .join('');
        assert.ok(
          text.includes('Isolated Snapshot Content'),
          `Expected snapshot to contain "Isolated Snapshot Content" but got: ${text.slice(0, 200)}`,
        );
      });
    });

    it('wait_for finds text on the isolatedContext page, not the global selection', async () => {
      await withMcpContext(async (response, context) => {
        // Create an isolated page with target text.
        await newPage.handler(
          {
            params: {
              url: 'data:text/html,<p>Unique Isolated Text</p>',
              isolatedContext: 'wait-ctx',
            },
          },
          response,
          context,
        );

        // Switch global selection away.
        await selectPage.handler({params: {pageId: 1}}, response, context);

        // wait_for should find text on the isolated page.
        const waitResponse = new (await import('../../src/McpResponse.js')).McpResponse();
        await waitFor.handler(
          {
            params: {
              text: 'Unique Isolated Text',
              isolatedContext: 'wait-ctx',
            },
          },
          waitResponse,
          context,
        );

        assert.equal(
          waitResponse.responseLines[0],
          'Element with text "Unique Isolated Text" found.',
        );
      });
    });
  });
});
