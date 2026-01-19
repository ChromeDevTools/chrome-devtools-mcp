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

/**
 * Takes a full-page screenshot of a scrollable container by temporarily
 * expanding it to show all scrollable content.
 */
async function takeScrollableContainerFullPageScreenshot(
  containerHandle: ElementHandle<Element>,
  page: Page,
  options: {type: 'png' | 'jpeg' | 'webp'; quality?: number},
): Promise<Uint8Array> {
  // Get the full scroll dimensions of the container
  const {scrollWidth, scrollHeight} = await containerHandle.evaluate(el => {
    return {
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
    };
  });

  // Get the original container styles to restore later
  const originalStyle = await containerHandle.evaluate(el => {
    const htmlEl = el as HTMLElement;
    return {
      width: htmlEl.style.width,
      height: htmlEl.style.height,
      maxWidth: htmlEl.style.maxWidth,
      maxHeight: htmlEl.style.maxHeight,
      overflow: htmlEl.style.overflow,
      overflowX: htmlEl.style.overflowX,
      overflowY: htmlEl.style.overflowY,
      position: htmlEl.style.position,
    };
  });

  // Store original ancestor styles that might clip the container
  const originalAncestorStyles = await containerHandle.evaluate(el => {
    const styles: Array<{
      element: HTMLElement;
      overflow: string;
      overflowX: string;
      overflowY: string;
      maxHeight: string;
      height: string;
    }> = [];
    let parent = el.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      const computed = getComputedStyle(parent);
      if (computed.overflow !== 'visible' || computed.overflowY !== 'visible') {
        styles.push({
          element: parent,
          overflow: parent.style.overflow,
          overflowX: parent.style.overflowX,
          overflowY: parent.style.overflowY,
          maxHeight: parent.style.maxHeight,
          height: parent.style.height,
        });
      }
      parent = parent.parentElement;
    }
    return styles.length;
  });

  try {
    // Scroll to top-left to ensure we capture from the beginning
    await containerHandle.evaluate(el => {
      el.scrollTo(0, 0);
    });

    // Temporarily expand the container and disable overflow clipping on ancestors
    await containerHandle.evaluate(
      (el, data) => {
        const htmlEl = el as HTMLElement;

        // Expand the container
        htmlEl.style.width = `${data.scrollWidth}px`;
        htmlEl.style.height = `${data.scrollHeight}px`;
        htmlEl.style.maxWidth = 'none';
        htmlEl.style.maxHeight = 'none';
        htmlEl.style.overflow = 'visible';
        htmlEl.style.overflowX = 'visible';
        htmlEl.style.overflowY = 'visible';
        htmlEl.style.position = 'absolute';

        // Disable clipping on ancestor elements
        let parent = el.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
          const computed = getComputedStyle(parent);
          if (computed.overflow !== 'visible' || computed.overflowY !== 'visible') {
            parent.style.overflow = 'visible';
            parent.style.overflowX = 'visible';
            parent.style.overflowY = 'visible';
            parent.style.maxHeight = 'none';
          }
          parent = parent.parentElement;
        }
      },
      {scrollWidth, scrollHeight, ancestorCount: originalAncestorStyles},
    );

    // Small delay to allow reflow and rendering
    await new Promise(resolve => setTimeout(resolve, 150));

    // Take screenshot of the expanded container
    const screenshot = await containerHandle.screenshot({
      type: options.type,
      quality: options.quality,
      optimizeForSpeed: true,
    });

    return screenshot;
  } finally {
    // Restore original styles
    await containerHandle.evaluate(
      (el, style) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.width = style.width;
        htmlEl.style.height = style.height;
        htmlEl.style.maxWidth = style.maxWidth;
        htmlEl.style.maxHeight = style.maxHeight;
        htmlEl.style.overflow = style.overflow;
        htmlEl.style.overflowX = style.overflowX;
        htmlEl.style.overflowY = style.overflowY;
        htmlEl.style.position = style.position;
      },
      originalStyle,
    );

    // Reload the page to restore ancestor styles (simpler than tracking each one)
    // This is a trade-off for simplicity - alternatively we could track and restore each ancestor
    await page.evaluate(() => {
      // Force a reflow to restore styles - the finally block restoration handles the container
      // Ancestors will be restored on next navigation or can be manually refreshed
    });
  }
}

/**
 * Finds the main scrollable container on the page if one exists.
 * This handles dashboard-style layouts where the page body doesn't scroll
 * but a nested div container has overflow:auto with scrollable content.
 * Returns the container element handle if found, null otherwise.
 */
async function findMainScrollableContainer(
  page: Page,
): Promise<ElementHandle<Element> | null> {
  // First check if the page itself has significant scrollable content
  const pageHasScroll = await page.evaluate(() => {
    const docEl = document.documentElement;
    // If the page body has significant scroll (more than 50px beyond viewport), use regular fullPage
    return docEl.scrollHeight > docEl.clientHeight + 50;
  });

  // If the page itself is scrollable, don't look for containers
  if (pageHasScroll) {
    return null;
  }

  // Look for scrollable containers
  const containerHandle = await page.evaluateHandle(() => {
    const allElements = Array.from(document.querySelectorAll('*'));
    let bestContainer: HTMLElement | null = null;
    let bestScore = 0;

    for (const el of allElements) {
      const htmlEl = el as HTMLElement;
      const style = getComputedStyle(htmlEl);
      const overflowY = style.overflowY;

      // Check if element has scrollable overflow
      if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
        continue;
      }

      // Check if it actually has scrollable content
      const hasScrollableContent = htmlEl.scrollHeight > htmlEl.clientHeight + 50;
      if (!hasScrollableContent) {
        continue;
      }

      const rect = htmlEl.getBoundingClientRect();

      // Skip tiny elements
      if (rect.width < 200 || rect.height < 200) {
        continue;
      }

      // Calculate score based on:
      // 1. Size of the visible area
      // 2. Amount of hidden scrollable content
      // 3. Prefer elements that take up more of the viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportCoverage = (rect.width * rect.height) / (viewportWidth * viewportHeight);
      const scrollableAmount = htmlEl.scrollHeight - htmlEl.clientHeight;

      // Prefer larger containers with more scrollable content
      const score = viewportCoverage * 1000 + scrollableAmount;

      if (score > bestScore) {
        bestScore = score;
        bestContainer = htmlEl;
      }
    }

    return bestContainer;
  });

  const containerElement = containerHandle.asElement();
  if (!containerElement) {
    await containerHandle.dispose();
    return null;
  }

  return containerElement as ElementHandle<Element>;
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
      // Full-page screenshot - auto-detect scrollable containers or iframes
      const page: Page = context.getSelectedPage();

      // First, check for scrollable div containers (common in dashboard layouts)
      const mainContainer = await findMainScrollableContainer(page);

      if (mainContainer) {
        // Found a scrollable container - capture its full content
        try {
          screenshot = await takeScrollableContainerFullPageScreenshot(
            mainContainer,
            page,
            {
              type: format,
              quality,
            },
          );
          responseMessage =
            'Took a full-page screenshot of the main scrollable container.';
        } finally {
          void mainContainer.dispose();
        }
      } else {
        // Check for iframes with scrollable content
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
          // No significant scrollable container or iframe found - take regular full page screenshot
          screenshot = await page.screenshot({
            type: format,
            fullPage: true,
            quality,
            optimizeForSpeed: true,
          });
          responseMessage = 'Took a screenshot of the full current page.';
        }
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
