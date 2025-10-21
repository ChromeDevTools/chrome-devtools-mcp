/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {McpContext, TextSnapshotNode} from '../McpContext.js';
import {zod} from '../third_party/index.js';
import type {ElementHandle} from '../third_party/index.js';

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
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    dblClick: zod
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
    uid: zod
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

// The AXNode for an option doesn't contain its `value`. We set text content of the option as value.
// If the form is a combobox, we need to find the correct option by its text value.
// To do that, loop through the children while checking which child's text matches the requested value (requested value is actually the text content).
// When the correct option is found, use the element handle to get the real value.
async function selectOption(
  handle: ElementHandle,
  aXNode: TextSnapshotNode,
  value: string,
) {
  let optionFound = false;
  for (const child of aXNode.children) {
    if (child.role === 'option' && child.name === value && child.value) {
      optionFound = true;
      const childHandle = await child.elementHandle();
      if (childHandle) {
        try {
          const childValueHandle = await childHandle.getProperty('value');
          try {
            const childValue = await childValueHandle.jsonValue();
            if (childValue) {
              await handle.asLocator().fill(childValue.toString());
            }
          } finally {
            void childValueHandle.dispose();
          }
          break;
        } finally {
          void childHandle.dispose();
        }
      }
    }
  }
  if (!optionFound) {
    throw new Error(`Could not find option with text "${value}"`);
  }
}

async function fillFormElement(
  uid: string,
  value: string,
  context: McpContext,
) {
  const handle = await context.getElementByUid(uid);
  try {
    const aXNode = context.getAXNodeByUid(uid);
    if (aXNode && aXNode.role === 'combobox') {
      await selectOption(handle, aXNode, value);
    } else {
      await handle.asLocator().fill(value);
    }
  } finally {
    void handle.dispose();
  }
}

export const fill = defineTool({
  name: 'fill',
  description: `Type text into a input, text area or select an option from a <select> element.`,
  annotations: {
    category: ToolCategories.INPUT_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    value: zod.string().describe('The value to fill in'),
  },
  handler: async (request, response, context) => {
    await context.waitForEventsAfterAction(async () => {
      await fillFormElement(
        request.params.uid,
        request.params.value,
        context as McpContext,
      );
    });
    response.appendResponseLine(`Successfully filled out the element`);
    response.setIncludeSnapshot(true);
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
    from_uid: zod.string().describe('The uid of the element to drag'),
    to_uid: zod.string().describe('The uid of the element to drop into'),
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
    elements: zod
      .array(
        zod.object({
          uid: zod.string().describe('The uid of the element to fill out'),
          value: zod.string().describe('Value for the element'),
        }),
      )
      .describe('Elements from snapshot to fill out.'),
  },
  handler: async (request, response, context) => {
    for (const element of request.params.elements) {
      await context.waitForEventsAfterAction(async () => {
        await fillFormElement(
          element.uid,
          element.value,
          context as McpContext,
        );
      });
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
    uid: zod
      .string()
      .describe(
        'The uid of the file input element or an element that will open file chooser on the page from the page content snapshot',
      ),
    filePath: zod.string().describe('The local path of the file to upload'),
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
