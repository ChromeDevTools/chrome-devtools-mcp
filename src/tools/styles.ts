/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod as z} from '../third_party/index.js';
import type {ElementHandle} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';
// Intentionally no direct imports to avoid unused types and keep payload small.

type CssPropertyMap = Record<string, string>;

interface BorderRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface StyleSnapshotMeta {
  capturedAt: string;
  url: string;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
}

interface StyleSnapshotElement {
  computed: CssPropertyMap;
  borderRect?: BorderRect;
  domPath?: string;
  backendNodeId?: number;
}

interface StyleSnapshotData {
  meta: StyleSnapshotMeta;
  elements: Record<string, StyleSnapshotElement>;
}

/** Legacy: flat uid -> computed map (pre v1). */
type LegacySnapshotMap = Record<string, CssPropertyMap>;

const GEOMETRY_EPS_PX = 0.5;

// Per-context named snapshots (v1 or legacy flat map).
const snapshotsStore = new WeakMap<
  object,
  Map<string, StyleSnapshotData | LegacySnapshotMap>
>();

function getSnapshots(context: object) {
  let map = snapshotsStore.get(context);
  if (!map) {
    map = new Map();
    snapshotsStore.set(context, map);
  }
  return map;
}

function isV1Snapshot(
  s: StyleSnapshotData | LegacySnapshotMap,
): s is StyleSnapshotData {
  return typeof s === 'object' && s !== null && 'meta' in s && 'elements' in s;
}

function snapshotElements(
  raw: StyleSnapshotData | LegacySnapshotMap,
): Record<string, StyleSnapshotElement> {
  if (isV1Snapshot(raw)) {
    return raw.elements;
  }
  const out: Record<string, StyleSnapshotElement> = {};
  for (const [uid, computed] of Object.entries(raw)) {
    out[uid] = {computed};
  }
  return out;
}

function snapshotMeta(
  raw: StyleSnapshotData | LegacySnapshotMap,
): StyleSnapshotMeta | undefined {
  return isV1Snapshot(raw) ? raw.meta : undefined;
}

function rectFromQuad(
  quad: Array<{x: number; y: number}> | number[],
): BorderRect {
  if (Array.isArray(quad) && typeof quad[0] === 'number') {
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
}

function borderRectsMatch(
  a?: BorderRect,
  b?: BorderRect,
  eps = GEOMETRY_EPS_PX,
) {
  if (!a || !b) {
    return !a && !b;
  }
  return (
    Math.abs(a.left - b.left) <= eps &&
    Math.abs(a.top - b.top) <= eps &&
    Math.abs(a.width - b.width) <= eps &&
    Math.abs(a.height - b.height) <= eps
  );
}

function isLayoutProperty(p: string): boolean {
  const x = p.toLowerCase();
  return (
    x.includes('width') ||
    x.includes('height') ||
    x.includes('margin') ||
    x.includes('padding') ||
    x.includes('border') ||
    x === 'display' ||
    x === 'position' ||
    x.includes('flex') ||
    x.includes('grid') ||
    x.includes('gap') ||
    x === 'transform' ||
    x === 'top' ||
    x === 'left' ||
    x === 'right' ||
    x === 'bottom' ||
    x.includes('inset')
  );
}

function classifyStyleDiff(
  styleChanges: Array<{property: string}>,
  geometryEqual: boolean | undefined,
): {
  changeClass: 'none' | 'cascadeOnly' | 'layoutEffective' | 'paintLikely';
  effectiveLayoutChange: boolean;
} {
  if (styleChanges.length === 0) {
    if (geometryEqual === undefined) {
      return {changeClass: 'none', effectiveLayoutChange: false};
    }
    const layoutShift = geometryEqual === false;
    return {
      changeClass: layoutShift ? 'layoutEffective' : 'none',
      effectiveLayoutChange: layoutShift,
    };
  }
  if (geometryEqual === false) {
    return {changeClass: 'layoutEffective', effectiveLayoutChange: true};
  }
  const touchedLayout = styleChanges.some(c => isLayoutProperty(c.property));
  if (geometryEqual === true && touchedLayout) {
    return {changeClass: 'cascadeOnly', effectiveLayoutChange: false};
  }
  if (geometryEqual === undefined && touchedLayout) {
    return {changeClass: 'layoutEffective', effectiveLayoutChange: false};
  }
  if (touchedLayout) {
    return {changeClass: 'layoutEffective', effectiveLayoutChange: true};
  }
  return {changeClass: 'paintLikely', effectiveLayoutChange: false};
}

async function domPathForHandle(handle: ElementHandle<Element>) {
  return handle.evaluate((el: Element) => {
    const parts: string[] = [];
    let current: Element | null = el;
    const stopAt = document.documentElement.parentElement;
    while (current && current !== stopAt) {
      const tag = current.tagName.toLowerCase();
      const par: Element | null = current.parentElement;
      let idx = 1;
      if (par) {
        for (const c of par.children) {
          if (c.tagName === current.tagName) {
            if (c === current) {
              break;
            }
            idx++;
          }
        }
      }
      parts.unshift(`${tag}:nth-of-type(${idx})`);
      current = par;
    }
    return parts.join(' > ');
  });
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

function resolveSnapshotElement(
  elements: Record<string, StyleSnapshotElement>,
  uid: string,
  domPath?: string,
): StyleSnapshotElement | undefined {
  const direct = elements[uid];
  if (direct) {
    return direct;
  }
  if (!domPath?.length) {
    return undefined;
  }
  for (const el of Object.values(elements)) {
    if (el.domPath === domPath) {
      return el;
    }
  }
  return undefined;
}

function borderQuadToNumbers(
  border: unknown,
): [number, number, number, number, number, number, number, number] | null {
  if (!Array.isArray(border) || border.length < 8) {
    return null;
  }
  if (typeof border[0] === 'number') {
    return border as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
  }
  const pts = border as Array<{x: number; y: number}>;
  const out: number[] = [];
  for (const p of pts) {
    out.push(p.x, p.y);
  }
  return out.length >= 8
    ? (out.slice(0, 8) as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ])
    : null;
}

export const getComputedStyles = definePageTool({
  name: 'get_computed_styles',
  description:
    'Resolved computed styles for one uid; optional property filter and ' +
    'winning-rule hints (includeSources). Prefer over scraping styles in ' +
    'evaluate_script.',
  annotations: {
    category: ToolCategory.DEBUGGING,
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
    const pptr = request.page.pptrPage;
    const handle = await request.page.getElementByUid(request.params.uid);
    try {
      await context.ensureDomDomainEnabledForPage(pptr);
      await context.ensureCssDomainEnabledForPage(pptr);
      // @ts-expect-error internal API
      const client = pptr._client();

      const nodeId = await context.getNodeIdFromHandle(handle, pptr);
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

          interface OriginEntry {
            source: string;
            selector?: string;
            origin?: string;
            styleSheetId?: string;
            range?: unknown;
            value: string;
          }
          const propIndex = new Map<string, OriginEntry[]>();
          for (const c of candidates) {
            for (const p of c.properties ?? []) {
              let arr = propIndex.get(p.name);
              if (!arr) {
                arr = [];
                propIndex.set(p.name, arr);
              }
              arr.push({
                source: c.source,
                selector: c.selector,
                origin: c.origin,
                styleSheetId: c.styleSheetId,
                range: c.range,
                value: p.value,
              });
            }
          }
          for (const propName of Object.keys(filtered)) {
            const entries = propIndex.get(propName);
            if (!entries) {
              continue;
            }
            const computedVal = filtered[propName];
            let origin: Record<string, unknown> | null = null;
            for (const e of entries) {
              if (e.value === computedVal) {
                origin = {
                  source: e.source,
                  selector: e.selector,
                  origin: e.origin,
                  styleSheetId: e.styleSheetId,
                  range: e.range,
                };
                break;
              }
              if (!origin) {
                origin = {
                  source: e.source,
                  selector: e.selector,
                  origin: e.origin,
                  styleSheetId: e.styleSheetId,
                  range: e.range,
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
      await handle.dispose();
    }
  },
});

export const getBoxModel = definePageTool({
  name: 'get_box_model',
  description:
    'CDP box model quads and rects for layout misalignment, overflow, and ' +
    'offset debugging.',
  annotations: {
    category: ToolCategory.DEBUGGING,
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
    const pptr = request.page.pptrPage;
    const handle = await request.page.getElementByUid(request.params.uid);
    try {
      await context.ensureDomDomainEnabledForPage(pptr);
      // @ts-expect-error internal API
      const client = pptr._client();

      const nodeId = await context.getNodeIdFromHandle(handle, pptr);
      const {model} = await client.send('DOM.getBoxModel', {nodeId});

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
      await handle.dispose();
    }
  },
});

export const getVisibility = definePageTool({
  name: 'get_visibility',
  description:
    'Explain why an element is invisible (display, opacity, zero size, ' +
    'off-viewport, clip-path).',
  annotations: {
    category: ToolCategory.DEBUGGING,
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
    const pptr = request.page.pptrPage;
    const handle = await request.page.getElementByUid(request.params.uid);
    try {
      await context.ensureDomDomainEnabledForPage(pptr);
      await context.ensureCssDomainEnabledForPage(pptr);
      // @ts-expect-error internal API
      const client = pptr._client();

      const nodeId = await context.getNodeIdFromHandle(handle, pptr);
      const [computedRes, boxRes] = await Promise.all([
        client.send('CSS.getComputedStyleForNode', {nodeId}),
        client.send('DOM.getBoxModel', {nodeId}).catch(() => null),
      ]);
      const style = toMap(
        computedRes.computedStyle as
          | Array<{name: string; value: string}>
          | undefined,
      );

      const boxModel: {
        width: number;
        height: number;
        border: Array<{x: number; y: number}>;
      } | null = boxRes?.model ?? null;

      const reasons: string[] = [];

      if (style['display'] === 'none') {
        reasons.push('display:none');
      }
      if (
        style['visibility'] === 'hidden' ||
        style['visibility'] === 'collapse'
      ) {
        reasons.push('visibility:hidden');
      }
      if (Number(parseFloat(style['opacity'] ?? '1')) === 0) {
        reasons.push('opacity:0');
      }

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
          if (!intersects) {
            reasons.push('off-viewport');
          }
        } catch {
          void 0;
        }
      }

      if ((style['clip-path'] ?? 'none') !== 'none') {
        reasons.push('clip-path');
      }

      const isVisible = reasons.length === 0;
      const result = {isVisible, reasons};
      response.appendResponseLine('Visibility:');
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result));
      response.appendResponseLine('```');
    } finally {
      await handle.dispose();
    }
  },
});

export const getComputedStylesBatch = definePageTool({
  name: 'get_computed_styles_batch',
  description:
    'Batch computed styles map keyed by uid—use for design tokens or ' +
    'multi-node parity checks.',
  annotations: {
    category: ToolCategory.DEBUGGING,
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
    const pptr = request.page.pptrPage;
    await context.ensureDomDomainEnabledForPage(pptr);
    await context.ensureCssDomainEnabledForPage(pptr);
    // @ts-expect-error internal API
    const client = pptr._client();

    const results: Record<string, CssPropertyMap> = {};
    await Promise.all(
      request.params.uids.map(async uid => {
        const handle = await request.page.getElementByUid(uid);
        try {
          const nodeId = await context.getNodeIdFromHandle(handle, pptr);
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
          await handle.dispose();
        }
      }),
    );

    response.appendResponseLine('Computed styles (batch):');
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(results));
    response.appendResponseLine('```');
  },
});

export const diffComputedStyles = definePageTool({
  name: 'diff_computed_styles',
  description:
    'Side-by-side style diff for two uids on the same page; optional ' +
    'geometry compare for layout-affecting changes.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uidA: z.string().describe('First element uid'),
    uidB: z.string().describe('Second element uid'),
    properties: z.array(z.string()).optional().describe('Optional filter list'),
    compareGeometry: z
      .boolean()
      .optional()
      .describe(
        'If true, compare border-box geometry and classify effective layout change.',
      ),
  },
  handler: async (request, response, context) => {
    const pptr = request.page.pptrPage;
    await context.ensureDomDomainEnabledForPage(pptr);
    await context.ensureCssDomainEnabledForPage(pptr);
    // @ts-expect-error internal API
    const client = pptr._client();

    async function getMapAndRect(uid: string): Promise<{
      map: CssPropertyMap;
      rect?: BorderRect;
    }> {
      const handle = await request.page.getElementByUid(uid);
      try {
        const nodeId = await context.getNodeIdFromHandle(handle, pptr);
        const {computedStyle} = await client.send(
          'CSS.getComputedStyleForNode',
          {
            nodeId,
          },
        );
        const map = filterMap(
          toMap(
            computedStyle as Array<{name: string; value: string}> | undefined,
          ),
          request.params.properties,
        );
        let rect: BorderRect | undefined;
        if (request.params.compareGeometry) {
          try {
            const bm = await client.send('DOM.getBoxModel', {nodeId});
            if (bm.model?.border) {
              rect = rectFromQuad(bm.model.border as number[]);
            }
          } catch {
            void 0;
          }
        }
        return {map, rect};
      } finally {
        await handle.dispose();
      }
    }

    const [ra, rb] = await Promise.all([
      getMapAndRect(request.params.uidA),
      getMapAndRect(request.params.uidB),
    ]);
    const a = ra.map;
    const b = rb.map;
    const changed: Array<{property: string; before: string; after: string}> =
      [];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (a[k] !== b[k]) {
        changed.push({property: k, before: a[k] ?? '', after: b[k] ?? ''});
      }
    }
    let geometryEqual: boolean | undefined;
    if (request.params.compareGeometry) {
      geometryEqual = borderRectsMatch(ra.rect, rb.rect);
    }
    const classification = classifyStyleDiff(changed, geometryEqual);
    const out: Record<string, unknown> = {
      styleChanges: changed,
      ...classification,
    };
    if (request.params.compareGeometry) {
      out.geometry = {
        borderRectA: ra.rect,
        borderRectB: rb.rect,
        approximatelyEqual: geometryEqual,
      };
    }
    response.appendResponseLine('Computed styles diff (A -> B):');
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(out));
    response.appendResponseLine('```');
  },
});

export const saveComputedStylesSnapshot = definePageTool({
  name: 'save_computed_styles_snapshot',
  description:
    'Store baseline computed styles + domPath/meta under a name for ' +
    'cross-navigation regression checks.',
  annotations: {
    category: ToolCategory.DEBUGGING,
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
    const pptr = request.page.pptrPage;
    await context.ensureDomDomainEnabledForPage(pptr);
    await context.ensureCssDomainEnabledForPage(pptr);
    // @ts-expect-error internal API
    const client = pptr._client();

    const vpRes = await client.send('Runtime.evaluate', {
      expression:
        '({w:window.innerWidth,h:window.innerHeight,' +
        'dpr:window.devicePixelRatio})',
      returnByValue: true,
    });
    const vp = vpRes.result?.value as {w?: number; h?: number; dpr?: number};
    const meta: StyleSnapshotMeta = {
      capturedAt: new Date().toISOString(),
      url: pptr.url(),
      viewportWidth: Number(vp?.w ?? 0),
      viewportHeight: Number(vp?.h ?? 0),
      dpr: Number(vp?.dpr ?? 1) || 1,
    };

    const elements: Record<string, StyleSnapshotElement> = {};
    await Promise.all(
      request.params.uids.map(async uid => {
        const handle = await request.page.getElementByUid(uid);
        try {
          const nodeId = await context.getNodeIdFromHandle(handle, pptr);
          const [computedRes, bmRes, domPathRes, descRes] = await Promise.all([
            client.send('CSS.getComputedStyleForNode', {nodeId}),
            client.send('DOM.getBoxModel', {nodeId}).catch(() => null),
            domPathForHandle(handle).catch(() => undefined),
            client.send('DOM.describeNode', {nodeId}).catch(() => null),
          ]);
          const map = toMap(
            computedRes.computedStyle as
              | Array<{name: string; value: string}>
              | undefined,
          );
          let borderRect: BorderRect | undefined;
          if (bmRes?.model?.border) {
            borderRect = rectFromQuad(bmRes.model.border as number[]);
          }
          const domPath = domPathRes || undefined;
          const backendNodeId =
            (descRes?.node?.backendNodeId as number | undefined) ?? undefined;
          elements[uid] = {
            computed: filterMap(map, request.params.properties),
            borderRect,
            domPath,
            backendNodeId,
          };
        } finally {
          await handle.dispose();
        }
      }),
    );

    const data: StyleSnapshotData = {meta, elements};
    const snapshots = getSnapshots(context as unknown as object);
    snapshots.set(request.params.name, data);

    response.appendResponseLine(
      `Saved styles snapshot "${request.params.name}" for ` +
        `${Object.keys(elements).length} elements (schema v1).`,
    );
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify({
        name: request.params.name,
        schemaVersion: 1,
        meta,
        uids: Object.keys(elements),
      }),
    );
    response.appendResponseLine('```');
  },
});

export const diffComputedStylesSnapshot = definePageTool({
  name: 'diff_computed_styles_snapshot',
  description:
    'Compare live uid to save_computed_styles_snapshot baseline; domPath ' +
    'when uids differ between loads.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    name: z.string().describe('Snapshot name'),
    uid: z
      .string()
      .describe('Element uid for the live node (from current snapshot)'),
    domPath: z
      .string()
      .optional()
      .describe(
        'If baseline uid differs, match saved element by domPath from v1 snapshot.',
      ),
    properties: z.array(z.string()).optional().describe('Optional filter list'),
    compareGeometry: z
      .boolean()
      .optional()
      .describe('Compare border-box rects to detect effective layout change.'),
  },
  handler: async (request, response, context) => {
    const snapshots = getSnapshots(context as unknown as object);
    const snapshot = snapshots.get(request.params.name);
    if (!snapshot) {
      throw new Error('No snapshot found with the provided name');
    }
    const elems = snapshotElements(snapshot);
    const baseline = resolveSnapshotElement(
      elems,
      request.params.uid,
      request.params.domPath,
    );
    if (!baseline) {
      throw new Error('No entry for the provided uid/domPath in the snapshot');
    }
    const baseMap = baseline.computed;

    const pptr = request.page.pptrPage;
    await context.ensureDomDomainEnabledForPage(pptr);
    await context.ensureCssDomainEnabledForPage(pptr);
    // @ts-expect-error internal API
    const client = pptr._client();

    const handle = await request.page.getElementByUid(request.params.uid);
    try {
      const nodeId = await context.getNodeIdFromHandle(handle, pptr);
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
      const keys = new Set([...Object.keys(baseMap), ...Object.keys(current)]);
      for (const k of keys) {
        if (baseMap[k] !== current[k]) {
          changed.push({
            property: k,
            before: baseMap[k] ?? '',
            after: current[k] ?? '',
          });
        }
      }

      let geometryEqual: boolean | undefined;
      let currentRect: BorderRect | undefined;
      let liveQuad: number[] | null = null;
      try {
        const bm = await client.send('DOM.getBoxModel', {nodeId});
        const flat = borderQuadToNumbers(bm.model?.border);
        liveQuad = flat ? [...flat] : null;
        if (bm.model?.border) {
          currentRect = rectFromQuad(bm.model.border as number[]);
        }
      } catch {
        void 0;
      }
      if (request.params.compareGeometry) {
        geometryEqual = borderRectsMatch(baseline.borderRect, currentRect);
      }

      const classification = classifyStyleDiff(changed, geometryEqual);
      const meta = snapshotMeta(snapshot);
      const out: Record<string, unknown> = {
        snapshotMeta: meta,
        domPathBaseline: baseline.domPath,
        styleChanges: changed,
        overlay: {borderQuad: liveQuad},
        ...classification,
      };
      if (request.params.compareGeometry) {
        out.geometry = {
          baselineBorderRect: baseline.borderRect,
          currentBorderRect: currentRect,
          approximatelyEqual: geometryEqual,
        };
      }
      response.appendResponseLine(
        `Computed styles diff vs snapshot "${request.params.name}" ` +
          `(snapshot -> current):`,
      );
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(out));
      response.appendResponseLine('```');
    } finally {
      await handle.dispose();
    }
  },
});

export const highlightElementsForStyles = definePageTool({
  name: 'highlight_elements_for_styles',
  description:
    'Highlight border quads in DevTools and return coordinates for ' +
    'screenshot overlays or docs.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uids: z
      .array(z.string())
      .min(1)
      .describe('Element uids from the current page snapshot'),
  },
  handler: async (request, response, context) => {
    const pptr = request.page.pptrPage;
    await context.ensureDomDomainEnabledForPage(pptr);
    // @ts-expect-error internal API
    const client = pptr._client();
    try {
      await client.send('Overlay.enable');
    } catch {
      void 0;
    }
    const regions = await Promise.all(
      request.params.uids.map(async uid => {
        const handle = await request.page.getElementByUid(uid);
        try {
          const nodeId = await context.getNodeIdFromHandle(handle, pptr);
          const flat = borderQuadToNumbers(
            (await client.send('DOM.getBoxModel', {nodeId})).model?.border,
          );
          const quad = flat ? [...flat] : null;
          if (quad) {
            await client
              .send('Overlay.highlightQuad', {quad})
              .catch(() => undefined);
          }
          return {uid, borderQuad: quad};
        } finally {
          await handle.dispose();
        }
      }),
    );
    response.appendResponseLine('Highlight regions (border quads, layout px):');
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify({regions}));
    response.appendResponseLine('```');
  },
});
