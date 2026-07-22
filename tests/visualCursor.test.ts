/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  parseArguments,
  type ParsedArguments,
} from '../src/bin/chrome-devtools-mcp-cli-options.js';
import {TextSnapshot} from '../src/TextSnapshot.js';
import {click, clickAt} from '../src/tools/input.js';
import {
  animateCursorTo,
  buildVisualCursorInjectionScript,
  DEFAULT_VISUAL_CURSOR_DURATION_MS,
  ensureVisualCursor,
} from '../src/visualCursor.js';

import {html, withMcpContext} from './utils.js';

interface GhostCursorTestWindow {
  __ghostCursorInstalled?: boolean;
  __ghostCursorMove?: (x: number, y: number) => Promise<void>;
  __ghostCursorRipple?: () => void;
}

describe('visualCursor', () => {
  describe('--visual-cursor CLI flag', () => {
    it('defaults to false', () => {
      const args = parseArguments('1.0.0', ['node', 'main.js'], {});
      assert.strictEqual(args.visualCursor, false);
    });

    it('parses --visual-cursor', () => {
      const args = parseArguments(
        '1.0.0',
        ['node', 'main.js', '--visual-cursor'],
        {},
      );
      assert.strictEqual(args.visualCursor, true);
    });
  });

  describe('--visual-cursor-duration CLI flag', () => {
    it('defaults to 800', () => {
      const args = parseArguments('1.0.0', ['node', 'main.js'], {});
      assert.strictEqual(args.visualCursorDuration, 800);
    });

    it('parses --visual-cursor-duration', () => {
      const args = parseArguments(
        '1.0.0',
        ['node', 'main.js', '--visual-cursor-duration', '500'],
        {},
      );
      assert.strictEqual(args.visualCursorDuration, 500);
    });
  });

  describe('injection script', () => {
    it('exposes the ghost cursor helpers on window', () => {
      const script = buildVisualCursorInjectionScript();
      assert.ok(script.includes('__ghostCursorInstalled'));
      assert.ok(script.includes('__ghostCursorMove'));
      assert.ok(script.includes('__ghostCursorRipple'));
    });

    it('renders a non-interactive cursor on top of the page', () => {
      const script = buildVisualCursorInjectionScript();
      assert.ok(script.includes('2147483647'));
      assert.ok(script.includes('pointerEvents'));
    });

    it('uses the default duration of 800ms', () => {
      assert.strictEqual(DEFAULT_VISUAL_CURSOR_DURATION_MS, 800);
      const script = buildVisualCursorInjectionScript();
      assert.ok(script.includes('800ms cubic-bezier(.33,.9,.25,1)'));
      // The fallback timeout in __ghostCursorMove is the duration plus a
      // small buffer.
      assert.ok(script.includes('setTimeout(finish, 800 + 50)'));
    });

    it('embeds a custom duration', () => {
      const script = buildVisualCursorInjectionScript(1200);
      assert.ok(script.includes('1200ms cubic-bezier(.33,.9,.25,1)'));
      assert.ok(script.includes('setTimeout(finish, 1200 + 50)'));
      assert.ok(!script.includes('800ms'));
    });

    it('embeds the blue cursor svg and ripple styles', () => {
      const script = buildVisualCursorInjectionScript();
      assert.ok(script.includes('1f6feb'));
      assert.ok(script.includes('scale(2.2)'));
    });
  });

  describe('ensureVisualCursor', () => {
    it('installs the cursor and is idempotent', async () => {
      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(html`<button>test</button>`);
        await ensureVisualCursor(page);
        await ensureVisualCursor(page);
        const state = await page.evaluate(() => {
          const win = window as unknown as GhostCursorTestWindow;
          return {
            installed: win.__ghostCursorInstalled === true,
            moveType: typeof win.__ghostCursorMove,
            rippleType: typeof win.__ghostCursorRipple,
            cursorCount: document.querySelectorAll('#__ghost-cursor').length,
          };
        });
        assert.deepStrictEqual(state, {
          installed: true,
          moveType: 'function',
          rippleType: 'function',
          cursorCount: 1,
        });
      });
    });

    it('re-installs the cursor after a navigation', async () => {
      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(html`<button>test</button>`);
        await ensureVisualCursor(page);
        // A real navigation creates a new document which re-runs the
        // injection script registered via evaluateOnNewDocument.
        await page.reload();
        const cursorCount = await page.evaluate(() => {
          return document.querySelectorAll('#__ghost-cursor').length;
        });
        assert.strictEqual(cursorCount, 1);
      });
    });
  });

  describe('animateCursorTo', () => {
    it('moves the cursor to the target coordinates and shows a ripple', async () => {
      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(html`<button>test</button>`);
        await animateCursorTo(page, 120, 130);
        const state = await page.evaluate(() => {
          const cursor = document.getElementById('__ghost-cursor');
          const ripples = [...document.querySelectorAll('div')].filter(el => {
            return el.style.borderRadius === '50%';
          });
          return {
            left: cursor?.style.left,
            top: cursor?.style.top,
            rippleCount: ripples.length,
          };
        });
        assert.deepStrictEqual(state, {
          left: '120px',
          top: '130px',
          rippleCount: 1,
        });
      });
    });

    it('applies a custom duration to the cursor transition', async () => {
      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(html`<button>test</button>`);
        await animateCursorTo(page, 50, 60, 100);
        const transition = await page.evaluate(() => {
          return document.getElementById('__ghost-cursor')?.style.transition;
        });
        // The browser normalizes the transition shorthand (e.g. adds leading
        // zeros), so only assert on the duration itself.
        assert.ok(transition?.includes('100ms'));
      });
    });

    it('silently degrades when the page is gone', async () => {
      await withMcpContext(async (_response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.close();
        // Must not throw even though the page is closed.
        await animateCursorTo(page, 10, 10);
      });
    });
  });

  describe('input tools integration', () => {
    it('click shows the cursor before clicking when the flag is on', async () => {
      const clickWithCursor = click({visualCursor: true} as ParsedArguments);
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(
          html`<button onclick="this.innerText = 'clicked';">test</button>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await clickWithCursor.handler(
          {
            params: {
              uid: '1_1',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked on the element',
        );
        assert.ok(await page.$('text/clicked'));
        assert.ok(await page.$('#__ghost-cursor'));
      });
    });

    it('click does not show the cursor when the flag is off', async () => {
      const clickWithoutCursor = click({} as ParsedArguments);
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(
          html`<button onclick="this.innerText = 'clicked';">test</button>`,
        );
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await clickWithoutCursor.handler(
          {
            params: {
              uid: '1_1',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked on the element',
        );
        assert.ok(await page.$('text/clicked'));
        assert.strictEqual(await page.$('#__ghost-cursor'), null);
      });
    });

    it('click_at shows the cursor at the target coordinates', async () => {
      const clickAtWithCursor = clickAt({
        visualCursor: true,
      } as ParsedArguments);
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await page.setContent(
          html`<button
            style="position: fixed; left: 100px; top: 100px; width: 50px; height: 50px;"
            onclick="this.innerText = 'clicked';"
          >
            test
          </button>`,
        );
        await clickAtWithCursor.handler(
          {
            params: {
              x: 110,
              y: 110,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked at the coordinates',
        );
        assert.ok(await page.$('text/clicked'));
        const position = await page.evaluate(() => {
          const cursor = document.getElementById('__ghost-cursor');
          return {left: cursor?.style.left, top: cursor?.style.top};
        });
        assert.deepStrictEqual(position, {left: '110px', top: '110px'});
      });
    });
  });
});
