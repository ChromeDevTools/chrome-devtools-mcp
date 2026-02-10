/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ImageContentData, Response} from './tools/ToolDefinition.js';

export class McpResponse implements Response {
  #textResponseLines: string[] = [];
  #images: ImageContentData[] = [];

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

  resetResponseLineForTesting(): void {
    this.#textResponseLines = [];
  }
}
