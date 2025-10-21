/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import logger from 'debug';
import type {Browser} from 'puppeteer';
import puppeteer, {Locator} from 'puppeteer';
import type {Frame, HTTPRequest, HTTPResponse} from 'puppeteer-core';

import {McpContext} from '../src/McpContext.js';
import {McpResponse} from '../src/McpResponse.js';
import {stableIdSymbol} from '../src/PageCollector.js';

let browser: Browser | undefined;

export async function withBrowser(
  cb: (response: McpResponse, context: McpContext) => Promise<void>,
  options: {debug?: boolean} = {},
) {
  const {debug = false} = options;
  if (!browser) {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: !debug,
      defaultViewport: null,
    });
  }
  const newPage = await browser.newPage();
  // Close other pages.
  await Promise.all(
    (await browser.pages()).map(async page => {
      if (page !== newPage) {
        await page.close();
      }
    }),
  );
  const response = new McpResponse();
  const context = await McpContext.from(browser, logger('test'), Locator);

  await cb(response, context);
}

export function getMockRequest(
  options: {
    method?: string;
    response?: HTTPResponse;
    failure?: HTTPRequest['failure'];
    resourceType?: string;
    hasPostData?: boolean;
    postData?: string;
    fetchPostData?: Promise<string>;
    stableId?: number;
    navigationRequest?: boolean;
    frame?: Frame;
  } = {},
): HTTPRequest {
  return {
    url() {
      return 'http://example.com';
    },
    method() {
      return options.method ?? 'GET';
    },
    fetchPostData() {
      return options.fetchPostData ?? Promise.reject();
    },
    hasPostData() {
      return options.hasPostData ?? false;
    },
    postData() {
      return options.postData;
    },
    response() {
      return options.response ?? null;
    },
    failure() {
      return options.failure?.() ?? null;
    },
    resourceType() {
      return options.resourceType ?? 'document';
    },
    headers(): Record<string, string> {
      return {
        'content-size': '10',
      };
    },
    redirectChain(): HTTPRequest[] {
      return [];
    },
    isNavigationRequest() {
      return options.navigationRequest ?? false;
    },
    frame() {
      return options.frame ?? ({} as Frame);
    },
    [stableIdSymbol]: options.stableId ?? 1,
  } as unknown as HTTPRequest;
}

export function getMockResponse(
  options: {
    status?: number;
  } = {},
): HTTPResponse {
  return {
    status() {
      return options.status ?? 200;
    },
  } as HTTPResponse;
}

export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  const bodyContent = strings.reduce((acc, str, i) => {
    return acc + str + (values[i] || '');
  }, '');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My test page</title>
  </head>
  <body>
    ${bodyContent}
  </body>
</html>`;
}

export function stabilizeResponseOutput(text: unknown) {
  if (typeof text !== 'string') {
    throw new Error('Input must be string');
  }
  let output = text;
  const dateRegEx = /.{3}, \d{2} .{3} \d{4} \d{2}:\d{2}:\d{2} [A-Z]{3}/g;
  output = output.replaceAll(dateRegEx, '<long date>');

  const localhostRegEx = /http:\/\/localhost:\d{5}\//g;
  output = output.replaceAll(localhostRegEx, 'http://localhost:<port>/');

  const userAgentRegEx = /user-agent:.*\n/g;
  output = output.replaceAll(userAgentRegEx, 'user-agent:<user-agent>\n');

  const chUaRegEx = /sec-ch-ua:"Chromium";v="\d{3}"/g;
  output = output.replaceAll(chUaRegEx, 'sec-ch-ua:"Chromium";v="<version>"');

  // sec-ch-ua-platform:"Linux"
  const chUaPlatformRegEx = /sec-ch-ua-platform:"[a-zA-Z]*"/g;
  output = output.replaceAll(chUaPlatformRegEx, 'sec-ch-ua-platform:"<os>"');
  return output;
}
