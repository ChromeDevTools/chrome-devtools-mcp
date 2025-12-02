/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import {
  getCdpSession,
  resolveToNodeId,
  ensureDomEnabled,
  ensureCssEnabled,
  ensureOverlayEnabled,
  formatQuad,
  cssPropertiesToObject,
} from '../utils/cdpHelper.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ============================================================================
// Tool 1: inspect_element
// ============================================================================

export const inspectElement = defineTool({
  name: 'inspect_element',
  description: `Get comprehensive information about an element including its HTML, attributes, and position.
This is equivalent to inspecting an element in Chrome DevTools Elements panel.
Returns tag name, id, classes, all attributes, outer HTML, and box model dimensions.`,
  annotations: {
    title: 'Inspect Element',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
    includeHtml: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Include the outer HTML of the element'),
    maxHtmlLength: zod
      .number()
      .int()
      .min(100)
      .max(50000)
      .optional()
      .default(5000)
      .describe('Maximum length of HTML to return (truncated if longer)'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    const nodeId = await resolveToNodeId(client, axNode.backendNodeId);

    // Get node description
    const {node} = await client.send('DOM.describeNode', {
      nodeId,
      depth: 1,
      pierce: true,
    });

    // Get attributes
    const {attributes} = await client.send('DOM.getAttributes', {nodeId});
    const attrMap: Record<string, string> = {};
    for (let i = 0; i < attributes.length; i += 2) {
      attrMap[attributes[i]] = attributes[i + 1];
    }

    // Get box model
    let boxModel = null;
    try {
      const {model} = await client.send('DOM.getBoxModel', {nodeId});
      boxModel = {
        content: formatQuad(model.content),
        padding: formatQuad(model.padding),
        border: formatQuad(model.border),
        margin: formatQuad(model.margin),
        width: model.width,
        height: model.height,
      };
    } catch {
      // Box model may not be available for all elements
    }

    // Get outer HTML
    let outerHTML = '';
    if (request.params.includeHtml) {
      try {
        const result = await client.send('DOM.getOuterHTML', {nodeId});
        outerHTML = result.outerHTML;
        if (outerHTML.length > request.params.maxHtmlLength) {
          outerHTML =
            outerHTML.substring(0, request.params.maxHtmlLength) +
            '\n... (truncated)';
        }
      } catch {
        // HTML may not be available
      }
    }

    const result = {
      uid: request.params.uid,
      tagName: node.nodeName.toLowerCase(),
      nodeType: node.nodeType,
      id: attrMap['id'] || null,
      className: attrMap['class'] || null,
      attributes: attrMap,
      childCount: node.childNodeCount || 0,
      boxModel,
      outerHTML: request.params.includeHtml ? outerHTML : undefined,
    };

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// ============================================================================
// Tool 2: get_element_styles
// ============================================================================

export const getElementStyles = defineTool({
  name: 'get_element_styles',
  description: `Get CSS styles for an element including computed styles, matched CSS rules, and inherited styles.
This is equivalent to the "Styles" panel in Chrome DevTools Elements tab.
Use this to understand how an element is styled and copy styles from websites.`,
  annotations: {
    title: 'Get Element Styles',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
    includeInherited: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include styles inherited from ancestor elements'),
    includeComputed: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Include final computed style values'),
    properties: zod
      .array(zod.string())
      .optional()
      .describe(
        'Filter to specific CSS properties (e.g., ["color", "font-size"]). If omitted, returns common properties.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);
    await ensureCssEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    const nodeId = await resolveToNodeId(client, axNode.backendNodeId);

    const result: Record<string, unknown> = {};

    // Get computed styles
    if (request.params.includeComputed) {
      const {computedStyle} = await client.send('CSS.getComputedStyleForNode', {
        nodeId,
      });

      const defaultProperties = [
        'display',
        'position',
        'width',
        'height',
        'margin',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'border',
        'border-width',
        'border-style',
        'border-color',
        'border-radius',
        'color',
        'background-color',
        'background',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'text-align',
        'flex-direction',
        'justify-content',
        'align-items',
        'gap',
        'grid-template-columns',
        'grid-template-rows',
        'opacity',
        'visibility',
        'overflow',
        'z-index',
        'box-shadow',
        'transform',
        'transition',
      ];

      const filterProps = request.params.properties || defaultProperties;

      const computed: Record<string, string> = {};
      for (const prop of computedStyle) {
        if (filterProps.includes(prop.name)) {
          computed[prop.name] = prop.value;
        }
      }
      result.computed = computed;
    }

    // Get matched styles
    const matched = await client.send('CSS.getMatchedStylesForNode', {nodeId});

    // Process inline styles
    if (matched.inlineStyle?.cssProperties) {
      const inline = cssPropertiesToObject(
        matched.inlineStyle.cssProperties,
        request.params.properties,
      );
      if (Object.keys(inline).length > 0) {
        result.inline = inline;
      }
    }

    // Process matched CSS rules
    if (matched.matchedCSSRules) {
      const matchedRules = matched.matchedCSSRules
        .map(match => {
          const selector = match.rule.selectorList?.selectors
            ?.map(s => s.text)
            .join(', ');
          const properties = cssPropertiesToObject(
            match.rule.style?.cssProperties || [],
            request.params.properties,
          );

          if (Object.keys(properties).length === 0) return null;

          return {
            selector,
            origin: match.rule.origin,
            properties,
          };
        })
        .filter(Boolean);

      if (matchedRules.length > 0) {
        result.matchedRules = matchedRules;
      }
    }

    // Process inherited styles
    if (request.params.includeInherited && matched.inherited) {
      const inherited = matched.inherited
        .map((inh, index) => {
          const rules = inh.matchedCSSRules
            ?.map(match => {
              const selector = match.rule.selectorList?.selectors
                ?.map(s => s.text)
                .join(', ');
              const properties = cssPropertiesToObject(
                match.rule.style?.cssProperties || [],
                request.params.properties,
              );

              if (Object.keys(properties).length === 0) return null;

              return {selector, properties};
            })
            .filter(Boolean);

          if (!rules || rules.length === 0) return null;

          return {
            ancestorLevel: index + 1,
            matchedRules: rules,
          };
        })
        .filter(Boolean);

      if (inherited.length > 0) {
        result.inherited = inherited;
      }
    }

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// ============================================================================
// Tool 3: get_element_box_model
// ============================================================================

export const getElementBoxModel = defineTool({
  name: 'get_element_box_model',
  description: `Get the box model (layout) information for an element.
Returns content, padding, border, and margin dimensions.
This is equivalent to the box model diagram shown in Chrome DevTools.`,
  annotations: {
    title: 'Get Element Box Model',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    const nodeId = await resolveToNodeId(client, axNode.backendNodeId);

    const {model} = await client.send('DOM.getBoxModel', {nodeId});

    // Also get content quads for more precise positioning
    let quads = null;
    try {
      const result = await client.send('DOM.getContentQuads', {nodeId});
      quads = result.quads;
    } catch {
      // Quads may not be available
    }

    const result = {
      uid: request.params.uid,
      content: formatQuad(model.content),
      padding: formatQuad(model.padding),
      border: formatQuad(model.border),
      margin: formatQuad(model.margin),
      width: model.width,
      height: model.height,
      quads,
    };

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// ============================================================================
// Tool 4: query_selector
// ============================================================================

export const querySelector = defineTool({
  name: 'query_selector',
  description: `Find elements using CSS selectors.
Returns element information for matching elements.
Use this to find elements by class, id, tag, or complex CSS selectors.`,
  annotations: {
    title: 'Query Selector',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    selector: zod
      .string()
      .describe(
        'CSS selector (e.g., ".btn-primary", "#header", "div.container > p")',
      ),
    all: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Return all matching elements vs just the first match'),
    limit: zod
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum number of elements to return when all=true'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);

    const {root} = await client.send('DOM.getDocument', {depth: 0});

    let nodeIds: number[] = [];

    if (request.params.all) {
      const result = await client.send('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector: request.params.selector,
      });
      nodeIds = result.nodeIds.slice(0, request.params.limit);
    } else {
      const result = await client.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: request.params.selector,
      });
      if (result.nodeId) {
        nodeIds = [result.nodeId];
      }
    }

    if (nodeIds.length === 0) {
      response.appendResponseLine(
        JSON.stringify({
          found: 0,
          message: `No elements found matching selector: ${request.params.selector}`,
        }),
      );
      return;
    }

    const elements = [];
    for (const nodeId of nodeIds) {
      try {
        const {node} = await client.send('DOM.describeNode', {
          nodeId,
          depth: 0,
        });

        const {attributes} = await client.send('DOM.getAttributes', {nodeId});
        const attrMap: Record<string, string> = {};
        for (let i = 0; i < attributes.length; i += 2) {
          attrMap[attributes[i]] = attributes[i + 1];
        }

        elements.push({
          nodeId,
          backendNodeId: node.backendNodeId,
          tagName: node.nodeName.toLowerCase(),
          id: attrMap['id'] || null,
          className: attrMap['class'] || null,
        });
      } catch {
        // Skip nodes that can't be described
      }
    }

    response.appendResponseLine(
      JSON.stringify(
        {
          found: elements.length,
          selector: request.params.selector,
          elements,
        },
        null,
        2,
      ),
    );
  },
});

// ============================================================================
// Tool 5: highlight_element
// ============================================================================

export const highlightElement = defineTool({
  name: 'highlight_element',
  description: `Visually highlight an element on the page with a colored overlay.
Useful for verifying you've identified the correct element.
The highlight shows content (blue), padding (green), border (yellow), and margin (orange).`,
  annotations: {
    title: 'Highlight Element',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
    duration: zod
      .number()
      .int()
      .min(0)
      .max(30000)
      .optional()
      .default(3000)
      .describe(
        'How long to show highlight in milliseconds (0 = until hide_highlight is called)',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);
    await ensureOverlayEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    await client.send('Overlay.highlightNode', {
      highlightConfig: {
        contentColor: {r: 111, g: 168, b: 220, a: 0.66},
        paddingColor: {r: 147, g: 196, b: 125, a: 0.55},
        borderColor: {r: 255, g: 229, b: 153, a: 0.66},
        marginColor: {r: 246, g: 178, b: 107, a: 0.66},
        showInfo: true,
        showStyles: true,
        showRulers: false,
        showAccessibilityInfo: true,
      },
      backendNodeId: axNode.backendNodeId,
    });

    if (request.params.duration > 0) {
      setTimeout(async () => {
        try {
          await client.send('Overlay.hideHighlight');
        } catch {
          // Ignore errors when hiding
        }
      }, request.params.duration);
    }

    response.appendResponseLine(
      `Element highlighted for ${request.params.duration}ms. Use hide_highlight to remove early.`,
    );
  },
});

// ============================================================================
// Tool 6: hide_highlight
// ============================================================================

export const hideHighlight = defineTool({
  name: 'hide_highlight',
  description: `Hide any active element highlight on the page.`,
  annotations: {
    title: 'Hide Highlight',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    try {
      await client.send('Overlay.hideHighlight');
      response.appendResponseLine('Highlight hidden.');
    } catch {
      response.appendResponseLine('No highlight was active.');
    }
  },
});

// ============================================================================
// Tool 7: get_dom_tree
// ============================================================================

export const getDomTree = defineTool({
  name: 'get_dom_tree',
  description: `Get the DOM tree structure starting from a specific element or document root.
Returns a hierarchical view of elements with their tag names and key attributes.
Useful for understanding the structure of a component or page section.`,
  annotations: {
    title: 'Get DOM Tree',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod
      .string()
      .optional()
      .describe(
        'Element UID to start from (omit for document root)',
      ),
    depth: zod
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(3)
      .describe('How deep to traverse the tree'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);

    let rootNodeId: number;

    if (request.params.uid) {
      const axNode = context.getAXNodeByUid(request.params.uid);
      if (!axNode?.backendNodeId) {
        throw new Error(
          `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
        );
      }
      rootNodeId = await resolveToNodeId(client, axNode.backendNodeId);
    } else {
      const {root} = await client.send('DOM.getDocument', {
        depth: request.params.depth,
        pierce: true,
      });
      rootNodeId = root.nodeId;
    }

    // Request child nodes to ensure they're loaded
    await client.send('DOM.requestChildNodes', {
      nodeId: rootNodeId,
      depth: request.params.depth,
      pierce: true,
    });

    // Give a moment for nodes to be pushed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get the node with children
    const {node} = await client.send('DOM.describeNode', {
      nodeId: rootNodeId,
      depth: request.params.depth,
      pierce: true,
    });

    // Format tree recursively
    interface TreeNode {
      tag: string;
      id?: string;
      class?: string;
      children?: TreeNode[];
    }

    function formatNode(n: typeof node, currentDepth: number): TreeNode | null {
      if (!n || currentDepth > request.params.depth) return null;

      // Skip text nodes and comments for cleaner output
      if (n.nodeType === 3 || n.nodeType === 8) return null;

      const attrs = n.attributes || [];
      const attrMap: Record<string, string> = {};
      for (let i = 0; i < attrs.length; i += 2) {
        attrMap[attrs[i]] = attrs[i + 1];
      }

      const treeNode: TreeNode = {
        tag: n.nodeName.toLowerCase(),
      };

      if (attrMap['id']) treeNode.id = attrMap['id'];
      if (attrMap['class']) treeNode.class = attrMap['class'];

      if (n.children && currentDepth < request.params.depth) {
        const children = n.children
          .map(child => formatNode(child, currentDepth + 1))
          .filter((c): c is TreeNode => c !== null);

        if (children.length > 0) {
          treeNode.children = children;
        }
      }

      return treeNode;
    }

    const tree = formatNode(node, 0);
    response.appendResponseLine(JSON.stringify(tree, null, 2));
  },
});

// ============================================================================
// Tool 8: capture_dom_snapshot
// ============================================================================

export const captureDomSnapshot = defineTool({
  name: 'capture_dom_snapshot',
  description: `Capture a complete DOM snapshot with computed styles for all elements.
This is an efficient way to get DOM structure and styles in a single call.
Useful for analyzing entire page layouts or large sections.`,
  annotations: {
    title: 'Capture DOM Snapshot',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    computedStyles: zod
      .array(zod.string())
      .optional()
      .describe(
        'CSS properties to capture (default: display, color, background-color, font-size, etc.)',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await client.send('DOMSnapshot.enable');

    const defaultStyles = [
      'display',
      'visibility',
      'opacity',
      'color',
      'background-color',
      'font-family',
      'font-size',
      'font-weight',
      'width',
      'height',
      'position',
      'top',
      'right',
      'bottom',
      'left',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'border-width',
      'flex-direction',
      'justify-content',
      'align-items',
    ];

    const snapshot = await client.send('DOMSnapshot.captureSnapshot', {
      computedStyles: request.params.computedStyles || defaultStyles,
      includeDOMRects: true,
      includeBlendedBackgroundColors: true,
    });

    // Format the snapshot for readability
    const documents = [];
    const strings = snapshot.strings;

    for (let docIndex = 0; docIndex < snapshot.documents.length; docIndex++) {
      const doc = snapshot.documents[docIndex];
      const nodes: Array<{
        index: number;
        name: string;
        attributes: Record<string, string>;
        bounds?: {x: number; y: number; width: number; height: number};
      }> = [];

      const nodeNames = doc.nodes?.nodeName;
      const nodeAttrs = doc.nodes?.attributes;
      const bounds = doc.layout?.bounds || [];

      if (!nodeNames) continue;

      for (let i = 0; i < nodeNames.length && i < 100; i++) {
        const nameIdx = nodeNames[i];
        const name = strings[nameIdx]?.toLowerCase() || '';

        // Skip text nodes and non-element nodes
        if (!name || name === '#text' || name === '#comment') continue;

        const attrs: Record<string, string> = {};
        const attrPairs = nodeAttrs?.[i] || [];
        for (let j = 0; j < attrPairs.length; j += 2) {
          const keyIdx = attrPairs[j];
          const valIdx = attrPairs[j + 1];
          if (strings[keyIdx] && strings[valIdx]) {
            attrs[strings[keyIdx]] = strings[valIdx];
          }
        }

        const nodeBounds = bounds[i];
        nodes.push({
          index: i,
          name,
          attributes: attrs,
          bounds: nodeBounds
            ? {
                x: nodeBounds[0],
                y: nodeBounds[1],
                width: nodeBounds[2],
                height: nodeBounds[3],
              }
            : undefined,
        });
      }

      documents.push({
        documentIndex: docIndex,
        url: strings[doc.documentURL] || '',
        nodeCount: nodeNames.length,
        nodes: nodes.slice(0, 50), // Limit output
      });
    }

    response.appendResponseLine(
      JSON.stringify(
        {
          documentCount: documents.length,
          documents,
          note:
            documents[0]?.nodeCount > 50
              ? 'Output limited to first 50 elements per document'
              : undefined,
        },
        null,
        2,
      ),
    );
  },
});

// ============================================================================
// Tool 9: force_element_state
// ============================================================================

export const forceElementState = defineTool({
  name: 'force_element_state',
  description: `Force an element into specific CSS pseudo-states for inspection.
Use this to inspect :hover, :active, :focus styles without actually interacting with the element.
Multiple states can be forced simultaneously.`,
  annotations: {
    title: 'Force Element State',
    category: ToolCategory.INSPECTION,
    readOnlyHint: false,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
    states: zod
      .array(
        zod.enum([
          'active',
          'focus',
          'hover',
          'visited',
          'focus-within',
          'focus-visible',
        ]),
      )
      .describe('Pseudo-states to force (e.g., ["hover", "focus"])'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);
    await ensureCssEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    const nodeId = await resolveToNodeId(client, axNode.backendNodeId);

    await client.send('CSS.forcePseudoState', {
      nodeId,
      forcedPseudoClasses: request.params.states,
    });

    response.appendResponseLine(
      `Forced states [${request.params.states.join(', ')}] on element. Use get_element_styles to see the styles in this state.`,
    );
  },
});

// ============================================================================
// Tool 10: get_element_event_listeners
// ============================================================================

export const getElementEventListeners = defineTool({
  name: 'get_element_event_listeners',
  description: `Get all event listeners attached to an element.
Returns the event type, handler function preview, and listener options.
Useful for understanding element interactivity.`,
  annotations: {
    title: 'Get Element Event Listeners',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    const nodeId = await resolveToNodeId(client, axNode.backendNodeId);

    // Resolve node to JS object
    const {object} = await client.send('DOM.resolveNode', {nodeId});

    // Get event listeners
    const {listeners} = await client.send('DOMDebugger.getEventListeners', {
      objectId: object.objectId!,
      depth: 1,
      pierce: true,
    });

    // Release the object
    if (object.objectId) {
      await client.send('Runtime.releaseObject', {objectId: object.objectId});
    }

    const formattedListeners = listeners.map(listener => ({
      type: listener.type,
      useCapture: listener.useCapture,
      passive: listener.passive,
      once: listener.once,
      handler: listener.handler?.description?.substring(0, 200) || 'unknown',
      scriptId: listener.scriptId,
      lineNumber: listener.lineNumber,
      columnNumber: listener.columnNumber,
    }));

    response.appendResponseLine(
      JSON.stringify(
        {
          uid: request.params.uid,
          listenerCount: formattedListeners.length,
          listeners: formattedListeners,
        },
        null,
        2,
      ),
    );
  },
});

// ============================================================================
// Tool 11: get_element_at_position
// ============================================================================

export const getElementAtPosition = defineTool({
  name: 'get_element_at_position',
  description: `Get the element at specific x,y coordinates on the page.
Returns basic information about the topmost element at that position.
Useful for identifying elements at specific visual locations.`,
  annotations: {
    title: 'Get Element At Position',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    x: zod.number().int().describe('X coordinate on the page'),
    y: zod.number().int().describe('Y coordinate on the page'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);

    const {backendNodeId, nodeId, frameId} = await client.send(
      'DOM.getNodeForLocation',
      {
        x: request.params.x,
        y: request.params.y,
        includeUserAgentShadowDOM: false,
        ignorePointerEventsNone: true,
      },
    );

    if (!nodeId && !backendNodeId) {
      response.appendResponseLine(
        JSON.stringify({
          found: false,
          message: `No element found at position (${request.params.x}, ${request.params.y})`,
        }),
      );
      return;
    }

    const resolvedNodeId =
      nodeId || (await resolveToNodeId(client, backendNodeId!));
    const {node} = await client.send('DOM.describeNode', {
      nodeId: resolvedNodeId,
      depth: 0,
    });

    const {attributes} = await client.send('DOM.getAttributes', {
      nodeId: resolvedNodeId,
    });
    const attrMap: Record<string, string> = {};
    for (let i = 0; i < attributes.length; i += 2) {
      attrMap[attributes[i]] = attributes[i + 1];
    }

    response.appendResponseLine(
      JSON.stringify(
        {
          found: true,
          position: {x: request.params.x, y: request.params.y},
          element: {
            backendNodeId,
            nodeId: resolvedNodeId,
            tagName: node.nodeName.toLowerCase(),
            id: attrMap['id'] || null,
            className: attrMap['class'] || null,
            frameId,
          },
        },
        null,
        2,
      ),
    );
  },
});

// ============================================================================
// Tool 12: search_dom
// ============================================================================

export const searchDom = defineTool({
  name: 'search_dom',
  description: `Search the DOM for elements matching a text query, CSS selector, or XPath.
Returns matching elements with their basic information.
Supports plain text search, CSS selectors, and XPath expressions.`,
  annotations: {
    title: 'Search DOM',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    query: zod
      .string()
      .describe(
        'Search query - text content, CSS selector, or XPath expression',
      ),
    limit: zod
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum results to return'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);

    // Perform search
    const {searchId, resultCount} = await client.send('DOM.performSearch', {
      query: request.params.query,
      includeUserAgentShadowDOM: false,
    });

    if (resultCount === 0) {
      await client.send('DOM.discardSearchResults', {searchId});
      response.appendResponseLine(
        JSON.stringify({
          found: 0,
          message: `No elements found matching: ${request.params.query}`,
        }),
      );
      return;
    }

    // Get results
    const {nodeIds} = await client.send('DOM.getSearchResults', {
      searchId,
      fromIndex: 0,
      toIndex: Math.min(resultCount, request.params.limit),
    });

    // Cleanup search
    await client.send('DOM.discardSearchResults', {searchId});

    const elements = [];
    for (const nodeId of nodeIds) {
      try {
        const {node} = await client.send('DOM.describeNode', {
          nodeId,
          depth: 0,
        });

        let attrs: string[] = [];
        try {
          const result = await client.send('DOM.getAttributes', {nodeId});
          attrs = result.attributes;
        } catch {
          // Some nodes don't have attributes
        }

        const attrMap: Record<string, string> = {};
        for (let i = 0; i < attrs.length; i += 2) {
          attrMap[attrs[i]] = attrs[i + 1];
        }

        elements.push({
          nodeId,
          backendNodeId: node.backendNodeId,
          tagName: node.nodeName.toLowerCase(),
          id: attrMap['id'] || null,
          className: attrMap['class'] || null,
        });
      } catch {
        // Skip problematic nodes
      }
    }

    response.appendResponseLine(
      JSON.stringify(
        {
          query: request.params.query,
          found: resultCount,
          returned: elements.length,
          elements,
        },
        null,
        2,
      ),
    );
  },
});

// ============================================================================
// Tool 13: get_fonts_info
// ============================================================================

export const getFontsInfo = defineTool({
  name: 'get_fonts_info',
  description: `Get information about fonts used to render text in an element.
Shows which fonts are actually being used (may differ from CSS font-family).
Useful for understanding typography and font fallbacks.`,
  annotations: {
    title: 'Get Fonts Info',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);
    await ensureCssEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    const nodeId = await resolveToNodeId(client, axNode.backendNodeId);

    const {fonts} = await client.send('CSS.getPlatformFontsForNode', {nodeId});

    // Also get the CSS font-family for comparison
    const {computedStyle} = await client.send('CSS.getComputedStyleForNode', {
      nodeId,
    });
    const fontFamily = computedStyle.find(
      p => p.name === 'font-family',
    )?.value;
    const fontSize = computedStyle.find(p => p.name === 'font-size')?.value;
    const fontWeight = computedStyle.find(p => p.name === 'font-weight')?.value;

    response.appendResponseLine(
      JSON.stringify(
        {
          uid: request.params.uid,
          cssStyles: {
            fontFamily,
            fontSize,
            fontWeight,
          },
          platformFonts: fonts.map(f => ({
            familyName: f.familyName,
            postScriptName: f.postScriptName,
            glyphCount: f.glyphCount,
            isCustomFont: f.isCustomFont,
          })),
        },
        null,
        2,
      ),
    );
  },
});

// ============================================================================
// Tool 14: show_layout_overlay
// ============================================================================

export const showLayoutOverlay = defineTool({
  name: 'show_layout_overlay',
  description: `Show CSS Grid or Flexbox layout overlay for an element.
Visualizes grid lines, flex containers, gaps, and alignment.
Helps understand and debug complex layouts.`,
  annotations: {
    title: 'Show Layout Overlay',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
    type: zod
      .enum(['grid', 'flex'])
      .describe('Type of layout overlay to show'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);
    await ensureOverlayEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    const nodeId = await resolveToNodeId(client, axNode.backendNodeId);

    if (request.params.type === 'grid') {
      await client.send('Overlay.setShowGridOverlays', {
        gridNodeHighlightConfigs: [
          {
            nodeId,
            gridHighlightConfig: {
              showGridExtensionLines: true,
              showPositiveLineNumbers: true,
              showNegativeLineNumbers: false,
              showAreaNames: true,
              showLineNames: true,
              gridBorderColor: {r: 255, g: 0, b: 255, a: 0.8},
              cellBorderColor: {r: 128, g: 128, b: 128, a: 0.4},
              rowLineColor: {r: 127, g: 32, b: 210, a: 0.8},
              columnLineColor: {r: 127, g: 32, b: 210, a: 0.8},
              gridBackgroundColor: {r: 255, g: 0, b: 255, a: 0.1},
              rowGapColor: {r: 0, g: 255, b: 0, a: 0.2},
              columnGapColor: {r: 0, g: 0, b: 255, a: 0.2},
            },
          },
        ],
      });
      response.appendResponseLine(
        'Grid overlay shown. Call hide_highlight or show_layout_overlay with empty configs to hide.',
      );
    } else {
      await client.send('Overlay.setShowFlexOverlays', {
        flexNodeHighlightConfigs: [
          {
            nodeId,
            flexContainerHighlightConfig: {
              containerBorder: {
                color: {r: 255, g: 165, b: 0, a: 0.8},
              },
              itemSeparator: {
                color: {r: 255, g: 165, b: 0, a: 0.4},
                pattern: 'dotted',
              },
              lineSeparator: {
                color: {r: 255, g: 165, b: 0, a: 0.4},
                pattern: 'dashed',
              },
              mainDistributedSpace: {
                fillColor: {r: 255, g: 165, b: 0, a: 0.2},
                hatchColor: {r: 255, g: 165, b: 0, a: 0.4},
              },
              crossDistributedSpace: {
                fillColor: {r: 0, g: 165, b: 255, a: 0.2},
                hatchColor: {r: 0, g: 165, b: 255, a: 0.4},
              },
            },
          },
        ],
      });
      response.appendResponseLine(
        'Flexbox overlay shown. Call hide_highlight to hide.',
      );
    }
  },
});

// ============================================================================
// Tool 15: get_accessibility_info
// ============================================================================

export const getAccessibilityInfo = defineTool({
  name: 'get_accessibility_info',
  description: `Get detailed accessibility information for an element.
Returns ARIA roles, states, properties, and the accessibility tree node.
Useful for ensuring proper accessibility implementation.`,
  annotations: {
    title: 'Get Accessibility Info',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
    includeAncestors: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Include accessibility info for ancestor elements'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);
    await client.send('Accessibility.enable');

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    let nodes;
    if (request.params.includeAncestors) {
      const result = await client.send('Accessibility.getAXNodeAndAncestors', {
        backendNodeId: axNode.backendNodeId,
      });
      nodes = result.nodes;
    } else {
      const result = await client.send('Accessibility.getPartialAXTree', {
        backendNodeId: axNode.backendNodeId,
        fetchRelatives: false,
      });
      nodes = result.nodes;
    }

    const formatNode = (node: (typeof nodes)[0]) => ({
      nodeId: node.nodeId,
      role: node.role?.value,
      name: node.name?.value,
      description: node.description?.value,
      value: node.value?.value,
      properties: node.properties?.map(p => ({
        name: p.name,
        value: p.value?.value,
      })),
      childIds: node.childIds,
      ignored: node.ignored,
      ignoredReasons: node.ignoredReasons?.map(r => ({
        name: r.name,
        value: r.value?.value,
      })),
    });

    response.appendResponseLine(
      JSON.stringify(
        {
          uid: request.params.uid,
          nodes: nodes.map(formatNode),
        },
        null,
        2,
      ),
    );
  },
});

// ============================================================================
// Tool 16: compare_elements
// ============================================================================

export const compareElements = defineTool({
  name: 'compare_elements',
  description: `Compare two elements' styles and attributes to understand their differences.
Returns a diff of computed styles, showing which properties differ between elements.
Useful for debugging inconsistent styling or understanding variations.`,
  annotations: {
    title: 'Compare Elements',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid1: zod.string().describe('First element UID'),
    uid2: zod.string().describe('Second element UID'),
    properties: zod
      .array(zod.string())
      .optional()
      .describe(
        'CSS properties to compare (default: common layout/visual properties)',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);
    await ensureCssEnabled(client);

    const axNode1 = context.getAXNodeByUid(request.params.uid1);
    const axNode2 = context.getAXNodeByUid(request.params.uid2);

    if (!axNode1?.backendNodeId) {
      throw new Error(`Could not find element with UID "${request.params.uid1}"`);
    }
    if (!axNode2?.backendNodeId) {
      throw new Error(`Could not find element with UID "${request.params.uid2}"`);
    }

    const nodeId1 = await resolveToNodeId(client, axNode1.backendNodeId);
    const nodeId2 = await resolveToNodeId(client, axNode2.backendNodeId);

    const defaultProps = [
      'display',
      'position',
      'width',
      'height',
      'margin',
      'padding',
      'border',
      'color',
      'background-color',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'text-align',
      'flex-direction',
      'justify-content',
      'align-items',
      'gap',
      'border-radius',
      'box-shadow',
      'opacity',
    ];
    const propsToCompare = request.params.properties || defaultProps;

    // Get computed styles for both
    const [styles1, styles2] = await Promise.all([
      client.send('CSS.getComputedStyleForNode', {nodeId: nodeId1}),
      client.send('CSS.getComputedStyleForNode', {nodeId: nodeId2}),
    ]);

    const styleMap1: Record<string, string> = {};
    const styleMap2: Record<string, string> = {};

    for (const prop of styles1.computedStyle) {
      if (propsToCompare.includes(prop.name)) {
        styleMap1[prop.name] = prop.value;
      }
    }

    for (const prop of styles2.computedStyle) {
      if (propsToCompare.includes(prop.name)) {
        styleMap2[prop.name] = prop.value;
      }
    }

    const differences: Record<string, {element1: string; element2: string}> = {};
    const same: string[] = [];

    for (const prop of propsToCompare) {
      const val1 = styleMap1[prop] || '';
      const val2 = styleMap2[prop] || '';

      if (val1 !== val2) {
        differences[prop] = {element1: val1, element2: val2};
      } else if (val1) {
        same.push(prop);
      }
    }

    response.appendResponseLine(
      JSON.stringify(
        {
          element1: request.params.uid1,
          element2: request.params.uid2,
          differenceCount: Object.keys(differences).length,
          differences,
          sameProperties: same,
        },
        null,
        2,
      ),
    );
  },
});

// ============================================================================
// Tool 17: get_css_variables
// ============================================================================

export const getCssVariables = defineTool({
  name: 'get_css_variables',
  description: `Get CSS custom properties (variables) that apply to an element.
Returns both the variables defined on the element and inherited variables.
Useful for understanding design systems and theming.`,
  annotations: {
    title: 'Get CSS Variables',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await getCdpSession(page);

    await ensureDomEnabled(client);
    await ensureCssEnabled(client);

    const axNode = context.getAXNodeByUid(request.params.uid);
    if (!axNode?.backendNodeId) {
      throw new Error(
        `Could not find element with UID "${request.params.uid}". Make sure to call take_snapshot first.`,
      );
    }

    const nodeId = await resolveToNodeId(client, axNode.backendNodeId);

    // Get all computed styles and filter for CSS variables
    const {computedStyle} = await client.send('CSS.getComputedStyleForNode', {
      nodeId,
    });

    const cssVariables: Record<string, string> = {};
    for (const prop of computedStyle) {
      if (prop.name.startsWith('--')) {
        cssVariables[prop.name] = prop.value;
      }
    }

    // Get matched rules to find where variables are defined
    const matched = await client.send('CSS.getMatchedStylesForNode', {nodeId});

    const variableDefinitions: Array<{
      variable: string;
      value: string;
      selector: string;
    }> = [];

    if (matched.matchedCSSRules) {
      for (const match of matched.matchedCSSRules) {
        const selector = match.rule.selectorList?.selectors
          ?.map(s => s.text)
          .join(', ');
        for (const prop of match.rule.style?.cssProperties || []) {
          if (prop.name.startsWith('--') && !prop.disabled) {
            variableDefinitions.push({
              variable: prop.name,
              value: prop.value,
              selector: selector || 'unknown',
            });
          }
        }
      }
    }

    response.appendResponseLine(
      JSON.stringify(
        {
          uid: request.params.uid,
          variableCount: Object.keys(cssVariables).length,
          computedVariables: cssVariables,
          definitions: variableDefinitions,
        },
        null,
        2,
      ),
    );
  },
});
