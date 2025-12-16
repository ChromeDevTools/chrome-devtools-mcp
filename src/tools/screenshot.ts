/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ElementHandle, Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Takes a full-page screenshot of an iframe's content by temporarily
 * expanding the iframe to show all scrollable content.
 */
async function takeIframeFullPageScreenshot(
  iframeHandle: ElementHandle<Element>,
  options: {type: 'png' | 'jpeg' | 'webp'; quality?: number},
): Promise<Uint8Array> {
  const contentFrame = await iframeHandle.contentFrame();
  if (!contentFrame) {
    throw new Error(
      'The specified element is not an iframe or its content is not accessible.',
    );
  }

  // Get the full scroll dimensions of the iframe content
  const {scrollWidth, scrollHeight} = await contentFrame.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });

  // Get the original iframe styles to restore later
  const originalIframeStyle = await iframeHandle.evaluate(el => {
    const iframe = el as HTMLIFrameElement;
    return {
      width: iframe.style.width,
      height: iframe.style.height,
      maxWidth: iframe.style.maxWidth,
      maxHeight: iframe.style.maxHeight,
      position: iframe.style.position,
    };
  });

  // Get the original iframe content styles to restore later
  const originalContentStyle = await contentFrame.evaluate(() => {
    return {
      htmlHeight: document.documentElement.style.height,
      htmlOverflow: document.documentElement.style.overflow,
      bodyHeight: document.body.style.height,
      bodyOverflow: document.body.style.overflow,
    };
  });

  try {
    // Temporarily expand the iframe to show all content
    // Setting position:absolute helps escape flex/grid layout constraints
    await iframeHandle.evaluate(
      (el, dims) => {
        const iframe = el as HTMLIFrameElement;
        iframe.style.width = `${dims.scrollWidth}px`;
        iframe.style.height = `${dims.scrollHeight}px`;
        iframe.style.maxWidth = 'none';
        iframe.style.maxHeight = 'none';
        iframe.style.position = 'absolute';
      },
      {scrollWidth, scrollHeight},
    );

    // Set overflow:visible on iframe content to allow content to expand
    await contentFrame.evaluate(dims => {
      document.documentElement.style.height = `${dims.scrollHeight}px`;
      document.documentElement.style.overflow = 'visible';
      document.body.style.height = `${dims.scrollHeight}px`;
      document.body.style.overflow = 'visible';
    }, {scrollHeight});

    // Scroll to top-left to ensure we capture from the beginning
    await contentFrame.evaluate(() => {
      window.scrollTo(0, 0);
    });

    // Small delay to allow the iframe to resize and render
    await new Promise(resolve => setTimeout(resolve, 150));

    // Take screenshot of the expanded iframe
    const screenshot = await iframeHandle.screenshot({
      type: options.type,
      quality: options.quality,
      optimizeForSpeed: true,
    });

    return screenshot;
  } finally {
    // Restore original iframe content styles
    await contentFrame.evaluate(style => {
      document.documentElement.style.height = style.htmlHeight;
      document.documentElement.style.overflow = style.htmlOverflow;
      document.body.style.height = style.bodyHeight;
      document.body.style.overflow = style.bodyOverflow;
    }, originalContentStyle);

    // Restore original iframe styles
    await iframeHandle.evaluate(
      (el, style) => {
        const iframe = el as HTMLIFrameElement;
        iframe.style.width = style.width;
        iframe.style.height = style.height;
        iframe.style.maxWidth = style.maxWidth;
        iframe.style.maxHeight = style.maxHeight;
        iframe.style.position = style.position;
      },
      originalIframeStyle,
    );
  }
}

/**
 * Finds the main content iframe on the page if one exists.
 * Returns the iframe element handle if found, null otherwise.
 */
async function findMainContentIframe(
  page: Page,
): Promise<ElementHandle<Element> | null> {
  // Look for iframes that take up a significant portion of the viewport
  const iframeHandle = await page.evaluateHandle(() => {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    if (iframes.length === 0) return null;

    // Find the largest iframe that has scrollable content
    let bestIframe: HTMLIFrameElement | null = null;
    let bestScore = 0;

    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i]!;
      try {
        const rect = iframe.getBoundingClientRect();
        const contentDoc = iframe.contentDocument;

        // Skip tiny iframes or iframes we can't access
        if (rect.width < 100 || rect.height < 100 || !contentDoc) continue;

        // Calculate score based on size and scrollable content
        const scrollHeight = contentDoc.documentElement.scrollHeight;
        const hasScrollableContent = scrollHeight > rect.height;
        const areaScore = rect.width * rect.height;
        const scrollScore = hasScrollableContent ? scrollHeight : 0;
        const score = areaScore + scrollScore * 100;

        if (score > bestScore) {
          bestScore = score;
          bestIframe = iframe;
        }
      } catch {
        // Skip iframes we can't access (cross-origin)
        continue;
      }
    }

    return bestIframe;
  });

  const iframeElement = iframeHandle.asElement();
  if (!iframeElement) {
    await iframeHandle.dispose();
    return null;
  }

  // Cast to the correct type
  const iframe = iframeElement as ElementHandle<Element>;

  // Verify the iframe has scrollable content
  const contentFrame = await iframe.contentFrame();
  if (!contentFrame) {
    await iframe.dispose();
    return null;
  }

  const {scrollHeight, clientHeight} = await contentFrame.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));

  // Only return if there's actually scrollable content
  if (scrollHeight > clientHeight) {
    return iframe;
  }

  await iframe.dispose();
  return null;
}

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
        'If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid unless iframeUid is also provided.',
      ),
    iframeUid: zod
      .string()
      .optional()
      .describe(
        'The uid of an iframe element. When used with fullPage=true, captures the full scrollable content of the iframe by temporarily expanding it.',
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.',
      ),
  },
  handler: async (request, response, context) => {
    const {uid, fullPage, iframeUid} = request.params;

    // Validate parameter combinations
    if (uid && fullPage && !iframeUid) {
      throw new Error('Providing both "uid" and "fullPage" is not allowed.');
    }
    if (uid && iframeUid) {
      throw new Error('Providing both "uid" and "iframeUid" is not allowed.');
    }
    if (iframeUid && !fullPage) {
      throw new Error(
        'iframeUid requires fullPage=true to capture the full iframe content.',
      );
    }

    const format = request.params.format;
    const quality = format === 'png' ? undefined : request.params.quality;

    let screenshot: Uint8Array;
    let responseMessage: string;

    if (iframeUid && fullPage) {
      // Full-page screenshot of iframe content (explicit iframe specified)
      const iframeHandle = await context.getElementByUid(iframeUid);
      try {
        screenshot = await takeIframeFullPageScreenshot(iframeHandle, {
          type: format,
          quality,
        });
        responseMessage = `Took a full-page screenshot of iframe with uid "${iframeUid}".`;
      } finally {
        void iframeHandle.dispose();
      }
    } else if (uid) {
      // Screenshot of a specific element
      const handle = await context.getElementByUid(uid);
      try {
        screenshot = await handle.screenshot({
          type: format,
          quality,
          optimizeForSpeed: true,
        });
        responseMessage = `Took a screenshot of node with uid "${uid}".`;
      } finally {
        void handle.dispose();
      }
    } else if (fullPage) {
      // Full-page screenshot - auto-detect iframe with scrollable content
      const page: Page = context.getSelectedPage();
      const mainIframe = await findMainContentIframe(page);

      if (mainIframe) {
        // Found an iframe with scrollable content - capture its full content
        try {
          screenshot = await takeIframeFullPageScreenshot(mainIframe, {
            type: format,
            quality,
          });
          responseMessage =
            'Took a full-page screenshot of the main content iframe.';
        } finally {
          void mainIframe.dispose();
        }
      } else {
        // No significant iframe found - take regular full page screenshot
        screenshot = await page.screenshot({
          type: format,
          fullPage: true,
          quality,
          optimizeForSpeed: true,
        });
        responseMessage = 'Took a screenshot of the full current page.';
      }
    } else {
      // Viewport screenshot
      const page: Page = context.getSelectedPage();
      screenshot = await page.screenshot({
        type: format,
        fullPage: false,
        quality,
        optimizeForSpeed: true,
      });
      responseMessage = "Took a screenshot of the current page's viewport.";
    }

    response.appendResponseLine(responseMessage);

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
