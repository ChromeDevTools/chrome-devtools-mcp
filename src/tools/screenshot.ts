/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ElementHandle, Page} from '../third_party/index.js';
import {processImage} from '../utils/image-processor.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const screenshot = defineTool({
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
      .describe('Type of format to save the screenshot as. Default is "png"'),
    quality: zod
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        'Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.',
      ),
    maxWidth: zod
      .number()
      .optional()
      .describe(
        'Maximum width in pixels. Image will be resized (maintaining aspect ratio) if larger. Useful for token efficiency.',
      ),
    maxHeight: zod
      .number()
      .optional()
      .describe(
        'Maximum height in pixels. Image will be resized (maintaining aspect ratio) if larger. Useful for token efficiency.',
      ),
    uid: zod
      .string()
      .optional()
      .describe(
        'The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.',
      ),
    fullPage: zod
      .boolean()
      .optional()
      .describe(
        'If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.',
      ),
    filePath: zod
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

    const format = request.params.format;
    const quality = format === 'png' ? undefined : request.params.quality;

    let screenshotData = await pageOrHandle.screenshot({
      type: format,
      fullPage: request.params.fullPage,
      quality,
      optimizeForSpeed: true, // Bonus: optimize encoding for speed
    });

    let mimeType = `image/${format}`;

    // Apply image processing if resize options are specified
    if (request.params.maxWidth || request.params.maxHeight) {
      const processed = await processImage(screenshotData, mimeType, {
        maxWidth: request.params.maxWidth,
        maxHeight: request.params.maxHeight,
        format: format,
        quality: quality,
      });
      screenshotData = processed.data;
      mimeType = processed.mimeType;

      if (processed.compressionRatio < 1) {
        response.appendResponseLine(
          `Resized from ${processed.originalSize.width}x${processed.originalSize.height} to ${processed.processedSize.width}x${processed.processedSize.height} (${Math.round(processed.compressionRatio * 100)}% of original size).`,
        );
      }
    }

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
      const file = await context.saveFile(
        screenshotData,
        request.params.filePath,
      );
      response.appendResponseLine(`Saved screenshot to ${file.filename}.`);
    } else if (screenshotData.length >= 2_000_000) {
      const {filename} = await context.saveTemporaryFile(
        screenshotData,
        mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
      );
      response.appendResponseLine(`Saved screenshot to ${filename}.`);
    } else {
      response.attachImage({
        mimeType,
        data: Buffer.from(screenshotData).toString('base64'),
      });
    }
  },
});
