/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {randomUUID} from 'node:crypto';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ListRootsRequestSchema,
  type Root,
} from '@modelcontextprotocol/sdk/types.js';
import {executablePath} from 'puppeteer';

import {closeBrowser} from '../src/browser.js';
import {parseArguments} from '../src/config/mcp-options.js';
import {startMcpHttpServer} from '../src/http-server.js';
import {VERSION} from '../src/version.js';

interface HttpClient {
  client: Client;
  transport: StreamableHTTPClientTransport;
}
interface HttpService {
  url: URL;
  close(): Promise<void>;
}

interface ProxyClient {
  client: Client;
  transport: StdioClientTransport;
}

interface PageListing {
  id: number;
  selected: boolean;
}

const PAGE_A_TITLE = 'http-multi-client-a';
const PAGE_B_TITLE = 'http-multi-client-b';

function textFromToolResult(result: unknown): string {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('content' in result) ||
    !Array.isArray(result.content)
  ) {
    throw new Error('Expected a tool result with content');
  }

  const firstContent = result.content[0];
  if (
    typeof firstContent !== 'object' ||
    firstContent === null ||
    !('type' in firstContent) ||
    firstContent.type !== 'text' ||
    !('text' in firstContent) ||
    typeof firstContent.text !== 'string'
  ) {
    throw new Error('Expected the first tool result content item to be text');
  }
  return firstContent.text;
}

function isToolError(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'isError' in result &&
    result.isError === true
  );
}

function pageListing(result: unknown, title: string): PageListing | undefined {
  const line = textFromToolResult(result)
    .split('\n')
    .find(candidate => /^\d+:\s/.test(candidate) && candidate.includes(title));
  if (line === undefined) {
    return undefined;
  }

  const idText = line.match(/^(\d+):/)?.[1];
  if (idText === undefined) {
    throw new Error(`Could not parse page ID from page listing: ${line}`);
  }

  const id = Number(idText);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Invalid page ID in page listing: ${line}`);
  }
  return {id, selected: line.includes(' [selected]')};
}

function requiredPage(
  pages: Map<string, PageListing>,
  title: string,
): PageListing {
  const page = pages.get(title);
  if (page === undefined) {
    throw new Error(`Page ${title} was not found`);
  }
  return page;
}

async function waitForPages(
  client: Client,
  titles: readonly string[],
): Promise<Map<string, PageListing>> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await client.callTool({
      name: 'list_pages',
      arguments: {},
    });
    const pages = new Map<string, PageListing>();
    for (const title of titles) {
      const page = pageListing(result, title);
      if (page !== undefined) {
        pages.set(title, page);
      }
    }
    if (pages.size === titles.length) {
      return pages;
    }
    // Target-created events arrive asynchronously through the shared browser;
    // the HTTP protocol exposes no event we can await for this propagation.
    const {promise, resolve} = Promise.withResolvers<void>();
    setTimeout(resolve, 50);
    await promise;
  }
  throw new Error(`Timed out waiting for pages: ${titles.join(', ')}`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function connectClient(
  url: URL,
  name: string,
  roots: Root[],
): Promise<HttpClient> {
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client(
    {name, version: '1.0.0'},
    {
      capabilities: {
        roots: {listChanged: true},
      },
    },
  );
  client.setRequestHandler(ListRootsRequestSchema, () => {
    return {roots};
  });
  try {
    await client.connect(transport);
    return {client, transport};
  } catch (error) {
    try {
      await transport.close();
    } catch {
      // Preserve the initialization error.
    }
    throw error;
  }
}

async function connectProxyClient(url: URL): Promise<ProxyClient> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.resolve('build/src/bin/chrome-devtools-mcp.js'),
      '--isolated',
      '--headless',
      '--chrome-arg=--password-store=basic',
    ],
    env: {
      ...process.env,
      CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
      CHROME_DEVTOOLS_MCP_SERVER_URL: url.href,
    },
  });
  const client = new Client(
    {name: 'http-multi-client-proxy', version: '1.0.0'},
    {
      capabilities: {
        roots: {listChanged: true},
      },
    },
  );
  client.setRequestHandler(ListRootsRequestSchema, () => {
    return {roots: []};
  });
  try {
    await client.connect(transport);
    return {client, transport};
  } catch (error) {
    try {
      await transport.close();
    } catch {
      // Preserve the initialization error.
    }
    throw error;
  }
}

async function closeClient(connection: HttpClient | undefined): Promise<void> {
  if (connection === undefined) {
    return;
  }
  try {
    await connection.transport.terminateSession();
  } catch {
    // The service may already be closed while the test is unwinding.
  }
  try {
    await connection.client.close();
  } catch {
    // The service may already be closed while the test is unwinding.
  }
}

async function closeProxyClient(
  connection: ProxyClient | undefined,
): Promise<void> {
  if (connection === undefined) {
    return;
  }
  try {
    await connection.client.close();
  } catch {
    // The proxy may already be closed while the test is unwinding.
  }
}

describe('shared-browser HTTP MCP service', () => {
  it('keeps pages, selection, and roots independent across sessions', async () => {
    const rootPath = await fs.mkdtemp(
      path.join(os.homedir(), '.chrome-devtools-mcp-http-root-'),
    );
    let service: HttpService | undefined;
    let clientA: HttpClient | undefined;
    let clientB: HttpClient | undefined;
    let proxyClient: ProxyClient | undefined;
    const screenshotA = path.join(rootPath, 'a.png');
    const screenshotB = path.join(rootPath, 'b.png');
    const screenshotBAfterClose = path.join(
      os.tmpdir(),
      `http-multi-client-b-${randomUUID()}.png`,
    );

    try {
      const serverArgs = parseArguments(
        VERSION,
        [
          'node',
          'test',
          '--headless',
          '--isolated',
          '--executable-path',
          await executablePath(),
          '--no-usage-statistics',
        ],
        {},
      );
      service = await startMcpHttpServer(serverArgs, {port: 0});
      const root: Root = {
        uri: pathToFileURL(rootPath).href,
        name: 'client-a-home-temp-root',
      };
      clientA = await connectClient(service.url, 'http-multi-client-a', [root]);
      clientB = await connectClient(service.url, 'http-multi-client-b', []);

      assert.ok(clientA.transport.sessionId);
      assert.ok(clientB.transport.sessionId);
      assert.notStrictEqual(
        clientA.transport.sessionId,
        clientB.transport.sessionId,
      );

      const createdA = await clientA.client.callTool({
        name: 'new_page',
        arguments: {
          url: 'data:text/html,<title>http-multi-client-a</title>',
        },
      });
      const createdAPage = pageListing(createdA, PAGE_A_TITLE);
      assert.ok(createdAPage);
      assert.strictEqual(createdAPage.selected, true);

      await waitForPages(clientB.client, [PAGE_A_TITLE]);
      const createdB = await clientB.client.callTool({
        name: 'new_page',
        arguments: {
          url: 'data:text/html,<title>http-multi-client-b</title>',
        },
      });
      const createdBPage = pageListing(createdB, PAGE_B_TITLE);
      assert.ok(createdBPage);
      assert.strictEqual(createdBPage.selected, true);

      const pagesA = await waitForPages(clientA.client, [
        PAGE_A_TITLE,
        PAGE_B_TITLE,
      ]);
      const pagesB = await waitForPages(clientB.client, [
        PAGE_A_TITLE,
        PAGE_B_TITLE,
      ]);
      assert.notStrictEqual(
        requiredPage(pagesA, PAGE_A_TITLE).id,
        requiredPage(pagesA, PAGE_B_TITLE).id,
      );
      assert.notStrictEqual(
        requiredPage(pagesB, PAGE_A_TITLE).id,
        requiredPage(pagesB, PAGE_B_TITLE).id,
      );

      await clientA.client.callTool({
        name: 'select_page',
        arguments: {pageId: requiredPage(pagesA, PAGE_A_TITLE).id},
      });
      await clientB.client.callTool({
        name: 'select_page',
        arguments: {pageId: requiredPage(pagesB, PAGE_B_TITLE).id},
      });

      const selectedA = await waitForPages(clientA.client, [
        PAGE_A_TITLE,
        PAGE_B_TITLE,
      ]);
      const selectedB = await waitForPages(clientB.client, [
        PAGE_A_TITLE,
        PAGE_B_TITLE,
      ]);
      assert.strictEqual(requiredPage(selectedA, PAGE_A_TITLE).selected, true);
      assert.strictEqual(requiredPage(selectedA, PAGE_B_TITLE).selected, false);
      assert.strictEqual(requiredPage(selectedB, PAGE_A_TITLE).selected, false);
      assert.strictEqual(requiredPage(selectedB, PAGE_B_TITLE).selected, true);

      const screenshotResultA = await clientA.client.callTool({
        name: 'take_screenshot',
        arguments: {
          pageId: requiredPage(selectedA, PAGE_A_TITLE).id,
          filePath: screenshotA,
        },
      });
      assert.strictEqual(isToolError(screenshotResultA), false);
      assert.strictEqual(await fileExists(screenshotA), true);

      const screenshotResultB = await clientB.client.callTool({
        name: 'take_screenshot',
        arguments: {
          pageId: requiredPage(selectedB, PAGE_B_TITLE).id,
          filePath: screenshotB,
        },
      });
      assert.strictEqual(isToolError(screenshotResultB), true);
      assert.match(textFromToolResult(screenshotResultB), /Access denied/);
      assert.strictEqual(await fileExists(screenshotB), false);

      proxyClient = await connectProxyClient(service.url);
      const proxyPages = await proxyClient.client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      assert.strictEqual(isToolError(proxyPages), false);
      assert.match(textFromToolResult(proxyPages), /http-multi-client-a/);

      await clientA.transport.terminateSession();
      await clientA.client.close();
      clientA = undefined;

      const afterClosePages = await waitForPages(clientB.client, [
        PAGE_A_TITLE,
        PAGE_B_TITLE,
      ]);
      assert.strictEqual(
        requiredPage(afterClosePages, PAGE_B_TITLE).selected,
        true,
      );
      const screenshotAfterClose = await clientB.client.callTool({
        name: 'take_screenshot',
        arguments: {
          pageId: requiredPage(afterClosePages, PAGE_B_TITLE).id,
          filePath: screenshotBAfterClose,
        },
      });
      assert.strictEqual(isToolError(screenshotAfterClose), false);
      assert.strictEqual(await fileExists(screenshotBAfterClose), true);
    } finally {
      await closeClient(clientA);
      await closeClient(clientB);
      await closeProxyClient(proxyClient);
      if (service !== undefined) {
        await service.close();
      }
      await closeBrowser();
      await fs.rm(rootPath, {recursive: true, force: true});
      await fs.rm(screenshotBAfterClose, {force: true});
    }
  });
});
