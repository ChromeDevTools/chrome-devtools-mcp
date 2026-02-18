/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 * */

import {isUtf8} from 'node:buffer';

import type {HTTPRequest, HTTPResponse} from '../third_party/index.js';

const BODY_CONTEXT_SIZE_LIMIT = 10000;

export interface NetworkFormatterOptions {
  requestId?: number | string;
  selectedInDevToolsUI?: boolean;
  requestIdResolver?: (request: HTTPRequest) => number | string;
  fetchData?: boolean;
  requestFilePath?: string;
  responseFilePath?: string;
  saveFile?: (
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ) => Promise<{filename: string}>;
}

interface NetworkRequestConcise {
  requestId?: number | string;
  method: string;
  url: string;
  status: string;
  selectedInDevToolsUI?: boolean;
}

interface NetworkRequestDetailed extends NetworkRequestConcise {
  requestHeaders: Record<string, string>;
  requestBody?: string;
  requestBodyFilePath?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseBodyFilePath?: string;
  failure?: string;
  redirectChain?: NetworkRequestConcise[];
}

export class NetworkFormatter {
  #request: HTTPRequest;
  #options: NetworkFormatterOptions;
  #requestBody?: string;
  #responseBody?: string;
  #requestBodyFilePath?: string;
  #responseBodyFilePath?: string;

  private constructor(request: HTTPRequest, options: NetworkFormatterOptions) {
    this.#request = request;
    this.#options = options;
  }

  static async from(
    request: HTTPRequest,
    options: NetworkFormatterOptions,
  ): Promise<NetworkFormatter> {
    const instance = new NetworkFormatter(request, options);
    if (options.fetchData) {
      await instance.#loadDetailedData();
    }
    return instance;
  }

  async #loadDetailedData(): Promise<void> {
    // Load Request Body
    if (this.#request.hasPostData()) {
      let data;
      try {
        data =
          this.#request.postData() ?? (await this.#request.fetchPostData());
      } catch {
        // Ignore parsing errors
      }
      const requestBodyNotAvailableMessage =
        '<Request body not available anymore>';
      if (this.#options.requestFilePath) {
        if (!this.#options.saveFile) {
          throw new Error('saveFile is not provided');
        }
        if (data) {
          await this.#options.saveFile(
            Buffer.from(data),
            this.#options.requestFilePath,
          );
          this.#requestBodyFilePath = this.#options.requestFilePath;
        } else {
          this.#requestBody = requestBodyNotAvailableMessage;
        }
      } else {
        if (data) {
          this.#requestBody = getSizeLimitedString(
            data,
            BODY_CONTEXT_SIZE_LIMIT,
          );
        } else {
          this.#requestBody = requestBodyNotAvailableMessage;
        }
      }
    }

    // Load Response Body
    const response = this.#request.response();
    if (response) {
      const responseBodyNotAvailableMessage =
        '<Response body not available anymore>';
      if (this.#options.responseFilePath) {
        try {
          const buffer = await response.buffer();
          if (!this.#options.saveFile) {
            throw new Error('saveFile is not provided');
          }
          await this.#options.saveFile(buffer, this.#options.responseFilePath);
          this.#responseBodyFilePath = this.#options.responseFilePath;
        } catch {
          // Flatten error handling for buffer() failure and save failure
        }

        if (!this.#responseBodyFilePath) {
          this.#responseBody = responseBodyNotAvailableMessage;
        }
      } else {
        this.#responseBody = await this.#getFormattedResponseBody(
          response,
          BODY_CONTEXT_SIZE_LIMIT,
        );
      }
    }
  }

  toString(): string {
    return convertNetworkRequestConciseToString(this.toJSON());
  }

  toStringDetailed(): string {
    return converNetworkRequestDetailedToStringDetailed(this.toJSONDetailed());
  }

  toJSON(): NetworkRequestConcise {
    return {
      requestId: this.#options.requestId,
      method: this.#request.method(),
      url: this.#request.url(),
      status: this.#getStatusFromRequest(this.#request),
      selectedInDevToolsUI: this.#options.selectedInDevToolsUI,
    };
  }

  toJSONDetailed(): NetworkRequestDetailed {
    const redirectChain = this.#request.redirectChain();
    const formattedRedirectChain = redirectChain.reverse().map(request => {
      const id = this.#options.requestIdResolver
        ? this.#options.requestIdResolver(request)
        : undefined;
      const formatter = new NetworkFormatter(request, {
        requestId: id,
        saveFile: this.#options.saveFile,
      });
      return formatter.toJSON();
    });

    return {
      ...this.toJSON(),
      requestHeaders: this.#request.headers(),
      requestBody: this.#requestBody,
      requestBodyFilePath: this.#requestBodyFilePath,
      responseHeaders: this.#request.response()?.headers(),
      responseBody: this.#responseBody,
      responseBodyFilePath: this.#responseBodyFilePath,
      failure: this.#request.failure()?.errorText,
      redirectChain: formattedRedirectChain.length
        ? formattedRedirectChain
        : undefined,
    };
  }

  #getStatusFromRequest(request: HTTPRequest): string {
    const httpResponse = request.response();
    const failure = request.failure();
    let status: string;
    if (httpResponse) {
      status = httpResponse.status().toString();
    } else if (failure) {
      status = failure.errorText;
    } else {
      status = 'pending';
    }
    return status;
  }

  async #getFormattedResponseBody(
    httpResponse: HTTPResponse,
    sizeLimit = BODY_CONTEXT_SIZE_LIMIT,
  ): Promise<string | undefined> {
    try {
      const responseBuffer = await httpResponse.buffer();

      if (isUtf8(responseBuffer)) {
        const responseAsTest = responseBuffer.toString('utf-8');

        if (responseAsTest.length === 0) {
          return '<empty response>';
        }

        return getSizeLimitedString(responseAsTest, sizeLimit);
      }

      return '<binary data>';
    } catch {
      return '<not available anymore>';
    }
  }
}

function getSizeLimitedString(text: string, sizeLimit: number) {
  if (text.length > sizeLimit) {
    return text.substring(0, sizeLimit) + '... <truncated>';
  }
  return text;
}

function convertNetworkRequestConciseToString(
  data: NetworkRequestConcise,
): string {
  // TODO truncate the URL
  return `reqid=${data.requestId} ${data.method} ${data.url} [${data.status}]${data.selectedInDevToolsUI ? ` [selected in the DevTools Network panel]` : ''}`;
}

function formatHeadlers(headers: Record<string, string>): string[] {
  const response: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    response.push(`- ${name}:${value}`);
  }
  return response;
}

function converNetworkRequestDetailedToStringDetailed(
  data: NetworkRequestDetailed,
): string {
  const response: string[] = [];
  response.push(`## Request ${data.url}`);
  response.push(`Status: ${data.status}`);
  response.push(`### Request Headers`);
  for (const line of formatHeadlers(data.requestHeaders)) {
    response.push(line);
  }

  if (data.requestBody) {
    response.push(`### Request Body`);
    response.push(data.requestBody);
  } else if (data.requestBodyFilePath) {
    response.push(`### Request Body`);
    response.push(`Saved to ${data.requestBodyFilePath}.`);
  }

  if (data.responseHeaders) {
    response.push(`### Response Headers`);
    for (const line of formatHeadlers(data.responseHeaders)) {
      response.push(line);
    }
  }

  if (data.responseBody) {
    response.push(`### Response Body`);
    response.push(data.responseBody);
  } else if (data.responseBodyFilePath) {
    response.push(`### Response Body`);
    response.push(`Saved to ${data.responseBodyFilePath}.`);
  }

  if (data.failure) {
    response.push(`### Request failed with`);
    response.push(data.failure);
  }

  const redirectChain = data.redirectChain;
  if (redirectChain?.length) {
    response.push(`### Redirect chain`);
    let indent = 0;
    for (const request of redirectChain.reverse()) {
      response.push(
        `${'  '.repeat(indent)}${convertNetworkRequestConciseToString(request)})}`,
      );
      indent++;
    }
  }
  return response.join('\n');
}
