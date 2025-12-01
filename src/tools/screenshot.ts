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
  description: 'Take screenshot of page or element.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    format: z.enum(['png', 'jpeg']).default('png').describe('Image format'),
    uid: z.string().optional().describe('Element uid (optional)'),
    fullPage: z.boolean().optional().describe('Full page screenshot'),
  },
  handler: async (request, response, context) => {
    if (request.params.uid && request.params.fullPage) {
      throw new Error('Cannot use both uid and fullPage');
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
    });

    response.appendResponseLine('Screenshot taken');

    if (screenshot.length >= 2_000_000) {
      const {filename} = await context.saveTemporaryFile(
        screenshot,
        `image/${request.params.format}`,
      );
      response.appendResponseLine(`Saved: ${filename}`);
    } else {
      response.attachImage({
        mimeType: `image/${request.params.format}`,
        data: Buffer.from(screenshot).toString('base64'),
      });
    }
  },
});
