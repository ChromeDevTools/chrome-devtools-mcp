/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';
import type {McpContext} from '../McpContext.js';
import {zod} from '../third_party/index.js';
import type {
  CDPSession,
  ElementHandle,
  KeyInput,
  Protocol,
} from '../third_party/index.js';
import type {TextSnapshotNode} from '../types.js';
import {parseKey} from '../utils/keyboard.js';

import {ToolCategory} from './categories.js';
import type {Context, ContextPage, Response} from './ToolDefinition.js';
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

function handleActionError(error: unknown, uid: string) {
  logger('failed to act using a locator', error);
  throw new Error(
    `Failed to interact with the element with uid ${uid}. The element did not become interactive within the configured timeout.`,
    {
      cause: error,
    },
  );
}

async function selectNativeSelectOption(handle: ElementHandle<Element>) {
  const selectHandle = await handle.evaluateHandle(node => {
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
  try {
    const select = selectHandle.asElement() as ElementHandle<Element> | null;
    if (!select) {
      return false;
    }

    const valueHandle = await handle.getProperty('value');
    try {
      const value = await valueHandle.jsonValue();
      if (typeof value !== 'string') {
        return false;
      }
      await select.asLocator().fill(value);
    } finally {
      void valueHandle.dispose();
    }
    return true;
  } finally {
    void selectHandle.dispose();
  }
}

export const click = definePageTool({
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
  handler: async (request, response) => {
    const uid = request.params.uid;
    const handle = await request.page.getElementByUid(uid);
    const aXNode = request.page.getAXNodeByUid(uid);
    const shouldSelectNativeOption =
      !request.params.dblClick && aXNode?.role === 'option';
    try {
      await request.page.waitForEventsAfterAction(async () => {
        if (
          shouldSelectNativeOption &&
          (await selectNativeSelectOption(handle))
        ) {
          return;
        }

        await handle.asLocator().click({
          count: request.params.dblClick ? 2 : 1,
        });
      });
      response.appendResponseLine(
        request.params.dblClick
          ? `Successfully double clicked on the element`
          : `Successfully clicked on the element`,
      );
      if (request.params.includeSnapshot) {
        response.includeSnapshot();
      }
    } catch (error) {
      handleActionError(error, uid);
    } finally {
      void handle.dispose();
    }
  },
});

export const clickAt = definePageTool({
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
  handler: async (request, response) => {
    const page = request.page;
    await page.waitForEventsAfterAction(async () => {
      await page.pptrPage.mouse.click(request.params.x, request.params.y, {
        clickCount: request.params.dblClick ? 2 : 1,
      });
    });
    response.appendResponseLine(
      request.params.dblClick
        ? `Successfully double clicked at the coordinates`
        : `Successfully clicked at the coordinates`,
    );
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
});

export const hover = definePageTool({
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
  handler: async (request, response) => {
    const uid = request.params.uid;
    const handle = await request.page.getElementByUid(uid);
    try {
      await request.page.waitForEventsAfterAction(async () => {
        await handle.asLocator().hover();
      });
      response.appendResponseLine(`Successfully hovered over the element`);
      if (request.params.includeSnapshot) {
        response.includeSnapshot();
      }
    } catch (error) {
      handleActionError(error, uid);
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

function hasOptionChildren(aXNode: TextSnapshotNode) {
  return aXNode.children.some(child => child.role === 'option');
}

async function fillFormElement(
  uid: string,
  value: string,
  context: McpContext,
  page: ContextPage,
) {
  const handle = await page.getElementByUid(uid);
  try {
    const aXNode = context.getAXNodeByUid(uid);
    // We assume that combobox needs to be handled as select if it has
    // role='combobox' and option children.
    if (aXNode && aXNode.role === 'combobox' && hasOptionChildren(aXNode)) {
      await selectOption(handle, aXNode, value);
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
          await handle.asLocator().fill(value === 'true');
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
        await handle.asLocator().setTimeout(fillTimeout).fill(value);
      }
    }
  } catch (error) {
    handleActionError(error, uid);
  } finally {
    void handle.dispose();
  }
}

export const fill = definePageTool({
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
  handler: async (request, response, context) => {
    const page = request.page;
    await page.waitForEventsAfterAction(async () => {
      await fillFormElement(
        request.params.uid,
        request.params.value,
        context as McpContext,
        page,
      );
    });
    response.appendResponseLine(`Successfully filled out the element`);
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
});

export const typeText = definePageTool({
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
  handler: async (request, response) => {
    const page = request.page;
    await page.waitForEventsAfterAction(async () => {
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
  },
});

export const drag = definePageTool({
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
  handler: async (request, response) => {
    const fromHandle = await request.page.getElementByUid(
      request.params.from_uid,
    );
    const toHandle = await request.page.getElementByUid(request.params.to_uid);
    try {
      await request.page.waitForEventsAfterAction(async () => {
        await fromHandle.drag(toHandle);
        await new Promise(resolve => setTimeout(resolve, 50));
        await toHandle.drop(fromHandle);
      });
      response.appendResponseLine(`Successfully dragged an element`);
      if (request.params.includeSnapshot) {
        response.includeSnapshot();
      }
    } finally {
      void fromHandle.dispose();
      void toHandle.dispose();
    }
  },
});

export const fillForm = definePageTool({
  name: 'fill_form',
  description: `Fill out multiple form elements (inputs, selects, checkboxes, radios) at once. ALWAYS prefer this tool over multiple individual 'fill' or 'click' calls when interacting with forms. It is significantly faster, more reliable, and reduces turn count. Example: Fill username, password, and check "Remember Me" in one call.`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    elements: zod
      .array(
        // eslint-disable-next-line @local/enforce-zod-schema
        zod.object({
          uid: zod.string().describe('The uid of the element to fill out'),
          value: zod
            .string()
            .describe(
              'Value for the element. "true" or "false" for checkboxes and toggles, "true" for radio buttons.',
            ),
        }),
      )
      .describe('Elements from snapshot to fill out.'),
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    const page = request.page;
    for (const element of request.params.elements) {
      await page.waitForEventsAfterAction(async () => {
        await fillFormElement(
          element.uid,
          element.value,
          context as McpContext,
          page,
        );
      });
    }
    response.appendResponseLine(`Successfully filled out the form`);
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
});

export const uploadFile = definePageTool({
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
    filePath: zod.string().describe('The local path of the file to upload'),
    includeSnapshot: includeSnapshotSchema,
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    const {uid, filePath} = request.params;
    context.validatePath(filePath);
    const handle = (await request.page.getElementByUid(
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
          const [fileChooser] = await Promise.all([
            request.page.pptrPage.waitForFileChooser({timeout: 3000}),
            handle.asLocator().click(),
          ]);
          await fileChooser.accept([filePath]);
        } catch {
          throw new Error(
            `Failed to upload file. The element could not accept the file directly, and clicking it did not trigger a file chooser.`,
          );
        }
      }
      if (request.params.includeSnapshot) {
        response.includeSnapshot();
      }
      response.appendResponseLine(`File uploaded from ${filePath}.`);
    } finally {
      void handle.dispose();
    }
  },
});

export const pressKey = definePageTool({
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
  handler: async (request, response) => {
    const page = request.page;
    const tokens = parseKey(request.params.key);
    const [key, ...modifiers] = tokens;

    await page.waitForEventsAfterAction(async () => {
      for (const modifier of modifiers) {
        await page.pptrPage.keyboard.down(modifier);
      }
      await page.pptrPage.keyboard.press(key);
      for (const modifier of modifiers.toReversed()) {
        await page.pptrPage.keyboard.up(modifier);
      }
    });

    response.appendResponseLine(
      `Successfully pressed key: ${request.params.key}`,
    );
    if (request.params.includeSnapshot) {
      response.includeSnapshot();
    }
  },
});

interface ChildSummary {
  tag: string;
  id: string;
  classList: string[];
  text: string;
  role: string | undefined;
  href: string | undefined;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElementDescriptor {
  found: true;
  tag: string;
  id: string;
  classList: string[];
  attributes: Record<string, string>;
  text: string;
  boundingBox: BoundingBox;
  role: string | undefined;
  selector: string;
  outerHTML: string;
  children: ChildSummary[];
  childrenOmitted: number;
  inOpenShadow: boolean;
  closedShadowEncountered: boolean;
  frameOrigin: string;
  crossOriginFrame: boolean;
  computedStyle?: Record<string, string>;
}

interface NotFoundResult {
  found: false;
  reason: 'outside-viewport' | 'no-node' | 'cross-origin-blocked';
  partialDescriptor?: Partial<ElementDescriptor>;
}

type DescriptorResult = ElementDescriptor | NotFoundResult;

interface MatchedRuleProperty {
  name: string;
  value: string;
  important: boolean;
}

interface MatchedRule {
  selector: string;
  origin: string;
  properties: MatchedRuleProperty[];
}

type CssMode = 'none' | 'matched' | 'computed-visual' | 'computed-full';
type OutputMode = 'auto' | 'schema' | 'raw' | 'selector-only';

const COMPUTED_VISUAL_PROPERTIES: readonly string[] = [
  'display',
  'position',
  'width',
  'height',
  'top',
  'right',
  'bottom',
  'left',
  'color',
  'background-color',
  'background-image',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
  'opacity',
  'visibility',
  'z-index',
  'border',
  'border-radius',
  'padding',
  'margin',
  'flex',
  'flex-direction',
  'justify-content',
  'align-items',
  'gap',
  'grid-template-columns',
  'grid-template-rows',
  'overflow',
  'transform',
  'cursor',
  'pointer-events',
];

const RAW_OUTPUT_HTML_LIMIT = 50_000;
const MATCHED_RULES_CAP = 30;

interface InPageOptions {
  x: number;
  y: number;
  pierceShadow: boolean;
  cssMode: CssMode;
  computedVisualProperties: readonly string[];
}

/**
 * In-page hit-test + descriptor builder. Self-contained: must not reference
 * any closure variables since it is shipped to the page (and to CDP via
 * Runtime.callFunctionOn).
 */
function buildElementDescriptorInPage(
  options: InPageOptions,
): DescriptorResult {
  const REACT_VUE_ATTR_DENY =
    /^(data-react-|data-v-|__reactFiber|__reactProps|__reactInternalInstance)/i;
  const ATTR_VALUE_LIMIT = 500;
  const TEXT_LIMIT = 200;
  const CHILD_TEXT_LIMIT = 40;
  const MAX_CHILDREN = 12;

  function roundTenth(value: number): number {
    return Math.round(value * 10) / 10;
  }

  function safeAttr(value: string | null): string {
    if (value === null) {
      return '';
    }
    if (value.length > ATTR_VALUE_LIMIT) {
      return value.slice(0, ATTR_VALUE_LIMIT) + '…';
    }
    return value;
  }

  function collectAttributes(el: Element): Record<string, string> {
    const out: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (REACT_VUE_ATTR_DENY.test(attr.name)) {
        continue;
      }
      if (attr.name === 'style' && attr.value.length > ATTR_VALUE_LIMIT) {
        continue;
      }
      out[attr.name] = safeAttr(attr.value);
    }
    return out;
  }

  function summarizeChildren(el: Element): {
    children: ChildSummary[];
    childrenOmitted: number;
  } {
    const all = Array.from(el.children);
    const slice = all.slice(0, MAX_CHILDREN);
    const children: ChildSummary[] = [];
    for (const child of slice) {
      const text = (child.textContent ?? '').trim().slice(0, CHILD_TEXT_LIMIT);
      const classList: string[] = [];
      for (const c of Array.from(child.classList)) {
        classList.push(c);
      }
      const role = child.getAttribute('role') ?? undefined;
      const href =
        child instanceof HTMLAnchorElement
          ? child.href || undefined
          : undefined;
      children.push({
        tag: child.nodeName.toLowerCase(),
        id: child.id ?? '',
        classList,
        text,
        role,
        href,
      });
    }
    return {
      children,
      childrenOmitted:
        all.length > MAX_CHILDREN ? all.length - MAX_CHILDREN : 0,
    };
  }

  function isValidIdentClass(cls: string): boolean {
    return /^[a-zA-Z_][\w-]*$/.test(cls);
  }

  function cssEscape(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/[^\w-]/g, ch => '\\' + ch);
  }

  function siblingsOfSameTag(el: Element): Element[] {
    const parent = el.parentElement;
    if (!parent) {
      return [el];
    }
    const out: Element[] = [];
    for (const sibling of Array.from(parent.children)) {
      if (sibling.nodeName === el.nodeName) {
        out.push(sibling);
      }
    }
    return out;
  }

  function buildSelectorPart(el: Element): string {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      return selector + '#' + cssEscape(el.id);
    }
    const sameTag = siblingsOfSameTag(el);
    if (sameTag.length > 1) {
      const idx = sameTag.indexOf(el) + 1;
      selector += ':nth-of-type(' + idx + ')';
    } else if (el.classList.length > 0) {
      const classes: string[] = [];
      for (const c of Array.from(el.classList)) {
        if (isValidIdentClass(c) && classes.length < 2) {
          classes.push('.' + cssEscape(c));
        }
      }
      if (classes.length > 0) {
        selector += classes.join('');
      }
    }
    return selector;
  }

  function cssPath(el: Element): string {
    const path: string[] = [];
    let current: Element | null = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      if (current.id) {
        const idSelector =
          current.nodeName.toLowerCase() + '#' + cssEscape(current.id);
        path.unshift(idSelector);
        const ownerDoc = current.ownerDocument;
        if (
          ownerDoc &&
          ownerDoc.querySelectorAll('#' + cssEscape(current.id)).length === 1
        ) {
          break;
        }
        current = current.parentElement;
        continue;
      }
      path.unshift(buildSelectorPart(current));
      current = current.parentElement;
    }
    const candidate = path.join(' > ');
    const ownerDoc = el.ownerDocument;
    if (ownerDoc) {
      try {
        if (ownerDoc.querySelectorAll(candidate).length === 1) {
          return candidate;
        }
      } catch {
        // Selector failed to parse; fall through to nth-of-type chain.
      }
    }
    const fallback: string[] = [];
    let cur: Element | null = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      let part = cur.nodeName.toLowerCase();
      const sameTag = siblingsOfSameTag(cur);
      if (sameTag.length > 1) {
        part += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
      }
      fallback.unshift(part);
      cur = cur.parentElement;
    }
    return fallback.join(' > ');
  }

  function collectComputedStyle(
    el: Element,
    mode: CssMode,
    visualProps: readonly string[],
  ): Record<string, string> | undefined {
    if (mode !== 'computed-visual' && mode !== 'computed-full') {
      return undefined;
    }
    const computed = window.getComputedStyle(el);
    const out: Record<string, string> = {};
    if (mode === 'computed-visual') {
      for (const prop of visualProps) {
        const value = computed.getPropertyValue(prop);
        if (value) {
          out[prop] = value;
        }
      }
      return out;
    }
    for (let i = 0; i < computed.length; i++) {
      const prop = computed.item(i);
      if (!prop) {
        continue;
      }
      out[prop] = computed.getPropertyValue(prop);
    }
    return out;
  }

  let inOpenShadow = false;
  let closedShadowEncountered = false;
  let crossOriginFrame = false;
  let frameOrigin = '';
  try {
    frameOrigin = window.location.origin;
  } catch {
    frameOrigin = '';
  }

  let currentDoc: Document | ShadowRoot = document;
  let currentX = options.x;
  let currentY = options.y;
  let hit: Element | null = null;

  for (let descents = 0; descents < 32; descents++) {
    let candidate: Element | null = null;
    if (currentDoc instanceof Document) {
      candidate = currentDoc.elementFromPoint(currentX, currentY);
    } else {
      candidate = currentDoc.elementFromPoint(currentX, currentY);
    }
    if (!candidate) {
      if (!hit) {
        return {found: false, reason: 'outside-viewport'};
      }
      break;
    }
    hit = candidate;
    if (
      candidate instanceof HTMLIFrameElement ||
      candidate instanceof HTMLFrameElement
    ) {
      const rect = candidate.getBoundingClientRect();
      let innerDoc: Document | null = null;
      try {
        innerDoc = candidate.contentDocument;
      } catch {
        innerDoc = null;
      }
      if (!innerDoc) {
        crossOriginFrame = true;
        break;
      }
      currentDoc = innerDoc;
      currentX = currentX - rect.left;
      currentY = currentY - rect.top;
      try {
        frameOrigin = candidate.contentWindow?.location.origin ?? frameOrigin;
      } catch {
        frameOrigin = '';
      }
      continue;
    }
    if (options.pierceShadow) {
      const shadowRoot: ShadowRoot | null = candidate.shadowRoot;
      if (shadowRoot) {
        inOpenShadow = true;
        currentDoc = shadowRoot;
        continue;
      }
      // Closed shadow root cannot be detected directly; we infer when the
      // browser stops descending (no shadowRoot but the element looks like a
      // host). The conservative choice is to leave closedShadowEncountered
      // false unless we detect an explicit signal.
    } else {
      closedShadowEncountered = candidate.shadowRoot !== null;
    }
    break;
  }

  if (!hit) {
    return {found: false, reason: 'no-node'};
  }

  const rect = hit.getBoundingClientRect();
  const text = (hit.textContent ?? '').trim().slice(0, TEXT_LIMIT);
  const classList: string[] = [];
  for (const c of Array.from(hit.classList)) {
    classList.push(c);
  }
  const role = hit.getAttribute('role') ?? undefined;
  const summary = summarizeChildren(hit);
  const descriptor: ElementDescriptor = {
    found: true,
    tag: hit.nodeName.toLowerCase(),
    id: hit.id ?? '',
    classList,
    attributes: collectAttributes(hit),
    text,
    boundingBox: {
      x: roundTenth(rect.x),
      y: roundTenth(rect.y),
      width: roundTenth(rect.width),
      height: roundTenth(rect.height),
    },
    role,
    selector: cssPath(hit),
    outerHTML: hit.outerHTML,
    children: summary.children,
    childrenOmitted: summary.childrenOmitted,
    inOpenShadow,
    closedShadowEncountered,
    frameOrigin,
    crossOriginFrame,
    computedStyle: collectComputedStyle(
      hit,
      options.cssMode,
      options.computedVisualProperties,
    ),
  };
  if (crossOriginFrame) {
    const partial: Partial<ElementDescriptor> = {
      tag: descriptor.tag,
      attributes: descriptor.attributes,
      boundingBox: descriptor.boundingBox,
      frameOrigin,
      crossOriginFrame,
    };
    return {
      found: false,
      reason: 'cross-origin-blocked',
      partialDescriptor: partial,
    };
  }
  return descriptor;
}

function buildMatchedRulesSummary(
  matched: Protocol.CSS.GetMatchedStylesForNodeResponse,
): MatchedRule[] {
  const rules: MatchedRule[] = [];
  const inline = matched.inlineStyle;
  if (inline) {
    const properties: MatchedRuleProperty[] = [];
    for (const prop of inline.cssProperties) {
      if (prop.disabled || prop.implicit) {
        continue;
      }
      if (!prop.value) {
        continue;
      }
      properties.push({
        name: prop.name,
        value: prop.value,
        important: prop.important === true,
      });
    }
    if (properties.length > 0) {
      rules.push({
        selector: '[style attribute]',
        origin: 'inline',
        properties,
      });
    }
  }
  const matchedRules = matched.matchedCSSRules ?? [];
  // Most-specific rules tend to appear last; iterate in reverse to bias toward
  // the rules likely affecting the rendered element.
  for (const ruleMatch of matchedRules.slice().reverse()) {
    if (rules.length >= MATCHED_RULES_CAP) {
      break;
    }
    const rule = ruleMatch.rule;
    if (rule.origin !== 'regular') {
      continue;
    }
    const properties: MatchedRuleProperty[] = [];
    for (const prop of rule.style.cssProperties) {
      if (prop.disabled || prop.implicit) {
        continue;
      }
      if (!prop.value) {
        continue;
      }
      properties.push({
        name: prop.name,
        value: prop.value,
        important: prop.important === true,
      });
    }
    if (properties.length === 0) {
      continue;
    }
    rules.push({
      selector: rule.selectorList.text,
      origin: rule.origin,
      properties,
    });
  }
  if (rules.length === 0) {
    // No author-origin rules. Surface UA rules as a fallback signal.
    for (const ruleMatch of matchedRules) {
      if (rules.length >= MATCHED_RULES_CAP) {
        break;
      }
      const rule = ruleMatch.rule;
      if (rule.origin !== 'user-agent') {
        continue;
      }
      const properties: MatchedRuleProperty[] = [];
      for (const prop of rule.style.cssProperties) {
        if (prop.disabled || prop.implicit) {
          continue;
        }
        if (!prop.value) {
          continue;
        }
        properties.push({
          name: prop.name,
          value: prop.value,
          important: prop.important === true,
        });
      }
      if (properties.length === 0) {
        continue;
      }
      rules.push({
        selector: rule.selectorList.text,
        origin: rule.origin,
        properties,
      });
    }
  }
  return rules;
}

function formatBoundingBox(box: BoundingBox): string {
  return `x=${box.x} y=${box.y} w=${box.width} h=${box.height}`;
}

function formatAttributesLine(attrs: Record<string, string>): string {
  const entries = Object.entries(attrs);
  if (entries.length === 0) {
    return '';
  }
  const formatted: string[] = [];
  for (const [key, value] of entries) {
    formatted.push(`${key}=${value}`);
  }
  return formatted.join(', ');
}

function appendSchemaSummary(
  response: Response,
  descriptor: ElementDescriptor,
  x: number,
  y: number,
): void {
  response.appendResponseLine(`## Element at (${x}, ${y})`);
  response.appendResponseLine('');
  response.appendResponseLine(`- **tag**: \`${descriptor.tag}\``);
  if (descriptor.id) {
    response.appendResponseLine(`- **id**: \`${descriptor.id}\``);
  }
  if (descriptor.classList.length > 0) {
    response.appendResponseLine(
      `- **class**: ${descriptor.classList.join(' ')}`,
    );
  }
  response.appendResponseLine(`- **selector**: \`${descriptor.selector}\``);
  if (descriptor.role) {
    response.appendResponseLine(`- **role**: ${descriptor.role}`);
  }
  if (descriptor.text) {
    response.appendResponseLine(`- **text**: "${descriptor.text}"`);
  }
  response.appendResponseLine(
    `- **bbox**: ${formatBoundingBox(descriptor.boundingBox)}`,
  );
  const attrs = formatAttributesLine(descriptor.attributes);
  if (attrs) {
    response.appendResponseLine(`- **attrs**: ${attrs}`);
  }
  const flags = [
    `inOpenShadow=${descriptor.inOpenShadow}`,
    `closedShadowEncountered=${descriptor.closedShadowEncountered}`,
    `crossOriginFrame=${descriptor.crossOriginFrame}`,
    `frameOrigin=${descriptor.frameOrigin || '(unknown)'}`,
  ];
  response.appendResponseLine(`- **flags**: ${flags.join(', ')}`);

  const totalChildren = descriptor.children.length + descriptor.childrenOmitted;
  if (totalChildren > 0) {
    response.appendResponseLine('');
    response.appendResponseLine(
      `### Children (${descriptor.children.length} of ${totalChildren})`,
    );
    for (const child of descriptor.children) {
      const classPart =
        child.classList.length > 0 ? '.' + child.classList.join('.') : '';
      const idPart = child.id ? `#${child.id}` : '';
      const text = child.text ? ` "${child.text}"` : '';
      response.appendResponseLine(
        `- \`${child.tag}${idPart}${classPart}\`${text}`,
      );
    }
    if (descriptor.childrenOmitted > 0) {
      response.appendResponseLine(
        `- … (${descriptor.childrenOmitted} more children omitted)`,
      );
    }
  }
}

function appendComputedCss(
  response: Response,
  descriptor: ElementDescriptor,
  cssMode: CssMode,
): void {
  if (
    !descriptor.computedStyle ||
    (cssMode !== 'computed-visual' && cssMode !== 'computed-full')
  ) {
    return;
  }
  response.appendResponseLine('');
  response.appendResponseLine(`### CSS (${cssMode})`);
  if (cssMode === 'computed-visual') {
    const lines: string[] = [];
    for (const prop of COMPUTED_VISUAL_PROPERTIES) {
      const value = descriptor.computedStyle[prop];
      if (value !== undefined && value !== '') {
        lines.push(`${prop}: ${value}`);
      }
    }
    response.appendResponseLine(lines.join(' | '));
  } else {
    const entries = Object.entries(descriptor.computedStyle);
    response.appendResponseLine(
      `${entries.length} computed properties (full set saved when filePath is set).`,
    );
  }
}

function appendMatchedRules(
  response: Response,
  rules: MatchedRule[] | undefined,
): void {
  if (!rules || rules.length === 0) {
    return;
  }
  response.appendResponseLine('');
  response.appendResponseLine('### CSS (matched)');
  for (const rule of rules) {
    const props: string[] = [];
    for (const prop of rule.properties) {
      props.push(
        `${prop.name}: ${prop.value}${prop.important ? ' !important' : ''}`,
      );
    }
    response.appendResponseLine(
      `- \`${rule.selector}\` (${rule.origin}) → ${props.join('; ')}`,
    );
  }
}

async function maybeWriteRawHtml(
  response: Response,
  context: Context,
  outerHTML: string,
  x: number,
  y: number,
): Promise<void> {
  if (outerHTML.length > RAW_OUTPUT_HTML_LIMIT) {
    const buffer = new TextEncoder().encode(outerHTML);
    const {filepath} = await context.saveTemporaryFile(
      buffer,
      `element_at_${x}_${y}.html`,
    );
    response.appendResponseLine('');
    response.appendResponseLine('```html');
    response.appendResponseLine(outerHTML.slice(0, RAW_OUTPUT_HTML_LIMIT));
    response.appendResponseLine('```');
    response.appendResponseLine(
      `(outerHTML truncated; full content saved to ${filepath})`,
    );
    return;
  }
  response.appendResponseLine('');
  response.appendResponseLine('```html');
  response.appendResponseLine(outerHTML);
  response.appendResponseLine('```');
}

async function maybeSaveFullDescriptor(
  response: Response,
  context: Context,
  descriptor: ElementDescriptor,
  matchedRules: MatchedRule[] | undefined,
  filePath: string | undefined,
): Promise<void> {
  if (!filePath) {
    return;
  }
  context.validatePath(filePath);
  const payload = {
    descriptor,
    matchedRules: matchedRules ?? [],
  };
  const buffer = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const {filename} = await context.saveFile(buffer, filePath, '.json');
  response.appendResponseLine('');
  response.appendResponseLine(`Saved full element descriptor to ${filename}.`);
}

interface CdpDescriptorFetchResult {
  descriptor: DescriptorResult;
  matchedRules: MatchedRule[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDescriptorResult(raw: unknown): DescriptorResult {
  if (!isRecord(raw)) {
    return {found: false, reason: 'no-node'};
  }
  if (raw.found === true) {
    // Trust the in-page builder's shape; we authored it. Re-parse defensively.
    return parseElementDescriptor(raw);
  }
  if (raw.found === false) {
    const reason =
      raw.reason === 'outside-viewport' ||
      raw.reason === 'no-node' ||
      raw.reason === 'cross-origin-blocked'
        ? raw.reason
        : 'no-node';
    const partialRaw = raw.partialDescriptor;
    const result: NotFoundResult = {found: false, reason};
    if (isRecord(partialRaw)) {
      result.partialDescriptor = parsePartialDescriptor(partialRaw);
    }
    return result;
  }
  return {found: false, reason: 'no-node'};
}

function parseStringRecord(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value === 'string') {
      out.push(value);
    }
  }
  return out;
}

function parseBoundingBox(raw: unknown): BoundingBox {
  if (!isRecord(raw)) {
    return {x: 0, y: 0, width: 0, height: 0};
  }
  const x = typeof raw.x === 'number' ? raw.x : 0;
  const y = typeof raw.y === 'number' ? raw.y : 0;
  const width = typeof raw.width === 'number' ? raw.width : 0;
  const height = typeof raw.height === 'number' ? raw.height : 0;
  return {x, y, width, height};
}

function parseChild(raw: unknown): ChildSummary | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const tag = typeof raw.tag === 'string' ? raw.tag : '';
  if (!tag) {
    return undefined;
  }
  return {
    tag,
    id: typeof raw.id === 'string' ? raw.id : '',
    classList: parseStringArray(raw.classList),
    text: typeof raw.text === 'string' ? raw.text : '',
    role: typeof raw.role === 'string' ? raw.role : undefined,
    href: typeof raw.href === 'string' ? raw.href : undefined,
  };
}

function parseChildren(raw: unknown): ChildSummary[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ChildSummary[] = [];
  for (const item of raw) {
    const parsed = parseChild(item);
    if (parsed) {
      out.push(parsed);
    }
  }
  return out;
}

function parseElementDescriptor(
  raw: Record<string, unknown>,
): ElementDescriptor {
  const computedRaw = raw.computedStyle;
  const computedStyle = isRecord(computedRaw)
    ? parseStringRecord(computedRaw)
    : undefined;
  return {
    found: true,
    tag: typeof raw.tag === 'string' ? raw.tag : '',
    id: typeof raw.id === 'string' ? raw.id : '',
    classList: parseStringArray(raw.classList),
    attributes: parseStringRecord(raw.attributes),
    text: typeof raw.text === 'string' ? raw.text : '',
    boundingBox: parseBoundingBox(raw.boundingBox),
    role: typeof raw.role === 'string' ? raw.role : undefined,
    selector: typeof raw.selector === 'string' ? raw.selector : '',
    outerHTML: typeof raw.outerHTML === 'string' ? raw.outerHTML : '',
    children: parseChildren(raw.children),
    childrenOmitted:
      typeof raw.childrenOmitted === 'number' ? raw.childrenOmitted : 0,
    inOpenShadow: raw.inOpenShadow === true,
    closedShadowEncountered: raw.closedShadowEncountered === true,
    frameOrigin: typeof raw.frameOrigin === 'string' ? raw.frameOrigin : '',
    crossOriginFrame: raw.crossOriginFrame === true,
    computedStyle,
  };
}

function parsePartialDescriptor(
  raw: Record<string, unknown>,
): Partial<ElementDescriptor> {
  const partial: Partial<ElementDescriptor> = {};
  if (typeof raw.tag === 'string') {
    partial.tag = raw.tag;
  }
  if (isRecord(raw.attributes)) {
    partial.attributes = parseStringRecord(raw.attributes);
  }
  if (isRecord(raw.boundingBox)) {
    partial.boundingBox = parseBoundingBox(raw.boundingBox);
  }
  if (typeof raw.frameOrigin === 'string') {
    partial.frameOrigin = raw.frameOrigin;
  }
  if (raw.crossOriginFrame === true) {
    partial.crossOriginFrame = true;
  }
  return partial;
}

async function fetchDescriptorViaCdp(
  page: ContextPage,
  options: InPageOptions,
): Promise<CdpDescriptorFetchResult> {
  const cdp: CDPSession = await page.pptrPage.createCDPSession();
  try {
    await Promise.all([cdp.send('DOM.enable'), cdp.send('CSS.enable')]);
    await cdp.send('DOM.getDocument', {depth: -1, pierce: true});

    let nodeRef: Protocol.DOM.GetNodeForLocationResponse;
    try {
      nodeRef = await cdp.send('DOM.getNodeForLocation', {
        x: Math.round(options.x),
        y: Math.round(options.y),
        includeUserAgentShadowDOM: false,
        ignorePointerEventsNone: false,
      });
    } catch (error) {
      logger('DOM.getNodeForLocation failed', error);
      return {
        descriptor: {found: false, reason: 'no-node'},
        matchedRules: [],
      };
    }

    const pushed = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', {
      backendNodeIds: [nodeRef.backendNodeId],
    });
    const nodeId = pushed.nodeIds[0];
    if (!nodeId) {
      return {
        descriptor: {found: false, reason: 'no-node'},
        matchedRules: [],
      };
    }

    const fnSource = buildElementDescriptorInPage.toString();
    const callArgument: Protocol.Runtime.CallArgument = {
      value: {
        x: options.x,
        y: options.y,
        pierceShadow: options.pierceShadow,
        cssMode: options.cssMode,
        computedVisualProperties: options.computedVisualProperties,
      },
    };

    const resolved = await cdp.send('DOM.resolveNode', {
      backendNodeId: nodeRef.backendNodeId,
    });
    const objectId = resolved.object.objectId;
    if (!objectId) {
      return {
        descriptor: {found: false, reason: 'no-node'},
        matchedRules: [],
      };
    }

    const [matchedRes, descriptorCall] = await Promise.all([
      cdp
        .send('CSS.getMatchedStylesForNode', {nodeId})
        .catch((error: unknown) => {
          logger('CSS.getMatchedStylesForNode failed', error);
          return undefined;
        }),
      cdp.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `function() { return (${fnSource}).call(null, arguments[0]); }`,
        arguments: [callArgument],
        returnByValue: true,
      }),
    ]);

    const descriptor = parseDescriptorResult(descriptorCall.result.value);

    const matchedRules = matchedRes ? buildMatchedRulesSummary(matchedRes) : [];

    return {descriptor, matchedRules};
  } finally {
    try {
      await cdp.detach();
    } catch (error) {
      logger('Failed to detach CDP session for get_element_at', error);
    }
  }
}

function describeNotFound(
  response: Response,
  result: NotFoundResult,
  x: number,
  y: number,
): void {
  if (result.reason === 'cross-origin-blocked') {
    response.appendResponseLine(
      `## Element at (${x}, ${y}) — cross-origin iframe`,
    );
    const partial = result.partialDescriptor;
    if (partial) {
      if (partial.tag) {
        response.appendResponseLine(`- **tag**: \`${partial.tag}\``);
      }
      if (partial.boundingBox) {
        response.appendResponseLine(
          `- **bbox**: ${formatBoundingBox(partial.boundingBox)}`,
        );
      }
      if (partial.attributes) {
        const attrs = formatAttributesLine(partial.attributes);
        if (attrs) {
          response.appendResponseLine(`- **attrs**: ${attrs}`);
        }
      }
      if (partial.frameOrigin) {
        response.appendResponseLine(
          `- **frameOrigin**: ${partial.frameOrigin}`,
        );
      }
    }
    response.appendResponseLine('');
    response.appendResponseLine(
      'Hit element is a cross-origin iframe. The contained document cannot be inspected from the parent context. If the inner page is exposed as a separate target, call `list_pages` to find it and `select_page` to switch into it.',
    );
    return;
  }
  response.appendResponseLine(
    `No element found at (${x}, ${y}). Coordinate may be outside the viewport, over a closed shadow root, or inside a cross-origin iframe. Try take_screenshot first to verify the page state.`,
  );
}

export const getElementAt = definePageTool({
  name: 'get_element_at',
  description: `Returns the DOM element at viewport-relative CSS-pixel coordinates (x, y). Pairs with take_screenshot + a vision model that emits coordinates. Pierces open shadow roots by default. Limitations: cannot enter closed shadow roots; cannot enter cross-origin/OOPIF iframes (you'll get the <iframe> element with crossOriginFrame=true); css="matched" requires the experimentalVision flag and uses Chrome DevTools Protocol. For huge elements use mode="schema" (default) or pass filePath to write the full descriptor to disk.`,
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: true,
    conditions: ['experimentalVision'],
  },
  schema: {
    x: zod.number().describe('CSS-pixel X coordinate, viewport-relative.'),
    y: zod.number().describe('CSS-pixel Y coordinate, viewport-relative.'),
    mode: zod
      .enum(['auto', 'schema', 'raw', 'selector-only'])
      .default('auto')
      .describe(
        'Output detail level. auto/schema = compact MD descriptor. raw = full outerHTML (truncated to 50KB or saved to file). selector-only = just the CSS selector.',
      ),
    css: zod
      .enum(['none', 'matched', 'computed-visual', 'computed-full'])
      .default('none')
      .describe(
        'CSS data to include. matched = author rules from cascade (uses CDP). computed-visual = ~30 visually relevant computed properties. computed-full = all computed properties (saved to file when large).',
      ),
    pierceShadow: zod
      .boolean()
      .optional()
      .describe(
        'Whether to descend into open shadow roots. Default true. Closed shadow roots are never pierced.',
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'If set, writes the full descriptor (raw outerHTML + full computed CSS) to this path and returns a summary in the response.',
      ),
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    const {x, y} = request.params;
    const mode: OutputMode = request.params.mode;
    const cssMode: CssMode = request.params.css;
    const pierceShadow = request.params.pierceShadow ?? true;
    const filePath = request.params.filePath;

    if (filePath) {
      context.validatePath(filePath);
    }

    const inPageOptions: InPageOptions = {
      x,
      y,
      pierceShadow,
      cssMode,
      computedVisualProperties: COMPUTED_VISUAL_PROPERTIES,
    };

    let descriptorResult: DescriptorResult;
    let matchedRules: MatchedRule[] = [];

    if (cssMode === 'matched') {
      const cdpResult = await fetchDescriptorViaCdp(
        request.page,
        inPageOptions,
      );
      descriptorResult = cdpResult.descriptor;
      matchedRules = cdpResult.matchedRules;
    } else {
      descriptorResult = await request.page.pptrPage.evaluate(
        buildElementDescriptorInPage,
        inPageOptions,
      );
    }

    if (!descriptorResult.found) {
      describeNotFound(response, descriptorResult, x, y);
      return;
    }

    const descriptor = descriptorResult;

    if (mode === 'selector-only') {
      response.appendResponseLine(descriptor.selector);
      await maybeSaveFullDescriptor(
        response,
        context,
        descriptor,
        matchedRules.length > 0 ? matchedRules : undefined,
        filePath,
      );
      return;
    }

    appendSchemaSummary(response, descriptor, x, y);
    appendComputedCss(response, descriptor, cssMode);
    if (cssMode === 'matched') {
      appendMatchedRules(
        response,
        matchedRules.length > 0 ? matchedRules : undefined,
      );
    }

    if (mode === 'raw') {
      await maybeWriteRawHtml(response, context, descriptor.outerHTML, x, y);
    }

    await maybeSaveFullDescriptor(
      response,
      context,
      descriptor,
      matchedRules.length > 0 ? matchedRules : undefined,
      filePath,
    );
  },
});
