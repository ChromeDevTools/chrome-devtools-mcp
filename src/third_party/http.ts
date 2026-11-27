/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Loaded lazily by loadHttp() in index.ts so stdio startup never pulls in
// @modelcontextprotocol/node or Hono.
export {
  toNodeHandler,
  type FetchLikeMcpHandler,
  type NodeMcpRequestHandler,
  type ToNodeHandlerOptions,
} from '@modelcontextprotocol/node';
