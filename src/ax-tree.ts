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

import {logger} from './logger.js';
import {cdpService, type AttachedTargetInfo} from './services/index.js';

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

/** Maps UIDs to their frame IDs for cross-frame interaction. */
let uidToFrameId = new Map<string, string>();

// ── Frame Types ──

interface FrameInfo {
  id: string;
  name?: string;
  url: string;
  securityOrigin?: string;
}

interface FrameTreeNode {
  frame: FrameInfo;
  childFrames?: FrameTreeNode[];
}

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
  if (node.ignored) {return false;}
  const role = String(node.role?.value ?? '');
  if (UNINTERESTING_ROLES.has(role)) {return false;}
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
 * Collect all frames from the frame tree recursively.
 */
function collectFrames(node: FrameTreeNode): FrameInfo[] {
  const frames: FrameInfo[] = [node.frame];
  if (node.childFrames) {
    for (const child of node.childFrames) {
      frames.push(...collectFrames(child));
    }
  }
  return frames;
}

/**
 * Determine if a frame is a webview based on its URL or properties.
 */
function isWebviewFrame(frame: FrameInfo): boolean {
  const url = frame.url.toLowerCase();
  return url.includes('vscode-webview://') ||
         url.includes('webview-panel') ||
         url.includes('vscode-webview-resource://') ||
         (frame.name?.includes('webview') ?? false);
}

/**
 * Get a human-readable label for a frame.
 */
function getFrameLabel(frame: FrameInfo, isMain: boolean): string {
  if (isMain) {
    return 'Main Window';
  }
  if (isWebviewFrame(frame)) {
    const nameMatch = frame.url.match(/vscode-webview:\/\/([^/]+)/);
    if (nameMatch) {
      return `Webview: ${nameMatch[1].substring(0, 20)}`;
    }
    return frame.name ? `Webview: ${frame.name}` : 'Webview';
  }
  return frame.name || `Frame: ${frame.id.substring(0, 8)}`;
}

/**
 * Determine if a URL is a webview URL.
 */
function isWebviewUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('vscode-webview://') ||
         lowerUrl.includes('webview-panel') ||
         lowerUrl.includes('vscode-webview-resource://');
}

/**
 * Get a human-readable label for an OOPIF target.
 */
function getOOPIFLabel(target: AttachedTargetInfo): string {
  if (isWebviewUrl(target.url)) {
    const nameMatch = target.url.match(/vscode-webview:\/\/([^/]+)/);
    if (nameMatch) {
      return `OOPIF Webview: ${nameMatch[1].substring(0, 20)}`;
    }
    return target.title ? `OOPIF Webview: ${target.title}` : 'OOPIF Webview';
  }
  return target.title ? `OOPIF: ${target.title}` : `OOPIF: ${target.targetId.substring(0, 8)}`;
}

/**
 * Format AX nodes from an OOPIF target.
 */
function formatOOPIFNodes(
  nodes: AXNode[],
  sessionId: string,
  label: string,
  baseDepth: number,
  uidMap: Map<string, AXNode>,
  cdpMap: Map<string, AXNode>,
  uidToFrameIdMap: Map<string, string>,
  verbose: boolean,
  getNextUid: () => number,
): string {
  // Build local CDP map for this OOPIF
  const localCdpMap = new Map<string, AXNode>();
  for (const node of nodes) {
    localCdpMap.set(node.nodeId, node);
    cdpMap.set(`oopif:${sessionId}:${node.nodeId}`, node);
  }

  const roots = nodes.filter(n => !n.parentId);
  let result = '';

  function formatNode(node: AXNode, depth: number): string {
    const include = verbose || isInteresting(node);

    let nodeOutput = '';
    if (include) {
      const uid = `s${getNextUid()}`;
      uidMap.set(uid, node);
      // Use sessionId as frameId for OOPIF interactions
      uidToFrameIdMap.set(uid, `oopif:${sessionId}`);

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
              if (mapped) {parts.push(mapped);}
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
      nodeOutput += `${indent}${parts.join(' ')}\n`;
    }

    const childDepth = include ? depth + 1 : depth;
    if (node.childIds) {
      for (const childId of node.childIds) {
        const child = localCdpMap.get(childId);
        if (child) {
          nodeOutput += formatNode(child, childDepth);
        }
      }
    }

    return nodeOutput;
  }

  // Add OOPIF header if there are interesting nodes
  let frameContent = '';
  for (const root of roots) {
    frameContent += formatNode(root, baseDepth + 1);
  }

  if (frameContent.trim()) {
    const indent = ' '.repeat(baseDepth * 2);
    result += `${indent}[${label}]\n`;
    result += frameContent;
  }

  return result;
}

/**
 * Fetch the full AX tree via CDP, assign UIDs, store the mapping,
 * and return the formatted text.
 * 
 * Automatically traverses all frames including webviews.
 */
export async function fetchAXTree(verbose: boolean): Promise<AXTreeResult> {
  await cdpService.sendCdp('Accessibility.enable');
  await cdpService.sendCdp('Page.enable');

  // Get frame tree to discover all frames including webviews
  let allFrames: FrameInfo[] = [];
  let mainFrameId: string | undefined;
  
  try {
    const frameTreeResult = await cdpService.sendCdp('Page.getFrameTree');
    if (frameTreeResult.frameTree) {
      allFrames = collectFrames(frameTreeResult.frameTree);
      mainFrameId = frameTreeResult.frameTree.frame.id;
      logger(`[AX Tree] Found ${allFrames.length} frame(s) (${allFrames.filter(isWebviewFrame).length} webviews)`);
    }
  } catch (err) {
    logger(`[AX Tree] Could not get frame tree, using main frame only: ${err}`);
  }

  // Rebuild maps
  const newUidMap = new Map<string, AXNode>();
  const newCdpMap = new Map<string, AXNode>();
  const newUidToFrameId = new Map<string, string>();
  
  let globalUidCounter = 0;
  let allNodes: AXNode[] = [];
  let output = '';

  // Format nodes for a single frame
  function formatFrameNodes(
    nodes: AXNode[],
    frameId: string,
    frameLabel: string,
    baseDepth: number,
  ): string {
    // Build local CDP map for this frame
    const localCdpMap = new Map<string, AXNode>();
    for (const node of nodes) {
      localCdpMap.set(node.nodeId, node);
      newCdpMap.set(`${frameId}:${node.nodeId}`, node);
    }

    const roots = nodes.filter(n => !n.parentId);
    let result = '';

    function formatNode(node: AXNode, depth: number): string {
      const include = verbose || isInteresting(node);

      let nodeOutput = '';
      if (include) {
        const uid = `s${globalUidCounter++}`;
        newUidMap.set(uid, node);
        newUidToFrameId.set(uid, frameId);

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
                if (mapped) {parts.push(mapped);}
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
        nodeOutput += `${indent}${parts.join(' ')}\n`;
      }

      const childDepth = include ? depth + 1 : depth;
      if (node.childIds) {
        for (const childId of node.childIds) {
          const child = localCdpMap.get(childId);
          if (child) {
            nodeOutput += formatNode(child, childDepth);
          }
        }
      }

      return nodeOutput;
    }

    // Add frame header if there are interesting nodes
    let frameContent = '';
    for (const root of roots) {
      frameContent += formatNode(root, baseDepth + 1);
    }

    if (frameContent.trim()) {
      const indent = ' '.repeat(baseDepth * 2);
      result += `${indent}[${frameLabel}]\n`;
      result += frameContent;
    }

    return result;
  }

  // If we have frames, process each one
  if (allFrames.length > 0) {
    for (const frame of allFrames) {
      try {
        const result = await cdpService.sendCdp('Accessibility.getFullAXTree', {frameId: frame.id});
        const nodes: AXNode[] = result.nodes ?? [];
        
        if (nodes.length > 0) {
          allNodes.push(...nodes);
          const isMain = frame.id === mainFrameId;
          const label = getFrameLabel(frame, isMain);
          output += formatFrameNodes(nodes, frame.id, label, 0);
        }
      } catch (err) {
        logger(`[AX Tree] Could not get AX tree for frame ${frame.id}: ${err}`);
      }
    }
  } else {
    // Fallback: just get main frame
    const result = await cdpService.sendCdp('Accessibility.getFullAXTree');
    const nodes: AXNode[] = result.nodes ?? [];
    allNodes = nodes;

    const localCdpMap = new Map<string, AXNode>();
    for (const node of nodes) {
      localCdpMap.set(node.nodeId, node);
      newCdpMap.set(node.nodeId, node);
    }

    const roots = nodes.filter(n => !n.parentId);

    function formatNode(node: AXNode, depth: number): string {
      const include = verbose || isInteresting(node);

      let nodeOutput = '';
      if (include) {
        const uid = `s${globalUidCounter++}`;
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
                if (mapped) {parts.push(mapped);}
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
        nodeOutput += `${indent}${parts.join(' ')}\n`;
      }

      const childDepth = include ? depth + 1 : depth;
      if (node.childIds) {
        for (const childId of node.childIds) {
          const child = localCdpMap.get(childId);
          if (child) {
            nodeOutput += formatNode(child, childDepth);
          }
        }
      }

      return nodeOutput;
    }

    for (const root of roots) {
      output += formatNode(root, 0);
    }
  }

  // Process OOPIF targets (out-of-process iframes like webviews)
  const attachedTargets = cdpService.getAttachedTargets();
  const oopifTargets = attachedTargets.filter(t => t.type === 'iframe' || isWebviewUrl(t.url));
  
  if (oopifTargets.length > 0) {
    logger(`[AX Tree] Processing ${oopifTargets.length} OOPIF target(s)`);
    
    for (const target of oopifTargets) {
      try {
        // Enable accessibility on the target session
        await cdpService.sendCdp('Accessibility.enable', {}, {sessionId: target.sessionId});
        
        // Fetch AX tree for this OOPIF
        const result = await cdpService.sendCdp('Accessibility.getFullAXTree', {}, {sessionId: target.sessionId});
        const nodes: AXNode[] = (result.nodes ?? []) as AXNode[];
        
        if (nodes.length > 0) {
          allNodes.push(...nodes);
          const label = getOOPIFLabel(target);
          output += formatOOPIFNodes(
            nodes,
            target.sessionId,
            label,
            0,
            newUidMap,
            newCdpMap,
            newUidToFrameId,
            verbose,
            () => globalUidCounter++,
          );
        }
      } catch (err) {
        logger(`[AX Tree] Could not get AX tree for OOPIF "${target.title}": ${err}`);
      }
    }
  }

  // Commit the new maps
  uidToAXNode = newUidMap;
  cdpNodeMap = newCdpMap;
  uidToFrameId = newUidToFrameId;

  return {
    formatted: output || '(empty accessibility tree)',
    nodes: allNodes,
  };
}

/**
 * Get the frame ID for a given UID (for cross-frame interactions).
 */
export function getFrameIdForUid(uid: string): string | undefined {
  return uidToFrameId.get(uid);
}

/**
 * Check if a UID refers to an OOPIF element and return the session ID if so.
 */
export function getSessionIdForUid(uid: string): string | undefined {
  const frameId = uidToFrameId.get(uid);
  if (frameId?.startsWith('oopif:')) {
    return frameId.substring(6); // Remove 'oopif:' prefix
  }
  return undefined;
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
  const frameId = uidToFrameId.get(uid);
  
  // Walk up if the target node lacks a backendDOMNodeId
  let current: AXNode | undefined = node;
  while (current) {
    if (current.backendDOMNodeId !== undefined) {
      return current.backendDOMNodeId;
    }
    if (current.parentId) {
      // Try frame-prefixed key first, then non-prefixed (for fallback mode)
      const prefixedKey: string = frameId ? `${frameId}:${current.parentId}` : current.parentId;
      current = cdpNodeMap.get(prefixedKey) ?? cdpNodeMap.get(current.parentId);
    } else {
      current = undefined;
    }
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
  const sessionId = getSessionIdForUid(uid);
  const opts = sessionId ? {sessionId} : undefined;
  await cdpService.sendCdp('DOM.enable', {}, opts);
  const result = await cdpService.sendCdp('DOM.resolveNode', {backendNodeId}, opts);
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
  const sessionId = getSessionIdForUid(uid);
  const opts = sessionId ? {sessionId} : undefined;
  await cdpService.sendCdp('DOM.enable', {}, opts);

  try {
    const boxModel = await cdpService.sendCdp('DOM.getBoxModel', {backendNodeId}, opts);
    // content quad: [x1,y1, x2,y2, x3,y3, x4,y4]
    const content = boxModel.model.content;
    const x = (content[0] + content[2] + content[4] + content[6]) / 4;
    const y = (content[1] + content[3] + content[5] + content[7]) / 4;
    return {x, y};
  } catch {
    // Fallback: try getContentQuads
    const quads = await cdpService.sendCdp('DOM.getContentQuads', {backendNodeId}, opts);
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
  const sessionId = getSessionIdForUid(uid);
  const opts = sessionId ? {sessionId} : undefined;
  await cdpService.sendCdp('DOM.enable', {}, opts);
  await cdpService.sendCdp('DOM.focus', {backendNodeId}, opts);
}

/**
 * Scroll an element into view by UID.
 */
export async function scrollIntoView(uid: string): Promise<void> {
  const backendNodeId = getBackendNodeId(uid);
  const sessionId = getSessionIdForUid(uid);
  const opts = sessionId ? {sessionId} : undefined;
  await cdpService.sendCdp('DOM.enable', {}, opts);
  await cdpService.sendCdp('DOM.scrollIntoViewIfNeeded', {backendNodeId}, opts);
}

/**
 * Scroll an element into view, then optionally dispatch a mouse wheel event
 * at its center to scroll within the element in a given direction.
 */
export async function scrollElement(
  uid: string,
  direction?: 'up' | 'down' | 'left' | 'right',
  amount = 300,
): Promise<void> {
  await scrollIntoView(uid);

  if (!direction) {return;}

  const {x, y} = await getElementCenter(uid);
  const deltaX = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
  const deltaY = direction === 'up' ? -amount : direction === 'down' ? amount : 0;

  logger(`Scrolling uid=${uid} at (${x}, ${y}), deltaX=${deltaX}, deltaY=${deltaY}`);
  await cdpService.sendCdp('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX,
    deltaY,
  });
  // Allow layout to settle after scroll
  await new Promise(r => setTimeout(r, 100));
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
  await cdpService.sendCdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount,
  });
  await cdpService.sendCdp('Input.dispatchMouseEvent', {
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
  await cdpService.sendCdp('Input.dispatchMouseEvent', {
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
  await cdpService.sendCdp('Input.insertText', {text});
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

/**
 * Type text into a focused element at the current cursor position WITHOUT
 * clearing existing content. Behaves like a normal keyboard — appends/inserts
 * at the caret rather than replacing the entire field value.
 */
export async function typeIntoElement(uid: string, value: string): Promise<void> {
  await scrollIntoView(uid);
  await focusElement(uid);
  await new Promise(r => setTimeout(r, 50));
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
    await cdpService.sendCdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: def.keyCode,
      code: def.code,
      key: def.key,
      modifiers,
    });
    await cdpService.sendCdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: def.keyCode,
      code: def.code,
      key: def.key,
      modifiers,
    });
  } else if (keyName.length === 1) {
    // Single character
    const charCode = keyName.charCodeAt(0);
    await cdpService.sendCdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      windowsVirtualKeyCode: charCode,
      key: keyName,
      modifiers,
    });
    // Only emit char event for printable characters without modifiers that would suppress it
    if (modifiers === 0 || modifiers === 8) {
      await cdpService.sendCdp('Input.dispatchKeyEvent', {
        type: 'char',
        text: keyName,
        key: keyName,
        modifiers,
      });
    }
    await cdpService.sendCdp('Input.dispatchKeyEvent', {
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
    if (!mod) {throw new Error(`Unknown modifier: "${name}"`);}
    modifierBits |= mod.bit;
  }

  // Press modifiers down
  for (const name of modifierNames) {
    const mod = MODIFIER_KEYS[name]!;
    await cdpService.sendCdp('Input.dispatchKeyEvent', {
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
    await cdpService.sendCdp('Input.dispatchKeyEvent', {
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
  if (current) {parts.push(current);}

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
  await cdpService.sendCdp('Input.dispatchMouseEvent', {
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
    await cdpService.sendCdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'left',
    });
  }

  // Small pause for drag recognition
  await new Promise(r => setTimeout(r, 50));

  // Mouse up at target
  await cdpService.sendCdp('Input.dispatchMouseEvent', {
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
    const sessionId = getSessionIdForUid(options.uid);
    const opts = sessionId ? {sessionId} : undefined;
    await cdpService.sendCdp('DOM.enable', {}, opts);
    await cdpService.sendCdp('DOM.scrollIntoViewIfNeeded', {backendNodeId}, opts);
    const boxModel = await cdpService.sendCdp('DOM.getBoxModel', {backendNodeId}, opts);
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
    const metrics = await cdpService.sendCdp('Page.getLayoutMetrics');
    params.clip = {
      x: 0,
      y: 0,
      width: metrics.contentSize.width,
      height: metrics.contentSize.height,
      scale: 1,
    };
  }

  const result = await cdpService.sendCdp('Page.captureScreenshot', params);
  return Buffer.from(result.data, 'base64');
}

// ── Snapshot Diff ──

/**
 * Represents a node for comparison purposes.
 * Uses backendDOMNodeId as the stable identifier.
 */
export interface NodeSignature {
  backendDOMNodeId: number;
  role: string;
  name: string;
  description: string;
  value: string;
  focused: boolean;
  expanded: boolean;
  selected: boolean;
  disabled: boolean;
  checked: boolean;
  pressed: boolean;
  required: boolean;
  readonly: boolean;
}

/**
 * Create a signature string for comparison.
 */
function getNodeSignature(node: AXNode): NodeSignature | null {
  if (node.backendDOMNodeId === undefined) {return null;}
  const props = node.properties ?? [];
  const getBool = (name: string) => props.some(p => p.name === name && p.value.value === true);
  return {
    backendDOMNodeId: node.backendDOMNodeId,
    role: String(node.role?.value ?? ''),
    name: String(node.name?.value ?? ''),
    description: String(node.description?.value ?? ''),
    value: String(node.value?.value ?? ''),
    focused: getBool('focused'),
    expanded: getBool('expanded'),
    selected: getBool('selected'),
    disabled: getBool('disabled'),
    checked: getBool('checked'),
    pressed: getBool('pressed'),
    required: getBool('required'),
    readonly: getBool('readonly'),
  };
}

/**
 * Format a node as a single-line summary.
 */
function formatNodeOneLiner(node: AXNode, uid: string): string {
  const parts: string[] = [`uid=${uid}`];
  const role = node.role?.value;
  if (role && role !== 'none') {parts.push(String(role));}
  if (node.name?.value) {parts.push(`"${node.name.value}"`);}
  const props = node.properties ?? [];
  if (props.some(p => p.name === 'focused' && p.value.value)) {parts.push('focused');}
  if (props.some(p => p.name === 'expanded' && p.value.value)) {parts.push('expanded');}
  if (props.some(p => p.name === 'selected' && p.value.value)) {parts.push('selected');}
  if (props.some(p => p.name === 'disabled' && p.value.value)) {parts.push('disabled');}
  if (props.some(p => p.name === 'checked' && p.value.value)) {parts.push('checked');}
  if (props.some(p => p.name === 'pressed' && p.value.value)) {parts.push('pressed');}
  if (props.some(p => p.name === 'required' && p.value.value)) {parts.push('required');}
  if (props.some(p => p.name === 'readonly' && p.value.value)) {parts.push('readonly');}
  if (node.value?.value) {parts.push(`value="${node.value.value}"`);}
  if (node.description?.value) {parts.push(`desc="${node.description.value}"`);}
  return parts.join(' ');
}

export interface SnapshotDiff {
  /** Nodes that appeared in the after snapshot. */
  added: string[];
  /** Nodes that disappeared in the after snapshot. */
  removed: string[];
  /** Nodes whose properties changed (with before→after). */
  changed: string[];
  /** True if there were any changes. */
  hasChanges: boolean;
}

/**
 * Compare two AX tree snapshots and return the diff.
 * Both snapshots should be captured with fetchAXTreeForDiff.
 */
export function diffSnapshots(
  before: Map<number, {node: AXNode; sig: NodeSignature}>,
  after: Map<number, {node: AXNode; sig: NodeSignature; uid: string}>,
): SnapshotDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  // Check for additions and changes
  for (const [domId, afterData] of after) {
    const beforeData = before.get(domId);
    if (!beforeData) {
      // New node
      added.push(formatNodeOneLiner(afterData.node, afterData.uid));
    } else {
      // Check for changes in key properties
      const bSig = beforeData.sig;
      const aSig = afterData.sig;
      const changes: string[] = [];

      if (bSig.name !== aSig.name) {
        changes.push(`name: "${bSig.name}" → "${aSig.name}"`);
      }
      if (bSig.description !== aSig.description) {
        changes.push(`desc: "${bSig.description}" → "${aSig.description}"`);
      }
      if (bSig.value !== aSig.value) {
        changes.push(`value: "${bSig.value}" → "${aSig.value}"`);
      }
      if (bSig.focused !== aSig.focused) {
        changes.push(aSig.focused ? '+focused' : '-focused');
      }
      if (bSig.expanded !== aSig.expanded) {
        changes.push(aSig.expanded ? '+expanded' : '-expanded');
      }
      if (bSig.selected !== aSig.selected) {
        changes.push(aSig.selected ? '+selected' : '-selected');
      }
      if (bSig.disabled !== aSig.disabled) {
        changes.push(aSig.disabled ? '+disabled' : '-disabled');
      }
      if (bSig.checked !== aSig.checked) {
        changes.push(aSig.checked ? '+checked' : '-checked');
      }
      if (bSig.pressed !== aSig.pressed) {
        changes.push(aSig.pressed ? '+pressed' : '-pressed');
      }
      if (bSig.required !== aSig.required) {
        changes.push(aSig.required ? '+required' : '-required');
      }
      if (bSig.readonly !== aSig.readonly) {
        changes.push(aSig.readonly ? '+readonly' : '-readonly');
      }

      if (changes.length > 0) {
        const base = formatNodeOneLiner(afterData.node, afterData.uid);
        changed.push(`${base} (${changes.join(', ')})`);
      }
    }
  }

  // Check for removals (in before but not in after)
  for (const [domId, beforeData] of before) {
    if (!after.has(domId)) {
      // Pick a placeholder UID for removed nodes
      const role = String(beforeData.node.role?.value ?? '');
      const name = beforeData.node.name?.value ? ` "${beforeData.node.name.value}"` : '';
      removed.push(`${role}${name} [removed]`);
    }
  }

  return {
    added,
    removed,
    changed,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0,
  };
}

/**
 * Fetch AX tree for diffing — returns a map keyed by backendDOMNodeId.
 * Does NOT update the global UID mapping.
 * Only includes "interesting" nodes (same filter as the formatted output).
 */
export async function fetchAXTreeForDiff(): Promise<Map<number, {node: AXNode; sig: NodeSignature}>> {
  await cdpService.sendCdp('Accessibility.enable');
  const result = await cdpService.sendCdp('Accessibility.getFullAXTree');
  const nodes: AXNode[] = result.nodes ?? [];

  const map = new Map<number, {node: AXNode; sig: NodeSignature}>();
  for (const node of nodes) {
    if (node.ignored) {continue;}
    if (!isInteresting(node)) {continue;}
    const sig = getNodeSignature(node);
    if (sig) {
      map.set(sig.backendDOMNodeId, {node, sig});
    }
  }
  return map;
}

/**
 * Capture AX tree after an action, with UIDs assigned.
 * Updates global UID mapping and returns a map for diffing.
 */
export async function fetchAXTreeForDiffWithUids(): Promise<{
  map: Map<number, {node: AXNode; sig: NodeSignature; uid: string}>;
  formatted: string;
}> {
  await cdpService.sendCdp('Accessibility.enable');
  const result = await cdpService.sendCdp('Accessibility.getFullAXTree');
  const nodes: AXNode[] = result.nodes ?? [];

  // Build CDP node map
  const cdpMap = new Map<string, AXNode>();
  for (const node of nodes) {
    cdpMap.set(node.nodeId, node);
  }

  // Assign UIDs and build diff map
  const newUidMap = new Map<string, AXNode>();
  const diffMap = new Map<number, {node: AXNode; sig: NodeSignature; uid: string}>();
  let uidCounter = 0;

  const roots = nodes.filter(n => !n.parentId);

  function visit(node: AXNode): void {
    if (!node.ignored && isInteresting(node)) {
      const uid = `s0_${uidCounter++}`;
      newUidMap.set(uid, node);
      const sig = getNodeSignature(node);
      if (sig) {
        diffMap.set(sig.backendDOMNodeId, {node, sig, uid});
      }
    }
    for (const childId of node.childIds ?? []) {
      const child = cdpMap.get(childId);
      if (child) {visit(child);}
    }
  }

  for (const root of roots) {
    visit(root);
  }

  // Update global state
  uidToAXNode = newUidMap;
  cdpNodeMap = cdpMap;

  // Build formatted output (reuse the logic but simpler)
  let formatted = '';
  uidCounter = 0;
  function formatVisit(node: AXNode, depth: number): void {
    if (!node.ignored && isInteresting(node)) {
      const uid = `s0_${uidCounter++}`;
      const indent = ' '.repeat(depth * 2);
      formatted += `${indent}${formatNodeOneLiner(node, uid)}\n`;
    }
    const childDepth = !node.ignored && isInteresting(node) ? depth + 1 : depth;
    for (const childId of node.childIds ?? []) {
      const child = cdpMap.get(childId);
      if (child) {formatVisit(child, childDepth);}
    }
  }
  for (const root of roots) {
    formatVisit(root, 0);
  }

  return {map: diffMap, formatted};
}

/**
 * Poll for changes after an action, up to the specified timeout.
 * Returns the diff between before and after states.
 */
export async function waitForChanges(
  beforeMap: Map<number, {node: AXNode; sig: NodeSignature}>,
  timeoutMs = 1500,
  pollIntervalMs = 100,
): Promise<{diff: SnapshotDiff; formatted: string}> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const {map: afterMap, formatted} = await fetchAXTreeForDiffWithUids();
    const diff = diffSnapshots(beforeMap, afterMap);

    if (diff.hasChanges) {
      return {diff, formatted};
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  // Final check after timeout
  const {map: afterMap, formatted} = await fetchAXTreeForDiffWithUids();
  const diff = diffSnapshots(beforeMap, afterMap);
  return {diff, formatted};
}

/**
 * Execute an action and return the UI diff.
 * This is the main helper for interactive tools.
 */
export async function executeWithDiff<T>(
  action: () => Promise<T>,
  timeoutMs = 1500,
): Promise<{result: T; diff: SnapshotDiff; summary: string}> {
  // Capture before state
  const beforeMap = await fetchAXTreeForDiff();

  // Execute the action
  const result = await action();

  // Wait for changes
  const {diff} = await waitForChanges(beforeMap, timeoutMs);

  // Build summary
  let summary = '';
  if (!diff.hasChanges) {
    summary = 'No visible changes detected.';
  } else {
    const lines: string[] = [];
    if (diff.added.length > 0) {
      lines.push(`Added (${diff.added.length}):`);
      for (const item of diff.added.slice(0, 10)) {
        lines.push(`  + ${item}`);
      }
      if (diff.added.length > 10) {
        lines.push(`  ... and ${diff.added.length - 10} more`);
      }
    }
    if (diff.removed.length > 0) {
      lines.push(`Removed (${diff.removed.length}):`);
      for (const item of diff.removed.slice(0, 10)) {
        lines.push(`  - ${item}`);
      }
      if (diff.removed.length > 10) {
        lines.push(`  ... and ${diff.removed.length - 10} more`);
      }
    }
    if (diff.changed.length > 0) {
      lines.push(`Changed (${diff.changed.length}):`);
      for (const item of diff.changed.slice(0, 10)) {
        lines.push(`  ~ ${item}`);
      }
      if (diff.changed.length > 10) {
        lines.push(`  ... and ${diff.changed.length - 10} more`);
      }
    }
    summary = lines.join('\n');
  }

  return {result, diff, summary};
}
