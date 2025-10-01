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

import {screenshot} from '../../src/tools/screenshot.js';
import {screenshots} from '../snapshot.js';
import {withBrowser} from '../utils.js';

describe('screenshot', () => {
  describe('browser_take_screenshot', () => {
    it('with default options', async () => {
      await withBrowser(async (response, context) => {
        const fixture = screenshots.basic;
        const page = context.getSelectedPage();
        await page.setContent(fixture.html);
        await screenshot.handler({params: {format: 'png'}}, response, context);

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/png');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('with jpeg', async () => {
      await withBrowser(async (response, context) => {
        await screenshot.handler({params: {format: 'jpeg'}}, response, context);

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/jpeg');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('with webp', async () => {
      await withBrowser(async (response, context) => {
        await screenshot.handler({params: {format: 'webp'}}, response, context);

        assert.equal(response.images.length, 1);
        assert.equal(response.images[0].mimeType, 'image/webp');
        assert.equal(
          response.responseLines.at(0),
          "Took a screenshot of the current page's viewport.",
        );
      });
    });
    it('with full page', async () => {
      await withBrowser(async (response, context) => {
        const fixture = screenshots.viewportOverflow;
        const page = context.getSelectedPage();
        await page.setContent(fixture.html);
        await screenshot.handler(
          {params: {format: 'png', fullPage: true}},
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
      await withBrowser(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          `<div style="color:blue;">test</div>`.repeat(7_000),
        );
        await screenshot.handler(
          {params: {format: 'png', fullPage: true}},
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
      await withBrowser(async (response, context) => {
        const fixture = screenshots.button;

        const page = context.getSelectedPage();
        await page.setContent(fixture.html);
        await context.createTextSnapshot();
        await screenshot.handler(
          {
            params: {
              format: 'png',
              uid: '1_1',
            },
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
      await withBrowser(async (response, context) => {
        const filePath = join(tmpdir(), 'test-screenshot.png');
        try {
          const fixture = screenshots.basic;
          const page = context.getSelectedPage();
          await page.setContent(fixture.html);
          await screenshot.handler(
            {params: {format: 'png', filePath}},
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
          await withBrowser(async (response, context) => {
            const fixture = screenshots.basic;
            const page = context.getSelectedPage();
            await page.setContent(fixture.html);
            await assert.rejects(
              screenshot.handler(
                {params: {format: 'png', filePath}},
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
          await withBrowser(async (response, context) => {
            const fixture = screenshots.basic;
            const page = context.getSelectedPage();
            await page.setContent(fixture.html);
            await assert.rejects(
              screenshot.handler(
                {params: {format: 'png', filePath}},
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
      await withBrowser(async (response, context) => {
        // Use a platform-specific invalid character.
        // On Windows, characters like '<', '>', ':', '"', '/', '\', '|', '?', '*' are invalid.
        // On POSIX, the null byte is invalid.
        const invalidChar = process.platform === 'win32' ? '>' : '\0';
        const filePath = `malformed${invalidChar}path.png`;
        const fixture = screenshots.basic;
        const page = context.getSelectedPage();
        await page.setContent(fixture.html);
        await assert.rejects(
          screenshot.handler(
            {params: {format: 'png', filePath}},
            response,
            context,
          ),
        );
      });
    });
  });
});
