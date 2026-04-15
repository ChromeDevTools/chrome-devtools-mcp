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

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {screenshot} from '../../src/tools/screenshot.js';
import {screenshots} from '../snapshot.js';
import {html, withMcpContext} from '../utils.js';

const screenshotTool = screenshot({} as ParsedArguments);

/**
 * Reads the pixel width from a PNG buffer's IHDR chunk (bytes 16..19).
 */
function pngWidth(data: Buffer): number {
  return data.readUInt32BE(16);
}

/**
 * Reads the pixel height from a PNG buffer's IHDR chunk (bytes 20..23).
 */
function pngHeight(data: Buffer): number {
  return data.readUInt32BE(20);
}

describe('screenshot', () => {
  describe('browser_take_screenshot', () => {
    it('with default options', async () => {
      await withMcpContext(async (response, context) => {
        const fixture = screenshots.basic;
        const page = context.getSelectedPptrPage();
        await page.setContent(fixture.html);
        await screenshotTool.handler(
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
        await screenshotTool.handler(
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
        await screenshotTool.handler(
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
        await screenshotTool.handler(
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
        await screenshotTool.handler(
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

        await screenshotTool.handler(
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
        await context.createTextSnapshot(context.getSelectedMcpPage());
        await screenshotTool.handler(
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
          await screenshotTool.handler(
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
              screenshotTool.handler(
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
              screenshotTool.handler(
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

    it('honors screenshotFormat default from CLI args', async () => {
      const tool = screenshot({
        screenshotFormat: 'jpeg',
      } as ParsedArguments);
      await withMcpContext(async (response, context) => {
        const fixture = screenshots.basic;
        const page = context.getSelectedPptrPage();
        await page.setContent(fixture.html);
        // No explicit format passed: zod should apply the CLI-driven default.
        await tool.handler(
          {
            params: {format: tool.schema.format.parse(undefined)},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/jpeg');
      });
    });

    it('keeps "png" as default format when no CLI override is set', async () => {
      const tool = screenshot({} as ParsedArguments);
      assert.equal(tool.schema.format.parse(undefined), 'png');
    });

    it('downscales viewport screenshot when screenshotMaxWidth is set', async () => {
      const tool = screenshot({
        screenshotMaxWidth: 100,
      } as ParsedArguments);
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setViewport({width: 800, height: 600});
        await page.setContent(
          html`<div style="width:100vw;height:100vh;background:red"></div>`,
        );

        await tool.handler(
          {params: {format: 'png'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        assert.equal(response.images.length, 1);
        const buf = Buffer.from(response.images[0].data, 'base64');
        assert.equal(pngWidth(buf), 100);
        // Aspect ratio preserved: 800x600 -> 100x75.
        assert.equal(pngHeight(buf), 75);
      });
    });

    it('downscales using the smaller scale when both max-width and max-height are set', async () => {
      const tool = screenshot({
        screenshotMaxWidth: 400,
        screenshotMaxHeight: 60,
      } as ParsedArguments);
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setViewport({width: 800, height: 600});
        await page.setContent(
          html`<div style="width:100vw;height:100vh"></div>`,
        );

        await tool.handler(
          {params: {format: 'png'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        const buf = Buffer.from(response.images[0].data, 'base64');
        // height bound dictates: 60/600 = 0.1 -> 80x60.
        assert.equal(pngHeight(buf), 60);
        assert.equal(pngWidth(buf), 80);
      });
    });

    it('does not resize when source is smaller than the max bounds', async () => {
      const tool = screenshot({
        screenshotMaxWidth: 4000,
        screenshotMaxHeight: 4000,
      } as ParsedArguments);
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setViewport({width: 800, height: 600});
        await page.setContent(html`<div></div>`);

        await tool.handler(
          {params: {format: 'png'}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        const buf = Buffer.from(response.images[0].data, 'base64');
        assert.equal(pngWidth(buf), 800);
        assert.equal(pngHeight(buf), 600);
      });
    });

    it('downscales full page screenshot when screenshotMaxWidth is set', async () => {
      const tool = screenshot({
        screenshotMaxWidth: 200,
      } as ParsedArguments);
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
        await page.setViewport({width: 800, height: 600});
        await page.setContent(
          html`<style>
              body {
                margin: 0;
              }</style
            ><div style="width:1000px;height:1500px;background:red"></div>`,
        );

        await tool.handler(
          {
            params: {format: 'png', fullPage: true},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const buf = Buffer.from(response.images[0].data, 'base64');
        // Source is at least 1000x1500; scale = 200/1000 = 0.2 -> ~200x300.
        // Allow ±2px to absorb sub-pixel rasterization rounding by Chrome.
        assert.equal(pngWidth(buf), 200);
        assert.ok(
          Math.abs(pngHeight(buf) - 300) <= 2,
          `expected height near 300, got ${pngHeight(buf)}`,
        );
      });
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
          screenshotTool.handler(
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
