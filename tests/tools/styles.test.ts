/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';
import assert from 'assert';

import {
  getComputedStyles,
  getBoxModel,
  getVisibility,
  getComputedStylesBatch,
  diffComputedStyles,
  saveComputedStylesSnapshot,
  diffComputedStylesSnapshot,
} from '../../src/tools/styles.js';

import {html, withBrowser} from '../utils.js';

describe('styles', () => {
  describe('get_computed_styles', () => {
    it('returns filtered computed styles', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<div
            id="box"
            style="display:block;color:rgb(0,0,255)"
            >box</div
          >`,
        );
        await context.createTextSnapshot();

        await getComputedStyles.handler(
          {
            params: {
              uid: '1_1',
              properties: ['display'],
            },
          },
          response,
          context,
        );

        const json = response.responseLines.at(2)!;
        const parsed = JSON.parse(json) as {
          computed: Record<string, string>;
        };
        assert.strictEqual(parsed.computed.display, 'block');
      });
    });

    it('can include best-effort rule origins', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<div
            id="box"
            style="display:block"
            >box</div
          >`,
        );
        await context.createTextSnapshot();

        await getComputedStyles.handler(
          {
            params: {
              uid: '1_1',
              properties: ['display'],
              includeSources: true,
            },
          },
          response,
          context,
        );

        const json = response.responseLines.at(2)!;
        const parsed = JSON.parse(json) as {
          computed: Record<string, string>;
          sourceMap?: Record<string, {source?: string}>;
        };
        assert.strictEqual(parsed.computed.display, 'block');
        // Best-effort: inline styles should be detected.
        assert.strictEqual(parsed.sourceMap?.display?.source, 'inline');
      });
    });
  });

  describe('get_box_model', () => {
    it('returns box quads and rects', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<div
            id="box"
            style="width:10px;height:10px;padding:1px;border:1px solid"
            >box</div
          >`,
        );
        await context.createTextSnapshot();

        await getBoxModel.handler({params: {uid: '1_1'}}, response, context);

        const json = response.responseLines.at(2)!;
        const parsed = JSON.parse(json) as {
          borderRect: {width: number};
          contentRect: {width: number};
          borderQuad: unknown;
        };
        assert.ok(parsed.borderQuad);
        assert.ok(parsed.borderRect.width >= parsed.contentRect.width);
      });
    });
  });

  describe('get_visibility', () => {
    it('flags display:none as not visible', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(html`<div id="box">hidden</div>`);
        await context.createTextSnapshot();
        // Hide the element after snapshot so we can still resolve the uid
        await page.evaluate(() => {
          const el = document.getElementById('box');
          if (el) {
            el.style.display = 'none';
          }
        });

        await getVisibility.handler({params: {uid: '1_1'}}, response, context);

        const json = response.responseLines.at(2)!;
        const parsed = JSON.parse(json) as {
          isVisible: boolean;
          reasons: string[];
        };
        assert.strictEqual(parsed.isVisible, false);
        assert.ok(parsed.reasons.includes('display:none'));
      });
    });
  });

  describe('get_computed_styles_batch', () => {
    it('returns styles for multiple elements', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(html`<div>box</div><span>inline</span>`);
        await context.createTextSnapshot();

        await getComputedStylesBatch.handler(
          {
            params: {
              uids: ['1_1', '1_2'],
              properties: ['display'],
            },
          },
          response,
          context,
        );

        const json = response.responseLines.at(2)!;
        const parsed = JSON.parse(json) as Record<string, {display: string}>;
        assert.strictEqual(parsed['1_1'].display, 'block');
        assert.strictEqual(parsed['1_2'].display, 'inline');
      });
    });
  });

  describe('diff_computed_styles', () => {
    it('returns changed properties between two nodes', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(html`<div>box</div><span>inline</span>`);
        await context.createTextSnapshot();

        await diffComputedStyles.handler(
          {
            params: {
              uidA: '1_1',
              uidB: '1_2',
              properties: ['display'],
            },
          },
          response,
          context,
        );

        const json = response.responseLines.at(2)!;
        const parsed = JSON.parse(json) as Array<{
          property: string;
          before: string;
          after: string;
        }>;
        const display = parsed.find(p => p.property === 'display');
        assert.ok(display);
        assert.strictEqual(display?.before, 'block');
        assert.strictEqual(display?.after, 'inline');
      });
    });
  });

  describe('named snapshots', () => {
    it('saves and diffs snapshot vs current', async () => {
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<div
            id="box"
            style="display:block"
            >box</div
          >`,
        );
        await context.createTextSnapshot();

        await saveComputedStylesSnapshot.handler(
          {
            params: {
              name: 'snap1',
              uids: ['1_1'],
              properties: ['display'],
            },
          },
          response,
          context,
        );

        // Change the style
        await page.evaluate(() => {
          const el = document.getElementById('box');
          if (el) el.style.display = 'inline';
        });

        response.resetResponseLineForTesting();
        await diffComputedStylesSnapshot.handler(
          {
            params: {
              name: 'snap1',
              uid: '1_1',
              properties: ['display'],
            },
          },
          response,
          context,
        );

        const json = response.responseLines.at(2)!;
        const parsed = JSON.parse(json) as Array<{
          property: string;
          before: string;
          after: string;
        }>;
        const display = parsed.find(p => p.property === 'display');
        assert.strictEqual(display?.before, 'block');
        assert.strictEqual(display?.after, 'inline');
      });
    });
  });
});
