/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ElementHandle} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const click = defineTool({
  name: 'click',
  description: 'Click on element by uid.',
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: z.string().describe('Element uid'),
    dblClick: z.boolean().optional().describe('Double click'),
  },
  handler: async (request, response, context) => {
    const uid = request.params.uid;
    const handle = await context.getElementByUid(uid);
    try {
      await context.waitForEventsAfterAction(async () => {
        await handle.asLocator().click({
          count: request.params.dblClick ? 2 : 1,
        });
      });
      response.appendResponseLine('Clicked');
      response.setIncludeSnapshot(true);
    } finally {
      void handle.dispose();
    }
  },
});

export const hover = defineTool({
  name: 'hover',
  description: 'Hover over element by uid.',
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: z.string().describe('Element uid'),
  },
  handler: async (request, response, context) => {
    const uid = request.params.uid;
    const handle = await context.getElementByUid(uid);
    try {
      await context.waitForEventsAfterAction(async () => {
        await handle.asLocator().hover();
      });
      response.appendResponseLine('Hovered');
      response.setIncludeSnapshot(true);
    } finally {
      void handle.dispose();
    }
  },
});

export const fill = defineTool({
  name: 'fill',
  description: 'Fill input, textarea, or select element.',
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: z.string().describe('Element uid'),
    value: z.string().describe('Value to fill'),
  },
  handler: async (request, response, context) => {
    const handle = await context.getElementByUid(request.params.uid);
    try {
      await context.waitForEventsAfterAction(async () => {
        await handle.asLocator().fill(request.params.value);
      });
      response.appendResponseLine('Filled');
      response.setIncludeSnapshot(true);
    } finally {
      void handle.dispose();
    }
  },
});

export const drag = defineTool({
  name: 'drag',
  description: 'Drag element to another element.',
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    from_uid: z.string().describe('Source element uid'),
    to_uid: z.string().describe('Target element uid'),
  },
  handler: async (request, response, context) => {
    const fromHandle = await context.getElementByUid(request.params.from_uid);
    const toHandle = await context.getElementByUid(request.params.to_uid);
    try {
      await context.waitForEventsAfterAction(async () => {
        await fromHandle.drag(toHandle);
        await new Promise(resolve => setTimeout(resolve, 50));
        await toHandle.drop(fromHandle);
      });
      response.appendResponseLine('Dragged');
      response.setIncludeSnapshot(true);
    } finally {
      void fromHandle.dispose();
      void toHandle.dispose();
    }
  },
});

export const fillForm = defineTool({
  name: 'fill_form',
  description: 'Fill multiple form elements.',
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    elements: z
      .array(
        z.object({
          uid: z.string().describe('Element uid'),
          value: z.string().describe('Value'),
        }),
      )
      .describe('Elements to fill'),
  },
  handler: async (request, response, context) => {
    for (const element of request.params.elements) {
      const handle = await context.getElementByUid(element.uid);
      try {
        await context.waitForEventsAfterAction(async () => {
          await handle.asLocator().fill(element.value);
        });
      } finally {
        void handle.dispose();
      }
    }
    response.appendResponseLine('Form filled');
    response.setIncludeSnapshot(true);
  },
});

export const uploadFile = defineTool({
  name: 'upload_file',
  description: 'Upload file through element.',
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: z.string().describe('File input element uid'),
    filePath: z.string().describe('Local file path'),
  },
  handler: async (request, response, context) => {
    const {uid, filePath} = request.params;
    const handle = (await context.getElementByUid(
      uid,
    )) as ElementHandle<HTMLInputElement>;
    try {
      try {
        await handle.uploadFile(filePath);
      } catch {
        try {
          const page = await context.getSelectedPage();
          const [fileChooser] = await Promise.all([
            page.waitForFileChooser({timeout: 3000}),
            handle.asLocator().click(),
          ]);
          await fileChooser.accept([filePath]);
        } catch {
          throw new Error('Failed to upload file');
        }
      }
      response.setIncludeSnapshot(true);
      response.appendResponseLine(`Uploaded: ${filePath}`);
    } finally {
      void handle.dispose();
    }
  },
});
