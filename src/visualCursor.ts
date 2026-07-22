/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from './third_party/index.js';
import {logger} from './utils/logger.js';

/**
 * Blue arrow cursor shown on the page when the --visual-cursor flag is
 * enabled, so a human observer can follow where the agent interacts.
 */
export const CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path d="M5 3l14 9-6.5 1.2L9 19.5z" fill="#1f6feb" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

// Duration of the cursor slide animation in milliseconds. Kept in sync with
// the CSS transition inside VISUAL_CURSOR_INJECTION_SCRIPT.
export const CURSOR_MOVE_DURATION_MS = 350;

/**
 * Idempotent script injected into pages. It creates a fixed-position ghost
 * cursor element and exposes two helpers on `window`:
 * - `__ghostCursorMove(x, y)`: smoothly slides the cursor to the given
 *   viewport coordinates and resolves once the transition finished.
 * - `__ghostCursorRipple()`: shows an expanding ripple at the current cursor
 *   position to highlight the click point.
 */
export const VISUAL_CURSOR_INJECTION_SCRIPT = `(() => {
  if (window.__ghostCursorInstalled) {
    return;
  }
  window.__ghostCursorInstalled = true;

  const cursor = document.createElement('div');
  cursor.id = '__ghost-cursor';
  cursor.innerHTML = ${JSON.stringify(CURSOR_SVG)};
  Object.assign(cursor.style, {
    position: 'fixed',
    left: '80px',
    top: '200px',
    zIndex: '2147483647',
    pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))',
    transition:
      'left ${CURSOR_MOVE_DURATION_MS}ms cubic-bezier(.33,.9,.25,1), top ${CURSOR_MOVE_DURATION_MS}ms cubic-bezier(.33,.9,.25,1)',
  });
  // At document-start the DOM may not exist yet, so defer mounting until the
  // root element is available.
  const mountCursor = () => {
    if (!cursor.isConnected) {
      (document.body || document.documentElement).appendChild(cursor);
    }
  };
  if (document.documentElement) {
    mountCursor();
  } else {
    document.addEventListener('DOMContentLoaded', mountCursor, {once: true});
  }

  window.__ghostCursorPos = {x: 80, y: 200};

  window.__ghostCursorMove = (x, y) => {
    return new Promise(resolve => {
      window.__ghostCursorPos = {x, y};
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        cursor.removeEventListener('transitionend', onTransitionEnd);
        resolve();
      };
      const onTransitionEnd = () => {
        finish();
      };
      cursor.addEventListener('transitionend', onTransitionEnd);
      // Fallback in case the transition event never fires (e.g. the page is
      // hidden and transitions are throttled).
      setTimeout(finish, ${CURSOR_MOVE_DURATION_MS} + 50);
      cursor.style.left = x + 'px';
      cursor.style.top = y + 'px';
    });
  };

  window.__ghostCursorRipple = () => {
    const pos = window.__ghostCursorPos;
    const ripple = document.createElement('div');
    Object.assign(ripple.style, {
      position: 'fixed',
      left: pos.x - 16 + 'px',
      top: pos.y - 16 + 'px',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: '4px solid #1f6feb',
      background: 'rgba(31,111,235,.18)',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transform: 'scale(1)',
      opacity: '1',
      transition: 'transform 500ms ease-out, opacity 500ms ease-out',
    });
    (document.body || document.documentElement).appendChild(ripple);
    requestAnimationFrame(() => {
      ripple.style.transform = 'scale(2.2)';
      ripple.style.opacity = '0';
    });
    setTimeout(() => {
      ripple.remove();
    }, 500);
  };
})();`;

interface GhostCursorWindow {
  __ghostCursorMove?: (x: number, y: number) => Promise<void>;
  __ghostCursorRipple?: () => void;
}

// Tracks pages that already have the injection script registered via
// evaluateOnNewDocument, so it is only registered once per page.
const registeredPages = new WeakSet<Page>();

/**
 * Registers the ghost cursor injection script on the page so it is
 * re-installed after every navigation, and injects it into the current
 * document right away. Safe to call multiple times for the same page.
 */
export async function ensureVisualCursor(page: Page): Promise<void> {
  if (!registeredPages.has(page)) {
    await page.evaluateOnNewDocument(VISUAL_CURSOR_INJECTION_SCRIPT);
    registeredPages.add(page);
  }
  // The in-page script itself is idempotent, so re-evaluating it for the
  // current document is safe.
  await page.evaluate(VISUAL_CURSOR_INJECTION_SCRIPT);
}

/**
 * Slides the ghost cursor to the target coordinates, waits for the move to
 * finish and then shows a click ripple. Any failure (e.g. CSP restrictions,
 * a navigation in flight, a closed page) is swallowed so that the actual
 * input action is never affected.
 */
export async function animateCursorTo(
  page: Page,
  x: number,
  y: number,
): Promise<void> {
  try {
    await ensureVisualCursor(page);
    await page.evaluate(
      (targetX, targetY) => {
        return (window as unknown as GhostCursorWindow).__ghostCursorMove?.(
          targetX,
          targetY,
        );
      },
      x,
      y,
    );
    await page.evaluate(() => {
      (window as unknown as GhostCursorWindow).__ghostCursorRipple?.();
    });
  } catch (error) {
    logger?.('visual cursor animation failed', error);
  }
}
