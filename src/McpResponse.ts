/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * McpResponse - Simplified for Extension-only mode (v2.0.0)
 *
 * This class handles response formatting for MCP tools.
 * Puppeteer-based features (pages, snapshots, network requests) are no longer supported.
 */

import type {
  ImageContent,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';

import type {Context, ImageContentData, Response} from './tools/ToolDefinition.js';

export class McpResponse implements Response {
  #textResponseLines: string[] = [];
  #images: ImageContentData[] = [];

  // Stub methods for interface compatibility (not supported in extension mode)
  setIncludePages(_value: boolean): void {
    // Not supported in extension-only mode
  }

  setIncludeSnapshot(_value: boolean): void {
    // Not supported in extension-only mode
  }

  setIncludeNetworkRequests(
    _value: boolean,
    _options?: {
      pageSize?: number;
      pageIdx?: number;
      resourceTypes?: string[];
    },
  ): void {
    // Not supported in extension-only mode
  }

  setIncludeConsoleData(_value: boolean): void {
    // Not supported in extension-only mode
  }

  attachNetworkRequest(_url: string): void {
    // Not supported in extension-only mode
  }

  appendResponseLine(value: string): void {
    this.#textResponseLines.push(value);
  }

  attachImage(value: ImageContentData): void {
    this.#images.push(value);
  }

  get responseLines(): readonly string[] {
    return this.#textResponseLines;
  }

  get images(): ImageContentData[] {
    return this.#images;
  }

  async handle(
    toolName: string,
    _context: Context,
  ): Promise<Array<TextContent | ImageContent>> {
    return this.format(toolName);
  }

  format(toolName: string): Array<TextContent | ImageContent> {
    const response = [`# ${toolName} response`];
    for (const line of this.#textResponseLines) {
      response.push(line);
    }

    const text: TextContent = {
      type: 'text',
      text: response.join('\n'),
    };

    const images: ImageContent[] = this.#images.map(imageData => {
      return {
        type: 'image',
        ...imageData,
      } as const;
    });

    return [text, ...images];
  }

  resetResponseLineForTesting() {
    this.#textResponseLines = [];
  }
}
