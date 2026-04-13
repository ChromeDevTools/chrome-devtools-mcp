/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ElementHandle, Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const screenshot = definePageTool({
  name: 'take_screenshot',
  description: `Take a screenshot of the page or element.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    // Not read-only due to filePath param.
    readOnlyHint: false,
  },
  schema: {
    format: zod
      .enum(['png', 'jpeg', 'webp'])
      .default('png')
      .describe('Type of format to save the screenshot as. If omitted: "png"'),
    quality: zod
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        'Compression quality for (0-100). Higher values means better quality but larger sizes. Ignored for PNG format.',
      ),
    uid: zod
      .string()
      .optional()
      .describe('Element UID from snapshot. If omitted: takes page screenshot'),
    fullPage: zod
      .boolean()
      .optional()
      .describe(
        'Takes a screenshot of the entire page instead of the currently visible viewport. Incompatible with uid.',
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'Path to save the screenshot to instead of attaching it to the response',
      ),
  },
  handler: async (request, response, context) => {
    if (request.params.uid && request.params.fullPage) {
      throw new Error('Providing both "uid" and "fullPage" is not allowed');
    }

    let pageOrHandle: Page | ElementHandle;
    if (request.params.uid) {
      pageOrHandle = await request.page.getElementByUid(request.params.uid);
    } else {
      pageOrHandle = request.page.pptrPage;
    }

    const format = request.params.format;
    const quality = format === 'png' ? undefined : request.params.quality;

    const screenshot = await pageOrHandle.screenshot({
      type: format,
      fullPage: request.params.fullPage,
      quality,
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
      const {filepath} = await context.saveTemporaryFile(
        screenshot,
        `screenshot.${request.params.format}`,
      );
      response.appendResponseLine(`Saved screenshot to ${filepath}.`);
    } else {
      response.attachImage({
        mimeType: `image/${request.params.format}`,
        data: Buffer.from(screenshot).toString('base64'),
      });
    }
  },
});
