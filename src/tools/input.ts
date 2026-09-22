/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {TimeoutError, zod} from '../third_party/index.js';
import type {ElementHandle, KeyInput} from '../third_party/index.js';
import type {TextSnapshotNode} from '../types.js';
import {parseKey} from '../utils/keyboard.js';
import {logger} from '../utils/logger.js';
import type {WaitForEventsResult} from '../utils/WaitForHelper.js';

import {ToolCategory} from './categories.js';
import type {ContextPage} from './ToolDefinition.js';
import {definePageTool} from './ToolDefinition.js';

const dblClickSchema = zod
  .boolean()
  .optional()
  .describe('Set to true for double clicks. Default is false.');

const includeSnapshotSchema = zod
  .boolean()
  .optional()
  .describe('Whether to include a snapshot in the response. Default is false.');

const submitKeySchema = zod
  .string()
  .optional()
  .describe(
    'Optional key to press after typing. E.g., "Enter", "Tab", "Escape"',
  );

/**
 * Locator actions abort or time out while the page is blocked by a JavaScript
 * dialog, even though the action itself was dispatched and opened that dialog.
 * The open dialog is already reported in the response, so treat this as an
 * interruption instead of a failure.
 */
function handleActionError(error: unknown, uid: string, page: ContextPage) {
  if (page.getDialog()) {
    logger?.('action interrupted by a dialog', error);
    return;
  }

  logger?.('failed to act using a locator', error);
  const reason =
    error instanceof TimeoutError
      ? 'The element did not become interactive within the configured timeout.'
      : error instanceof Error
        ? error.message
        : String(error);
  throw new Error(
    `Failed to interact with the element with uid ${uid}. ${reason}`,
    {
      cause: error,
    },
  );
}

async function selectNativeSelectOption(
  handle: ElementHandle<Element>,
  signal: AbortSignal,
) {
  using selectHandle = await handle.evaluateHandle(node => {
    if (!(node instanceof HTMLOptionElement)) {
      return null;
    }

    const select = node.closest('select');
    if (!select || select.multiple || select.disabled || node.disabled) {
      return null;
    }

    const parentElement = node.parentElement;
    if (
      parentElement instanceof HTMLOptGroupElement &&
      parentElement.disabled
    ) {
      return null;
    }

    return select;
  });

  using select = selectHandle.asElement() as ElementHandle<Element> | null;
  if (!select) {
    return false;
  }

  using valueHandle = await handle.getProperty('value');

  const value = await valueHandle.jsonValue();
  if (typeof value !== 'string') {
    return false;
  }
  await select.asLocator().fill(value, {signal});

  return true;
}

export const click = definePageTool(() => ({
  name: 'click',
  description: `Clicks on the provided element`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    dblClick: dblClickSchema,
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const uid = request.params.uid;
    using handle = await request.page.getElementByUid(uid);
    const aXNode = request.page.getAXNodeByUid(uid);
    const shouldSelectNativeOption =
      !request.params.dblClick && aXNode?.role === 'option';
    try {
      const result = await request.page.waitForEventsAfterAction(
        async signal => {
          if (
            shouldSelectNativeOption &&
            (await selectNativeSelectOption(handle, signal))
          ) {
            return;
          }

          await handle.asLocator().click({
            count: request.params.dblClick ? 2 : 1,
            signal,
          });
        },
      );
      response.appendResponseLine(
        request.params.dblClick
          ? `Successfully double clicked on the element`
          : `Successfully clicked on the element`,
      );
      response.attachWaitForResult(result);
      if (request.params.includeSnapshot) {
        response.includeSnapshot();
      }
    } catch (error) {
      handleActionError(error, uid, request.page);
      response.appendResponseLine(
        request.params.dblClick
          ? `The element was double clicked and it opened a dialog.`
          : `The element was clicked and it opened a dialog.`,
      );
    }
  },
}));

export const clickAt = definePageTool(() => ({
  name: 'click_at',
  description: `Clicks at the provided coordinates`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
    conditions: ['experimentalVision'],
  },
  schema: {
    x: zod.number().describe('The x coordinate'),
    y: zod.number().describe('The y coordinate'),
    dblClick: dblClickSchema,
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const page = request.page;
    const result = await page.waitForEventsAfterAction(async () => {
      await page.pptrPage.mouse.click(request.params.x, request.params.y, {
        count: request.params.dblClick ? 2 : 1,
      });
    });
    response.appendResponseLine(
      request.params.dblClick
        ? `Successfully double clicked at the coordinates`
        : `Successfully clicked at the coordinates`,
    );
    response.attachWaitForResult(result);
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
}));

export const hover = definePageTool(() => ({
  name: 'hover',
  description: `Hover over the provided element`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const uid = request.params.uid;
    using handle = await request.page.getElementByUid(uid);
    try {
      const result = await request.page.waitForEventsAfterAction(
        async signal => {
          await handle.asLocator().hover({signal});
        },
      );
      response.appendResponseLine(`Successfully hovered over the element`);
      response.attachWaitForResult(result);
      if (request.params.includeSnapshot) {
        response.includeSnapshot();
      }
    } catch (error) {
      handleActionError(error, uid, request.page);
      response.appendResponseLine(
        `The element was hovered and it opened a dialog.`,
      );
    }
  },
}));

// The AXNode for an option doesn't contain its `value`. We set text content of the option as value.
// If the form is a combobox, we need to find the correct option by its text value.
// To do that, loop through the children while checking which child's text matches the requested value (requested value is actually the text content).
// When the correct option is found, use the element handle to get the real value.
async function selectOption(
  handle: ElementHandle,
  aXNode: TextSnapshotNode,
  value: string,
  signal: AbortSignal,
) {
  let optionFound = false;
  for (const child of aXNode.children) {
    if (child.role === 'option' && child.name === value && child.value) {
      optionFound = true;
      using childHandle = await child.elementHandle();
      if (childHandle) {
        using childValueHandle = await childHandle.getProperty('value');

        const childValue = await childValueHandle.jsonValue();
        if (typeof childValue === 'string') {
          await handle.asLocator().fill(childValue, {signal});
        }

        break;
      }
    }
  }
  if (!optionFound) {
    throw new Error(`Could not find option with text "${value}"`);
  }
}

function hasOptionChildren(aXNode: TextSnapshotNode) {
  return aXNode.children.some(child => child.role === 'option');
}

/**
 * Fills one or more form elements and waits for resulting page events in a
 * single `waitForEventsAfterAction` call.
 * If an element opens a JavaScript dialog, returns the `interruptedUid` of that
 * element so the caller can report it without filling remaining elements.
 */
async function fillFormElement(
  elements: Array<{uid: string; value: string}>,
  page: ContextPage,
): Promise<{result?: WaitForEventsResult; interruptedUid?: string}> {
  let currentUid: string | undefined;
  try {
    const result = await page.waitForEventsAfterAction(async signal => {
      for (const {uid, value} of elements) {
        currentUid = undefined;
        using handle = await page.getElementByUid(uid);
        currentUid = uid;
        const aXNode = page.getAXNodeByUid(uid);
        // We assume that combobox needs to be handled as select if it has
        // role='combobox' and option children.
        if (aXNode && aXNode.role === 'combobox' && hasOptionChildren(aXNode)) {
          await selectOption(handle, aXNode, value, signal);
        } else {
          const isToggle = await handle.evaluate(el => {
            if (el instanceof HTMLInputElement) {
              return el.type === 'checkbox' || el.type === 'radio';
            }
            const role = el.getAttribute('role');
            return role === 'checkbox' || role === 'radio' || role === 'switch';
          });

          if (isToggle) {
            if (['true', 'false'].includes(value)) {
              await handle.asLocator().fill(value === 'true', {signal});
            } else {
              throw new Error(
                `Checkboxes, radio boxes and toggles require "true" or "false" value, but ${value} was used`,
              );
            }
          } else {
            // Increase timeout for longer input values.
            const timeoutPerChar = 10; // ms
            const fillTimeout =
              page.pptrPage.getDefaultTimeout() + value.length * timeoutPerChar;
            await handle
              .asLocator()
              .setTimeout(fillTimeout)
              .fill(value, {signal});
          }
        }
      }
    });
    return {result};
  } catch (error) {
    if (!currentUid) {
      throw error;
    }
    handleActionError(error, currentUid, page);
    return {interruptedUid: currentUid};
  }
}

export const fill = definePageTool(() => ({
  name: 'fill',
  description: `Type text into an input, text area or select an option from a <select> element.`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    value: zod
      .string()
      .describe(
        'The value to fill in. "true" or "false" for checkboxes and toggles, "true" for radio buttons.',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const {result} = await fillFormElement(
      [{uid: request.params.uid, value: request.params.value}],
      request.page,
    );
    if (!result) {
      response.appendResponseLine(
        `The element was filled out and it opened a dialog.`,
      );
      return;
    }
    response.appendResponseLine(`Successfully filled out the element`);
    response.attachWaitForResult(result);
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
}));

export const typeText = definePageTool(() => ({
  name: 'type_text',
  description: `Type text using keyboard into a previously focused input`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    text: zod.string().describe('The text to type'),
    submitKey: submitKeySchema,
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const page = request.page;
    const result = await page.waitForEventsAfterAction(async () => {
      await page.pptrPage.keyboard.type(request.params.text);
      if (request.params.submitKey) {
        await page.pptrPage.keyboard.press(
          request.params.submitKey as KeyInput,
        );
      }
    });
    response.appendResponseLine(
      `Typed text "${request.params.text}${request.params.submitKey ? ` + ${request.params.submitKey}` : ''}"`,
    );
    response.attachWaitForResult(result);
  },
}));

export const drag = definePageTool(() => ({
  name: 'drag',
  description: `Drag an element onto another element`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    from_uid: zod.string().describe('The uid of the element to drag'),
    to_uid: zod.string().describe('The uid of the element to drop into'),
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    using fromHandle = await request.page.getElementByUid(
      request.params.from_uid,
    );
    using toHandle = await request.page.getElementByUid(request.params.to_uid);

    const result = await request.page.waitForEventsAfterAction(async () => {
      await fromHandle.drag(toHandle);
      await new Promise(resolve => setTimeout(resolve, 50));
      await toHandle.drop(fromHandle);
    });
    response.appendResponseLine(`Successfully dragged an element`);
    response.attachWaitForResult(result);
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
}));

export const fillForm = definePageTool(() => ({
  name: 'fill_form',
  description: `Fill out multiple form elements (inputs, selects, checkboxes, radios) at once. ALWAYS prefer this tool over multiple individual 'fill' or 'click' calls when interacting with forms. It is significantly faster, more reliable, and reduces turn count. Example: Fill username, password, and check "Remember Me" in one call.`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    elements: zod
      .array(
        /* eslint-disable @local/enforce-zod-schema */
        zod
          .object({
            uid: zod.string().describe('The uid of the element to fill out'),
            value: zod
              .string()
              .describe(
                'Value for the element. "true" or "false" for checkboxes and toggles, "true" for radio buttons.',
              ),
          })
          .describe('An element to fill out'),
        /* eslint-enable @local/enforce-zod-schema */
      )
      .describe('Elements from snapshot to fill out.'),
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const {result, interruptedUid} = await fillFormElement(
      request.params.elements,
      request.page,
    );
    if (!result) {
      // The page is blocked by a dialog, so the remaining elements cannot be
      // filled out until it is handled.
      response.appendResponseLine(
        `Filling out the element with uid ${interruptedUid} opened a dialog. The remaining elements were not filled out.`,
      );
      return;
    }
    response.appendResponseLine(`Successfully filled out the form`);
    response.attachWaitForResult(result);
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
}));

export const uploadFile = definePageTool(() => ({
  name: 'upload_file',
  description: 'Upload a file through a provided element.',
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    uid: zod
      .string()
      .describe(
        'The uid of the file input element or an element that will open file chooser on the page from the page content snapshot',
      ),
    filePaths: zod
      .array(zod.string())
      .min(1)
      .describe(
        'One or more files paths to upload. File paths have to be local to the browser instance (not the MCP).',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  // We do not validate file paths for remote browser instances
  // because they are on the remote host and not accessed by the MCP server.
  verifyFilesSchema: {
    filePaths: {
      local: true,
      remote: false,
    },
  },
  handler: async (request, response) => {
    const {uid, filePaths} = request.params;
    using handle = (await request.page.getElementByUid(
      uid,
    )) as ElementHandle<HTMLInputElement>;

    try {
      await handle.uploadFile(...filePaths);
    } catch {
      // Some sites use a proxy element to trigger file upload instead of
      // a type=file element. In this case, we want to default to
      // Page.waitForFileChooser() and upload the file this way.
      try {
        const [fileChooser] = await Promise.all([
          request.page.pptrPage.waitForFileChooser({timeout: 3000}),
          handle.asLocator().click(),
        ]);
        await fileChooser.accept(filePaths);
      } catch {
        throw new Error(
          `Failed to upload file. The element could not accept the file directly, and clicking it did not trigger a file chooser.`,
        );
      }
    }
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
    response.appendResponseLine(`File uploaded from ${filePaths.join(', ')}.`);
  },
}));

export const pressKey = definePageTool(() => ({
  name: 'press_key',
  description: `Press a key or key combination. Use this when other input methods like fill() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    key: zod
      .string()
      .describe(
        'A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta',
      ),
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const page = request.page;
    const tokens = parseKey(request.params.key);
    const [key, ...modifiers] = tokens;

    const result = await page.waitForEventsAfterAction(async () => {
      const heldModifiers: KeyInput[] = [];
      try {
        for (const modifier of modifiers) {
          await page.pptrPage.keyboard.down(modifier);
          heldModifiers.push(modifier);
        }
        await page.pptrPage.keyboard.press(key);
      } finally {
        // Release every modifier that was successfully pressed, even if a
        // later key event throws. Otherwise a failed press leaves modifiers
        // logically held down in the browser (see #2309).
        for (const modifier of heldModifiers.toReversed()) {
          await page.pptrPage.keyboard.up(modifier);
        }
      }
    });

    response.appendResponseLine(
      `Successfully pressed key: ${request.params.key}`,
    );
    response.attachWaitForResult(result);
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
}));
