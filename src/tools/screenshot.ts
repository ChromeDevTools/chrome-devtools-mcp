/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {
  BoundingBox,
  ElementHandle,
  Page,
  ScreenshotClip,
} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

function isScreenshotFormat(value: unknown): value is ScreenshotFormat {
  return value === 'png' || value === 'jpeg' || value === 'webp';
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

async function getSourceBox(
  page: Page,
  element: ElementHandle | undefined,
  fullPage: boolean,
): Promise<BoundingBox | undefined> {
  if (element) {
    const box = await element.boundingBox();
    return box ?? undefined;
  }
  if (fullPage) {
    const dims = await page.evaluate(() => ({
      width: Math.max(
        document.documentElement.scrollWidth,
        document.body?.scrollWidth ?? 0,
      ),
      height: Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      ),
    }));
    if (dims.width <= 0 || dims.height <= 0) {
      return undefined;
    }
    return {x: 0, y: 0, width: dims.width, height: dims.height};
  }
  const viewport = page.viewport();
  if (!viewport) {
    return undefined;
  }
  return {x: 0, y: 0, width: viewport.width, height: viewport.height};
}

function computeDownscaleClip(
  box: BoundingBox,
  maxWidth: number | undefined,
  maxHeight: number | undefined,
): ScreenshotClip | undefined {
  const widthScale = isPositiveFiniteNumber(maxWidth)
    ? Math.min(1, maxWidth / box.width)
    : 1;
  const heightScale = isPositiveFiniteNumber(maxHeight)
    ? Math.min(1, maxHeight / box.height)
    : 1;
  const scale = Math.min(widthScale, heightScale);
  if (scale >= 1) {
    return undefined;
  }
  // Skip degenerate sub-pixel results.
  if (Math.round(box.width * scale) < 1 || Math.round(box.height * scale) < 1) {
    return undefined;
  }
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    scale,
  };
}

export const screenshot = definePageTool(args => {
  const {
    screenshotFormat,
    screenshotQuality,
    screenshotMaxWidth,
    screenshotMaxHeight,
  } = args ?? {};

  const defaultFormat: ScreenshotFormat = isScreenshotFormat(screenshotFormat)
    ? screenshotFormat
    : 'png';
  const defaultQuality = isPositiveFiniteNumber(screenshotQuality)
    ? screenshotQuality
    : undefined;
  const maxWidth = isPositiveFiniteNumber(screenshotMaxWidth)
    ? screenshotMaxWidth
    : undefined;
  const maxHeight = isPositiveFiniteNumber(screenshotMaxHeight)
    ? screenshotMaxHeight
    : undefined;

  return {
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
        .default(defaultFormat)
        .describe(
          `Type of format to save the screenshot as. Default is "${defaultFormat}"`,
        ),
      quality: zod
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe(
          'Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.',
        ),
      uid: zod
        .string()
        .optional()
        .describe(
          'The uid of an element on the page from the page content snapshot. If omitted, takes a page screenshot.',
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

      const page = request.page.pptrPage;
      const element = request.params.uid
        ? await request.page.getElementByUid(request.params.uid)
        : undefined;

      const format = request.params.format;
      const quality =
        format === 'png'
          ? undefined
          : (request.params.quality ?? defaultQuality);
      const fullPage = request.params.fullPage ?? false;

      // Compute downscale clip when maxWidth/maxHeight is set and the source
      // exceeds either bound. The smaller scale factor wins so both bounds
      // are respected while preserving aspect ratio.
      let clip: ScreenshotClip | undefined;
      if (maxWidth !== undefined || maxHeight !== undefined) {
        const box = await getSourceBox(page, element, fullPage);
        if (box) {
          clip = computeDownscaleClip(box, maxWidth, maxHeight);
        }
      }

      let screenshot: Uint8Array;
      if (clip) {
        // page.screenshot with clip lets the CDP scale param downscale the
        // capture for viewport, full-page and element shots alike. We rely on
        // Puppeteer's default of captureBeyondViewport=true when a clip is
        // present so element/full-page captures below the fold still work.
        screenshot = await page.screenshot({
          type: format,
          quality,
          optimizeForSpeed: true,
          clip,
        });
      } else if (element) {
        screenshot = await element.screenshot({
          type: format,
          quality,
          optimizeForSpeed: true,
        });
      } else {
        screenshot = await page.screenshot({
          type: format,
          fullPage,
          quality,
          optimizeForSpeed: true,
        });
      }

      if (request.params.uid) {
        response.appendResponseLine(
          `Took a screenshot of node with uid "${request.params.uid}".`,
        );
      } else if (fullPage) {
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
          screenshot,
          request.params.filePath,
        );
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
  };
});
