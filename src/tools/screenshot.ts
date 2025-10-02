/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ElementHandle, Page} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const screenshot = defineTool({
  name: 'take_screenshot',
  description: `Take a screenshot of the page or element.`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    format: z
      .enum(['png', 'jpeg', 'webp'])
      .default('png')
      .describe('Type of format to save the screenshot as. Default is "png"'),
    quality: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        'Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.',
      ),
    uid: z
      .string()
      .optional()
      .describe(
        'The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.',
      ),
    fullPage: z
      .boolean()
      .optional()
      .describe(
        'If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.',
      ),
    filePath: z
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.',
      ),
  },
  handler: async (request, response, context) => {
    if (request.params.uid && request.params.fullPage) {
      throw new Error('Providing both "uid" and "fullPage" is not allowed.');
    }

    let pageOrHandle: Page | ElementHandle;
    if (request.params.uid) {
      pageOrHandle = await context.getElementByUid(request.params.uid);
    } else {
      pageOrHandle = context.getSelectedPage();
    }

    const screenshot = await pageOrHandle.screenshot({
      type: request.params.format,
      fullPage: request.params.fullPage,
      quality: request.params.quality,
      optimizeForSpeed: true, // Bonus: optimize encoding for speed
    });

    if (request.params.uid) {
      response.appendResponseLine(
        `Took a screenshot of node with uid "${request.params.uid}".`,
      );
    } else if (request.params.fullPage) {
      response.appendResponseLine(
        'Took a screenshot of the full current page.',
      );
    } else {
      response.appendResponseLine(
        "Took a screenshot of the current page's viewport.",
      );
    }

    if (request.params.filePath) {
      const file = await context.saveFile(screenshot, request.params.filePath);
      response.appendResponseLine(`Saved screenshot to ${file.filename}.`);
    } else if (screenshot.length >= 2_000_000) {
      const {filename} = await context.saveTemporaryFile(
        screenshot,
        `image/${request.params.format}`,
      );
      response.appendResponseLine(`Saved screenshot to ${filename}.`);
    } else {
      response.attachImage({
        mimeType: `image/${request.params.format}`,
        data: Buffer.from(screenshot).toString('base64'),
      });
    }
  },
});
