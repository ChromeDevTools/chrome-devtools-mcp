/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {McpResponse} from '../../src/McpResponse.js';
import {emulate} from '../../src/tools/emulation.js';
import {navigatePage, selectPage} from '../../src/tools/pages.js';
import {screenshot} from '../../src/tools/screenshot.js';
import {evaluateScript} from '../../src/tools/script.js';
import {takeSnapshot} from '../../src/tools/snapshot.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('pageId routing E2E', () => {
  const server = serverHooks();

  describe('basic pageId routing', () => {
    it('screenshot targets the correct page via pageId', async () => {
      server.addHtmlRoute('/page-a', html`<h1 id="marker">PAGE_A_CONTENT</h1>`);
      server.addHtmlRoute('/page-b', html`<h1 id="marker">PAGE_B_CONTENT</h1>`);

      await withMcpContext(async (_response, context) => {
        // Page 1: navigate to page-a
        const page1 = context.getSelectedMcpPage();
        await page1.pptrPage.goto(server.getRoute('/page-a'));

        // Page 2: navigate to page-b
        const page2 = await context.newPage();
        await page2.pptrPage.goto(server.getRoute('/page-b'));

        // Selected page is now page2 (newPage auto-selects)
        assert.strictEqual(context.getSelectedMcpPage().id, page2.id);

        // Take screenshot targeting page1 via pageId
        const resp1 = new McpResponse({} as ParsedArguments);
        resp1.setPage(page1);
        await screenshot.handler(
          {params: {format: 'png'}, page: page1},
          resp1,
          context,
        );

        // Take screenshot targeting page2 via pageId
        const resp2 = new McpResponse({} as ParsedArguments);
        resp2.setPage(page2);
        await screenshot.handler(
          {params: {format: 'png'}, page: page2},
          resp2,
          context,
        );

        // Both should have produced images
        assert.strictEqual(resp1.images.length, 1, 'page1 screenshot captured');
        assert.strictEqual(resp2.images.length, 1, 'page2 screenshot captured');

        // Screenshots should be different (different page content)
        assert.notStrictEqual(
          resp1.images[0]!.data,
          resp2.images[0]!.data,
          'screenshots from different pages should differ',
        );
      });
    });

    it('evaluate_script targets the correct page via pageId', async () => {
      server.addHtmlRoute('/eval-a', html`<h1 id="marker">EVAL_PAGE_A</h1>`);
      server.addHtmlRoute('/eval-b', html`<h1 id="marker">EVAL_PAGE_B</h1>`);

      await withMcpContext(async (_response, context) => {
        const page1 = context.getSelectedMcpPage();
        await page1.pptrPage.goto(server.getRoute('/eval-a'));

        const page2 = await context.newPage();
        await page2.pptrPage.goto(server.getRoute('/eval-b'));

        // Selected is page2, but evaluate on page1 via pageId
        const resp1 = new McpResponse({} as ParsedArguments);
        const evalTool = evaluateScript({} as ParsedArguments);
        await evalTool.handler(
          {
            params: {
              function: '() => document.querySelector("#marker").textContent',
              pageId: page1.id,
            },
          },
          resp1,
          context,
        );

        // Should get EVAL_PAGE_A (page1), not EVAL_PAGE_B (page2)
        const output = resp1.responseLines.join('\n');
        assert.ok(
          output.includes('EVAL_PAGE_A'),
          `Expected 'EVAL_PAGE_A' in output, got: ${output}`,
        );
        assert.ok(
          !output.includes('EVAL_PAGE_B'),
          `Should not contain 'EVAL_PAGE_B' in output`,
        );
      });
    });

    it('navigate_page targets the correct page via pageId', async () => {
      server.addHtmlRoute('/start', html`<h1>Start</h1>`);
      server.addHtmlRoute('/destination', html`<h1>Destination</h1>`);

      await withMcpContext(async (_response, context) => {
        const page1 = context.getSelectedMcpPage();
        await page1.pptrPage.goto(server.getRoute('/start'));

        const page2 = await context.newPage();
        await page2.pptrPage.goto(server.getRoute('/start'));

        // Navigate page1 to /destination while page2 is selected
        const resp = new McpResponse({} as ParsedArguments);
        resp.setPage(page1);
        await navigatePage.handler(
          {
            params: {
              type: 'url',
              url: server.getRoute('/destination'),
            },
            page: page1,
          },
          resp,
          context,
        );

        // page1 should be at /destination
        assert.ok(
          page1.pptrPage.url().includes('/destination'),
          `page1 should be at /destination, got: ${page1.pptrPage.url()}`,
        );

        // page2 should still be at /start (untouched)
        assert.ok(
          page2.pptrPage.url().includes('/start'),
          `page2 should still be at /start, got: ${page2.pptrPage.url()}`,
        );
      });
    });

    it('fallback to selected page when pageId is not provided', async () => {
      server.addHtmlRoute(
        '/fallback',
        html`<h1 id="marker">FALLBACK_CONTENT</h1>`,
      );

      await withMcpContext(async (_response, context) => {
        const page1 = context.getSelectedMcpPage();
        await page1.pptrPage.goto(server.getRoute('/fallback'));

        // No pageId — should use selected page (page1)
        const resp = new McpResponse({} as ParsedArguments);
        const evalTool = evaluateScript({} as ParsedArguments);
        await evalTool.handler(
          {
            params: {
              function: '() => document.querySelector("#marker").textContent',
            },
          },
          resp,
          context,
        );

        const output = resp.responseLines.join('\n');
        assert.ok(
          output.includes('FALLBACK_CONTENT'),
          `Expected 'FALLBACK_CONTENT' in output, got: ${output}`,
        );
      });
    });
  });

  describe('race condition simulation', () => {
    it('pageId prevents cross-page contamination during interleaved select_page calls', async () => {
      server.addHtmlRoute(
        '/agent-a',
        html`<h1 id="marker">AGENT_A_CONTENT</h1>`,
      );
      server.addHtmlRoute(
        '/agent-b',
        html`<h1 id="marker">AGENT_B_CONTENT</h1>`,
      );

      await withMcpContext(async (_response, context) => {
        const page1 = context.getSelectedMcpPage();
        await page1.pptrPage.goto(server.getRoute('/agent-a'));

        const page2 = await context.newPage();
        await page2.pptrPage.goto(server.getRoute('/agent-b'));

        // --- Simulate race condition ---
        // Agent A: select_page(page1)
        const respSelectA = new McpResponse({} as ParsedArguments);
        await selectPage.handler(
          {params: {pageId: page1.id}},
          respSelectA,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().id, page1.id);

        // Agent B: select_page(page2) — interrupts!
        const respSelectB = new McpResponse({} as ParsedArguments);
        await selectPage.handler(
          {params: {pageId: page2.id}},
          respSelectB,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().id, page2.id);

        // Agent A: take_screenshot(pageId: page1.id) — uses explicit pageId
        const respScreenshot = new McpResponse({} as ParsedArguments);
        respScreenshot.setPage(page1);
        await screenshot.handler(
          {params: {format: 'png'}, page: page1},
          respScreenshot,
          context,
        );

        // Agent A: evaluate_script(pageId: page1.id) — verify correct page
        const respEval = new McpResponse({} as ParsedArguments);
        const evalTool = evaluateScript({} as ParsedArguments);
        await evalTool.handler(
          {
            params: {
              function: '() => document.querySelector("#marker").textContent',
              pageId: page1.id,
            },
          },
          respEval,
          context,
        );

        const evalOutput = respEval.responseLines.join('\n');
        // Despite select_page(page2) happening in between,
        // the pageId-routed call should still get page1's content
        assert.ok(
          evalOutput.includes('AGENT_A_CONTENT'),
          `Expected 'AGENT_A_CONTENT' but got: ${evalOutput}`,
        );
        assert.ok(
          !evalOutput.includes('AGENT_B_CONTENT'),
          `Should NOT contain 'AGENT_B_CONTENT'`,
        );

        // Verify selected page is still page2 (Agent B's selection)
        assert.strictEqual(
          context.getSelectedMcpPage().id,
          page2.id,
          'Global selected page should still be page2',
        );
      });
    });

    it('snapshot targets the correct page via pageId during interleaved calls', async () => {
      server.addHtmlRoute(
        '/snap-a',
        html`<h1>Snapshot A Heading</h1><button>Button A</button>`,
      );
      server.addHtmlRoute(
        '/snap-b',
        html`<h1>Snapshot B Heading</h1><button>Button B</button>`,
      );

      await withMcpContext(async (_response, context) => {
        const page1 = context.getSelectedMcpPage();
        await page1.pptrPage.goto(server.getRoute('/snap-a'));

        const page2 = await context.newPage();
        await page2.pptrPage.goto(server.getRoute('/snap-b'));

        // Select page2 (simulate agent B hijacking selection)
        context.selectPage(page2);

        // Take snapshot on page1 via explicit page targeting
        const resp1 = new McpResponse({} as ParsedArguments);
        resp1.setPage(page1);
        await takeSnapshot.handler({params: {}, page: page1}, resp1, context);

        // Finalize snapshot
        const {content: content1} = await resp1.handle(
          'take_snapshot',
          context,
        );
        const text1 = content1
          .filter(c => c.type === 'text')
          .map(c => (c as {text: string}).text)
          .join('\n');

        // Should contain page1's content, not page2's
        assert.ok(
          text1.includes('Snapshot A Heading') || text1.includes('Button A'),
          `Snapshot should contain page1 content, got: ${text1.substring(0, 200)}`,
        );
      });
    });
  });

  describe('waitForEventsAfterAction page isolation', () => {
    it('uses the explicit page emulation settings for timeout calculation', async () => {
      server.addHtmlRoute(
        '/throttled',
        html`<h1>Throttled Page</h1><a href="/throttled">reload</a>`,
      );
      server.addHtmlRoute('/normal', html`<h1>Normal Page</h1>`);

      await withMcpContext(async (_response, context) => {
        const page1 = context.getSelectedMcpPage();
        await page1.pptrPage.goto(server.getRoute('/throttled'));

        const page2 = await context.newPage();
        await page2.pptrPage.goto(server.getRoute('/normal'));

        // Apply CPU throttling to page1 (4x slowdown)
        const emulateResp = new McpResponse({} as ParsedArguments);
        emulateResp.setPage(page1);
        await emulate.handler(
          {
            params: {cpuThrottlingRate: 4},
            page: page1,
          },
          emulateResp,
          context,
        );

        // Verify page1 has throttling, page2 doesn't
        assert.strictEqual(page1.cpuThrottlingRate, 4);
        assert.strictEqual(page2.cpuThrottlingRate, 1);

        // Select page2 (global state now points to normal page)
        context.selectPage(page2);
        assert.strictEqual(context.getSelectedMcpPage().id, page2.id);

        // Navigate page1 via explicit page — this calls waitForEventsAfterAction
        // with {page: page1}. Before our fix, it would have used page2's settings.
        const navResp = new McpResponse({} as ParsedArguments);
        navResp.setPage(page1);
        await navigatePage.handler(
          {
            params: {
              type: 'reload',
            },
            page: page1,
          },
          navResp,
          context,
        );

        // Navigation should succeed — page1 is still at /throttled
        assert.ok(
          page1.pptrPage.url().includes('/throttled'),
          `page1 should still be at /throttled after reload`,
        );

        // page2 should be untouched at /normal
        assert.ok(
          page2.pptrPage.url().includes('/normal'),
          `page2 should still be at /normal`,
        );

        // page1 should still have throttling applied
        assert.strictEqual(
          page1.cpuThrottlingRate,
          4,
          'page1 CPU throttling should persist after navigation',
        );
      });
    });

    it('different pages have independent emulation settings', async () => {
      server.addHtmlRoute('/emu-a', html`<h1>Emulation A</h1>`);
      server.addHtmlRoute('/emu-b', html`<h1>Emulation B</h1>`);

      await withMcpContext(async (_response, context) => {
        const page1 = context.getSelectedMcpPage();
        await page1.pptrPage.goto(server.getRoute('/emu-a'));

        const page2 = await context.newPage();
        await page2.pptrPage.goto(server.getRoute('/emu-b'));

        // Set network throttling on page1
        const resp1 = new McpResponse({} as ParsedArguments);
        resp1.setPage(page1);
        await emulate.handler(
          {
            params: {networkConditions: 'Slow 3G'},
            page: page1,
          },
          resp1,
          context,
        );

        // Set CPU throttling on page2
        const resp2 = new McpResponse({} as ParsedArguments);
        resp2.setPage(page2);
        await emulate.handler(
          {
            params: {cpuThrottlingRate: 8},
            page: page2,
          },
          resp2,
          context,
        );

        // Verify isolation
        assert.strictEqual(page1.networkConditions, 'Slow 3G');
        assert.strictEqual(page1.cpuThrottlingRate, 1); // default

        assert.strictEqual(page2.networkConditions, null); // default
        assert.strictEqual(page2.cpuThrottlingRate, 8);
      });
    });
  });
});
