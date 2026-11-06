/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { McpContext } from './McpContext.js';
import { McpResponse } from './McpResponse.js';
import type { TextContent, ImageContent } from './third_party/index.js';
export declare class SlimMcpResponse extends McpResponse {
    handle(_context: McpContext): Promise<{
        content: Array<TextContent | ImageContent>;
        structuredContent: object;
    }>;
}
