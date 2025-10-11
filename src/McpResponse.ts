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
  getFormattedResponseBody,
  getFormattedRequestBody,
  getShortDescriptionForRequest,
  getStatusFromRequest,
} from './formatters/networkFormatter.js';
import {formatA11ySnapshot} from './formatters/snapshotFormatter.js';
import type {McpContext} from './McpContext.js';
import {handleDialog} from './tools/pages.js';
import type {ImageContentData, Response} from './tools/ToolDefinition.js';
import {paginate, type PaginationOptions} from './utils/pagination.js';

interface NetworkRequestData {
  networkRequestUrl: string;
  requestBody?: string;
  responseBody?: string;
}

export class McpResponse implements Response {
  #includePages = false;
  #includeSnapshot = false;
  #attachedNetworkRequestData?: NetworkRequestData;
  #includeConsoleData = false;
  #textResponseLines: string[] = [];
  #formattedConsoleData?: string[];
  #images: ImageContentData[] = [];
  #networkRequestsOptions?: {
    include: boolean;
    pagination?: PaginationOptions;
    resourceTypes?: ResourceType[];
  };

  setIncludePages(value: boolean): void {
    this.#includePages = value;
  }

  setIncludeSnapshot(value: boolean): void {
    this.#includeSnapshot = value;
  }

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

  setIncludeConsoleData(value: boolean): void {
    this.#includeConsoleData = value;
  }

  attachNetworkRequest(url: string): void {
    this.#attachedNetworkRequestData = {
      networkRequestUrl: url,
    };
  }

  get includePages(): boolean {
    return this.#includePages;
  }

  get includeNetworkRequests(): boolean {
    return this.#networkRequestsOptions?.include ?? false;
  }

  get includeConsoleData(): boolean {
    return this.#includeConsoleData;
  }
  get attachedNetworkRequestUrl(): string | undefined {
    return this.#attachedNetworkRequestData?.networkRequestUrl;
  }
  get networkRequestsPageIdx(): number | undefined {
    return this.#networkRequestsOptions?.pagination?.pageIdx;
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

    if (this.#attachedNetworkRequestData?.networkRequestUrl) {
      const request = context.getNetworkRequestByUrl(
        this.#attachedNetworkRequestData.networkRequestUrl,
      );

      this.#attachedNetworkRequestData.requestBody =
        await getFormattedRequestBody(request);

      const response = request.response();
      if (response) {
        this.#attachedNetworkRequestData.responseBody =
          await getFormattedResponseBody(response);
      }
    }

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
    const url = this.#attachedNetworkRequestData?.networkRequestUrl;
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

    if (this.#attachedNetworkRequestData?.requestBody) {
      response.push(`### Request Body`);
      response.push(this.#attachedNetworkRequestData.requestBody);
    }

    const httpResponse = httpRequest.response();
    if (httpResponse) {
      response.push(`### Response Headers`);
      for (const line of getFormattedHeaderValue(httpResponse.headers())) {
        response.push(line);
      }
    }

    if (this.#attachedNetworkRequestData?.responseBody) {
      response.push(`### Response Body`);
      response.push(this.#attachedNetworkRequestData.responseBody);
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
