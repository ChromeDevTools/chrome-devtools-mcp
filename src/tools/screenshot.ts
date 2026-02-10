/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {writeFileSync} from 'fs';

import {captureScreenshot} from '../ax-tree.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, ResponseFormat, responseFormatSchema} from './ToolDefinition.js';

const ScreenshotOutputSchema = zod.object({
  success: zod.boolean(),
  type: zod.enum(['element', 'fullPage', 'viewport']),
  format: zod.enum(['png', 'jpeg', 'webp']),
  savedTo: zod.string().optional(),
  sizeBytes: zod.number().optional(),
  attached: zod.boolean().optional(),
});

export const screenshot = defineTool({
  name: 'take_screenshot',
  description: `Take a screenshot of the page or element.

Args:
  - format ('png'|'jpeg'|'webp'): Image format. Default: 'png'
  - quality (number): Compression quality for JPEG/WebP (0-100). Ignored for PNG
  - uid (string): Element uid to screenshot. Omit for full page/viewport
  - fullPage (boolean): Screenshot full page instead of viewport. Incompatible with uid
  - filePath (string): Save to file path instead of attaching inline
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, type, format, savedTo?, sizeBytes?, attached? }
  Markdown format: Description + inline image or file save confirmation

Examples:
  - "Screenshot viewport" -> {}
  - "Screenshot full page" -> { fullPage: true }
  - "Screenshot element" -> { uid: "abc123" }
  - "Save as JPEG" -> { format: "jpeg", quality: 80, filePath: "shot.jpg" }

Error Handling:
  - Throws if both uid and fullPage are provided
  - Auto-saves to file if image > 2MB`,
  timeoutMs: 45000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
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
        'If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.',
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.',
      ),
  },
  outputSchema: ScreenshotOutputSchema,
  handler: async (request, response) => {
    if (request.params.uid && request.params.fullPage) {
      throw new Error('Providing both "uid" and "fullPage" is not allowed.');
    }

    const format = request.params.format;
    const quality = format === 'png' ? undefined : request.params.quality;

    const data = await captureScreenshot({
      format,
      quality,
      uid: request.params.uid,
      fullPage: request.params.fullPage,
    });

    const type = request.params.uid ? 'element' : (request.params.fullPage ? 'fullPage' : 'viewport');
    let savedTo: string | undefined;
    let attached = false;

    if (request.params.filePath) {
      writeFileSync(request.params.filePath, data);
      savedTo = request.params.filePath;
    } else if (data.length >= 2_000_000) {
      const tmpPath = `screenshot-${Date.now()}.${format}`;
      writeFileSync(tmpPath, data);
      savedTo = tmpPath;
    } else {
      response.attachImage({
        mimeType: `image/${format}`,
        data: data.toString('base64'),
      });
      attached = true;
    }

    if (request.params.response_format === ResponseFormat.JSON) {
      const output = {
        success: true,
        type,
        format,
        ...(savedTo ? { savedTo } : {}),
        sizeBytes: data.length,
        attached,
      };
      response.appendResponseLine(JSON.stringify(output, null, 2));
      return;
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

    if (savedTo) {
      if (savedTo === request.params.filePath) {
        response.appendResponseLine(`Saved screenshot to ${savedTo}.`);
      } else {
        response.appendResponseLine(`Screenshot too large for inline (${(data.length / 1024 / 1024).toFixed(1)}MB). Saved to ${savedTo}.`);
      }
    } else {
      response.appendResponseLine('Screenshot attached inline.');
    }
  },
});
