/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer, { Browser } from 'puppeteer';
import { HTTPRequest, HTTPResponse, type ResourceType } from 'puppeteer-core';
import { McpResponse } from '../src/McpResponse.js';
import { McpContext } from '../src/McpContext.js';
import logger from 'debug';

let browser: Browser | undefined;

export async function withBrowser(
  cb: (response: McpResponse, context: McpContext) => Promise<void>,
  options: { debug?: boolean } = {},
) {
  const { debug = false } = options;
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
  const context = await McpContext.from(browser, logger('test'));

  await cb(response, context);
}

export function getMockRequest(
  options: {
    method?: string;
    response?: HTTPResponse;
    failure?: HTTPRequest['failure'];
    resourceType?: ResourceType;
    url?: string;
  } = {},
): HTTPRequest {
  return {
    url() {
      return options.url ?? 'http://example.com';
    },
    method() {
      return options.method ?? 'GET';
    },
    response() {
      return options.response ?? null;
    },
    failure() {
      return options.failure?.() ?? null;
    },
    headers(): Record<string, string> {
      return {
        'content-size': '10',
      };
    },
    redirectChain(): HTTPRequest[] {
      return [];
    },
    resourceType() {
      return options.resourceType ?? 'document';
    },
  } as HTTPRequest;
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
