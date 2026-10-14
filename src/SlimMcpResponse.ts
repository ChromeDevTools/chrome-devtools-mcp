/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import type {TextContent, ImageContent} from './third_party/index.js';

export class SlimMcpResponse extends McpResponse {
  override async handle(_context: McpContext): Promise<{
    content: Array<TextContent | ImageContent>;
    structuredContent: object;
  }> {
    const error = this.error;
    const responseText = error
      ? [...this.responseLines, `Error: ${error.message}`].join('\n')
      : this.responseLines.join('\n');
    const text: TextContent = {
      type: 'text',
      text: responseText,
    };
    return {
      content: [text],
      structuredContent: text,
    };
  }
}
