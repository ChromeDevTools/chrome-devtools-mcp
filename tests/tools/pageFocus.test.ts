/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import type {ParsedArguments} from '../../src/cli.js';
import {McpResponse} from '../../src/McpResponse.js';
import {clickAt, pressKey, typeText} from '../../src/tools/input.js';
import {html, withMcpContext} from '../utils.js';

const emptyArgs = {} as ParsedArguments;

describe('assertPageIsFocused', () => {
  describe('McpContext method', () => {
    it('passes for the only page in an isolated context', async () => {
      await withMcpContext(async (_response, context) => {
        const page = await context.newPage(false, 'ctx-a');
        assert.doesNotThrow(() => context.assertPageIsFocused(page));
      });
    });

    it('throws when a different page is focused in the same context', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA1 = await context.newPage(false, 'ctx-a');
        const pageA2 = await context.newPage(false, 'ctx-a');
        assert.doesNotThrow(() => context.assertPageIsFocused(pageA2));
        assert.throws(
          () => context.assertPageIsFocused(pageA1),
          (err: Error) => {
            assert.ok(err.message.includes('not the active page'));
            assert.ok(err.message.includes('Call select_page'));
            return true;
          },
        );
      });
    });

    it('passes after re-selecting the page', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA1 = await context.newPage(false, 'ctx-a');
        await context.newPage(false, 'ctx-a');
        assert.throws(() => context.assertPageIsFocused(pageA1));
        context.selectPage(pageA1);
        assert.doesNotThrow(() => context.assertPageIsFocused(pageA1));
      });
    });

    it('does not cross-context interfere', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA = await context.newPage(false, 'ctx-a');
        const pageB = await context.newPage(false, 'ctx-b');
        assert.doesNotThrow(() => context.assertPageIsFocused(pageA));
        assert.doesNotThrow(() => context.assertPageIsFocused(pageB));
      });
    });

    it('tracks focus independently per context', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA1 = await context.newPage(false, 'ctx-a');
        const pageA2 = await context.newPage(false, 'ctx-a');
        const pageB1 = await context.newPage(false, 'ctx-b');
        const pageB2 = await context.newPage(false, 'ctx-b');

        // Latest page in each context is focused.
        assert.doesNotThrow(() => context.assertPageIsFocused(pageA2));
        assert.doesNotThrow(() => context.assertPageIsFocused(pageB2));
        assert.throws(() => context.assertPageIsFocused(pageA1));
        assert.throws(() => context.assertPageIsFocused(pageB1));

        // Switch focus within each context independently.
        context.selectPage(pageA1);
        context.selectPage(pageB1);
        assert.doesNotThrow(() => context.assertPageIsFocused(pageA1));
        assert.doesNotThrow(() => context.assertPageIsFocused(pageB1));
        assert.throws(() => context.assertPageIsFocused(pageA2));
        assert.throws(() => context.assertPageIsFocused(pageB2));
      });
    });
  });

  describe('type_text', () => {
    it('throws when targeting a non-focused page', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA1 = await context.newPage(false, 'ctx-a');
        await pageA1.setContent(html`<textarea></textarea>`);
        await pageA1.click('textarea');
        await context.newPage(false, 'ctx-a');

        await assert.rejects(
          () =>
            typeText.handler(
              {params: {text: 'fail'}, page: pageA1},
              new McpResponse(emptyArgs),
              context,
            ),
          (err: Error) => {
            assert.ok(err.message.includes('not the active page'));
            return true;
          },
        );
      });
    });

    it('succeeds on the focused page', async () => {
      await withMcpContext(async (_response, context) => {
        const page = await context.newPage(false, 'ctx-a');
        await page.setContent(html`<textarea></textarea>`);
        await page.click('textarea');

        const response = new McpResponse(emptyArgs);
        await typeText.handler(
          {params: {text: 'hello'}, page},
          response,
          context,
        );
        assert.strictEqual(response.responseLines[0], 'Typed text "hello"');
        assert.strictEqual(
          await page.evaluate(() => document.querySelector('textarea')?.value),
          'hello',
        );
      });
    });

    it('succeeds after re-selecting the correct page', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA1 = await context.newPage(false, 'ctx-a');
        await pageA1.setContent(html`<textarea></textarea>`);
        await context.newPage(false, 'ctx-a');

        await assert.rejects(() =>
          typeText.handler(
            {params: {text: 'fail'}, page: pageA1},
            new McpResponse(emptyArgs),
            context,
          ),
        );

        context.selectPage(pageA1);
        await pageA1.click('textarea');

        const response = new McpResponse(emptyArgs);
        await typeText.handler(
          {params: {text: 'recovered'}, page: pageA1},
          response,
          context,
        );
        assert.strictEqual(response.responseLines[0], 'Typed text "recovered"');
      });
    });
  });

  describe('press_key', () => {
    it('throws when targeting a non-focused page', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA1 = await context.newPage(false, 'ctx-a');
        await pageA1.setContent(html`<div>content</div>`);
        await context.newPage(false, 'ctx-a');

        await assert.rejects(
          () =>
            pressKey.handler(
              {params: {key: 'Tab'}, page: pageA1},
              new McpResponse(emptyArgs),
              context,
            ),
          (err: Error) => {
            assert.ok(err.message.includes('not the active page'));
            return true;
          },
        );
      });
    });

    it('succeeds on the focused page', async () => {
      await withMcpContext(async (_response, context) => {
        const page = await context.newPage(false, 'ctx-a');
        await page.setContent(
          html`<script>
            logs = [];
            document.addEventListener('keydown', e => logs.push(e.key));
          </script>`,
        );

        const response = new McpResponse(emptyArgs);
        await pressKey.handler(
          {params: {key: 'Enter'}, page},
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully pressed key: Enter',
        );
        assert.deepStrictEqual(await page.evaluate('logs'), ['Enter']);
      });
    });
  });

  describe('click_at', () => {
    it('throws when targeting a non-focused page', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA1 = await context.newPage(false, 'ctx-a');
        await pageA1.setContent(
          html`<div style="width:100px;height:100px;background:red;"></div>`,
        );
        await context.newPage(false, 'ctx-a');

        await assert.rejects(
          () =>
            clickAt.handler(
              {params: {x: 50, y: 50}, page: pageA1},
              new McpResponse(emptyArgs),
              context,
            ),
          (err: Error) => {
            assert.ok(err.message.includes('not the active page'));
            return true;
          },
        );
      });
    });

    it('succeeds on the focused page', async () => {
      await withMcpContext(async (_response, context) => {
        const page = await context.newPage(false, 'ctx-a');
        await page.setContent(
          html`<div
            style="width:100px;height:100px;background:red;"
            onclick="this.innerText='clicked'"
          ></div>`,
        );

        const response = new McpResponse(emptyArgs);
        await clickAt.handler(
          {params: {x: 50, y: 50}, page},
          response,
          context,
        );
        assert.strictEqual(
          response.responseLines[0],
          'Successfully clicked at the coordinates',
        );
        assert.ok(await page.$('text/clicked'));
      });
    });
  });

  describe('cross-context isolation', () => {
    it('type_text in one context does not affect another', async () => {
      await withMcpContext(async (_response, context) => {
        const pageA = await context.newPage(false, 'ctx-a');
        await pageA.setContent(html`<textarea></textarea>`);

        const pageB = await context.newPage(false, 'ctx-b');
        await pageB.setContent(html`<textarea></textarea>`);

        context.selectPage(pageA);
        await pageA.click('textarea');
        await typeText.handler(
          {params: {text: 'agent-a'}, page: pageA},
          new McpResponse(emptyArgs),
          context,
        );

        context.selectPage(pageB);
        await pageB.click('textarea');
        await typeText.handler(
          {params: {text: 'agent-b'}, page: pageB},
          new McpResponse(emptyArgs),
          context,
        );

        assert.strictEqual(
          await pageA.evaluate(() => document.querySelector('textarea')?.value),
          'agent-a',
        );
        assert.strictEqual(
          await pageB.evaluate(() => document.querySelector('textarea')?.value),
          'agent-b',
        );
      });
    });

    it('switching focus in context A does not break context B', async () => {
      await withMcpContext(async (_response, context) => {
        await context.newPage(false, 'ctx-a');
        const pageA2 = await context.newPage(false, 'ctx-a');
        await pageA2.setContent(html`<div>A2</div>`);

        const pageB = await context.newPage(false, 'ctx-b');
        await pageB.setContent(html`<textarea></textarea>`);

        // ctx-a focus is on pageA2, ctx-b focus is on pageB.
        await pageB.click('textarea');
        const response = new McpResponse(emptyArgs);
        await typeText.handler(
          {params: {text: 'still works'}, page: pageB},
          response,
          context,
        );
        assert.strictEqual(
          await pageB.evaluate(() => document.querySelector('textarea')?.value),
          'still works',
        );
      });
    });
  });
});
