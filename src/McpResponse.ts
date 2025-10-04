/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {
  ImageContent,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import type {ResourceType} from 'puppeteer-core';

import {formatConsoleEvent} from './formatters/consoleFormatter.js';
import {
  getFormattedHeaderValue,
  getShortDescriptionForRequest,
  getStatusFromRequest,
} from './formatters/networkFormatter.js';
import {formatA11ySnapshot} from './formatters/snapshotFormatter.js';
import type {McpContext} from './McpContext.js';
import {handleDialog} from './tools/pages.js';
import type {ImageContentData, Response} from './tools/ToolDefinition.js';
import {paginate, type PaginationOptions} from './utils/pagination.js';

/**
 * Represents a response from an MCP tool, handling the collection and
 * formatting of various data types like text, images, and network requests.
 * @public
 */
export class McpResponse implements Response {
  #includePages = false;
  #includeSnapshot = false;
  #attachedNetworkRequestUrl?: string;
  #includeConsoleData = false;
  #textResponseLines: string[] = [];
  #formattedConsoleData?: string[];
  #images: ImageContentData[] = [];
  #networkRequestsOptions?: {
    include: boolean;
    pagination?: PaginationOptions;
    resourceTypes?: ResourceType[];
  };

  /**
   * Sets whether to include page information in the response.
   *
   * @param value - True to include page information, false otherwise.
   */
  setIncludePages(value: boolean): void {
    this.#includePages = value;
  }

  /**
   * Sets whether to include a snapshot in the response.
   *
   * @param value - True to include a snapshot, false otherwise.
   */
  setIncludeSnapshot(value: boolean): void {
    this.#includeSnapshot = value;
  }

  /**
   * Sets whether to include network requests in the response, with optional
   * pagination and filtering.
   *
   * @param value - True to include network requests, false otherwise.
   * @param options - Options for pagination and resource type filtering.
   */
  setIncludeNetworkRequests(
    value: boolean,
    options?: {
      pageSize?: number;
      pageIdx?: number;
      resourceTypes?: ResourceType[];
    },
  ): void {
    if (!value) {
      this.#networkRequestsOptions = undefined;
      return;
    }

    this.#networkRequestsOptions = {
      include: value,
      pagination:
        options?.pageSize || options?.pageIdx
          ? {
              pageSize: options.pageSize,
              pageIdx: options.pageIdx,
            }
          : undefined,
      resourceTypes: options?.resourceTypes,
    };
  }

  /**
   * Sets whether to include console data in the response.
   *
   * @param value - True to include console data, false otherwise.
   */
  setIncludeConsoleData(value: boolean): void {
    this.#includeConsoleData = value;
  }

  /**
   * Attaches a specific network request to the response by its URL.
   *
   * @param url - The URL of the network request to attach.
   */
  attachNetworkRequest(url: string): void {
    this.#attachedNetworkRequestUrl = url;
  }

  /**
   * Gets whether page information is included in the response.
   */
  get includePages(): boolean {
    return this.#includePages;
  }

  /**
   * Gets whether network requests are included in the response.
   */
  get includeNetworkRequests(): boolean {
    return this.#networkRequestsOptions?.include ?? false;
  }

  /**
   * Gets whether console data is included in the response.
   */
  get includeConsoleData(): boolean {
    return this.#includeConsoleData;
  }
  /**
   * Gets the URL of the attached network request.
   */
  get attachedNetworkRequestUrl(): string | undefined {
    return this.#attachedNetworkRequestUrl;
  }
  /**
   * Gets the page index for network request pagination.
   */
  get networkRequestsPageIdx(): number | undefined {
    return this.#networkRequestsOptions?.pagination?.pageIdx;
  }

  /**
   * Appends a line of text to the response.
   *
   * @param value - The line of text to append.
   */
  appendResponseLine(value: string): void {
    this.#textResponseLines.push(value);
  }

  /**
   * Attaches an image to the response.
   *
   * @param value - The image data to attach.
   */
  attachImage(value: ImageContentData): void {
    this.#images.push(value);
  }

  /**
   * Gets the lines of text in the response.
   */
  get responseLines(): readonly string[] {
    return this.#textResponseLines;
  }

  /**
   * Gets the images attached to the response.
   */
  get images(): ImageContentData[] {
    return this.#images;
  }

  /**
   * Gets whether a snapshot is included in the response.
   */
  get includeSnapshot(): boolean {
    return this.#includeSnapshot;
  }

  /**
   * Handles the response by creating snapshots and formatting the data.
   *
   * @param toolName - The name of the tool that generated the response.
   * @param context - The MCP context.
   * @returns A promise that resolves to an array of text and image content.
   */
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

  /**
   * Formats the response into an array of text and image content.
   *
   * @param toolName - The name of the tool that generated the response.
   * @param context - The MCP context.
   * @returns An array of text and image content.
   */
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
      response.push(
        `Default navigation timeout set to ${context.getNavigationTimeout()} ms`,
      );
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
Call ${handleDialog.name} to handle it before continuing.`);
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

    if (this.#networkRequestsOptions?.include) {
      let requests = context.getNetworkRequests();

      // Apply resource type filtering if specified
      if (this.#networkRequestsOptions.resourceTypes?.length) {
        const normalizedTypes = new Set(
          this.#networkRequestsOptions.resourceTypes,
        );
        requests = requests.filter(request => {
          const type = request.resourceType();
          return normalizedTypes.has(type);
        });
      }

      response.push('## Network requests');
      if (requests.length) {
        const data = this.#dataWithPagination(
          requests,
          this.#networkRequestsOptions.pagination,
        );
        response.push(...data.info);
        for (const request of data.items) {
          response.push(getShortDescriptionForRequest(request));
        }
      } else {
        response.push('No requests found.');
      }
    }

    if (this.#includeConsoleData && this.#formattedConsoleData) {
      response.push('## Console messages');
      if (this.#formattedConsoleData.length) {
        response.push(...this.#formattedConsoleData);
      } else {
        response.push('<no console messages found>');
      }
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

  #dataWithPagination<T>(data: T[], pagination?: PaginationOptions) {
    const response = [];
    const paginationResult = paginate<T>(data, pagination);
    if (paginationResult.invalidPage) {
      response.push('Invalid page number provided. Showing first page.');
    }

    const {startIndex, endIndex, currentPage, totalPages} = paginationResult;
    response.push(
      `Showing ${startIndex + 1}-${endIndex} of ${data.length} (Page ${currentPage + 1} of ${totalPages}).`,
    );
    if (pagination) {
      if (paginationResult.hasNextPage) {
        response.push(`Next page: ${currentPage + 1}`);
      }
      if (paginationResult.hasPreviousPage) {
        response.push(`Previous page: ${currentPage - 1}`);
      }
    }

    return {
      info: response,
      items: paginationResult.items,
    };
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

  /**
   * Resets the response lines for testing purposes.
   * @internal
   */
  resetResponseLineForTesting() {
    this.#textResponseLines = [];
  }
}
