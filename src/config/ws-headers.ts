/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const WS_HEADERS_ENV_VAR = 'CHROME_DEVTOOLS_MCP_WS_HEADERS';
export const RESOLVED_WS_HEADERS_ENV_VAR =
  'CHROME_DEVTOOLS_MCP_RESOLVED_WS_HEADERS';

export function parseWsHeaders(
  value: string | undefined,
): Record<string, string> | undefined {
  if (!value) {
    return;
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Headers must be a JSON object');
    }
    return parsed as Record<string, string>;
  } catch (error) {
    throw new Error(`Invalid JSON for wsHeaders: ${(error as Error).message}`);
  }
}
