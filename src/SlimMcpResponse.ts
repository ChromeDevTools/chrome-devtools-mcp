/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  TextContent,
  ImageContent,
} from '@modelcontextprotocol/sdk/types.js';

import type {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';

export class SlimMcpResponse extends McpResponse {
  override async handle(
    _toolName: string,
    _context: McpContext,
  ): Promise<{
    content: Array<TextContent | ImageContent>;
    structuredContent: object;
  }> {
    const text: TextContent = {
      type: 'text',
      text: this.responseLines.join('\n'),
    };
    return {
      content: [text],
      structuredContent: text,
    };
  }
}
