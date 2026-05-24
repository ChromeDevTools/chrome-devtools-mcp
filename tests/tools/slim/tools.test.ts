/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

import {evaluate, navigate, screenshot} from '../../../src/tools/slim/tools.js';
import {screenshots} from '../../snapshot.js';
import {html, withMcpContext} from '../../utils.js';

describe('slim', () => {
  it('evaluates', async t => {
    await withMcpContext(async (response, context) => {
      await evaluate.handler(
        {
          params: {
            script: `2 * 5`,
          },
          page: context.getSelectedMcpPage(),
        },
        response,
        context,
      );
      t.assert.snapshot?.(response.responseLines.join('\n'));
    });
  });

  it('handles errors', async t => {
    await withMcpContext(async (response, context) => {
      await evaluate.handler(
        {
          params: {
            script: `throw new Error('test error')`,
          },
          page: context.getSelectedMcpPage(),
        },
        response,
        context,
      );
      t.assert.snapshot?.(response.responseLines.join('\n'));
    });
  });

  it('navigates to correct page', async t => {
    await withMcpContext(async (response, context) => {
      await navigate.handler(
        {
          params: {url: 'data:text/html,<div>Hello MCP</div>'},
          page: context.getSelectedMcpPage(),
        },
        response,
        context,
      );
      const page = context.getSelectedPptrPage();
      assert.equal(
        await page.evaluate(() => document.querySelector('div')?.textContent),
        'Hello MCP',
      );
      assert(!response.includePages);
      t.assert.snapshot?.(response.responseLines.join('\n'));
    });
  });

  it('with default options', async () => {
    await withMcpContext(async (response, context) => {
      const fixture = screenshots.basic;
      const page = context.getSelectedPptrPage();
      await page.setContent(fixture.html);
      await screenshot.handler(
        {params: {format: 'png'}, page: context.getSelectedMcpPage()},
        response,
        context,
      );
      assert(path.isAbsolute(response.responseLines.at(0)!));
      assert(fs.existsSync(response.responseLines.at(0)!));
    });
  });

  it('sets and resets the visible page background for screenshots', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPptrPage();
      const backgroundOverrides: unknown[] = [];
      const originalCreateCDPSession = page.createCDPSession.bind(page);
      page.createCDPSession = async () => {
        const session = await originalCreateCDPSession();
        const originalSend = session.send.bind(session);
        const sendWithTracking: typeof session.send = async (
          method,
          params,
          options,
        ) => {
          if (method === 'Emulation.setDefaultBackgroundColorOverride') {
            backgroundOverrides.push(params ?? {});
          }
          return await originalSend(method, params, options);
        };
        Object.defineProperty(session, 'send', {value: sendWithTracking});
        return session;
      };
      await page.setContent(html`
        <style>
          html,
          body {
            height: 100%;
            margin: 0;
            width: 100%;
          }

          #container {
            background: rgb(12, 34, 56);
            height: 120px;
            width: 120px;
          }

          canvas {
            display: block;
            height: 120px;
            width: 120px;
          }
        </style>
        <div id="container">
          <canvas
            width="120"
            height="120"
          ></canvas>
        </div>
      `);

      await screenshot.handler(
        {params: {}, page: context.getSelectedMcpPage()},
        response,
        context,
      );

      assert(path.isAbsolute(response.responseLines.at(0)!));
      assert(fs.existsSync(response.responseLines.at(0)!));
      assert.deepEqual(backgroundOverrides, [
        {
          color: {
            r: 12,
            g: 34,
            b: 56,
            a: 1,
          },
        },
        {},
      ]);
    });
  });
});
