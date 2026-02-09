/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared AX tree module — fetches the accessibility tree via CDP,
 * assigns stable UIDs, and provides resolution from UID → DOM node
 * for interactive tools (click, fill, hover, etc.).
 */

import {sendCdp} from './browser.js';
import {logger} from './logger.js';

// ── CDP Accessibility Types ──

export interface AXValue {
  type: string;
  value?: string | number | boolean;
}

export interface AXProperty {
  name: string;
  value: AXValue;
}

export interface AXNode {
  nodeId: string;
  ignored?: boolean;
  role?: AXValue;
  name?: AXValue;
  description?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
}

// ── UID Mapping State ──

/** Maps MCP UIDs (e.g. "s0_5") to CDP AX nodes from the last snapshot. */
let uidToAXNode = new Map<string, AXNode>();

/** All AX nodes from the last snapshot, keyed by CDP nodeId. */
let cdpNodeMap = new Map<string, AXNode>();

// ── Formatting Constants ──

const BOOLEAN_PROPERTY_MAP: Record<string, string> = {
  disabled: 'disableable',
  expanded: 'expandable',
  focused: 'focusable',
  selected: 'selectable',
};

const UNINTERESTING_ROLES = new Set([
  'generic',
  'none',
  'InlineTextBox',
  'StaticText',
  'LineBreak',
  'paragraph',
  'group',
]);

function isInteresting(node: AXNode): boolean {
  if (node.ignored) return false;
  const role = String(node.role?.value ?? '');
  if (UNINTERESTING_ROLES.has(role)) return false;
  return true;
}

// ── Public API ──

export interface AXTreeResult {
  /** Formatted text representation of the AX tree. */
  formatted: string;
  /** The raw AX nodes from CDP. */
  nodes: AXNode[];
}

/**
 * Fetch the full AX tree via CDP, assign UIDs, store the mapping,
 * and return the formatted text.
 */
export async function fetchAXTree(verbose: boolean): Promise<AXTreeResult> {
  await sendCdp('Accessibility.enable');
  const result = await sendCdp('Accessibility.getFullAXTree');
  const nodes: AXNode[] = result.nodes ?? [];

  // Rebuild maps
  const newUidMap = new Map<string, AXNode>();
  const newCdpMap = new Map<string, AXNode>();
  for (const node of nodes) {
    newCdpMap.set(node.nodeId, node);
  }

  const roots = nodes.filter(n => !n.parentId);
  let uidCounter = 0;

  function formatNode(node: AXNode, depth: number): string {
    const include = verbose || isInteresting(node);

    let result = '';
    if (include) {
      const uid = `s0_${uidCounter++}`;
      newUidMap.set(uid, node);

      const parts: string[] = [`uid=${uid}`];

      const role = node.role?.value;
      if (role) {
        parts.push(role === 'none' ? 'ignored' : String(role));
      }

      if (node.name?.value) {
        parts.push(`"${node.name.value}"`);
      }

      if (node.properties) {
        for (const prop of node.properties) {
          const mapped = BOOLEAN_PROPERTY_MAP[prop.name];
          if (prop.value.type === 'boolean' || prop.value.type === 'booleanOrUndefined') {
            if (prop.value.value) {
              if (mapped) parts.push(mapped);
              parts.push(prop.name);
            }
          } else if (typeof prop.value.value === 'string') {
            parts.push(`${prop.name}="${prop.value.value}"`);
          } else if (typeof prop.value.value === 'number') {
            parts.push(`${prop.name}="${prop.value.value}"`);
          }
        }
      }

      if (node.value?.value !== undefined && node.value.value !== '') {
        parts.push(`value="${node.value.value}"`);
      }

      const indent = ' '.repeat(depth * 2);
      result += `${indent}${parts.join(' ')}\n`;
    }

    const childDepth = include ? depth + 1 : depth;
    if (node.childIds) {
      for (const childId of node.childIds) {
        const child = newCdpMap.get(childId);
        if (child) {
          result += formatNode(child, childDepth);
        }
      }
    }

    return result;
  }

  let output = '';
  for (const root of roots) {
    output += formatNode(root, 0);
  }

  // Commit the new maps
  uidToAXNode = newUidMap;
  cdpNodeMap = newCdpMap;

  return {
    formatted: output || '(empty accessibility tree)',
    nodes,
  };
}

/**
 * Retrieve the AX node for a given UID from the last snapshot.
 * Throws if the UID is not found.
 */
export function getAXNodeByUid(uid: string): AXNode {
  const node = uidToAXNode.get(uid);
  if (!node) {
    throw new Error(
      `Element with uid "${uid}" not found. ` +
      'Take a new snapshot to get the latest UIDs.',
    );
  }
  return node;
}

/**
 * Get the backendDOMNodeId for a given UID.
 * Walks up the AX tree to find the nearest node with a DOM backing.
 */
export function getBackendNodeId(uid: string): number {
  const node = getAXNodeByUid(uid);
  // Walk up if the target node lacks a backendDOMNodeId
  let current: AXNode | undefined = node;
  while (current) {
    if (current.backendDOMNodeId !== undefined) {
      return current.backendDOMNodeId;
    }
    current = current.parentId ? cdpNodeMap.get(current.parentId) : undefined;
  }
  throw new Error(
    `Element with uid "${uid}" has no backing DOM node. ` +
    'It may be a virtual accessibility node.',
  );
}

/**
 * Resolve a UID to a CDP RemoteObjectId by calling DOM.resolveNode.
 */
export async function resolveNodeToRemoteObject(uid: string): Promise<string> {
  const backendNodeId = getBackendNodeId(uid);
  await sendCdp('DOM.enable');
  const result = await sendCdp('DOM.resolveNode', {backendNodeId});
  if (!result.object?.objectId) {
    throw new Error(
      `Could not resolve DOM node for uid "${uid}" (backendNodeId=${backendNodeId}).`,
    );
  }
  return result.object.objectId;
}

/**
 * Get the center coordinates of an element by UID using DOM.getBoxModel.
 * Falls back to DOM.getContentQuads if box model is unavailable.
 */
export async function getElementCenter(uid: string): Promise<{x: number; y: number}> {
  const backendNodeId = getBackendNodeId(uid);
  await sendCdp('DOM.enable');

  try {
    const boxModel = await sendCdp('DOM.getBoxModel', {backendNodeId});
    // content quad: [x1,y1, x2,y2, x3,y3, x4,y4]
    const content = boxModel.model.content;
    const x = (content[0] + content[2] + content[4] + content[6]) / 4;
    const y = (content[1] + content[3] + content[5] + content[7]) / 4;
    return {x, y};
  } catch {
    // Fallback: try getContentQuads
    const quads = await sendCdp('DOM.getContentQuads', {backendNodeId});
    if (!quads.quads?.length) {
      throw new Error(
        `Element with uid "${uid}" has no visible bounding box. ` +
        'It may be hidden or off-screen.',
      );
    }
    const quad = quads.quads[0]; // [x1,y1, x2,y2, x3,y3, x4,y4]
    const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
    const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
    return {x, y};
  }
}

/**
 * Focus a DOM element by its UID using DOM.focus.
 */
export async function focusElement(uid: string): Promise<void> {
  const backendNodeId = getBackendNodeId(uid);
  await sendCdp('DOM.enable');
  await sendCdp('DOM.focus', {backendNodeId});
}

/**
 * Scroll an element into view by UID.
 */
export async function scrollIntoView(uid: string): Promise<void> {
  const backendNodeId = getBackendNodeId(uid);
  await sendCdp('DOM.enable');
  await sendCdp('DOM.scrollIntoViewIfNeeded', {backendNodeId});
}

// ── Input Helpers ──

/**
 * Click at specific coordinates using CDP Input.dispatchMouseEvent.
 */
export async function clickAtCoords(
  x: number,
  y: number,
  clickCount = 1,
): Promise<void> {
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount,
  });
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount,
  });
}

/**
 * Click an element by its UID. Scrolls into view first, then clicks at center.
 */
export async function clickElement(
  uid: string,
  clickCount = 1,
): Promise<void> {
  await scrollIntoView(uid);
  const {x, y} = await getElementCenter(uid);
  logger(`Clicking uid=${uid} at (${x}, ${y}), count=${clickCount}`);
  await clickAtCoords(x, y, clickCount);
}

/**
 * Hover over an element by UID.
 */
export async function hoverElement(uid: string): Promise<void> {
  await scrollIntoView(uid);
  const {x, y} = await getElementCenter(uid);
  logger(`Hovering uid=${uid} at (${x}, ${y})`);
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
  });
}

/**
 * Type text into a focused element using Input.insertText for speed,
 * or use Input.dispatchKeyEvent for individual keys.
 */
export async function insertText(text: string): Promise<void> {
  await sendCdp('Input.insertText', {text});
}

/**
 * Clear the current value of a focused input/textarea by selecting all then deleting.
 */
export async function clearFocusedElement(): Promise<void> {
  // Select all
  await dispatchKeyCombo('a', ['Control']);
  // Delete
  await dispatchRawKey('Backspace');
}

/**
 * Fill a form element by UID: focus it, clear existing value, type new value.
 */
export async function fillElement(uid: string, value: string): Promise<void> {
  await scrollIntoView(uid);
  await focusElement(uid);
  // Small delay for focus to settle
  await new Promise(r => setTimeout(r, 50));
  await clearFocusedElement();
  await insertText(value);
}

// ── Key dispatch ──

const KEY_DEFINITIONS: Record<string, {keyCode: number; code: string; key: string}> = {
  Enter: {keyCode: 13, code: 'Enter', key: 'Enter'},
  Tab: {keyCode: 9, code: 'Tab', key: 'Tab'},
  Backspace: {keyCode: 8, code: 'Backspace', key: 'Backspace'},
  Delete: {keyCode: 46, code: 'Delete', key: 'Delete'},
  Escape: {keyCode: 27, code: 'Escape', key: 'Escape'},
  Space: {keyCode: 32, code: 'Space', key: ' '},
  ArrowUp: {keyCode: 38, code: 'ArrowUp', key: 'ArrowUp'},
  ArrowDown: {keyCode: 40, code: 'ArrowDown', key: 'ArrowDown'},
  ArrowLeft: {keyCode: 37, code: 'ArrowLeft', key: 'ArrowLeft'},
  ArrowRight: {keyCode: 39, code: 'ArrowRight', key: 'ArrowRight'},
  Home: {keyCode: 36, code: 'Home', key: 'Home'},
  End: {keyCode: 35, code: 'End', key: 'End'},
  PageUp: {keyCode: 33, code: 'PageUp', key: 'PageUp'},
  PageDown: {keyCode: 34, code: 'PageDown', key: 'PageDown'},
  F1: {keyCode: 112, code: 'F1', key: 'F1'},
  F2: {keyCode: 113, code: 'F2', key: 'F2'},
  F3: {keyCode: 114, code: 'F3', key: 'F3'},
  F4: {keyCode: 115, code: 'F4', key: 'F4'},
  F5: {keyCode: 116, code: 'F5', key: 'F5'},
  F6: {keyCode: 117, code: 'F6', key: 'F6'},
  F7: {keyCode: 118, code: 'F7', key: 'F7'},
  F8: {keyCode: 119, code: 'F8', key: 'F8'},
  F9: {keyCode: 120, code: 'F9', key: 'F9'},
  F10: {keyCode: 121, code: 'F10', key: 'F10'},
  F11: {keyCode: 122, code: 'F11', key: 'F11'},
  F12: {keyCode: 123, code: 'F12', key: 'F12'},
};

const MODIFIER_KEYS: Record<string, {bit: number; keyCode: number; code: string; key: string}> = {
  Control: {bit: 2, keyCode: 17, code: 'ControlLeft', key: 'Control'},
  ControlLeft: {bit: 2, keyCode: 17, code: 'ControlLeft', key: 'Control'},
  ControlRight: {bit: 2, keyCode: 17, code: 'ControlRight', key: 'Control'},
  Shift: {bit: 8, keyCode: 16, code: 'ShiftLeft', key: 'Shift'},
  ShiftLeft: {bit: 8, keyCode: 16, code: 'ShiftLeft', key: 'Shift'},
  ShiftRight: {bit: 8, keyCode: 16, code: 'ShiftRight', key: 'Shift'},
  Alt: {bit: 1, keyCode: 18, code: 'AltLeft', key: 'Alt'},
  AltLeft: {bit: 1, keyCode: 18, code: 'AltLeft', key: 'Alt'},
  AltRight: {bit: 1, keyCode: 18, code: 'AltRight', key: 'Alt'},
  Meta: {bit: 4, keyCode: 91, code: 'MetaLeft', key: 'Meta'},
  MetaLeft: {bit: 4, keyCode: 91, code: 'MetaLeft', key: 'Meta'},
  MetaRight: {bit: 4, keyCode: 91, code: 'MetaRight', key: 'Meta'},
};

/**
 * Dispatch a single key press (keyDown + keyUp) via CDP.
 */
export async function dispatchRawKey(keyName: string, modifiers = 0): Promise<void> {
  const def = KEY_DEFINITIONS[keyName];
  if (def) {
    await sendCdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: def.keyCode,
      code: def.code,
      key: def.key,
      modifiers,
    });
    await sendCdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: def.keyCode,
      code: def.code,
      key: def.key,
      modifiers,
    });
  } else if (keyName.length === 1) {
    // Single character
    const charCode = keyName.charCodeAt(0);
    await sendCdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: charCode,
      key: keyName,
      modifiers,
    });
    // Only emit char event for printable characters without modifiers that would suppress it
    if (modifiers === 0 || modifiers === 8) {
      await sendCdp('Input.dispatchKeyEvent', {
        type: 'char',
        text: keyName,
        key: keyName,
        modifiers,
      });
    }
    await sendCdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: charCode,
      key: keyName,
      modifiers,
    });
  } else {
    throw new Error(`Unknown key: "${keyName}"`);
  }
}

/**
 * Dispatch a key combination like Ctrl+A, Ctrl+Shift+P, etc.
 * Presses modifier keys down, presses the main key, then releases modifiers.
 */
export async function dispatchKeyCombo(
  key: string,
  modifierNames: string[],
): Promise<void> {
  let modifierBits = 0;
  for (const name of modifierNames) {
    const mod = MODIFIER_KEYS[name];
    if (!mod) throw new Error(`Unknown modifier: "${name}"`);
    modifierBits |= mod.bit;
  }

  // Press modifiers down
  for (const name of modifierNames) {
    const mod = MODIFIER_KEYS[name]!;
    await sendCdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: mod.keyCode,
      code: mod.code,
      key: mod.key,
      modifiers: modifierBits,
    });
  }

  // Press the main key
  await dispatchRawKey(key, modifierBits);

  // Release modifiers in reverse
  for (const name of [...modifierNames].reverse()) {
    const mod = MODIFIER_KEYS[name]!;
    await sendCdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: mod.keyCode,
      code: mod.code,
      key: mod.key,
      modifiers: 0,
    });
  }
}

/**
 * Parse a key combo string like "Control+Shift+P" or "Enter"
 * and dispatch it via CDP.
 */
export async function pressKey(keyInput: string): Promise<void> {
  const parts: string[] = [];
  let current = '';
  for (const ch of keyInput) {
    if (ch === '+' && current) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);

  if (parts.length === 0) {
    throw new Error(`Key "${keyInput}" could not be parsed.`);
  }

  // Last token is the main key, everything before is a modifier
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  if (modifiers.length > 0) {
    await dispatchKeyCombo(mainKey, modifiers);
  } else {
    await dispatchRawKey(mainKey);
  }
}

// ── Drag and Drop ──

/**
 * Drag from one element to another using mouse events.
 */
export async function dragElement(
  fromUid: string,
  toUid: string,
): Promise<void> {
  await scrollIntoView(fromUid);
  const from = await getElementCenter(fromUid);
  await scrollIntoView(toUid);
  const to = await getElementCenter(toUid);

  logger(`Dragging from uid=${fromUid} (${from.x},${from.y}) to uid=${toUid} (${to.x},${to.y})`);

  // Mouse down at source
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: from.x,
    y: from.y,
    button: 'left',
    clickCount: 1,
  });

  // Move to target in steps for drag recognition
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * (i / steps);
    const y = from.y + (to.y - from.y) * (i / steps);
    await sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'left',
    });
  }

  // Small pause for drag recognition
  await new Promise(r => setTimeout(r, 50));

  // Mouse up at target
  await sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: to.x,
    y: to.y,
    button: 'left',
    clickCount: 1,
  });
}

// ── Screenshot ──

/**
 * Capture a screenshot of the page or a specific element via CDP.
 */
export async function captureScreenshot(options: {
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  uid?: string;
  fullPage?: boolean;
}): Promise<Buffer> {
  const params: Record<string, unknown> = {
    format: options.format ?? 'png',
    optimizeForSpeed: true,
  };

  if (options.quality !== undefined && options.format !== 'png') {
    params.quality = options.quality;
  }

  if (options.uid) {
    // Clip to element bounds
    const backendNodeId = getBackendNodeId(options.uid);
    await sendCdp('DOM.enable');
    await sendCdp('DOM.scrollIntoViewIfNeeded', {backendNodeId});
    const boxModel = await sendCdp('DOM.getBoxModel', {backendNodeId});
    const content = boxModel.model.content;
    const xs = [content[0], content[2], content[4], content[6]];
    const ys = [content[1], content[3], content[5], content[7]];
    params.clip = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      scale: 1,
    };
  } else if (options.fullPage) {
    // Get full page dimensions
    const metrics = await sendCdp('Page.getLayoutMetrics');
    params.clip = {
      x: 0,
      y: 0,
      width: metrics.contentSize.width,
      height: metrics.contentSize.height,
      scale: 1,
    };
  }

  const result = await sendCdp('Page.captureScreenshot', params);
  return Buffer.from(result.data, 'base64');
}
