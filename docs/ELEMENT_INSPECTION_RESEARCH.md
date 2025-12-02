# Element Inspection Tools - Comprehensive Research Document

## Executive Summary

This document outlines a comprehensive set of tools to add full element inspection capabilities to the Chrome DevTools MCP. These tools will enable AI agents to inspect DOM elements, retrieve their styles, layouts, properties, and more - essentially replicating the functionality of Chrome DevTools' Elements panel.

## Current Architecture Overview

The MCP currently uses:
- **Puppeteer** (v24.31.0) for browser automation
- **Accessibility Tree** for element identification (via `page.accessibility.snapshot()`)
- **Tool Definition Pattern** using Zod schemas for validation
- **CDP Sessions** accessible via `page._client().send()`

## CDP Domains Required

### Primary Domains

| Domain | Purpose | Status |
|--------|---------|--------|
| **DOM** | Element structure, attributes, HTML | Required |
| **CSS** | Styles, computed styles, matched rules | Required |
| **DOMSnapshot** | Full DOM with styles in one call | Required |
| **Overlay** | Element highlighting/visualization | Optional |
| **Accessibility** | A11y tree (already used) | Already Used |

---

## Proposed Tools (17 New Tools)

### Category: INSPECTION (New Category)

```typescript
enum ToolCategory {
  INPUT = 'input',
  NAVIGATION = 'navigation',
  EMULATION = 'emulation',
  PERFORMANCE = 'performance',
  NETWORK = 'network',
  DEBUGGING = 'debugging',
  INSPECTION = 'inspection', // NEW
}
```

---

## Tool 1: `inspect_element`

**Purpose**: Get comprehensive information about a specific element including its HTML, attributes, and position.

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
  includeChildren: zod.boolean().optional().default(false)
    .describe('Include child elements in the output'),
  depth: zod.number().int().min(1).max(10).optional().default(1)
    .describe('Depth of children to include'),
}
```

**CDP Calls**:
```typescript
// Enable DOM domain
await client.send('DOM.enable');

// Get document root
const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });

// Describe the specific node
const { node } = await client.send('DOM.describeNode', {
  backendNodeId: element.backendNodeId,
  depth: params.depth,
  pierce: true
});

// Get outer HTML
const { outerHTML } = await client.send('DOM.getOuterHTML', {
  backendNodeId: element.backendNodeId,
  includeShadowDOM: true
});

// Get attributes
const { attributes } = await client.send('DOM.getAttributes', {
  nodeId: node.nodeId
});

// Get box model (position, dimensions)
const { model } = await client.send('DOM.getBoxModel', {
  backendNodeId: element.backendNodeId
});
```

**Response Example**:
```json
{
  "tagName": "div",
  "id": "main-container",
  "className": "container flex-row",
  "attributes": {
    "id": "main-container",
    "class": "container flex-row",
    "data-testid": "main"
  },
  "outerHTML": "<div id=\"main-container\" class=\"container flex-row\">...</div>",
  "boxModel": {
    "content": { "x": 100, "y": 50, "width": 800, "height": 600 },
    "padding": { "x": 90, "y": 40, "width": 820, "height": 620 },
    "border": { "x": 88, "y": 38, "width": 824, "height": 624 },
    "margin": { "x": 80, "y": 30, "width": 840, "height": 640 }
  }
}
```

---

## Tool 2: `get_element_styles`

**Purpose**: Get all CSS styles applied to an element - computed, inline, and matched rules.

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
  includeInherited: zod.boolean().optional().default(true)
    .describe('Include inherited styles from ancestors'),
  includeComputed: zod.boolean().optional().default(true)
    .describe('Include computed (final) style values'),
  includePseudo: zod.boolean().optional().default(false)
    .describe('Include pseudo-element styles (::before, ::after)'),
  properties: zod.array(zod.string()).optional()
    .describe('Filter to specific CSS properties (e.g., ["color", "font-size"])'),
}
```

**CDP Calls**:
```typescript
// Enable CSS domain
await client.send('CSS.enable');

// Get computed styles
const { computedStyle } = await client.send('CSS.getComputedStyleForNode', {
  nodeId: nodeId
});

// Get matched styles (rules that apply to this element)
const matchedStyles = await client.send('CSS.getMatchedStylesForNode', {
  nodeId: nodeId
});
// Returns: inlineStyle, attributesStyle, matchedCSSRules, inherited, pseudoElements

// Get inline styles specifically
const { inlineStyle, attributesStyle } = await client.send('CSS.getInlineStylesForNode', {
  nodeId: nodeId
});
```

**Response Example**:
```json
{
  "computed": {
    "color": "rgb(33, 37, 41)",
    "font-size": "16px",
    "display": "flex",
    "flex-direction": "row",
    "width": "800px",
    "height": "auto"
  },
  "inline": {
    "margin-top": "10px"
  },
  "matchedRules": [
    {
      "selector": ".container",
      "source": "styles.css:42",
      "properties": {
        "display": "flex",
        "padding": "20px"
      }
    },
    {
      "selector": ".flex-row",
      "source": "utilities.css:156",
      "properties": {
        "flex-direction": "row"
      }
    }
  ],
  "inherited": [
    {
      "from": "body",
      "properties": {
        "font-family": "Arial, sans-serif",
        "color": "rgb(33, 37, 41)"
      }
    }
  ]
}
```

---

## Tool 3: `get_element_box_model`

**Purpose**: Get detailed layout/box model information for an element (content, padding, border, margin).

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
}
```

**CDP Calls**:
```typescript
const { model } = await client.send('DOM.getBoxModel', {
  backendNodeId: element.backendNodeId
});

// For more precise quads (handles transforms)
const { quads } = await client.send('DOM.getContentQuads', {
  backendNodeId: element.backendNodeId
});
```

**Response Example**:
```json
{
  "content": {
    "x": 120,
    "y": 80,
    "width": 760,
    "height": 540
  },
  "padding": {
    "top": 20,
    "right": 20,
    "bottom": 20,
    "left": 20
  },
  "border": {
    "top": 1,
    "right": 1,
    "bottom": 1,
    "left": 1
  },
  "margin": {
    "top": 10,
    "right": 0,
    "bottom": 10,
    "left": 0
  },
  "quads": [[100, 70, 880, 70, 880, 630, 100, 630]]
}
```

---

## Tool 4: `query_selector`

**Purpose**: Find elements using CSS selectors and return their UIDs for further inspection.

**Schema**:
```typescript
{
  selector: zod.string().describe('CSS selector to query (e.g., ".btn-primary", "#header", "div.container > p")'),
  all: zod.boolean().optional().default(false)
    .describe('Return all matching elements (querySelectorAll) vs first match'),
  limit: zod.number().int().min(1).max(100).optional().default(20)
    .describe('Maximum number of elements to return when using all=true'),
}
```

**CDP Calls**:
```typescript
await client.send('DOM.enable');
const { root } = await client.send('DOM.getDocument', { depth: 0 });

// Single element
const { nodeId } = await client.send('DOM.querySelector', {
  nodeId: root.nodeId,
  selector: params.selector
});

// Multiple elements
const { nodeIds } = await client.send('DOM.querySelectorAll', {
  nodeId: root.nodeId,
  selector: params.selector
});
```

**Response Example**:
```json
{
  "found": 5,
  "elements": [
    { "uid": "42_1", "tagName": "button", "className": "btn-primary", "text": "Submit" },
    { "uid": "42_2", "tagName": "button", "className": "btn-primary", "text": "Cancel" },
    { "uid": "42_3", "tagName": "button", "className": "btn-primary", "text": "Save" }
  ]
}
```

---

## Tool 5: `get_element_at_position`

**Purpose**: Get the element at a specific x,y coordinate on the page.

**Schema**:
```typescript
{
  x: zod.number().int().describe('X coordinate on the page'),
  y: zod.number().int().describe('Y coordinate on the page'),
  includeShadowDOM: zod.boolean().optional().default(false)
    .describe('Include elements inside shadow DOM'),
}
```

**CDP Calls**:
```typescript
const { backendNodeId, nodeId, frameId } = await client.send('DOM.getNodeForLocation', {
  x: params.x,
  y: params.y,
  includeUserAgentShadowDOM: params.includeShadowDOM,
  ignorePointerEventsNone: true
});
```

---

## Tool 6: `get_dom_tree`

**Purpose**: Get the DOM tree structure starting from a specific element or document root.

**Schema**:
```typescript
{
  uid: zod.string().optional()
    .describe('Element UID to start from (omit for document root)'),
  depth: zod.number().int().min(1).max(20).optional().default(3)
    .describe('How deep to traverse the tree'),
  pierceIframes: zod.boolean().optional().default(false)
    .describe('Include iframe content in the tree'),
  includeShadowDOM: zod.boolean().optional().default(false)
    .describe('Include shadow DOM content'),
}
```

**CDP Calls**:
```typescript
const { root } = await client.send('DOM.getDocument', {
  depth: params.depth,
  pierce: params.pierceIframes
});

// Request children of a specific node
await client.send('DOM.requestChildNodes', {
  nodeId: nodeId,
  depth: params.depth,
  pierce: params.pierceIframes
});
```

---

## Tool 7: `search_dom`

**Purpose**: Search the DOM for elements matching a text query or XPath.

**Schema**:
```typescript
{
  query: zod.string().describe('Search query - can be text content, XPath, or CSS selector'),
  limit: zod.number().int().min(1).max(100).optional().default(20)
    .describe('Maximum results to return'),
}
```

**CDP Calls**:
```typescript
// Perform search
const { searchId, resultCount } = await client.send('DOM.performSearch', {
  query: params.query,
  includeUserAgentShadowDOM: false
});

// Get results
const { nodeIds } = await client.send('DOM.getSearchResults', {
  searchId: searchId,
  fromIndex: 0,
  toIndex: Math.min(resultCount, params.limit)
});

// Cleanup
await client.send('DOM.discardSearchResults', { searchId });
```

---

## Tool 8: `capture_dom_snapshot`

**Purpose**: Capture a complete DOM snapshot with all styles in a single efficient call.

**Schema**:
```typescript
{
  computedStyles: zod.array(zod.string()).optional()
    .describe('List of CSS properties to capture (e.g., ["display", "color", "font-size"])'),
  includePaintOrder: zod.boolean().optional().default(false)
    .describe('Include paint order information'),
  includeTextColorOpacities: zod.boolean().optional().default(false)
    .describe('Include text color opacity calculations'),
}
```

**CDP Calls**:
```typescript
await client.send('DOMSnapshot.enable');

const snapshot = await client.send('DOMSnapshot.captureSnapshot', {
  computedStyles: params.computedStyles || [
    'display', 'visibility', 'opacity',
    'color', 'background-color',
    'font-family', 'font-size', 'font-weight',
    'width', 'height', 'position',
    'top', 'right', 'bottom', 'left',
    'margin', 'padding', 'border',
    'flex-direction', 'justify-content', 'align-items',
    'grid-template-columns', 'grid-template-rows'
  ],
  includePaintOrder: params.includePaintOrder,
  includeTextColorOpacities: params.includeTextColorOpacities,
  includeDOMRects: true,
  includeBlendedBackgroundColors: true
});
```

---

## Tool 9: `get_fonts_for_element`

**Purpose**: Get information about fonts used to render text in an element.

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
}
```

**CDP Calls**:
```typescript
const { fonts } = await client.send('CSS.getPlatformFontsForNode', {
  nodeId: nodeId
});
```

**Response Example**:
```json
{
  "fonts": [
    { "familyName": "Roboto", "postScriptName": "Roboto-Regular", "glyphCount": 156 },
    { "familyName": "Arial", "postScriptName": "ArialMT", "glyphCount": 12 }
  ]
}
```

---

## Tool 10: `get_css_media_queries`

**Purpose**: Get all media queries defined in the page's stylesheets.

**Schema**:
```typescript
{} // No parameters needed
```

**CDP Calls**:
```typescript
const { medias } = await client.send('CSS.getMediaQueries');
```

---

## Tool 11: `force_element_state`

**Purpose**: Force an element into a specific CSS pseudo-state for inspection (hover, focus, active, etc.).

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
  states: zod.array(zod.enum(['active', 'focus', 'hover', 'visited', 'focus-within', 'focus-visible']))
    .describe('Pseudo-states to force on the element'),
}
```

**CDP Calls**:
```typescript
await client.send('CSS.forcePseudoState', {
  nodeId: nodeId,
  forcedPseudoClasses: params.states
});
```

---

## Tool 12: `highlight_element`

**Purpose**: Visually highlight an element on the page (useful for verification).

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
  color: zod.object({
    r: zod.number().min(0).max(255).optional().default(255),
    g: zod.number().min(0).max(255).optional().default(0),
    b: zod.number().min(0).max(255).optional().default(0),
    a: zod.number().min(0).max(1).optional().default(0.3),
  }).optional().describe('Highlight color (RGBA)'),
  duration: zod.number().int().min(0).max(10000).optional().default(2000)
    .describe('How long to show highlight in milliseconds (0 = until hideHighlight)'),
}
```

**CDP Calls**:
```typescript
await client.send('Overlay.enable');

await client.send('Overlay.highlightNode', {
  highlightConfig: {
    contentColor: { r: params.color.r, g: params.color.g, b: params.color.b, a: params.color.a },
    paddingColor: { r: 0, g: 255, b: 0, a: 0.2 },
    borderColor: { r: 0, g: 0, b: 255, a: 0.5 },
    marginColor: { r: 255, g: 165, b: 0, a: 0.2 },
    showInfo: true,
    showStyles: true,
    showRulers: true,
    showExtensionLines: true,
    showAccessibilityInfo: true
  },
  backendNodeId: element.backendNodeId
});

// Auto-hide after duration
if (params.duration > 0) {
  setTimeout(() => client.send('Overlay.hideHighlight'), params.duration);
}
```

---

## Tool 13: `hide_highlight`

**Purpose**: Hide any active element highlight.

**Schema**:
```typescript
{} // No parameters
```

**CDP Calls**:
```typescript
await client.send('Overlay.hideHighlight');
```

---

## Tool 14: `get_element_accessibility`

**Purpose**: Get detailed accessibility information for an element.

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
  includeAncestors: zod.boolean().optional().default(false)
    .describe('Include accessibility info for ancestor elements'),
}
```

**CDP Calls**:
```typescript
await client.send('Accessibility.enable');

const { nodes } = await client.send('Accessibility.getAXNodeAndAncestors', {
  backendNodeId: element.backendNodeId
});

// Or for partial tree
const { nodes } = await client.send('Accessibility.getPartialAXTree', {
  backendNodeId: element.backendNodeId,
  fetchRelatives: params.includeAncestors
});
```

---

## Tool 15: `show_layout_overlays`

**Purpose**: Show CSS Grid/Flexbox layout overlays for debugging layout.

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
  type: zod.enum(['grid', 'flex', 'container']).describe('Type of layout overlay to show'),
  showLineNames: zod.boolean().optional().default(true),
  showLineNumbers: zod.boolean().optional().default(true),
  showAreaNames: zod.boolean().optional().default(true),
}
```

**CDP Calls**:
```typescript
await client.send('Overlay.enable');

// For Grid
await client.send('Overlay.setShowGridOverlays', {
  gridNodeHighlightConfigs: [{
    nodeId: nodeId,
    gridHighlightConfig: {
      showGridExtensionLines: true,
      showPositiveLineNumbers: params.showLineNumbers,
      showNegativeLineNumbers: params.showLineNumbers,
      showAreaNames: params.showAreaNames,
      showLineNames: params.showLineNames,
      gridBorderColor: { r: 255, g: 0, b: 255, a: 0.8 },
      cellBorderColor: { r: 128, g: 128, b: 128, a: 0.4 },
      gridBackgroundColor: { r: 255, g: 0, b: 255, a: 0.1 }
    }
  }]
});

// For Flexbox
await client.send('Overlay.setShowFlexOverlays', {
  flexNodeHighlightConfigs: [{
    nodeId: nodeId,
    flexContainerHighlightConfig: {
      containerBorder: { color: { r: 255, g: 165, b: 0, a: 0.8 } },
      itemSeparator: { color: { r: 255, g: 165, b: 0, a: 0.3 } },
      mainDistributedSpace: { fillColor: { r: 255, g: 165, b: 0, a: 0.1 } },
      crossDistributedSpace: { fillColor: { r: 0, g: 165, b: 255, a: 0.1 } }
    }
  }]
});
```

---

## Tool 16: `get_element_event_listeners`

**Purpose**: Get all event listeners attached to an element.

**Schema**:
```typescript
{
  uid: zod.string().describe('Element UID from snapshot'),
  depth: zod.number().int().min(-1).max(10).optional().default(-1)
    .describe('Depth of subtree to search for listeners (-1 = all)'),
}
```

**CDP Calls**:
```typescript
// First resolve the element to a RemoteObject
const { object } = await client.send('DOM.resolveNode', {
  backendNodeId: element.backendNodeId
});

// Get event listeners via DOMDebugger
const { listeners } = await client.send('DOMDebugger.getEventListeners', {
  objectId: object.objectId,
  depth: params.depth,
  pierce: true
});
```

**Response Example**:
```json
{
  "listeners": [
    {
      "type": "click",
      "handler": "function onClick(e) { ... }",
      "scriptId": "42",
      "lineNumber": 156,
      "columnNumber": 12,
      "useCapture": false,
      "passive": false,
      "once": false
    },
    {
      "type": "mouseenter",
      "handler": "function onHover(e) { ... }",
      "useCapture": false
    }
  ]
}
```

---

## Tool 17: `compare_elements`

**Purpose**: Compare two elements' styles/properties to understand their differences.

**Schema**:
```typescript
{
  uid1: zod.string().describe('First element UID'),
  uid2: zod.string().describe('Second element UID'),
  compareStyles: zod.boolean().optional().default(true)
    .describe('Compare computed styles'),
  compareLayout: zod.boolean().optional().default(true)
    .describe('Compare box model/layout'),
  compareAttributes: zod.boolean().optional().default(true)
    .describe('Compare HTML attributes'),
}
```

**Response Example**:
```json
{
  "styleDifferences": {
    "color": { "element1": "rgb(0, 0, 0)", "element2": "rgb(255, 0, 0)" },
    "font-size": { "element1": "16px", "element2": "14px" }
  },
  "layoutDifferences": {
    "width": { "element1": 200, "element2": 180 },
    "padding-left": { "element1": 10, "element2": 20 }
  },
  "attributeDifferences": {
    "class": { "element1": "btn-primary", "element2": "btn-secondary" }
  },
  "sameProperties": ["display", "position", "font-family"]
}
```

---

## Implementation Architecture

### New File Structure

```
src/tools/
├── inspection/
│   ├── index.ts              # Export all inspection tools
│   ├── inspectElement.ts     # Tool 1
│   ├── getElementStyles.ts   # Tool 2
│   ├── getBoxModel.ts        # Tool 3
│   ├── querySelector.ts      # Tool 4
│   ├── getElementAtPosition.ts # Tool 5
│   ├── getDomTree.ts         # Tool 6
│   ├── searchDom.ts          # Tool 7
│   ├── captureDomSnapshot.ts # Tool 8
│   ├── getFonts.ts           # Tool 9
│   ├── getMediaQueries.ts    # Tool 10
│   ├── forceState.ts         # Tool 11
│   ├── highlight.ts          # Tools 12, 13
│   ├── accessibility.ts      # Tool 14
│   ├── layoutOverlays.ts     # Tool 15
│   ├── eventListeners.ts     # Tool 16
│   └── compareElements.ts    # Tool 17
├── categories.ts             # Add INSPECTION category
└── ...
```

### CDP Session Helper

Create a helper to manage CDP sessions:

```typescript
// src/utils/cdpSession.ts
import type { Page, CDPSession } from 'puppeteer';

interface EnabledDomains {
  DOM?: boolean;
  CSS?: boolean;
  DOMSnapshot?: boolean;
  Overlay?: boolean;
  Accessibility?: boolean;
  DOMDebugger?: boolean;
}

export class CdpSessionManager {
  private sessions = new WeakMap<Page, CDPSession>();
  private enabledDomains = new WeakMap<CDPSession, EnabledDomains>();

  async getSession(page: Page): Promise<CDPSession> {
    let session = this.sessions.get(page);
    if (!session) {
      // @ts-expect-error _client is internal
      session = page._client();
      this.sessions.set(page, session);
    }
    return session;
  }

  async ensureDomainEnabled(
    page: Page,
    domain: keyof EnabledDomains
  ): Promise<CDPSession> {
    const session = await this.getSession(page);
    const domains = this.enabledDomains.get(session) || {};

    if (!domains[domain]) {
      await session.send(`${domain}.enable`);
      domains[domain] = true;
      this.enabledDomains.set(session, domains);
    }

    return session;
  }
}
```

### NodeId Resolver

Since the MCP uses backendNodeId from accessibility tree, we need to convert:

```typescript
// src/utils/nodeResolver.ts
export async function resolveToNodeId(
  session: CDPSession,
  backendNodeId: number
): Promise<number> {
  const { nodeIds } = await session.send('DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: [backendNodeId]
  });

  if (!nodeIds || nodeIds.length === 0 || nodeIds[0] === 0) {
    throw new Error('Could not resolve backendNodeId to nodeId');
  }

  return nodeIds[0];
}
```

### Context Extensions

Extend `McpContext` to support inspection:

```typescript
// Add to McpContext interface
interface Context {
  // ... existing methods ...

  // New methods for inspection
  getCdpSession(): Promise<CDPSession>;
  getBackendNodeId(uid: string): Promise<number>;
  resolveToNodeId(backendNodeId: number): Promise<number>;
}
```

---

## Example Implementation: `get_element_styles`

```typescript
// src/tools/inspection/getElementStyles.ts
import { zod } from '../../third_party/index.js';
import { ToolCategory } from '../categories.js';
import { defineTool } from '../ToolDefinition.js';

export const getElementStyles = defineTool({
  name: 'get_element_styles',
  description: `Get CSS styles for an element including computed styles, matched rules, and inherited styles.
This is equivalent to the "Styles" panel in Chrome DevTools Elements tab.`,
  annotations: {
    title: 'Get Element Styles',
    category: ToolCategory.INSPECTION,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string().describe('Element UID from snapshot (e.g., "42_5")'),
    includeInherited: zod.boolean().optional().default(true)
      .describe('Include styles inherited from ancestor elements'),
    includeComputed: zod.boolean().optional().default(true)
      .describe('Include final computed style values'),
    includePseudo: zod.boolean().optional().default(false)
      .describe('Include pseudo-element styles (::before, ::after, etc.)'),
    properties: zod.array(zod.string()).optional()
      .describe('Filter to specific CSS properties. If omitted, returns all properties.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    // @ts-expect-error _client is internal
    const client = page._client();

    // Enable required domains
    await client.send('DOM.enable');
    await client.send('CSS.enable');

    // Get element by UID
    const element = await context.getElementByUid(request.params.uid);
    const axNode = context.getAXNodeByUid(request.params.uid);

    if (!axNode?.backendNodeId) {
      throw new Error('Could not find element backendNodeId');
    }

    // Push node to frontend to get nodeId
    const { nodeIds } = await client.send('DOM.pushNodesByBackendIdsToFrontend', {
      backendNodeIds: [axNode.backendNodeId]
    });

    const nodeId = nodeIds[0];
    if (!nodeId) {
      throw new Error('Could not resolve element');
    }

    const result: Record<string, unknown> = {};

    // Get computed styles
    if (request.params.includeComputed) {
      const { computedStyle } = await client.send('CSS.getComputedStyleForNode', {
        nodeId
      });

      const computed: Record<string, string> = {};
      for (const prop of computedStyle) {
        if (!request.params.properties ||
            request.params.properties.includes(prop.name)) {
          computed[prop.name] = prop.value;
        }
      }
      result.computed = computed;
    }

    // Get matched styles
    const matched = await client.send('CSS.getMatchedStylesForNode', {
      nodeId
    });

    // Process inline styles
    if (matched.inlineStyle) {
      const inline: Record<string, string> = {};
      for (const prop of matched.inlineStyle.cssProperties || []) {
        if (prop.value && (!request.params.properties ||
            request.params.properties.includes(prop.name))) {
          inline[prop.name] = prop.value;
        }
      }
      if (Object.keys(inline).length > 0) {
        result.inline = inline;
      }
    }

    // Process matched CSS rules
    if (matched.matchedCSSRules) {
      result.matchedRules = matched.matchedCSSRules.map(match => ({
        selector: match.rule.selectorList?.selectors
          ?.map(s => s.text).join(', '),
        source: match.rule.styleSheetId ?
          `${match.rule.origin}` : 'user-agent',
        properties: Object.fromEntries(
          (match.rule.style?.cssProperties || [])
            .filter(p => !p.disabled && p.value)
            .filter(p => !request.params.properties ||
                   request.params.properties.includes(p.name))
            .map(p => [p.name, p.value])
        )
      })).filter(r => Object.keys(r.properties).length > 0);
    }

    // Process inherited styles
    if (request.params.includeInherited && matched.inherited) {
      result.inherited = matched.inherited.map(inh => ({
        matchedRules: inh.matchedCSSRules?.map(match => ({
          selector: match.rule.selectorList?.selectors
            ?.map(s => s.text).join(', '),
          properties: Object.fromEntries(
            (match.rule.style?.cssProperties || [])
              .filter(p => !p.disabled && p.value)
              .filter(p => !request.params.properties ||
                     request.params.properties.includes(p.name))
              .map(p => [p.name, p.value])
          )
        })).filter(r => Object.keys(r.properties || {}).length > 0)
      })).filter(inh => inh.matchedRules && inh.matchedRules.length > 0);
    }

    // Process pseudo-elements
    if (request.params.includePseudo && matched.pseudoElements) {
      result.pseudoElements = matched.pseudoElements.map(pseudo => ({
        pseudoType: pseudo.pseudoType,
        pseudoIdentifier: pseudo.pseudoIdentifier,
        rules: pseudo.matches?.map(match => ({
          selector: match.rule.selectorList?.selectors
            ?.map(s => s.text).join(', '),
          properties: Object.fromEntries(
            (match.rule.style?.cssProperties || [])
              .filter(p => !p.disabled && p.value)
              .map(p => [p.name, p.value])
          )
        }))
      }));
    }

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});
```

---

## Usage Examples for AI Agents

### Example 1: Copying a Button Style

**User Request**: "I want to copy the button style from this website"

**Agent Workflow**:
```
1. take_snapshot() - Get elements on page
2. query_selector({ selector: "button.primary" }) - Find the button
3. get_element_styles({ uid: "42_5", includeComputed: true }) - Get all styles
4. Agent extracts relevant CSS properties and provides them
```

### Example 2: Debugging Layout Issues

**User Request**: "Why is this element not aligned properly?"

**Agent Workflow**:
```
1. take_snapshot() - Get elements
2. inspect_element({ uid: "42_10" }) - Get element info
3. get_element_box_model({ uid: "42_10" }) - Check margins/padding
4. show_layout_overlays({ uid: "42_10", type: "flex" }) - Visualize flexbox
5. get_element_styles({ uid: "42_10", properties: ["display", "flex-direction", "align-items", "justify-content"] })
6. Agent explains the issue based on gathered data
```

### Example 3: Understanding Component Structure

**User Request**: "How is this navigation menu structured?"

**Agent Workflow**:
```
1. take_snapshot()
2. query_selector({ selector: "nav", all: false })
3. get_dom_tree({ uid: "42_3", depth: 5 })
4. get_element_styles({ uid: "42_3" })
5. Agent provides structural analysis
```

---

## Performance Considerations

1. **Batch Operations**: Use `DOMSnapshot.captureSnapshot` for bulk style retrieval instead of multiple `CSS.getComputedStyleForNode` calls.

2. **Lazy Domain Enabling**: Only enable CDP domains when needed, cache enabled state per session.

3. **Limit Depth**: Always limit DOM tree depth to avoid performance issues on complex pages.

4. **Cleanup**: Properly disable overlays and release object references when done.

5. **Caching**: Consider caching nodeId resolutions within a snapshot session.

---

## Security Considerations

1. **Read-Only by Default**: All inspection tools should be marked as `readOnlyHint: true`.

2. **No Code Execution**: These tools should never execute arbitrary code, only read data.

3. **Sensitive Data**: Be aware that computed styles might reveal system fonts or user preferences.

4. **Cross-Origin**: CDP respects same-origin policy for iframe inspection.

---

## References

- [Chrome DevTools Protocol - DOM Domain](https://chromedevtools.github.io/devtools-protocol/tot/DOM/)
- [Chrome DevTools Protocol - CSS Domain](https://chromedevtools.github.io/devtools-protocol/tot/CSS/)
- [Chrome DevTools Protocol - DOMSnapshot Domain](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/)
- [Chrome DevTools Protocol - Overlay Domain](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/)
- [Chrome DevTools Protocol - Accessibility Domain](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)
- [chrome-inspector Library](https://github.com/devtoolcss/chrome-inspector)
- [Puppeteer CDP Session](https://pptr.dev/api/puppeteer.cdpsession)

---

## Summary

This research document outlines **17 new tools** across the following capabilities:

| Capability | Tools |
|------------|-------|
| Element Info | `inspect_element`, `get_dom_tree`, `search_dom` |
| CSS Styles | `get_element_styles`, `get_fonts_for_element`, `get_css_media_queries`, `force_element_state` |
| Layout | `get_element_box_model`, `show_layout_overlays` |
| Selection | `query_selector`, `get_element_at_position` |
| Snapshots | `capture_dom_snapshot` |
| Visual | `highlight_element`, `hide_highlight` |
| Accessibility | `get_element_accessibility` |
| Events | `get_element_event_listeners` |
| Analysis | `compare_elements` |

These tools would transform the Chrome DevTools MCP into a comprehensive element inspection toolkit, enabling AI agents to fully understand and replicate UI designs from any website.
