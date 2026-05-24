/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {rm, stat, mkdir, chmod, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import {TextSnapshot} from '../../src/TextSnapshot.js';
import type {Page} from '../../src/third_party/index.js';
import {screenshot} from '../../src/tools/screenshot.js';
import {screenshots} from '../snapshot.js';
import {html, withMcpContext} from '../utils.js';

async function getScreenshotPixel(
  page: Page,
  image: string | Uint8Array,
  x: number,
  y: number,
) {
  const data =
    typeof image === 'string' ? image : Buffer.from(image).toString('base64');
  return await page.evaluate(
    async ({data, x, y}) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not read screenshot pixels.');
      }

      context.drawImage(image, 0, 0);
      const pixel = context.getImageData(x, y, 1, 1).data;
      return {
        red: pixel[0],
        green: pixel[1],
        blue: pixel[2],
        alpha: pixel[3],
      };
    },
    {data, x, y},
  );
}

describe('screenshot', () => {
  describe('browser_take_screenshot', () => {
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

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/png');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('ignores quality', async () => {
      await withMcpContext(async (response, context) => {
        const fixture = screenshots.basic;
        const page = context.getSelectedPptrPage();
        await page.setContent(fixture.html);
        await screenshot.handler(
          {
            params: {format: 'png', quality: 0},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/png');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('with jpeg', async () => {
      await withMcpContext(async (response, context) => {
        await screenshot.handler(
          {params: {format: 'jpeg'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/jpeg');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('with webp', async () => {
      await withMcpContext(async (response, context) => {
        await screenshot.handler(
          {params: {format: 'webp'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/webp');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('with full page', async () => {
      await withMcpContext(async (response, context) => {
        const fixture = screenshots.viewportOverflow;
        const page = context.getSelectedPptrPage();
        await page.setContent(fixture.html);
        await screenshot.handler(
          {
            params: {format: 'png', fullPage: true},
            page: context.getSelectedMcpPage(),
          },
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

    it('preserves the visible background behind transparent canvas content', async () => {
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
              background: transparent;
              height: 100%;
              margin: 0;
              width: 100%;
            }

            canvas {
              display: block;
              height: 80px;
              width: 80px;
            }
          </style>
          <canvas
            width="80"
            height="80"
          ></canvas>
        `);
        const defaultScreenshot = await page.screenshot({
          type: 'png',
          optimizeForSpeed: true,
        });
        const defaultPixel = await getScreenshotPixel(
          page,
          defaultScreenshot,
          10,
          10,
        );

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
          {params: {format: 'png'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        const pixel = await getScreenshotPixel(
          page,
          response.images[0].data,
          10,
          10,
        );
        assert.deepEqual(pixel, {
          red: 12,
          green: 34,
          blue: 56,
          alpha: 255,
        });
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

        await page.setContent(html`
          <style>
            html,
            body {
              background: transparent;
              height: 100%;
              margin: 0;
              width: 100%;
            }

            canvas {
              display: block;
              height: 80px;
              width: 80px;
            }
          </style>
          <canvas
            width="80"
            height="80"
          ></canvas>
        `);
        const resetScreenshot = await page.screenshot({
          type: 'png',
          optimizeForSpeed: true,
        });
        const resetPixel = await getScreenshotPixel(
          page,
          resetScreenshot,
          10,
          10,
        );
        assert.deepEqual(resetPixel, defaultPixel);
      });
    });

    it('with full page resulting in a large screenshot', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();

        await page.setContent(
          html`${`<div style="color:blue;">test</div>`.repeat(6500)}
            <div
              id="red"
              style="color:blue;"
              >test</div
            > `,
        );
        await page.evaluate(() => {
          const el = document.querySelector('#red');
          return el?.scrollIntoViewIfNeeded();
        });

        await screenshot.handler(
          {
            params: {format: 'png', fullPage: true},
            page: context.getSelectedMcpPage(),
          },
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
      await withMcpContext(async (response, context) => {
        const fixture = screenshots.button;

        const page = context.getSelectedPptrPage();
        await page.setContent(fixture.html);
        context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
          context.getSelectedMcpPage(),
        );
        await screenshot.handler(
          {
            params: {
              format: 'png',
              uid: '1_1',
            },
            page: context.getSelectedMcpPage(),
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

    it('with filePath', async () => {
      await withMcpContext(async (response, context) => {
        const filePath = join(tmpdir(), 'test-screenshot.png');
        try {
          const fixture = screenshots.basic;
          const page = context.getSelectedPptrPage();
          await page.setContent(fixture.html);
          await screenshot.handler(
            {
              params: {format: 'png', filePath},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          );

          assert.equal(response.images.length, 0);
          assert.equal(
            response.responseLines.at(0),
            "Took a screenshot of the current page's viewport.",
          );
          assert.equal(
            response.responseLines.at(1),
            `Saved screenshot to ${filePath}.`,
          );

          const stats = await stat(filePath);
          assert.ok(stats.isFile());
          assert.ok(stats.size > 0);
        } finally {
          await rm(filePath, {force: true});
        }
      });
    });

    it('with unwritable filePath', async () => {
      if (process.platform === 'win32') {
        const filePath = join(
          tmpdir(),
          'readonly-file-for-screenshot-test.png',
        );
        // Create the file and make it read-only.
        await writeFile(filePath, '');
        await chmod(filePath, 0o400);

        try {
          await withMcpContext(async (response, context) => {
            const fixture = screenshots.basic;
            const page = context.getSelectedPptrPage();
            await page.setContent(fixture.html);
            await assert.rejects(
              screenshot.handler(
                {
                  params: {format: 'png', filePath},
                  page: context.getSelectedMcpPage(),
                },
                response,
                context,
              ),
            );
          });
        } finally {
          // Make the file writable again so it can be deleted.
          await chmod(filePath, 0o600);
          await rm(filePath, {force: true});
        }
      } else {
        const dir = join(tmpdir(), 'readonly-dir-for-screenshot-test');
        await mkdir(dir, {recursive: true});
        await chmod(dir, 0o500);
        const filePath = join(dir, 'test-screenshot.png');

        try {
          await withMcpContext(async (response, context) => {
            const fixture = screenshots.basic;
            const page = context.getSelectedPptrPage();
            await page.setContent(fixture.html);
            await assert.rejects(
              screenshot.handler(
                {
                  params: {format: 'png', filePath},
                  page: context.getSelectedMcpPage(),
                },
                response,
                context,
              ),
            );
          });
        } finally {
          await chmod(dir, 0o700);
          await rm(dir, {recursive: true, force: true});
        }
      }
    });

    it('with malformed filePath', async () => {
      await withMcpContext(async (response, context) => {
        // Use a platform-specific invalid character.
        // On Windows, characters like '<', '>', ':', '"', '/', '\', '|', '?', '*' are invalid.
        // On POSIX, the null byte is invalid.
        const invalidChar = process.platform === 'win32' ? '>' : '\0';
        const filePath = `malformed${invalidChar}path.png`;
        const fixture = screenshots.basic;
        const page = context.getSelectedPptrPage();
        await page.setContent(fixture.html);
        await assert.rejects(
          screenshot.handler(
            {
              params: {format: 'png', filePath},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
        );
      });
    });
  });
});
