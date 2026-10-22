/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {after, describe, it} from 'node:test';

import sinon from 'sinon';

import type {ParsedArguments} from '../src/config/mcp-options.js';
import type {McpContext} from '../src/McpContext.js';
import {McpResponse} from '../src/McpResponse.js';
import {TextSnapshot} from '../src/TextSnapshot.js';
import {DevTools, type Extension} from '../src/third_party/index.js';
import type {TextSnapshotNode} from '../src/types.js';
import {parseByteSizeRange} from '../src/utils/bytes.js';
import {
  closePage,
  listPages,
  navigatePage,
  newPage,
  selectPage,
} from '../src/tools/pages.js';
import {
  parseRawTraceBuffer,
  traceResultIsSuccess,
  type InsightName,
} from '../src/processors/PerformanceTrace.js';

import {serverHooks} from './server.js';
import {loadTraceAsBuffer} from './trace-processing/fixtures/load.js';
import {
  createHandlerMocks,
  createMockConsoleMessage,
  createMockHeapSnapshotAggregate,
  createMockCSSMatchedStyles,
  createMockCSSProperty,
  createMockCSSStyleDeclaration,
  createMockCSSStyleRule,
  createMockClassDiff,
  createMockClassDiffTotals,
  createMockContextAnalysisResult,
  createMockDetailedClassDiff,
  createMockDiffObject,
  createMockHeapSnapshotDiff,
  createMockHeapSnapshotEdge,
  createMockHeapSnapshotNode,
  createMockHeapSnapshotStats,
  createMockHeapSnapshotStaticData,
  createMockMcpContext,
  createMockMcpPage,
  createMockMcpWorker,
  createMockObjectInfo,
  createMockParsedArguments,
  createMockPuppeteerTarget,
  createMockServerConfig,
  createMockWebMCPTool,
  type MockMcpPage,
} from './mocks.js';
import {
  createTempDir,
  getImageContent,
  getMockAggregatedIssue,
  getMockRequest,
  getMockResponse,
  getTextContent,
  html,
  stabilizeResponseOutput,
  stabilizeStructuredContent,
  withMcpContext,
} from './utils.js';

let webDevTrace: ReturnType<typeof parseRawTraceBuffer> | undefined;

/**
 * Parses the web.dev trace fixture one time for this file. A parse takes
 * about 0.8 s of CPU time, and the tests only read the result.
 */
function parseWebDevTrace(): ReturnType<typeof parseRawTraceBuffer> {
  webDevTrace ??= parseRawTraceBuffer(
    loadTraceAsBuffer('web-dev-with-commit.json.gz'),
  );
  return webDevTrace;
}

// Releases the shared trace after all tests in this file.
after(() => {
  webDevTrace = undefined;
});

describe('McpResponse', () => {
  it('truncates a long page title without splitting a surrogate pair', async () => {
    // The 50 code unit limit leaves 47 for the title; the emoji sits at 46-47.
    const title = 'A'.repeat(46) + '\u{1F600}' + 'B'.repeat(10);
    const page = createMockMcpPage();
    Object.defineProperty(page, 'id', {value: 1});
    page.url.returns('https://example.com/emoji');
    page.getTitle.returns(title);
    const context = createMockMcpContext({selectedPage: page});
    context.getPages.returns([page]);
    context.isPageSelected.returns(true);
    const response = new McpResponse(createMockServerConfig());
    response.setIncludePages(true);

    const result = await response.handle(context);

    assert.ok(
      getTextContent(result.content[0]).includes(
        `1: ${'A'.repeat(46)}... (https://example.com/emoji)`,
      ),
      getTextContent(result.content[0]),
    );
    assert.doesNotMatch(JSON.stringify(result), /\\ud83d/i);
  });

  it('reports only pages opened by the attached action', async () => {
    const openedTarget = createMockPuppeteerTarget({
      url: 'https://example.com/opened',
      title: 'Opened page',
    });
    const openedPage = createMockMcpPage({target: openedTarget});
    const unrelatedPage = createMockMcpPage();
    Object.defineProperty(openedPage, 'id', {value: 2});
    openedPage.url.returns('https://example.com/opened');
    openedPage.getTitle.returns('Opened page');
    Object.defineProperty(unrelatedPage, 'id', {value: 3});
    unrelatedPage.url.returns('https://example.com/unrelated');
    unrelatedPage.getTitle.returns('Unrelated page');

    const context = createMockMcpContext();
    const targetInfo = openedTarget._getTargetInfo();
    context.getTargetInfos.resolves(
      new Map([[targetInfo.targetId, targetInfo]]),
    );
    context.getPages.returns([openedPage, unrelatedPage]);
    context.isPageSelected.returns(false);
    const response = new McpResponse(createMockServerConfig());
    response.attachWaitForResult({
      openedPages: new Set([openedPage.target]),
    });

    const result = await response.handle(context);

    sinon.assert.calledOnceWithExactly(context.createPagesSnapshot);
    sinon.assert.calledOnceWithExactly(context.getTargetInfos);
    sinon.assert.calledOnceWithExactly(openedPage.getTitle, targetInfo);
    assert.match(
      getTextContent(result.content[0]),
      /## Opened pages\n2: Opened page \(https:\/\/example\.com\/opened\)/,
    );
    assert.ok(!getTextContent(result.content[0]).includes('Unrelated page'));
    assert.deepStrictEqual(result.structuredContent, {
      openedPages: [
        {
          id: 2,
          url: 'https://example.com/opened',
          title: 'Opened page',
          selected: false,
        },
      ],
    });
  });

  it('list pages', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludePages(true);
      const {content, structuredContent} = await response.handle(context);
      assert.strictEqual(content[0].type, 'text');
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('includes a reconnect notice only when set', async () => {
    await withMcpContext(async (response, context) => {
      const before = await response.handle(context);
      assert.ok(
        !JSON.stringify(before.content).includes('Page ids have changed'),
        'no reconnect notice by default',
      );
      assert.ok(
        !(before.structuredContent as {reconnected?: boolean}).reconnected,
        'structuredContent is not flagged reconnected by default',
      );

      response.setReconnectNotice();
      const after = await response.handle(context);
      assert.ok(
        JSON.stringify(after.content).includes('Page ids have changed'),
        'reconnect notice is included once set',
      );
      assert.strictEqual(
        (after.structuredContent as {reconnected?: boolean}).reconnected,
        true,
        'structuredContent is flagged reconnected once set',
      );
    });
  });

  it('allows response text lines to be added', async t => {
    await withMcpContext(async (response, context) => {
      response.appendResponseLine('Testing 1');
      response.appendResponseLine('Testing 2');
      const {content, structuredContent} = await response.handle(context);
      assert.strictEqual(content[0].type, 'text');
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('does not include anything in response if snapshot is null', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      page.accessibility.snapshot = async () => null;
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('returns correctly formatted snapshot for a simple tree', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.setContent(
        html`<button>Click me</button>
          <input
            type="text"
            value="Input"
          />`,
      );
      await page.focus('button');
      response.includeSnapshot();
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('returns values for textboxes', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.setContent(
        html`<label
          >username<input
            name="username"
            value="mcp"
        /></label>`,
      );
      await page.focus('input');
      response.includeSnapshot();
      const {content, structuredContent} = await response.handle(context);
      assert.strictEqual(content[0].type, 'text');
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('returns verbose snapshot and structured content', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.setContent(html`<aside>test</aside>`);
      response.includeSnapshot({
        verbose: true,
      });
      const {content, structuredContent} = await response.handle(context);
      assert.strictEqual(content[0].type, 'text');
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('saves snapshot to file and returns structured content', async t => {
    using tmpDir = createTempDir();
    const filePath = join(tmpDir.path, 'test-snapshot.txt');
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.setContent(html`<aside>test</aside>`);
      response.includeSnapshot({
        verbose: true,
        filePath,
      });
      const {content, structuredContent} = await response.handle(context);
      assert.strictEqual(content[0].type, 'text');
      t.assert.snapshot(stabilizeResponseOutput(getTextContent(content[0])));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
    const content = await readFile(filePath, 'utf-8');
    t.assert.snapshot(stabilizeResponseOutput(content));
  });

  it('preserves mapping ids across multiple snapshots', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.setContent(html`
        <div>
          <button id="btn1">Button 1</button>
          <span id="span1">Span 1</span>
        </div>
      `);
      response.includeSnapshot();
      // First snapshot
      const res1 = await response.handle(context);
      const text1 = getTextContent(res1.content[0]);
      const btn1IdMatch = text1.match(/uid=(\S+) .*Button 1/);
      const span1IdMatch = text1.match(/uid=(\S+) .*Span 1/);

      assert.ok(btn1IdMatch, 'Button 1 ID not found in first snapshot');
      assert.ok(span1IdMatch, 'Span 1 ID not found in first snapshot');

      const btn1Id = btn1IdMatch[1];
      const span1Id = span1IdMatch[1];

      // Modify page: add a new element before the others to potentially shift indices if not stable
      await page.evaluate(() => {
        const newBtn = document.createElement('button');
        newBtn.textContent = 'Button 2';
        document.body.prepend(newBtn);
      });

      // Second snapshot
      const res2 = await response.handle(context);
      const text2 = getTextContent(res2.content[0]);

      const btn1IdMatch2 = text2.match(/uid=(\S+) .*Button 1/);
      const span1IdMatch2 = text2.match(/uid=(\S+) .*Span 1/);
      const btn2IdMatch = text2.match(/uid=(\S+) .*Button 2/);

      assert.ok(btn1IdMatch2, 'Button 1 ID not found in second snapshot');
      assert.ok(span1IdMatch2, 'Span 1 ID not found in second snapshot');
      assert.ok(btn2IdMatch, 'Button 2 ID not found in second snapshot');

      assert.strictEqual(
        btn1IdMatch2[1],
        btn1Id,
        'Button 1 ID changed between snapshots',
      );
      assert.strictEqual(
        span1IdMatch2[1],
        span1Id,
        'Span 1 ID changed between snapshots',
      );
      assert.notStrictEqual(
        btn2IdMatch[1],
        btn1Id,
        'Button 2 ID collides with Button 1',
      );
      assert.notStrictEqual(
        btn2IdMatch[1],
        btn1Id,
        'Button 2 ID collides with Button 1',
      );
    });
  });

  describe('navigation', () => {
    const server = serverHooks();

    it('lists current page titles', async () => {
      await withMcpContext(async (response, context) => {
        server.addHtmlRoute(
          '/titled.html',
          '<!doctype html><title>Real Title</title><h1>Titled</h1>',
        );
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/titled.html'));

        response.setIncludePages(true);
        const res1 = await response.handle(context);
        assert.ok(
          getTextContent(res1.content[0]).includes(
            `Real Title (${server.getRoute('/titled.html')})`,
          ),
        );

        await page.evaluate(() => {
          document.title = 'Changed By Script';
        });
        const res2 = await response.handle(context);
        assert.ok(
          getTextContent(res2.content[0]).includes(
            `Changed By Script (${server.getRoute('/titled.html')})`,
          ),
        );
      });
    });

    it('resets ids after navigation', async () => {
      await withMcpContext(async (response, context) => {
        server.addHtmlRoute(
          '/page.html',
          html`
            <div>
              <button id="btn1">Button 1</button>
            </div>
          `,
        );
        const page = context.getSelectedMcpPage().pptrPage;
        await page.goto(server.getRoute('/page.html'));

        response.includeSnapshot();
        const res1 = await response.handle(context);
        const text1 = getTextContent(res1.content[0]);
        const btn1IdMatch = text1.match(/uid=(\S+) .*Button 1/);
        assert.ok(btn1IdMatch, 'Button 1 ID not found in first snapshot');
        const btn1Id = btn1IdMatch[1];

        // Navigate to the same page again (or meaningful navigation)
        await page.goto(server.getRoute('/page.html'));

        const res2 = await response.handle(context);
        const text2 = getTextContent(res2.content[0]);
        const btn1IdMatch2 = text2.match(/uid=(\S+) .*Button 1/);
        assert.ok(btn1IdMatch2, 'Button 1 ID not found in second snapshot');
        const btn1Id2 = btn1IdMatch2[1];

        assert.notStrictEqual(
          btn1Id2,
          btn1Id,
          'ID should reset after navigation',
        );
      });
    });
  });

  it('adds throttling setting when it is not null', async t => {
    await withMcpContext(
      async (response, context) => {
        await context
          .getSelectedMcpPage()
          .emulate({networkConditions: 'Slow 3G'});
        const {content, structuredContent} = await response.handle(context);
        assert.strictEqual(content[0].type, 'text');
        t.assert.snapshot(getTextContent(content[0]));
        t.assert.snapshot(stabilizeStructuredContent(structuredContent));
      },
      {navigationTimeout: 10000},
    );
  });

  it('does not include throttling setting when it is null', async t => {
    await withMcpContext(async (response, context) => {
      const {content, structuredContent} = await response.handle(context);
      await context.getSelectedMcpPage().emulate({});
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });
  it('adds image when image is attached', async t => {
    await withMcpContext(async (response, context) => {
      response.attachImage({data: 'imageBase64', mimeType: 'image/png'});
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      assert.strictEqual(content[1].type, 'image');
      assert.strictEqual(getImageContent(content[1]).data, 'imageBase64');
      assert.strictEqual(getImageContent(content[1]).mimeType, 'image/png');
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('adds cpu throttling setting when it is over 1', async t => {
    await withMcpContext(async (response, context) => {
      await context.getSelectedMcpPage().emulate({cpuThrottlingRate: 4});
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('does not include cpu throttling setting when it is 1', async t => {
    await withMcpContext(async (response, context) => {
      await context.getSelectedMcpPage().emulate({cpuThrottlingRate: 1});
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('adds viewport emulation setting when it is set', async t => {
    await withMcpContext(async (response, context) => {
      await context.getSelectedMcpPage().emulate({
        viewport: {width: 400, height: 400, deviceScaleFactor: 1},
      });
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('adds userAgent emulation setting when it is set', async t => {
    await withMcpContext(async (response, context) => {
      await context.getSelectedMcpPage().emulate({userAgent: 'MyUA'});
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('adds color scheme emulation setting when it is set', async t => {
    await withMcpContext(async (response, context) => {
      await context.getSelectedMcpPage().emulate({colorScheme: 'dark'});
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('adds a prompt dialog', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      const dialogPromise = new Promise<void>(resolve => {
        page.pptrPage.on('dialog', () => {
          resolve();
        });
      });
      page.pptrPage.evaluate(() => {
        prompt('message', 'default');
      });
      await dialogPromise;
      const {content, structuredContent} = await response.handle(context);
      await page.getDialog()?.dismiss();
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('adds an alert dialog', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage();
      const dialogPromise = new Promise<void>(resolve => {
        page.pptrPage.on('dialog', () => {
          resolve();
        });
      });
      page.pptrPage.evaluate(() => {
        alert('message');
      });
      await dialogPromise;
      const {content, structuredContent} = await response.handle(context);
      await page.getDialog()?.dismiss();
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('add network requests when setting is true', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [getMockRequest({stableId: 1}), getMockRequest({stableId: 2})];
      };
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('does not include network requests when setting is false', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(false);
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [getMockRequest()];
      };
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('forwards includePreservedRequests to page.getNetworkRequests', async () => {
    const {page, context} = createHandlerMocks();
    page.emulationSettings = {};
    page.getNetworkRequests.returns([]);

    const responseWithPreserved = new McpResponse(createMockServerConfig());
    responseWithPreserved.setPage(page);
    responseWithPreserved.setIncludeNetworkRequests(true, {
      includePreservedRequests: true,
    });
    await responseWithPreserved.handle(context);

    sinon.assert.calledOnceWithExactly(page.getNetworkRequests, true);

    const responseDefault = new McpResponse(createMockServerConfig());
    responseDefault.setPage(page);
    responseDefault.setIncludeNetworkRequests(true);
    await responseDefault.handle(context);

    sinon.assert.calledWithExactly(
      page.getNetworkRequests.secondCall,
      undefined,
    );
  });

  it('add network request when attached with POST data', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      const httpResponse = getMockResponse();
      httpResponse.buffer = () => {
        return Promise.resolve(Buffer.from(JSON.stringify({response: 'body'})));
      };
      httpResponse.headers = () => {
        return {
          'Content-Type': 'application/json',
        };
      };
      const request = getMockRequest({
        method: 'POST',
        hasPostData: true,
        postData: JSON.stringify({request: 'body'}),
        response: httpResponse,
      });
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [request];
      };
      context.getSelectedMcpPage().getNetworkRequestById = () => {
        return request;
      };
      response.attachNetworkRequest(1);

      const {content, structuredContent} = await response.handle(context);

      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('add network request when attached', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      const request = getMockRequest();
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [request];
      };
      context.getSelectedMcpPage().getNetworkRequestById = () => {
        return request;
      };
      response.attachNetworkRequest(1);
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('adds console messages when the setting is true', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeConsoleData(true);
      const page = context.getSelectedMcpPage().pptrPage;
      const consoleMessagePromise = new Promise<void>(resolve => {
        page.on('console', () => {
          resolve();
        });
      });
      page.evaluate(() => {
        // eslint-disable-next-line no-console
        console.log('Hello from the test');
      });
      await consoleMessagePromise;
      const {content, structuredContent} = await response.handle(context);
      assert.ok(getTextContent(content[0]));
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('adds a message when no console messages exist', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeConsoleData(true);
      const {content, structuredContent} = await response.handle(context);
      assert.ok(getTextContent(content[0]));
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it("doesn't list the issue message if mapping returns null", async t => {
    await withMcpContext(async (response, context) => {
      const mockAggregatedIssue = getMockAggregatedIssue();
      const mockDescription = {
        file: 'not-existing-description-file.md',
        links: [],
      };
      mockAggregatedIssue.getDescription.returns(mockDescription);
      response.setIncludeConsoleData(true);
      context.getSelectedMcpPage().getConsoleData = () => {
        return [mockAggregatedIssue];
      };

      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.ok(text.includes('<no console messages found>'));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('throws error if mapping returns null on get issue details', async () => {
    await withMcpContext(async (response, context) => {
      const mockAggregatedIssue = getMockAggregatedIssue();
      const mockDescription = {
        file: 'not-existing-description-file.md',
        links: [],
      };
      mockAggregatedIssue.getDescription.returns(mockDescription);
      response.attachConsoleMessage(1);
      context.getSelectedMcpPage().getConsoleMessageById = () => {
        return mockAggregatedIssue;
      };

      try {
        await response.handle(context);
      } catch (e) {
        assert.ok(e.message.includes("Can't provide details for the msgid 1"));
      }
    });
  });
});

describe('McpResponse network request filtering', () => {
  const server = serverHooks();

  it('filters CORS preflights and prefetches by their own types', async () => {
    await withMcpContext(async (response, context) => {
      server.addRoute('/data?prefetch', (_req, res) => {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('prefetched');
      });
      server.addRoute('/data?cors', (_req, res) => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'PUT',
          'Access-Control-Allow-Headers': 'x-custom',
          'Content-Type': 'text/plain',
        });
        res.end('cors');
      });
      // localhost vs 127.0.0.1 makes the PUT cross-origin, so it is preflighted.
      const crossOrigin = server
        .getRoute('/data?cors')
        .replace('127.0.0.1', 'localhost');
      server.addHtmlRoute(
        '/types.html',
        `<!doctype html><link rel="prefetch" href="/data?prefetch"><script>fetch(${JSON.stringify(crossOrigin)}, {method: 'PUT', headers: {'x-custom': '1'}});</script>`,
      );
      const page = context.getSelectedMcpPage().pptrPage;
      const done = Promise.all([
        page.waitForResponse(r => r.url().endsWith('/data?prefetch')),
        page.waitForResponse(
          r => r.url() === crossOrigin && r.request().method() === 'PUT',
        ),
      ]);
      await page.goto(server.getRoute('/types.html'));
      await done;

      response.setIncludeNetworkRequests(true, {resourceTypes: ['preflight']});
      let text = getTextContent((await response.handle(context)).content[0]);
      assert.match(text, /OPTIONS \S+\/data\?cors/, text);
      assert.doesNotMatch(text, /PUT|prefetch/, text);

      response.setIncludeNetworkRequests(true, {resourceTypes: ['prefetch']});
      text = getTextContent((await response.handle(context)).content[0]);
      assert.match(text, /GET \S+\/data\?prefetch/, text);
      assert.doesNotMatch(text, /OPTIONS|PUT/, text);

      response.setIncludeNetworkRequests(true, {resourceTypes: ['fetch']});
      text = getTextContent((await response.handle(context)).content[0]);
      assert.match(text, /PUT \S+\/data\?cors/, text);
      assert.doesNotMatch(text, /OPTIONS|prefetch/, text);
    });
  });

  it('filters network requests by resource type', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true, {
        resourceTypes: ['script', 'stylesheet'],
      });
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
          getMockRequest({resourceType: 'document'}),
        ];
      };
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('filters network requests by single resource type', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true, {
        resourceTypes: ['image'],
      });
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
        ];
      };
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('shows no requests when filter matches nothing', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true, {
        resourceTypes: ['font'],
      });
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
        ];
      };
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('shows all requests when no filters are provided', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
          getMockRequest({resourceType: 'document'}),
          getMockRequest({resourceType: 'font'}),
        ];
      };
      const {content, structuredContent} = await response.handle(context);

      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('shows all requests when empty resourceTypes array is provided', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true, {
        resourceTypes: [],
      });
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
          getMockRequest({resourceType: 'document'}),
          getMockRequest({resourceType: 'font'}),
        ];
      };
      const {content, structuredContent} = await response.handle(context);
      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });
});

describe('McpResponse network pagination', () => {
  it('returns all requests when pagination is not provided', async t => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 5}, () => getMockRequest());
      context.getSelectedMcpPage().getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true);
      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 1-5 of 5 (Page 1 of 1).'));
      assert.ok(!text.includes('Next page:'));
      assert.ok(!text.includes('Previous page:'));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('returns first page by default', async t => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 30}, (_, idx) =>
        getMockRequest({method: `GET-${idx}`}),
      );
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return requests;
      };
      response.setIncludeNetworkRequests(true, {pageSize: 10});
      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 1-10 of 30 (Page 1 of 3).'));
      assert.ok(text.includes('Next page: 1'));
      assert.ok(!text.includes('Previous page:'));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('returns subsequent page when pageIdx provided', async t => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 25}, (_, idx) =>
        getMockRequest({method: `GET-${idx}`}),
      );
      context.getSelectedMcpPage().getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        pageSize: 10,
        pageIdx: 1,
      });
      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 11-20 of 25 (Page 2 of 3).'));
      assert.ok(text.includes('Next page: 2'));
      assert.ok(text.includes('Previous page: 0'));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('returns all items when pageIdx is 0 without pageSize', async () => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 30}, (_, idx) =>
        getMockRequest({method: `GET-${idx}`}),
      );
      context.getSelectedMcpPage().getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {pageIdx: 0});
      const {content} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 1-30 of 30 (Page 1 of 1).'));
      assert.ok(!text.includes('Next page:'));
      assert.ok(!text.includes('Previous page:'));
    });
  });

  it('returns all console messages when pageIdx is 0 without pageSize', async () => {
    await withMcpContext(async (response, context) => {
      const messages = Array.from({length: 30}, (_, idx) =>
        createMockConsoleMessage({text: `msg-${idx}`}),
      );
      context.getSelectedMcpPage().getConsoleData = () => messages;
      response.setIncludeConsoleData(true, {pageIdx: 0});
      const {content} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 1-30 of 30 (Page 1 of 1).'));
      assert.ok(!text.includes('Next page:'));
      assert.ok(!text.includes('Previous page:'));
    });
  });

  it('handles invalid page number by showing first page', async t => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 5}, () => getMockRequest());
      context.getSelectedMcpPage().getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        pageSize: 2,
        pageIdx: 10, // Invalid page number
      });
      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.ok(
        text.includes('Invalid page number provided. Showing first page.'),
      );
      assert.ok(text.includes('Showing 1-2 of 5 (Page 1 of 3).'));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  describe('trace summaries', () => {
    it('includes the trace summary text and structured data', async t => {
      const result = await parseWebDevTrace();
      if (!traceResultIsSuccess(result)) {
        throw new Error(result.error);
      }

      await withMcpContext(async (response, context) => {
        response.attachTraceSummary(result);
        const {content, structuredContent} = await response.handle(context);

        t.assert.snapshot(getTextContent(content[0]));
        const typedStructuredContent = structuredContent as {
          traceSummary?: string;
          traceInsights?: unknown[];
        };
        t.assert.snapshot(
          stabilizeStructuredContent(typedStructuredContent.traceSummary),
        );
        t.assert.snapshot(
          stabilizeStructuredContent(typedStructuredContent.traceInsights),
        );
      });
    });
  });

  describe('trace insights', () => {
    it('includes the trace insight output', async t => {
      const result = await parseWebDevTrace();
      if (!traceResultIsSuccess(result)) {
        throw new Error(result.error);
      }

      await withMcpContext(async (response, context) => {
        response.attachTraceInsight(
          result,
          'NAVIGATION_0',
          'LCPBreakdown' as InsightName,
        );
        const {content, structuredContent} = await response.handle(context);

        t.assert.snapshot(getTextContent(content[0]));
        const typedStructuredContent = structuredContent as {
          traceInsight?: string;
        };
        assert.ok(
          typedStructuredContent.traceInsight,
          'Expected traceInsight in structuredContent',
        );
        t.assert.snapshot(stabilizeStructuredContent(structuredContent));
      });
    });

    it('includes error if insight not found', async t => {
      const result = await parseWebDevTrace();
      if (!traceResultIsSuccess(result)) {
        throw new Error(result.error);
      }

      await withMcpContext(async (response, context) => {
        response.attachTraceInsight(
          result,
          'BAD_ID',
          'LCPBreakdown' as InsightName,
        );
        const {content, structuredContent} = await response.handle(context);

        t.assert.snapshot(getTextContent(content[0]));
        const typedStructuredContent = structuredContent as {
          error?: string;
        };
        assert.ok(
          typedStructuredContent.error,
          'Expected error in structuredContent',
        );
        t.assert.snapshot(stabilizeStructuredContent(structuredContent));
      });
    });
  });
});

describe('extensions', () => {
  it('lists extensions', async t => {
    await withMcpContext(async (response, context) => {
      response.setListExtensions();
      // Empty state testing
      const emptyResult = await response.handle(context);
      const emptyText = getTextContent(emptyResult.content[0]);
      assert.ok(
        emptyText.includes('No extensions installed.'),
        'Should show message for ampty extensions',
      );

      response.resetResponseLineForTesting();
      // Testing with extensions
      context.listExtensions = async () =>
        await Promise.resolve(
          new Map<string, Extension>([
            [
              'id1',
              {
                id: 'id1',
                name: 'Extension 1',
                version: '1.0',
                enabled: true,
                path: '/path/to/ext1',
              } as Extension,
            ],
            [
              'id2',
              {
                id: 'id2',
                name: 'Extension 2',
                version: '2.0',
                enabled: false,
                path: '/path/to/ext2',
              } as Extension,
            ],
          ]),
        );
      response.setListExtensions();
      const {content, structuredContent} = await response.handle(context);

      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });
});

describe('lighthouse', () => {
  it('includes lighthouse report paths', async t => {
    await withMcpContext(async (response, context) => {
      const lighthouseResult = {
        summary: {
          mode: 'navigation',
          device: 'desktop',
          url: 'https://example.com',
          scores: [
            {
              id: 'performance',
              title: 'Performance',
              score: 0.9,
            },
          ],
          audits: {
            failed: 1,
            passed: 10,
          },
          timing: {
            total: 1000,
          },
        },
        failedAudits: [
          {
            id: 'color-contrast',
            title:
              'Background and foreground colors do not have a sufficient contrast ratio.',
            description: 'Low-contrast text is difficult to read.',
            score: 0,
            categories: ['accessibility'],
            nodes: [
              {
                selector: 'body > p',
                snippet: '<p class="faint">',
                nodeLabel: 'Hello',
                explanation:
                  'Fix any of the following:\n  Element has insufficient color contrast',
              },
              {
                selector: 'a[title="Say \\"hi\\""]',
                snippet: '<a title="Say &quot;hi&quot;">',
                nodeLabel: 'Say "hi"\nnow',
              },
            ],
            totalNodes: 12,
          },
          {
            id: 'document-title',
            title: 'Document does not have a `<title>` element',
            score: 0,
            categories: ['accessibility', 'seo'],
            nodes: [],
            totalNodes: 0,
          },
        ],
        reports: ['/tmp/report.json', '/tmp/report.html'],
      };

      response.attachLighthouseResult(lighthouseResult);
      const {content, structuredContent} = await response.handle(context);

      const text = getTextContent(content[0]);
      assert.ok(text.includes('### Failed audits'));
      assert.ok(text.includes('### Reports'));
      assert.ok(text.includes('- /tmp/report.json'));
      assert.ok(text.includes('- /tmp/report.html'));

      t.assert.snapshot(getTextContent(content[0]));
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });

  it('rounds category scores and shows unscored categories as n/a', async t => {
    await withMcpContext(async (response, context) => {
      const lighthouseResult = {
        summary: {
          mode: 'navigation',
          device: 'desktop',
          url: 'https://example.com',
          scores: [
            {
              id: 'accessibility',
              title: 'Accessibility',
              score: 0.57,
            },
            {
              id: 'seo',
              title: 'SEO',
              score: 0,
            },
            {
              id: 'agentic-browsing',
              title: 'Agentic Browsing',
              score: null,
            },
          ],
          audits: {
            failed: 1,
            passed: 10,
          },
          timing: {
            total: 1000,
          },
        },
        failedAudits: [],
        reports: ['/tmp/report.json', '/tmp/report.html'],
      };

      response.attachLighthouseResult(lighthouseResult);
      const {content, structuredContent} = await response.handle(context);

      const text = getTextContent(content[0]);
      assert.ok(text.includes('- Accessibility: 57 (accessibility)'));
      assert.ok(text.includes('- SEO: 0 (seo)'));
      assert.ok(text.includes('- Agentic Browsing: n/a (agentic-browsing)'));

      t.assert.snapshot(text);
      t.assert.snapshot(stabilizeStructuredContent(structuredContent));
    });
  });
});

describe('third-party developer tools', () => {
  it('lists third-party developer tools', async t => {
    const args = createMockParsedArguments({
      categoryExperimentalThirdParty: true,
    });
    const page = createMockMcpPage();
    page.discoverThirdPartyDeveloperTools.resolves([
      {
        name: 'My Tool Group',
        description: 'A group of tools',
        tools: [
          {
            name: 'myTool',
            description: 'Does something',
            inputSchema: {
              type: 'object',
              properties: {
                foo: {type: 'string'},
              },
            },
          },
        ],
      },
    ]);
    const context = createMockMcpContext({selectedPage: page});
    const response = new McpResponse(createMockServerConfig(args));
    response.setPage(page);
    response.setListThirdPartyDeveloperTools();

    const {content, structuredContent} = await response.handle(context);
    const responseText = getTextContent(content[0]);
    t.assert.snapshot(responseText);
    assert.ok(
      responseText.includes('inputSchema={"type":"object"'),
      'Response should include inputSchema',
    );
    t.assert.snapshot(stabilizeStructuredContent(structuredContent));
  });

  it('lists no third-party developer tools if there are none', async t => {
    const response = new McpResponse(
      createMockServerConfig({categoryExperimentalThirdParty: true}),
    );
    const page = createMockMcpPage();
    page.discoverThirdPartyDeveloperTools.resolves([]);
    response.setPage(page);
    response.setListThirdPartyDeveloperTools();

    const context = createMockMcpContext();
    const {content, structuredContent} = await response.handle(context);
    const firstContent = content[0];
    assert.ok(firstContent);
    t.assert.snapshot(getTextContent(firstContent));
    t.assert.snapshot(stabilizeStructuredContent(structuredContent));
  });

  async function testIncludesThirdPartyDeveloperTools(
    handlerAction: (
      response: McpResponse,
      context: McpContext,
      args: ParsedArguments,
      page: MockMcpPage,
    ) => Promise<void>,
    toolName: string,
  ) {
    const args = createMockParsedArguments({
      categoryExperimentalThirdParty: true,
    });
    const page = createMockMcpPage();
    Object.defineProperty(page, 'id', {value: 1});
    page.url.returns('about:blank');
    page.discoverThirdPartyDeveloperTools.resolves([
      {
        name: 'Tool group name',
        description: 'Test tools',
        tools: [
          {
            name: '3pDeveloperTool',
            description: 'A test tool',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      },
    ]);
    const context = createMockMcpContext({selectedPage: page});
    context.getPages.returns([page]);
    context.getPageById.withArgs(1).returns(page);
    context.newPage.resolves(page);
    const response = new McpResponse(createMockServerConfig(args));

    await handlerAction(response, context, args, page);

    const {content} = await response.handle(context);
    const responseText = getTextContent(content[0]);
    assert.ok(
      responseText.includes('3pDeveloperTool'),
      `Should include third-party developer tool name in the ${toolName} response`,
    );
  }

  it('includes third-party developer tools in list_pages response', async () => {
    await testIncludesThirdPartyDeveloperTools(
      async (response, context, args) => {
        const listPagesDef = listPages(args);
        await listPagesDef.handler({params: {}}, response, context);
      },
      'list_pages',
    );
  });

  it('includes third-party developer tools in select_page response', async () => {
    await testIncludesThirdPartyDeveloperTools(
      async (response, context, args, page) => {
        await selectPage(args).handler(
          {params: {pageId: page.id}},
          response,
          context,
        );
      },
      'select_page',
    );
  });

  it('includes third-party developer tools in close_page response', async () => {
    await testIncludesThirdPartyDeveloperTools(
      async (response, context, args, page) => {
        await closePage(args).handler(
          {params: {pageId: page.id}},
          response,
          context,
        );
      },
      'close_page',
    );
  });

  it('includes third-party developer tools in navigate_page response', async () => {
    await testIncludesThirdPartyDeveloperTools(
      async (response, context, args, page) => {
        response.setPage(page);
        await navigatePage(args).handler(
          {
            params: {type: 'url', url: 'about:blank'},
            page,
          },
          response,
          context,
        );
      },
      'navigate_page',
    );
  });

  it('includes third-party developer tools in new_page response', async () => {
    await testIncludesThirdPartyDeveloperTools(
      async (response, context, args) => {
        await newPage(args).handler(
          {
            params: {url: 'about:blank'},
          },
          response,
          context,
        );
      },
      'new_page',
    );
  });
});

describe('webmcp', () => {
  async function testIncludesWebmcpTools(
    t: it.TestContext,
    parseArguments: Partial<ParsedArguments>,
    handlerAction: (
      response: McpResponse,
      context: McpContext,
      args: ParsedArguments,
      page: MockMcpPage,
    ) => Promise<void>,
  ) {
    const args = createMockParsedArguments(parseArguments);
    const page = createMockMcpPage();
    Object.defineProperty(page, 'id', {value: 1});
    page.url.returns('about:blank');
    page.getTitle.returns('My test page');
    page.getWebMcpTools.returns([
      createMockWebMCPTool({
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      }),
    ]);
    const context = createMockMcpContext({selectedPage: page});
    context.getPages.returns([page]);
    context.isPageSelected.returns(true);
    context.getPageById.withArgs(1).returns(page);
    const response = new McpResponse(createMockServerConfig(args));

    await handlerAction(response, context, args, page);

    const {content, structuredContent} = await response.handle(context);
    assert.ok(getTextContent(content[0]));
    t.assert.snapshot(getTextContent(content[0]));
    t.assert.snapshot(stabilizeStructuredContent(structuredContent));
  }

  it('includes webmcp tools in list_pages response', async t => {
    await testIncludesWebmcpTools(
      t,
      {categoryExperimentalWebmcp: true},
      async (response, context, args) => {
        await listPages(args).handler({params: {}}, response, context);
      },
    );
  });

  it('includes webmcp tools in select_page response', async t => {
    await testIncludesWebmcpTools(
      t,
      {categoryExperimentalWebmcp: true},
      async (response, context, args, page) => {
        await selectPage(args).handler(
          {params: {pageId: page.id}},
          response,
          context,
        );
      },
    );
  });

  it('includes webmcp tools in navigate_page response', async t => {
    await testIncludesWebmcpTools(
      t,
      {categoryExperimentalWebmcp: true},
      async (response, context, args, page) => {
        response.setPage(page);
        await navigatePage(args).handler(
          {
            params: {type: 'url', url: 'about:blank'},
            page,
          },
          response,
          context,
        );
      },
    );
  });

  it('list no webmcp tools if there are none', async t => {
    const args = createMockParsedArguments({
      categoryExperimentalWebmcp: true,
    });
    const page = createMockMcpPage();
    const context = createMockMcpContext({selectedPage: page});
    const response = new McpResponse(createMockServerConfig(args));
    response.setPage(page);
    response.setListWebMcpTools();

    const {content, structuredContent} = await response.handle(context);
    assert.ok(getTextContent(content[0]));
    t.assert.snapshot(getTextContent(content[0]));
    t.assert.snapshot(stabilizeStructuredContent(structuredContent));
  });

  it('list no webmcp tools if experimentalWebmcp is false', async t => {
    await testIncludesWebmcpTools(
      t,
      {categoryExperimentalWebmcp: false},
      async (response, context, args, page) => {
        response.setPage(page);
        await navigatePage(args).handler(
          {
            params: {type: 'url', url: 'about:blank'},
            page,
          },
          response,
          context,
        );
      },
    );
  });

  it('returns pagination info when css styles pagination options are provided', async () => {
    await withMcpContext(async (response, context) => {
      const mockStyles = createMockCSSMatchedStyles({
        node: 'button#btn',
        nodeStyles: Array.from({length: 5}, (_, idx) =>
          createMockCSSStyleDeclaration(
            [createMockCSSProperty('color', `color-${idx}`)],
            {
              rule: createMockCSSStyleRule(`.rule-${idx}`),
            },
          ),
        ),
      });
      response.setIncludeCssStyles(mockStyles, {
        uid: '1_1',
        pageSize: 2,
        pageIdx: 0,
      });
      const {content} = await response.handle(context);
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 1-2 of 5'));
    });
  });
});

describe('McpResponse heap snapshot formatting', () => {
  DevTools.I18n.DevToolsLocale.DevToolsLocale.instance({
    create: true,
    data: {
      navigatorLanguage: 'en-US',
      settingLanguage: 'en-US',
      lookupClosestDevToolsLocale: l => l,
    },
  });
  DevTools.I18n.i18n.registerLocaleDataForTest('en-US', {});

  it('formats stats, staticData, nativeContextSizes, and retainedByContextSummary', async () => {
    const response = new McpResponse(createMockServerConfig());
    const stats = createMockHeapSnapshotStats();
    const staticData = createMockHeapSnapshotStaticData();
    const nativeContextSizes = {
      nativeContexts: [
        {
          nodeId: 10,
          nodeIndex: 1,
          nodeName: 'system / NativeContext',
          attributedSize: 500,
          retainedSize: 1000,
          selfSize: 100,
        },
      ],
      sharedSize: 300,
      noAttributionSize: 400,
    };
    const retainedByContextSummary = {
      contextCount: 2,
      retainedByContextSize: 5000,
      retainedByContextCount: 10,
      notRetainedByContextSize: 1000,
      notRetainedByContextCount: 5,
      totalSize: 6000,
    };
    response.setHeapSnapshotStats(
      stats,
      staticData,
      nativeContextSizes,
      retainedByContextSummary,
    );
    const context = createMockMcpContext();
    const {content, structuredContent} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('## Heap Snapshot Data'));
    assert.ok(text.includes('Statistics: '));
    assert.ok(text.includes('Static Data: '));
    assert.ok(text.includes('### Native Contexts'));
    assert.ok(text.includes('system / NativeContext'));
    assert.ok(text.includes('### Retained by Context Summary'));
    assert.ok(text.includes('Context count: 2'));
    assert.ok(text.includes('Total size: '));

    const heapData: unknown = Reflect.get(structuredContent, 'heapSnapshot');
    assert.ok(heapData && typeof heapData === 'object');
    assert.deepStrictEqual(Reflect.get(heapData, 'stats'), stats);
    assert.deepStrictEqual(Reflect.get(heapData, 'staticData'), staticData);
    assert.deepStrictEqual(
      Reflect.get(heapData, 'nativeContextSizes'),
      nativeContextSizes,
    );
    assert.deepStrictEqual(
      Reflect.get(heapData, 'retainedByContextSummary'),
      retainedByContextSummary,
    );
  });

  it('formats aggregate data with shallow size and pagination summaries', async () => {
    const response = new McpResponse(createMockServerConfig());
    const aggregates = {
      aggregates: [
        createMockHeapSnapshotAggregate({
          id: 1,
          className: 'ObjectA',
          count: 10,
          selfSize: 100,
          retainedSize: 1000,
        }),
        createMockHeapSnapshotAggregate({
          id: 2,
          className: 'ObjectB',
          count: 5,
          selfSize: 50,
          retainedSize: 500,
        }),
      ],
      objectCount: 15,
      totalSelfSize: 150,
    };

    response.setHeapSnapshotAggregates(aggregates, {
      pageSize: 1,
      pageIdx: 0,
    });
    const context = createMockMcpContext();
    const {content, structuredContent} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('## Heap Snapshot Data'));
    assert.ok(text.includes('Objects: 15'));
    assert.ok(text.includes('Total shallow size: '));
    assert.ok(text.includes('Showing 1-1 of 2 (Page 1 of 2).'));
    assert.ok(text.includes('Next page: 1'));
    assert.ok(text.includes('ObjectA'));
    assert.ok(!text.includes('ObjectB'));

    const heapData: unknown = Reflect.get(structuredContent, 'heapSnapshot');
    assert.ok(heapData && typeof heapData === 'object');
    assert.deepStrictEqual(Reflect.get(heapData, 'aggregateStats'), {
      objectCount: 15,
      totalSelfSize: 150,
    });
    assert.deepStrictEqual(
      Reflect.get(structuredContent, 'heapSnapshotAggregates'),
      [aggregates.aggregates[0]],
    );
  });

  it('sorts nodes descending by retainedSize and formats pagination summaries', async () => {
    const response = new McpResponse(createMockServerConfig());
    const nodeSmall = createMockHeapSnapshotNode({
      id: 1,
      name: 'SmallNode',
      retainedSize: 100,
    });
    const nodeLarge = createMockHeapSnapshotNode({
      id: 2,
      name: 'LargeNode',
      retainedSize: 500,
    });
    const nodeMedium = createMockHeapSnapshotNode({
      id: 3,
      name: 'MediumNode',
      retainedSize: 200,
    });

    const itemsRange =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange(0, 3, 3, [
        nodeSmall,
        nodeLarge,
        nodeMedium,
      ]);

    response.setHeapSnapshotNodes(itemsRange, {
      pageSize: 2,
      pageIdx: 0,
    });

    const context = createMockMcpContext();
    const {content} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('Showing 1-2 of 3 (Page 1 of 2).'));
    assert.ok(text.includes('Next page: 1'));

    const largeIndex = text.indexOf('LargeNode');
    const mediumIndex = text.indexOf('MediumNode');
    assert.notStrictEqual(largeIndex, -1, 'LargeNode should be present');
    assert.notStrictEqual(mediumIndex, -1, 'MediumNode should be present');
    assert.ok(
      largeIndex < mediumIndex,
      'LargeNode should precede MediumNode due to descending retainedSize sorting',
    );
    assert.ok(
      !text.includes('SmallNode'),
      'SmallNode should be on page 1, not page 0',
    );
  });

  it('formats edge nodes correctly', async () => {
    const response = new McpResponse(createMockServerConfig());
    const edge = createMockHeapSnapshotEdge({
      name: 'myProp',
      type: 'property',
      node: createMockHeapSnapshotNode({id: 42, name: 'TargetNode'}),
    });

    const itemsRange =
      new DevTools.HeapSnapshotModel.HeapSnapshotModel.ItemsRange(0, 1, 1, [
        edge,
      ]);

    response.setHeapSnapshotNodes(itemsRange);
    const context = createMockMcpContext();
    const {content} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('name,type,nodeId,nodeName,selfSize,retainedSize'));
    assert.ok(text.includes('myProp,property,42,TargetNode'));
  });

  it('formats retaining paths with truncation note when limits are reached', async () => {
    const response = new McpResponse(createMockServerConfig());
    const retainingPaths = {
      paths: [
        {
          edgeIndex: 0,
          edgeName: 'ref',
          edgeType: 'property',
          nodeId: 10,
          nodeIndex: 1,
          nodeName: 'ParentClass',
          distance: 1,
          children: [],
        },
      ],
      limitsReached: {
        depth: true,
        nodes: false,
        siblings: false,
      },
    };

    response.setHeapSnapshotRetainingPaths(retainingPaths);
    const context = createMockMcpContext();
    const {content} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('### Retaining Paths'));
    assert.ok(
      text.includes('<- @10 ParentClass via property ref (distance: 1)'),
    );
    assert.ok(
      text.includes(
        'Note: results are truncated, the following limits were reached: depth.',
      ),
    );
  });

  it('formats empty retaining paths with no paths message', async () => {
    const response = new McpResponse(createMockServerConfig());
    response.setHeapSnapshotRetainingPaths({
      paths: [],
      limitsReached: {depth: false, nodes: false, siblings: false},
    });
    const context = createMockMcpContext();
    const {content} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('### Retaining Paths'));
    assert.ok(text.includes('No retaining paths found.'));
  });

  it('formats dominator chain and handles empty dominators', async () => {
    const response = new McpResponse(createMockServerConfig());
    const dominators = [
      {
        nodeId: 10,
        nodeIndex: 1,
        nodeName: 'DomClass',
        retainedSize: 1000,
        selfSize: 100,
      },
    ];

    response.setHeapSnapshotDominators(dominators);
    const context = createMockMcpContext();
    const {content} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('### Dominator Chain'));
    assert.ok(text.includes('10,DomClass'));

    const emptyResponse = new McpResponse(createMockServerConfig());
    emptyResponse.setHeapSnapshotDominators([]);
    const emptyResult = await emptyResponse.handle(context);
    const emptyText = getTextContent(emptyResult.content[0]);
    assert.ok(emptyText.includes('### Dominator Chain'));
    assert.ok(emptyText.includes('No dominators found.'));
  });

  it('formats class diff summary and detailed diff headers', async () => {
    const response = new McpResponse(createMockServerConfig());
    response.setHeapSnapshotClassDiffs(createMockHeapSnapshotDiff());

    const context = createMockMcpContext();
    const {content} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('### Heap Snapshot Diff'));
    assert.ok(text.includes('TestClass'));

    const detailedResponse = new McpResponse(createMockServerConfig());
    const detailedDiff = createMockDetailedClassDiff();
    detailedResponse.setHeapSnapshotDetailedClassDiff(detailedDiff);

    const detailedResult = await detailedResponse.handle(context);
    const detailedText = getTextContent(detailedResult.content[0]);
    assert.ok(detailedText.includes('### Heap Snapshot Detailed Diff'));
    assert.ok(detailedText.includes('TestClass: # new: 1, # deleted: 0'));
  });

  it('paginates detailed class diff objects below the class header', async () => {
    const response = new McpResponse(createMockServerConfig());
    const objects = [
      createMockDiffObject({id: 101, change: 'added'}),
      createMockDiffObject({id: 102, change: 'added'}),
      createMockDiffObject({id: 201, change: 'deleted'}),
    ];
    const classDiff = createMockClassDiff({className: 'Leaky'});
    response.setHeapSnapshotDetailedClassDiff(
      createMockDetailedClassDiff({classDiff, objects}),
      {pageIdx: 1, pageSize: 2},
    );

    const context = createMockMcpContext();
    const {content, structuredContent} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('Leaky: # new: 1, # deleted: 0'));
    assert.ok(text.includes('Showing 3-3 of 3 (Page 2 of 2).'));
    assert.ok(text.includes('  - @201'));
    assert.ok(!text.includes('@101'));
    assert.ok(!text.includes('@102'));
    assert.deepStrictEqual(
      Reflect.get(structuredContent, 'heapSnapshotDetailedClassDiff'),
      {classDiff, objects: [objects[2]]},
    );
  });

  it('paginates class diff summary and keeps global indices', async () => {
    const response = new McpResponse(createMockServerConfig());
    const classDiffs = [
      createMockClassDiff({index: 0, className: 'ClassA'}),
      createMockClassDiff({index: 1, className: 'ClassB'}),
      createMockClassDiff({index: 2, className: 'ClassC'}),
    ];
    const totals = createMockClassDiffTotals({addedCount: 3, countDelta: 3});
    response.setHeapSnapshotClassDiffs(
      createMockHeapSnapshotDiff({classDiffs, totals}),
      {pageIdx: 1, pageSize: 2},
    );

    const context = createMockMcpContext();
    const {content, structuredContent} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('Showing 3-3 of 3 (Page 2 of 2).'));
    assert.ok(text.includes('Previous page: 0'));
    assert.ok(text.includes('Total: # new: 3, # deleted: 0, # delta: +3'));
    assert.ok(text.includes('\n2,ClassC,'));
    assert.ok(!text.includes('ClassA'));
    assert.ok(!text.includes('ClassB'));
    assert.deepStrictEqual(
      Reflect.get(structuredContent, 'heapSnapshotClassDiffs'),
      [classDiffs[2]],
    );
    const heapData: unknown = Reflect.get(structuredContent, 'heapSnapshot');
    assert.ok(heapData && typeof heapData === 'object');
    assert.deepStrictEqual(Reflect.get(heapData, 'classDiffStats'), totals);
  });

  it('truncates class diff names in compact format', async () => {
    const context = createMockMcpContext();
    const toonDiffResponse = new McpResponse(createMockServerConfig());
    toonDiffResponse.setHeapSnapshotClassDiffs(createMockHeapSnapshotDiff(), {
      maxNameLength: 4,
    });
    const toonDiffResult = await toonDiffResponse.handle(context, 'toon');
    const toonDiffText = getTextContent(toonDiffResult.content[0]);
    assert.ok(toonDiffText.includes('Test...'));

    const detailedDiff = createMockDetailedClassDiff();
    const toonDetailedResponse = new McpResponse(createMockServerConfig());
    toonDetailedResponse.setHeapSnapshotDetailedClassDiff(detailedDiff, {
      maxNameLength: 4,
    });
    const toonDetailedResult = await toonDetailedResponse.handle(
      context,
      'toon',
    );
    const toonDetailedText = getTextContent(toonDetailedResult.content[0]);
    assert.ok(toonDetailedText.includes('Test...'));
  });

  it('formats duplicate strings with pagination and object details', async () => {
    const response = new McpResponse(createMockServerConfig());
    const duplicateStrings = [
      {
        value: 'duplicated-string-value',
        count: 5,
        totalSelfSize: 100,
        totalRetainedSize: 500,
        nodes: [
          {id: 10, selfSize: 50, retainedSize: 250, distance: 1},
          {id: 20, selfSize: 50, retainedSize: 250, distance: 2},
        ],
      },
    ];
    response.setHeapSnapshotDuplicateStrings(duplicateStrings, {
      pageSize: 1,
      pageIdx: 0,
    });

    const context = createMockMcpContext();
    const {content} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('### Duplicate Strings'));
    assert.ok(text.includes('duplicated-string-value'));
    assert.ok(text.includes('Showing 1-1 of 1 (Page 1 of 1).'));

    const objectInfoResponse = new McpResponse(createMockServerConfig());
    const objectInfo = createMockObjectInfo();
    objectInfoResponse.setHeapSnapshotObjectDetails(objectInfo);

    const objectResult = await objectInfoResponse.handle(context);
    const objectText = getTextContent(objectResult.content[0]);
    assert.ok(objectText.includes('### Object Details'));
    assert.ok(objectText.includes('id: @1'));
    assert.ok(objectText.includes('name: Object'));
  });

  it('truncates object details name in compact format', async () => {
    const context = createMockMcpContext();
    const toonResponse = new McpResponse(createMockServerConfig());
    const longNameObjectInfo = {
      ...createMockObjectInfo(),
      name: 'Object_' + 'x'.repeat(150),
    };
    toonResponse.setHeapSnapshotObjectDetails(longNameObjectInfo, {
      maxNameLength: 10,
    });

    const toonResult = await toonResponse.handle(context, 'toon');
    const toonText = getTextContent(toonResult.content[0]);
    assert.ok(toonText.includes('### Object Details'));
    assert.ok(toonText.includes('Object_xxx...'));
  });

  it('renders the context field usage section for the filtered contexts', async () => {
    const response = new McpResponse(createMockServerConfig());
    response.setHeapSnapshotContextAnalysis(createMockContextAnalysisResult(), {
      retainedSize: parseByteSizeRange('1000'),
    });

    const context = createMockMcpContext();
    const {content, structuredContent} = await response.handle(context);
    const text = getTextContent(content[0]);

    assert.ok(text.includes('### Context Analysis'));
    assert.ok(text.includes('Showing 1-2 of 2 (Page 1 of 1).'));
    assert.ok(text.includes('Context @101'));
    assert.ok(text.includes('Context @111'));
    assert.ok(!text.includes('Context @102'));
    assert.ok('heapSnapshotContextAnalysis' in structuredContent);
  });

  describe('extension service workers', () => {
    it('lists only service workers, excluding dedicated and shared workers', async () => {
      const response = new McpResponse(createMockServerConfig());
      response.setIncludeExtensionServiceWorkers(true);

      const context = createMockMcpContext();
      context.getWorkers.returns([
        createMockMcpWorker({
          id: 'sw-1',
          type: 'service_worker',
          url: 'chrome-extension://abc/sw.js',
        }),
        createMockMcpWorker({id: 'dw-2', type: 'dedicated_worker'}),
        createMockMcpWorker({id: 'shw-3', type: 'shared_worker'}),
      ]);

      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);

      assert.ok(text.includes('## Extension Service Workers'));
      assert.ok(text.includes('sw-1: chrome-extension://abc/sw.js'));
      assert.ok(!text.includes('dw-2'));
      assert.ok(!text.includes('shw-3'));
      assert.deepEqual(
        (
          structuredContent as {
            extensionServiceWorkers?: Array<{id: string}>;
          }
        ).extensionServiceWorkers,
        [{id: 'sw-1', url: 'chrome-extension://abc/sw.js'}],
      );
    });
  });

  describe('DevTools comments snapshot regeneration note', () => {
    function createSnapshotWithNodes(
      nodes: Array<{id: string; backendNodeId?: number}>,
      verbose = false,
    ): TextSnapshot {
      const idToNode = new Map<string, TextSnapshotNode>();
      const children: TextSnapshotNode[] = [];
      for (const n of nodes) {
        const node: TextSnapshotNode = {
          id: n.id,
          role: 'generic',
          backendNodeId: n.backendNodeId,
          children: [],
          elementHandle: async () => null,
        };
        idToNode.set(n.id, node);
        children.push(node);
      }
      const rootNode: TextSnapshotNode = {
        id: '1_0',
        role: 'root',
        children,
        elementHandle: async () => null,
      };
      return new TextSnapshot({
        root: rootNode,
        idToNode,
        snapshotId: '1',
        hasSelectedElement: false,
        verbose,
      });
    }

    it('includes note when DevTools comments regenerate a standard text snapshot', async () => {
      const response = new McpResponse(createMockServerConfig());
      const page = createMockMcpPage();
      page.textSnapshot = null;
      const standardSnapshot = createSnapshotWithNodes(
        [{id: '1_1', backendNodeId: 42}],
        false,
      );
      page.resolveBackendNodeId.callsFake(async () => {
        page.textSnapshot = standardSnapshot;
        return '1_1';
      });
      response.setPage(page);
      response.setDevToolsComments([
        {
          id: 'comment-1',
          text: 'Fix the color contrast here',
          node: {backendNodeId: 42, targetId: 'target-1'},
        },
      ]);

      const context = createMockMcpContext();
      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);

      assert.ok(
        text.includes(
          'Note: DevTools comments regenerated the standard text snapshot.',
        ),
      );
      assert.strictEqual(
        Reflect.get(structuredContent, 'commentsSnapshotRegenerated'),
        'standard',
      );
    });

    it('includes note when DevTools comments regenerate a verbose text snapshot', async () => {
      const response = new McpResponse(createMockServerConfig());
      const page = createMockMcpPage();
      page.textSnapshot = null;
      const verboseSnapshot = createSnapshotWithNodes(
        [{id: '1_1', backendNodeId: 42}],
        true,
      );
      page.resolveBackendNodeId.callsFake(async () => {
        page.textSnapshot = verboseSnapshot;
        return '1_1';
      });
      response.setPage(page);
      response.setDevToolsComments([
        {
          id: 'comment-1',
          text: 'Fix the color contrast here',
          node: {backendNodeId: 42, targetId: 'target-1'},
        },
      ]);

      const context = createMockMcpContext();
      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);

      assert.ok(
        text.includes(
          'Note: DevTools comments regenerated the verbose text snapshot.',
        ),
      );
      assert.strictEqual(
        Reflect.get(structuredContent, 'commentsSnapshotRegenerated'),
        'verbose',
      );
    });

    it('does not include note when DevTools comments do not regenerate the snapshot', async () => {
      const response = new McpResponse(createMockServerConfig());
      const page = createMockMcpPage();
      const existingSnapshot = createSnapshotWithNodes(
        [{id: '1_1', backendNodeId: 42}],
        false,
      );
      page.textSnapshot = existingSnapshot;
      page.resolveBackendNodeId.resolves('1_1');
      response.setPage(page);
      response.setDevToolsComments([
        {
          id: 'comment-1',
          text: 'Fix the color contrast here',
          node: {backendNodeId: 42, targetId: 'target-1'},
        },
      ]);

      const context = createMockMcpContext();
      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);

      assert.ok(!text.includes('Note: DevTools comments regenerated'));
      assert.strictEqual(
        Reflect.get(structuredContent, 'commentsSnapshotRegenerated'),
        undefined,
      );
    });

    it('does not include note when comments have no associated nodes', async () => {
      const response = new McpResponse(createMockServerConfig());
      const page = createMockMcpPage();
      page.textSnapshot = null;
      response.setPage(page);
      response.setDevToolsComments([
        {
          id: 'comment-1',
          text: 'General comment without a node',
        },
      ]);

      const context = createMockMcpContext();
      const {content, structuredContent} = await response.handle(context);
      const text = getTextContent(content[0]);

      assert.ok(!text.includes('Note: DevTools comments regenerated'));
      assert.strictEqual(
        Reflect.get(structuredContent, 'commentsSnapshotRegenerated'),
        undefined,
      );
    });
  });
});
