/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {ImageContentData, Response} from './tools/ToolDefinition.js';
import type {McpContext} from './McpContext.js';
import {ImageContent, TextContent} from '@modelcontextprotocol/sdk/types.js';
import {
  getFormattedHeaderValue,
  getShortDescriptionForRequest,
  getStatusFromRequest,
} from './formatters/networkFormatter.js';
import {formatA11ySnapshot} from './formatters/snapshotFormatter.js';
import {formatConsoleEvent} from './formatters/consoleFormatter.js';

export class McpResponse implements Response {
  #includePages: boolean = false;
  #includeSnapshot: boolean = false;
  #includeNetworkRequests: boolean = false;
  #attachedNetworkRequestUrl?: string;
  #includeConsoleData: boolean = false;
  #textResponseLines: string[] = [];
  #formattedConsoleData?: string[];
  #images: ImageContentData[] = [];

  setIncludePages(value: boolean): void {
    this.#includePages = value;
  }

  setIncludeSnapshot(value: boolean): void {
    this.#includeSnapshot = value;
  }

  setIncludeNetworkRequests(value: boolean): void {
    this.#includeNetworkRequests = value;
  }

  setIncludeConsoleData(value: boolean): void {
    this.#includeConsoleData = value;
  }

  attachNetworkRequest(url: string): void {
    this.#attachedNetworkRequestUrl = url;
  }

  get includePages(): boolean {
    return this.#includePages;
  }

  get includeNetworkRequests(): boolean {
    return this.#includeNetworkRequests;
  }

  get includeConsoleData(): boolean {
    return this.#includeConsoleData;
  }
  get attachedNetworkRequestUrl(): string | undefined {
    return this.#attachedNetworkRequestUrl;
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

  get includeSnapshot(): boolean {
    return this.#includeSnapshot;
  }

  async handle(
    toolName: string,
    context: McpContext,
  ): Promise<Array<TextContent | ImageContent>> {
    if (this.#includePages) {
      await context.createPagesSnapshot();
    }
    if (this.#includeSnapshot) {
      await context.createTextSnapshot();
    }

    let formattedConsoleMessages: string[];
    if (this.#includeConsoleData) {
      const consoleMessages = context.getConsoleData();
      if (consoleMessages) {
        formattedConsoleMessages = await Promise.all(
          consoleMessages.map(message => formatConsoleEvent(message)),
        );
        this.#formattedConsoleData = formattedConsoleMessages;
      }
    }

    return this.format(toolName, context);
  }

  format(
    toolName: string,
    context: McpContext,
  ): Array<TextContent | ImageContent> {
    const response = [`# ${toolName} response`];
    for (const line of this.#textResponseLines) {
      response.push(line);
    }

    const networkConditions = context.getNetworkConditions();
    if (networkConditions) {
      response.push(`## Network emulation`);
      response.push(`Emulating: ${networkConditions}`);
    }

    const cpuThrottlingRate = context.getCpuThrottlingRate();
    if (cpuThrottlingRate > 1) {
      response.push(`## CPU emulation`);
      response.push(`Emulating: ${cpuThrottlingRate}x slowdown`);
    }

    const dialog = context.getDialog();
    if (dialog) {
      response.push(`# Open dialog
${dialog.type()}: ${dialog.message()} (default value: ${dialog.message()}).
Call browser_handle_dialog to handle it before continuing.`);
    }

    if (this.#includePages) {
      const parts = [`## Pages`];
      let idx = 0;
      for (const page of context.getPages()) {
        parts.push(
          `${idx}: ${page.url()}${idx === context.getSelectedPageIdx() ? ' [selected]' : ''}`,
        );
        idx++;
      }
      response.push(...parts);
    }

    if (this.#includeSnapshot) {
      const snapshot = context.getTextSnapshot();
      if (snapshot) {
        const formattedSnapshot = formatA11ySnapshot(snapshot.root);
        response.push('## Page content');
        response.push(formattedSnapshot);
      }
    }

    response.push(...this.#getIncludeNetworkRequestsData(context));

    if (this.#includeNetworkRequests) {
      const requests = context.getNetworkRequests();
      response.push('## Network requests');
      if (requests.length) {
        for (const request of requests) {
          response.push(getShortDescriptionForRequest(request));
        }
      } else {
        response.push('No requests found.');
      }
    }

    if (this.#includeConsoleData && this.#formattedConsoleData) {
      response.push('## Console messages');
      response.push(...this.#formattedConsoleData);
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

  #getIncludeNetworkRequestsData(context: McpContext): string[] {
    const response: string[] = [];
    const url = this.#attachedNetworkRequestUrl;
    if (!url) {
      return response;
    }
    const httpRequest = context.getNetworkRequestByUrl(url);
    response.push(`## Request ${httpRequest.url()}`);
    response.push(`Status:  ${getStatusFromRequest(httpRequest)}`);
    response.push(`### Request Headers`);
    for (const line of getFormattedHeaderValue(httpRequest.headers())) {
      response.push(line);
    }

    const httpResponse = httpRequest.response();
    if (httpResponse) {
      response.push(`### Response Headers`);
      for (const line of getFormattedHeaderValue(httpResponse.headers())) {
        response.push(line);
      }
    }

    const httpFailure = httpRequest.failure();
    if (httpFailure) {
      response.push(`### Request failed with`);
      response.push(httpFailure.errorText);
    }

    const redirectChain = httpRequest.redirectChain();
    if (redirectChain.length) {
      response.push(`### Redirect chain`);
      let indent = 0;
      for (const request of redirectChain.reverse()) {
        response.push(
          `${'  '.repeat(indent)}${getShortDescriptionForRequest(request)}`,
        );
        indent++;
      }
    }
    return response;
  }

  resetResponseLineForTesting() {
    this.#textResponseLines = [];
  }
}
