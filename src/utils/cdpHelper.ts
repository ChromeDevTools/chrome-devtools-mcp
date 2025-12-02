/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page, CDPSession} from '../third_party/index.js';

/**
 * Helper to get CDP session from a page.
 */
export async function getCdpSession(page: Page): Promise<CDPSession> {
  // @ts-expect-error _client is internal puppeteer API
  return page._client();
}

/**
 * Convert backendNodeId to nodeId by pushing to frontend.
 */
export async function resolveToNodeId(
  client: CDPSession,
  backendNodeId: number,
): Promise<number> {
  const {nodeIds} = await client.send('DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: [backendNodeId],
  });

  if (!nodeIds || nodeIds.length === 0 || nodeIds[0] === 0) {
    throw new Error('Could not resolve backendNodeId to nodeId');
  }

  return nodeIds[0];
}

/**
 * Ensure DOM domain is enabled.
 */
export async function ensureDomEnabled(client: CDPSession): Promise<void> {
  await client.send('DOM.enable');
  await client.send('DOM.getDocument', {depth: 0});
}

/**
 * Ensure CSS domain is enabled.
 */
export async function ensureCssEnabled(client: CDPSession): Promise<void> {
  await client.send('CSS.enable');
}

/**
 * Ensure Overlay domain is enabled.
 */
export async function ensureOverlayEnabled(client: CDPSession): Promise<void> {
  await client.send('Overlay.enable');
}

/**
 * Format box model quad coordinates into readable format.
 */
export function formatQuad(quad: number[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  // Quad is array of 8 numbers: x1,y1, x2,y2, x3,y3, x4,y4 (corners)
  const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
  const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
  const width = Math.max(quad[0], quad[2], quad[4], quad[6]) - x;
  const height = Math.max(quad[1], quad[3], quad[5], quad[7]) - y;
  return {x, y, width, height};
}

/**
 * Parse CSS properties array into object.
 */
export function cssPropertiesToObject(
  properties: Array<{name: string; value: string; disabled?: boolean}>,
  filterProps?: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const prop of properties) {
    if (prop.disabled) continue;
    if (!prop.value) continue;
    if (filterProps && !filterProps.includes(prop.name)) continue;
    result[prop.name] = prop.value;
  }
  return result;
}
