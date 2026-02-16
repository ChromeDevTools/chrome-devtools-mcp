/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ImageContentData, Response} from './tools/ToolDefinition.js';

export class McpResponse implements Response {
  #textResponseLines: string[] = [];
  #images: ImageContentData[] = [];
  #skipLedger = false;

  appendResponseLine(value: string): void {
    this.#textResponseLines.push(value);
  }

  attachImage(value: ImageContentData): void {
    this.#images.push(value);
  }

  /**
   * Call this to prevent the process ledger from being appended.
   * Use for JSON-format responses where appending markdown would corrupt output.
   */
  setSkipLedger(): void {
    this.#skipLedger = true;
  }

  get skipLedger(): boolean {
    return this.#skipLedger;
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
