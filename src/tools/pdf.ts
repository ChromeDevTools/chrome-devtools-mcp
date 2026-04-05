/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const savePdf = defineTool({
  name: 'save_pdf',
  description: 'Save the currently selected page as a PDF file.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    filePath: zod
      .string()
      .describe('Absolute path or relative path to save the PDF to.'),
    format: zod
      .enum(['A4', 'Letter', 'Legal', 'Tabloid'])
      .optional()
      .describe('Page format. Defaults to A4.'),
    landscape: zod
      .boolean()
      .optional()
      .describe('Whether to print in landscape. Defaults to false.'),
    printBackground: zod
      .boolean()
      .optional()
      .describe(
        'Whether to print background graphics. Defaults to true.',
      ),
    scale: zod
      .number()
      .optional()
      .describe('Scale of the page rendering. Defaults to 1.'),
    margin: zod
      .object({
        top: zod.string().optional(),
        right: zod.string().optional(),
        bottom: zod.string().optional(),
        left: zod.string().optional(),
      })
      .optional()
      .describe('Margins in CSS units (e.g. "1cm", "20px").'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pdfBuffer = await page.pdf({
      path: request.params.filePath,
      format: request.params.format ?? 'A4',
      landscape: request.params.landscape ?? false,
      printBackground: request.params.printBackground ?? true,
      scale: request.params.scale ?? 1,
      margin: request.params.margin,
    });
    response.appendResponseLine(
      `PDF saved to ${request.params.filePath} (${pdfBuffer.length} bytes).`,
    );
  },
});
