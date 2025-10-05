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
  description: `Clicks on the provided element`,
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: z
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    dblClick: z
      .boolean()
      .optional()
      .describe('Set to true for double clicks. Default is false.'),
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
      response.appendResponseLine(
        request.params.dblClick
          ? `Successfully double clicked on the element`
          : `Successfully clicked on the element`,
      );
      response.setIncludeSnapshot(true);
    } finally {
      void handle.dispose();
    }
  },
});

export const hover = defineTool({
  name: 'hover',
  description: `Hover over the provided element`,
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: z
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
  },
  handler: async (request, response, context) => {
    const uid = request.params.uid;
    const handle = await context.getElementByUid(uid);
    try {
      await context.waitForEventsAfterAction(async () => {
        await handle.asLocator().hover();
      });
      response.appendResponseLine(`Successfully hovered over the element`);
      response.setIncludeSnapshot(true);
    } finally {
      void handle.dispose();
    }
  },
});

export const fill = defineTool({
  name: 'fill',
  description: `Type text into a input, text area or select an option from a <select> element.`,
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: z
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    value: z.string().describe('The value to fill in'),
  },
  handler: async (request, response, context) => {
    const handle = await context.getElementByUid(request.params.uid);
    try {
      await context.waitForEventsAfterAction(async () => {
        await handle.asLocator().fill(request.params.value);
      });
      response.appendResponseLine(`Successfully filled out the element`);
      response.setIncludeSnapshot(true);
    } finally {
      void handle.dispose();
    }
  },
});

export const drag = defineTool({
  name: 'drag',
  description: `Drag an element onto another element`,
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    from_uid: z.string().describe('The uid of the element to drag'),
    to_uid: z.string().describe('The uid of the element to drop into'),
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
      response.appendResponseLine(`Successfully dragged an element`);
      response.setIncludeSnapshot(true);
    } finally {
      void fromHandle.dispose();
      void toHandle.dispose();
    }
  },
});

export const fillForm = defineTool({
  name: 'fill_form',
  description: `Fill out multiple form elements at once`,
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    elements: z
      .array(
        z.object({
          uid: z.string().describe('The uid of the element to fill out'),
          value: z.string().describe('Value for the element'),
        }),
      )
      .describe('Elements from snapshot to fill out.'),
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
    response.appendResponseLine(`Successfully filled out the form`);
    response.setIncludeSnapshot(true);
  },
});

export const uploadFile = defineTool({
  name: 'upload_file',
  description: 'Upload a file through a provided element.',
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: z
      .string()
      .describe(
        'The uid of the file input element or an element that will open file chooser on the page from the page content snapshot',
      ),
    filePath: z.string().describe('The local path of the file to upload'),
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
        // Some sites use a proxy element to trigger file upload instead of
        // a type=file element. In this case, we want to default to
        // Page.waitForFileChooser() and upload the file this way.
        try {
          const page = context.getSelectedPage();
          const [fileChooser] = await Promise.all([
            page.waitForFileChooser({timeout: 3000}),
            handle.asLocator().click(),
          ]);
          await fileChooser.accept([filePath]);
        } catch {
          throw new Error(
            `Failed to upload file. The element could not accept the file directly, and clicking it did not trigger a file chooser.`,
          );
        }
      }
      response.setIncludeSnapshot(true);
      response.appendResponseLine(`File uploaded from ${filePath}.`);
    } finally {
      void handle.dispose();
    }
  },
});
