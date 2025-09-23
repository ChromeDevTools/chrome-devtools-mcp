/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';
import {defineTool} from './ToolDefinition.js';
import {ToolCategories} from './categories.js';
// Intentionally no direct imports to avoid unused types and keep payload small.

type CssPropertyMap = Record<string, string>;

// Per-context named snapshots: name -> { uid -> computedMap }
const snapshotsStore = new WeakMap<
  object,
  Map<string, Record<string, CssPropertyMap>>
>();

function getSnapshots(context: object) {
  let map = snapshotsStore.get(context);
  if (!map) {
    map = new Map();
    snapshotsStore.set(context, map);
  }
  return map;
}

function toMap(
  properties: Array<{name: string; value: string}> | undefined,
): CssPropertyMap {
  const map: CssPropertyMap = {};
  for (const {name, value} of properties ?? []) {
    map[name] = value;
  }
  return map;
}

function filterMap(
  map: CssPropertyMap,
  properties?: string[] | undefined,
): CssPropertyMap {
  if (!properties?.length) {
    return map;
  }
  const out: CssPropertyMap = {};
  for (const key of properties) {
    if (key in map) {
      out[key] = map[key];
    }
  }
  return out;
}

export const getComputedStyles = defineTool({
  name: 'get_computed_styles',
  description:
    'Return CSS computed styles for an element. Optionally filter properties and include rule origins.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uid: z
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
    properties: z.array(z.string()).optional().describe('Optional filter list'),
    includeSources: z
      .boolean()
      .optional()
      .describe('If true, include best-effort winning rule origins'),
  },
  handler: async (request, response, context) => {
    const handle = await context.getElementByUid(request.params.uid);
    const page = context.getSelectedPage();
    try {
      await context.ensureDomDomainEnabled();
      await context.ensureCssDomainEnabled();
      // @ts-expect-error internal API
      const client = page._client();

      const nodeId = await context.getNodeIdFromHandle(handle);
      const {computedStyle} = await client.send('CSS.getComputedStyleForNode', {
        nodeId,
      });

      const map = toMap(
        computedStyle as Array<{name: string; value: string}> | undefined,
      );
      const filtered = filterMap(map, request.params.properties);

      const result: {
        computed: CssPropertyMap;
        sourceMap?: Record<string, unknown>;
      } = {
        computed: filtered,
      };

      if (request.params.includeSources) {
        try {
          const {matchedCSSRules, inlineStyle, attributesStyle} =
            await client.send('CSS.getMatchedStylesForNode', {nodeId});

          const origins: Record<string, unknown> = {};
          const candidates: Array<{
            source: string;
            selector?: string;
            origin?: string;
            styleSheetId?: string;
            range?: unknown;
            properties?: Array<{name: string; value: string}>;
          }> = [];

          if (inlineStyle) {
            candidates.push({
              source: 'inline',
              properties: inlineStyle.cssProperties,
            });
          }
          if (attributesStyle) {
            candidates.push({
              source: 'attributes',
              properties: attributesStyle.cssProperties,
            });
          }
          for (const rule of matchedCSSRules ?? []) {
            candidates.push({
              source: 'rule',
              selector: rule.rule.selectorList?.text,
              origin: rule.rule.origin,
              styleSheetId: rule.rule.styleSheetId,
              range: rule.rule.style?.range,
              properties: rule.rule.style?.cssProperties,
            });
          }

          for (const propName of Object.keys(filtered)) {
            const computedVal = filtered[propName];
            let origin = null as unknown as Record<string, unknown> | null;
            for (const c of candidates) {
              const found = c.properties?.find(p => p.name === propName);
              if (!found) continue;
              // Prefer the candidate whose declaration value equals the
              // computed value; otherwise fall back to first match.
              if (found.value === computedVal) {
                origin = {
                  source: c.source,
                  selector: c.selector,
                  origin: c.origin,
                  styleSheetId: c.styleSheetId,
                  range: c.range,
                };
                break;
              }
              if (!origin) {
                origin = {
                  source: c.source,
                  selector: c.selector,
                  origin: c.origin,
                  styleSheetId: c.styleSheetId,
                  range: c.range,
                };
              }
            }
            if (origin) {
              origins[propName] = origin;
            }
          }
          result.sourceMap = origins;
        } catch {
          // ignore origin errors; keep computed only
        }
      }

      response.appendResponseLine('Computed styles:');
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result));
      response.appendResponseLine('```');
    } finally {
      handle.dispose();
    }
  },
});

export const getBoxModel = defineTool({
  name: 'get_box_model',
  description:
    'Return box model for an element (content/padding/border/margin) and rects (content, padding, border, margin, client, bounding).',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uid: z
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
  },
  handler: async (request, response, context) => {
    const handle = await context.getElementByUid(request.params.uid);
    const page = context.getSelectedPage();
    try {
      await context.ensureDomDomainEnabled();
      // @ts-expect-error internal API
      const client = page._client();

      const nodeId = await context.getNodeIdFromHandle(handle);
      const {model} = await client.send('DOM.getBoxModel', {nodeId});

      const rectFromQuad = (quad: Array<{x: number; y: number}> | number[]) => {
        if (Array.isArray(quad) && typeof quad[0] === 'number') {
          // CDP returns 8 numbers [x1,y1,x2,y2,x3,y3,x4,y4]
          const xs = [
            quad[0] as number,
            quad[2] as number,
            quad[4] as number,
            quad[6] as number,
          ];
          const ys = [
            quad[1] as number,
            quad[3] as number,
            quad[5] as number,
            quad[7] as number,
          ];
          const left = Math.min(...xs);
          const top = Math.min(...ys);
          const right = Math.max(...xs);
          const bottom = Math.max(...ys);
          return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
          };
        }
        const points = quad as Array<{x: number; y: number}>;
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);
        return {
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
        };
      };

      const borderRect = rectFromQuad(model.border as unknown as number[]);
      const contentRect = rectFromQuad(model.content as unknown as number[]);
      const paddingRect = rectFromQuad(model.padding as unknown as number[]);
      const marginRect = rectFromQuad(model.margin as unknown as number[]);
      const clientRect = paddingRect; // client box ~= content + padding
      const boundingRect = borderRect; // bounding box ~= border box

      let dpr = 1;
      try {
        const evalRes = await client.send('Runtime.evaluate', {
          expression: 'window.devicePixelRatio',
          returnByValue: true,
        });
        dpr = Number(evalRes.result?.value ?? 1) || 1;
      } catch {
        void 0;
      }

      const round = (x: number) => Math.round(x * dpr);

      const result = {
        width: model.width,
        height: model.height,
        contentQuad: model.content,
        paddingQuad: model.padding,
        borderQuad: model.border,
        marginQuad: model.margin,
        contentRect,
        paddingRect,
        borderRect,
        marginRect,
        clientRect,
        boundingRect,
        devicePixelRounded: {
          contentRect: {
            left: round(contentRect.left),
            top: round(contentRect.top),
            right: round(contentRect.right),
            bottom: round(contentRect.bottom),
            width: round(contentRect.width),
            height: round(contentRect.height),
          },
          paddingRect: {
            left: round(paddingRect.left),
            top: round(paddingRect.top),
            right: round(paddingRect.right),
            bottom: round(paddingRect.bottom),
            width: round(paddingRect.width),
            height: round(paddingRect.height),
          },
          borderRect: {
            left: round(borderRect.left),
            top: round(borderRect.top),
            right: round(borderRect.right),
            bottom: round(borderRect.bottom),
            width: round(borderRect.width),
            height: round(borderRect.height),
          },
          marginRect: {
            left: round(marginRect.left),
            top: round(marginRect.top),
            right: round(marginRect.right),
            bottom: round(marginRect.bottom),
            width: round(marginRect.width),
            height: round(marginRect.height),
          },
          clientRect: {
            left: round(clientRect.left),
            top: round(clientRect.top),
            right: round(clientRect.right),
            bottom: round(clientRect.bottom),
            width: round(clientRect.width),
            height: round(clientRect.height),
          },
          boundingRect: {
            left: round(boundingRect.left),
            top: round(boundingRect.top),
            right: round(boundingRect.right),
            bottom: round(boundingRect.bottom),
            width: round(boundingRect.width),
            height: round(boundingRect.height),
          },
        },
      };

      response.appendResponseLine('Box model:');
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result));
      response.appendResponseLine('```');
    } finally {
      handle.dispose();
    }
  },
});

export const getVisibility = defineTool({
  name: 'get_visibility',
  description:
    'Return visibility diagnostics for an element: isVisible and reasons.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uid: z
      .string()
      .describe(
        'The uid of an element on the page from the page content snapshot',
      ),
  },
  handler: async (request, response, context) => {
    const handle = await context.getElementByUid(request.params.uid);
    const page = context.getSelectedPage();
    try {
      await context.ensureDomDomainEnabled();
      await context.ensureCssDomainEnabled();
      // @ts-expect-error internal API
      const client = page._client();

      const nodeId = await context.getNodeIdFromHandle(handle);
      const {computedStyle} = await client.send('CSS.getComputedStyleForNode', {
        nodeId,
      });
      const style = toMap(
        computedStyle as Array<{name: string; value: string}> | undefined,
      );

      let boxModel: {
        width: number;
        height: number;
        border: Array<{x: number; y: number}>;
      } | null = null;
      try {
        boxModel = (await client.send('DOM.getBoxModel', {nodeId})).model;
      } catch {
        void 0;
      }

      const reasons: string[] = [];

      if (style['display'] === 'none') reasons.push('display:none');
      if (
        style['visibility'] === 'hidden' ||
        style['visibility'] === 'collapse'
      ) {
        reasons.push('visibility:hidden');
      }
      if (Number(parseFloat(style['opacity'] ?? '1')) === 0)
        reasons.push('opacity:0');

      if (boxModel) {
        if (boxModel.width === 0 || boxModel.height === 0) {
          reasons.push('zero-size');
        }
        const quad = boxModel.border as Array<{x: number; y: number}>;
        const xs = quad.map(p => p.x);
        const ys = quad.map(p => p.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);

        try {
          const {layoutViewport} = await client.send('Page.getLayoutMetrics');
          const vLeft = layoutViewport?.pageX ?? 0;
          const vTop = layoutViewport?.pageY ?? 0;
          const vRight = vLeft + (layoutViewport?.clientWidth ?? 0);
          const vBottom = vTop + (layoutViewport?.clientHeight ?? 0);
          const intersects = !(
            right < vLeft ||
            left > vRight ||
            bottom < vTop ||
            top > vBottom
          );
          if (!intersects) reasons.push('off-viewport');
        } catch {
          void 0;
        }
      }

      if ((style['clip-path'] ?? 'none') !== 'none') reasons.push('clip-path');

      const isVisible = reasons.length === 0;
      const result = {isVisible, reasons};
      response.appendResponseLine('Visibility:');
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result));
      response.appendResponseLine('```');
    } finally {
      handle.dispose();
    }
  },
});

export const getComputedStylesBatch = defineTool({
  name: 'get_computed_styles_batch',
  description:
    'Return CSS computed styles for multiple elements. Optionally filter properties.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uids: z
      .array(z.string())
      .describe(
        'The uids of elements on the page from the page content snapshot',
      ),
    properties: z.array(z.string()).optional().describe('Optional filter list'),
  },
  handler: async (request, response, context) => {
    await context.ensureDomDomainEnabled();
    await context.ensureCssDomainEnabled();
    const page = context.getSelectedPage();
    // @ts-expect-error internal API
    const client = page._client();

    const results: Record<string, CssPropertyMap> = {};
    await Promise.all(
      request.params.uids.map(async uid => {
        const handle = await context.getElementByUid(uid);
        try {
          const nodeId = await context.getNodeIdFromHandle(handle);
          const {computedStyle} = await client.send(
            'CSS.getComputedStyleForNode',
            {
              nodeId,
            },
          );
          const map = toMap(
            computedStyle as Array<{name: string; value: string}> | undefined,
          );
          results[uid] = filterMap(map, request.params.properties);
        } finally {
          handle.dispose();
        }
      }),
    );

    response.appendResponseLine('Computed styles (batch):');
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(results));
    response.appendResponseLine('```');
  },
});

export const diffComputedStyles = defineTool({
  name: 'diff_computed_styles',
  description:
    'Return the changed computed properties between two elements (A vs B).',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uidA: z.string().describe('First element uid'),
    uidB: z.string().describe('Second element uid'),
    properties: z.array(z.string()).optional().describe('Optional filter list'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    await context.ensureDomDomainEnabled();
    await context.ensureCssDomainEnabled();

    async function getMap(uid: string): Promise<CssPropertyMap> {
      const handle = await context.getElementByUid(uid);
      try {
        // @ts-expect-error internal API
        const client = page._client();
        const nodeId = await context.getNodeIdFromHandle(handle);
        const {computedStyle} = await client.send(
          'CSS.getComputedStyleForNode',
          {
            nodeId,
          },
        );
        const map = toMap(
          computedStyle as Array<{name: string; value: string}> | undefined,
        );
        return filterMap(map, request.params.properties);
      } finally {
        handle.dispose();
      }
    }

    const [a, b] = await Promise.all([
      getMap(request.params.uidA),
      getMap(request.params.uidB),
    ]);
    const changed: Array<{property: string; before: string; after: string}> =
      [];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (a[k] !== b[k]) {
        changed.push({property: k, before: a[k] ?? '', after: b[k] ?? ''});
      }
    }
    response.appendResponseLine('Computed styles diff (A -> B):');
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(changed));
    response.appendResponseLine('```');
  },
});

export const saveComputedStylesSnapshot = defineTool({
  name: 'save_computed_styles_snapshot',
  description:
    'Save a named snapshot of computed styles for specified elements.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    name: z.string().describe('Snapshot name'),
    uids: z
      .array(z.string())
      .describe(
        'The uids of elements on the page from the page content snapshot',
      ),
    properties: z.array(z.string()).optional().describe('Optional filter list'),
  },
  handler: async (request, response, context) => {
    await context.ensureDomDomainEnabled();
    await context.ensureCssDomainEnabled();
    const page = context.getSelectedPage();
    // @ts-expect-error internal API
    const client = page._client();

    const entries: Record<string, CssPropertyMap> = {};
    await Promise.all(
      request.params.uids.map(async uid => {
        const handle = await context.getElementByUid(uid);
        try {
          const nodeId = await context.getNodeIdFromHandle(handle);
          const {computedStyle} = await client.send(
            'CSS.getComputedStyleForNode',
            {nodeId},
          );
          const map = toMap(
            computedStyle as Array<{name: string; value: string}> | undefined,
          );
          entries[uid] = filterMap(map, request.params.properties);
        } finally {
          handle.dispose();
        }
      }),
    );

    const snapshots = getSnapshots(context as unknown as object);
    snapshots.set(request.params.name, entries);

    response.appendResponseLine(
      `Saved styles snapshot "${request.params.name}" for ${Object.keys(entries).length} elements.`,
    );
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify({name: request.params.name, uids: Object.keys(entries)}),
    );
    response.appendResponseLine('```');
  },
});

export const diffComputedStylesSnapshot = defineTool({
  name: 'diff_computed_styles_snapshot',
  description:
    'Diff current computed styles of an element against a saved snapshot.',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    name: z.string().describe('Snapshot name'),
    uid: z.string().describe('Element uid to compare against the snapshot'),
    properties: z.array(z.string()).optional().describe('Optional filter list'),
  },
  handler: async (request, response, context) => {
    const snapshots = getSnapshots(context as unknown as object);
    const snapshot = snapshots.get(request.params.name);
    if (!snapshot) {
      throw new Error('No snapshot found with the provided name');
    }
    const baseline = snapshot[request.params.uid];
    if (!baseline) {
      throw new Error('No entry for the provided uid in the snapshot');
    }

    await context.ensureDomDomainEnabled();
    await context.ensureCssDomainEnabled();
    const page = context.getSelectedPage();
    // @ts-expect-error internal API
    const client = page._client();

    const handle = await context.getElementByUid(request.params.uid);
    try {
      const nodeId = await context.getNodeIdFromHandle(handle);
      const {computedStyle} = await client.send('CSS.getComputedStyleForNode', {
        nodeId,
      });
      const current = filterMap(
        toMap(
          computedStyle as Array<{name: string; value: string}> | undefined,
        ),
        request.params.properties,
      );

      const changed: Array<{property: string; before: string; after: string}> =
        [];
      const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
      for (const k of keys) {
        if (baseline[k] !== current[k]) {
          changed.push({
            property: k,
            before: baseline[k] ?? '',
            after: current[k] ?? '',
          });
        }
      }
      response.appendResponseLine(
        `Computed styles diff vs snapshot "${request.params.name}" (snapshot -> current):`,
      );
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(changed));
      response.appendResponseLine('```');
    } finally {
      handle.dispose();
    }
  },
});
