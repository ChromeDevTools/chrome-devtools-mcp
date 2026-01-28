/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import type {InsightName} from '../src/trace-processing/parse.js';
import {
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../src/trace-processing/parse.js';

import {serverHooks} from './server.js';
import {loadTraceAsBuffer} from './trace-processing/fixtures/load.js';
import {
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

describe('McpResponse', () => {
  it('list pages', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludePages(true);
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.equal(content[0].type, 'text');
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('allows response text lines to be added', async t => {
    await withMcpContext(async (response, context) => {
      response.appendResponseLine('Testing 1');
      response.appendResponseLine('Testing 2');
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.equal(content[0].type, 'text');
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('does not include anything in response if snapshot is null', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      page.accessibility.snapshot = async () => null;
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.equal(content[0].type, 'text');
      assert.deepStrictEqual(getTextContent(content[0]), `# test response`);
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('returns correctly formatted snapshot for a simple tree', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(
        html`<button>Click me</button>
          <input
            type="text"
            value="Input"
          />`,
      );
      await page.focus('button');
      response.includeSnapshot();
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.equal(content[0].type, 'text');
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('returns values for textboxes', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(
        html`<label
          >username<input
            name="username"
            value="mcp"
        /></label>`,
      );
      await page.focus('input');
      response.includeSnapshot();
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.equal(content[0].type, 'text');
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('returns verbose snapshot and structured content', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`<aside>test</aside>`);
      response.includeSnapshot({
        verbose: true,
      });
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.equal(content[0].type, 'text');
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(JSON.stringify(structuredContent, null, 2));
    });
  });

  it('saves snapshot to file and returns structured content', async t => {
    const filePath = join(tmpdir(), 'test-screenshot.png');
    try {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(html`<aside>test</aside>`);
        response.includeSnapshot({
          verbose: true,
          filePath,
        });
        const {content, structuredContent} = await response.handle(
          'test',
          context,
        );
        assert.equal(content[0].type, 'text');
        t.assert.snapshot?.(
          stabilizeResponseOutput(getTextContent(content[0])),
        );
        t.assert.snapshot?.(
          JSON.stringify(
            stabilizeStructuredContent(structuredContent),
            null,
            2,
          ),
        );
      });
      const content = await readFile(filePath, 'utf-8');
      t.assert.snapshot?.(stabilizeResponseOutput(content));
    } finally {
      await rm(filePath, {force: true});
    }
  });

  it('preserves mapping ids across multiple snapshots', async () => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      await page.setContent(html`
        <div>
          <button id="btn1">Button 1</button>
          <span id="span1">Span 1</span>
        </div>
      `);
      response.includeSnapshot();
      // First snapshot
      const res1 = await response.handle('test', context);
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
      const res2 = await response.handle('test', context);
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
        const page = context.getSelectedPage();
        await page.goto(server.getRoute('/page.html'));

        response.includeSnapshot();
        const res1 = await response.handle('test', context);
        const text1 = getTextContent(res1.content[0]);
        const btn1IdMatch = text1.match(/uid=(\S+) .*Button 1/);
        assert.ok(btn1IdMatch, 'Button 1 ID not found in first snapshot');
        const btn1Id = btn1IdMatch[1];

        // Navigate to the same page again (or meaningful navigation)
        await page.goto(server.getRoute('/page.html'));

        const res2 = await response.handle('test', context);
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
    await withMcpContext(async (response, context) => {
      context.setNetworkConditions('Slow 3G');
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.equal(content[0].type, 'text');
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('does not include throttling setting when it is null', async t => {
    await withMcpContext(async (response, context) => {
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      context.setNetworkConditions(null);
      assert.equal(content[0].type, 'text');
      assert.strictEqual(getTextContent(content[0]), `# test response`);
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });
  it('adds image when image is attached', async t => {
    await withMcpContext(async (response, context) => {
      response.attachImage({data: 'imageBase64', mimeType: 'image/png'});
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.strictEqual(getTextContent(content[0]), `# test response`);
      assert.equal(content[1].type, 'image');
      assert.strictEqual(getImageContent(content[1]).data, 'imageBase64');
      assert.strictEqual(getImageContent(content[1]).mimeType, 'image/png');
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('adds cpu throttling setting when it is over 1', async t => {
    await withMcpContext(async (response, context) => {
      context.setCpuThrottlingRate(4);
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('does not include cpu throttling setting when it is 1', async t => {
    await withMcpContext(async (response, context) => {
      context.setCpuThrottlingRate(1);
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.strictEqual(getTextContent(content[0]), `# test response`);
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('adds viewport emulation setting when it is set', async t => {
    await withMcpContext(async (response, context) => {
      context.setViewport({width: 400, height: 400, deviceScaleFactor: 1});
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('adds userAgent emulation setting when it is set', async t => {
    await withMcpContext(async (response, context) => {
      context.setUserAgent('MyUA');
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('adds color scheme emulation setting when it is set', async t => {
    await withMcpContext(async (response, context) => {
      context.setColorScheme('dark');
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('adds a prompt dialog', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      const dialogPromise = new Promise<void>(resolve => {
        page.on('dialog', () => {
          resolve();
        });
      });
      page.evaluate(() => {
        prompt('message', 'default');
      });
      await dialogPromise;
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      await context.getDialog()?.dismiss();
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('adds an alert dialog', async t => {
    await withMcpContext(async (response, context) => {
      const page = context.getSelectedPage();
      const dialogPromise = new Promise<void>(resolve => {
        page.on('dialog', () => {
          resolve();
        });
      });
      page.evaluate(() => {
        alert('message');
      });
      await dialogPromise;
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      await context.getDialog()?.dismiss();
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('add network requests when setting is true', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getNetworkRequests = () => {
        return [getMockRequest({stableId: 1}), getMockRequest({stableId: 2})];
      };
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('does not include network requests when setting is false', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(false);
      context.getNetworkRequests = () => {
        return [getMockRequest()];
      };
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.strictEqual(getTextContent(content[0]), `# test response`);
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
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
      context.getNetworkRequests = () => {
        return [request];
      };
      context.getNetworkRequestById = () => {
        return request;
      };
      response.attachNetworkRequest(1);

      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );

      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('add network request when attached', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      const request = getMockRequest();
      context.getNetworkRequests = () => {
        return [request];
      };
      context.getNetworkRequestById = () => {
        return request;
      };
      response.attachNetworkRequest(1);
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('adds console messages when the setting is true', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeConsoleData(true);
      const page = context.getSelectedPage();
      const consoleMessagePromise = new Promise<void>(resolve => {
        page.on('console', () => {
          resolve();
        });
      });
      page.evaluate(() => {
        console.log('Hello from the test');
      });
      await consoleMessagePromise;
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.ok(getTextContent(content[0]));
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('adds a message when no console messages exist', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeConsoleData(true);
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      assert.ok(getTextContent(content[0]));
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
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
      context.getConsoleData = () => {
        return [mockAggregatedIssue];
      };

      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      const text = getTextContent(content[0]);
      assert.ok(text.includes('<no console messages found>'));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
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
      context.getConsoleMessageById = () => {
        return mockAggregatedIssue;
      };

      try {
        await response.handle('test', context);
      } catch (e) {
        assert.ok(e.message.includes("Can't provide detals for the msgid 1"));
      }
    });
  });
});

describe('McpResponse network request filtering', () => {
  it('filters network requests by resource type', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true, {
        resourceTypes: ['script', 'stylesheet'],
      });
      context.getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
          getMockRequest({resourceType: 'document'}),
        ];
      };
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('filters network requests by single resource type', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true, {
        resourceTypes: ['image'],
      });
      context.getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
        ];
      };
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('shows no requests when filter matches nothing', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true, {
        resourceTypes: ['font'],
      });
      context.getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
        ];
      };
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('shows all requests when no filters are provided', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
          getMockRequest({resourceType: 'document'}),
          getMockRequest({resourceType: 'font'}),
        ];
      };
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );

      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('shows all requests when empty resourceTypes array is provided', async t => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true, {
        resourceTypes: [],
      });
      context.getNetworkRequests = () => {
        return [
          getMockRequest({resourceType: 'script'}),
          getMockRequest({resourceType: 'image'}),
          getMockRequest({resourceType: 'stylesheet'}),
          getMockRequest({resourceType: 'document'}),
          getMockRequest({resourceType: 'font'}),
        ];
      };
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });
});

describe('McpResponse network pagination', () => {
  it('returns all requests when pagination is not provided', async t => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 5}, () => getMockRequest());
      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true);
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 1-5 of 5 (Page 1 of 1).'));
      assert.ok(!text.includes('Next page:'));
      assert.ok(!text.includes('Previous page:'));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('returns first page by default', async t => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 30}, (_, idx) =>
        getMockRequest({method: `GET-${idx}`}),
      );
      context.getNetworkRequests = () => {
        return requests;
      };
      response.setIncludeNetworkRequests(true, {pageSize: 10});
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 1-10 of 30 (Page 1 of 3).'));
      assert.ok(text.includes('Next page: 1'));
      assert.ok(!text.includes('Previous page:'));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('returns subsequent page when pageIdx provided', async t => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 25}, (_, idx) =>
        getMockRequest({method: `GET-${idx}`}),
      );
      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        pageSize: 10,
        pageIdx: 1,
      });
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      const text = getTextContent(content[0]);
      assert.ok(text.includes('Showing 11-20 of 25 (Page 2 of 3).'));
      assert.ok(text.includes('Next page: 2'));
      assert.ok(text.includes('Previous page: 0'));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  it('handles invalid page number by showing first page', async t => {
    await withMcpContext(async (response, context) => {
      const requests = Array.from({length: 5}, () => getMockRequest());
      context.getNetworkRequests = () => requests;
      response.setIncludeNetworkRequests(true, {
        pageSize: 2,
        pageIdx: 10, // Invalid page number
      });
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );
      const text = getTextContent(content[0]);
      assert.ok(
        text.includes('Invalid page number provided. Showing first page.'),
      );
      assert.ok(text.includes('Showing 1-2 of 5 (Page 1 of 3).'));
      t.assert.snapshot?.(
        JSON.stringify(stabilizeStructuredContent(structuredContent), null, 2),
      );
    });
  });

  describe('trace summaries', () => {
    it('includes the trace summary text and structured data', async t => {
      const rawData = loadTraceAsBuffer('web-dev-with-commit.json.gz');
      const result = await parseRawTraceBuffer(rawData);
      if (!traceResultIsSuccess(result)) {
        throw new Error(result.error);
      }

      await withMcpContext(async (response, context) => {
        response.attachTraceSummary(result);
        const {content, structuredContent} = await response.handle(
          'test',
          context,
        );

        t.assert.snapshot?.(getTextContent(content[0]));
        const typedStructuredContent = structuredContent as {
          traceSummary?: string;
          traceInsights?: unknown[];
        };
        t.assert.snapshot?.(
          JSON.stringify(typedStructuredContent.traceSummary, null, 2),
        );
        t.assert.snapshot?.(
          JSON.stringify(typedStructuredContent.traceInsights, null, 2),
        );
      });
    });
  });

  describe('trace insights', () => {
    it('includes the trace insight output', async t => {
      const rawData = loadTraceAsBuffer('web-dev-with-commit.json.gz');
      const result = await parseRawTraceBuffer(rawData);
      if (!traceResultIsSuccess(result)) {
        throw new Error(result.error);
      }

      await withMcpContext(async (response, context) => {
        response.attachTraceInsight(
          result,
          'NAVIGATION_0',
          'LCPBreakdown' as InsightName,
        );
        const {content, structuredContent} = await response.handle(
          'test',
          context,
        );

        t.assert.snapshot?.(getTextContent(content[0]));
        t.assert.snapshot?.(
          JSON.stringify(
            stabilizeStructuredContent(structuredContent),
            null,
            2,
          ),
        );
      });
    });

    it('includes error if insight not found', async t => {
      const rawData = loadTraceAsBuffer('web-dev-with-commit.json.gz');
      const result = await parseRawTraceBuffer(rawData);
      if (!traceResultIsSuccess(result)) {
        throw new Error(result.error);
      }

      await withMcpContext(async (response, context) => {
        response.attachTraceInsight(
          result,
          'BAD_ID',
          'LCPBreakdown' as InsightName,
        );
        const {content, structuredContent} = await response.handle(
          'test',
          context,
        );

        t.assert.snapshot?.(getTextContent(content[0]));
        t.assert.snapshot?.(
          JSON.stringify(
            stabilizeStructuredContent(structuredContent),
            null,
            2,
          ),
        );
      });
    });
  });
});

describe('extensions', () => {
  it('lists extensions', async t => {
    await withMcpContext(async (response, context) => {
      response.setListExtensions();
      // Empty state testing
      const emptyResult = await response.handle('test', context);
      const emptyText = getTextContent(emptyResult.content[0]);
      assert.ok(
        emptyText.includes('No extensions installed.'),
        'Should show message for ampty extensions',
      );

      response.resetResponseLineForTesting();
      // Testing with extensions
      context.listExtensions = () => [
        {
          id: 'id1',
          name: 'Extension 1',
          version: '1.0',
          isEnabled: true,
          path: '/path/to/ext1',
        },
        {
          id: 'id2',
          name: 'Extension 2',
          version: '2.0',
          isEnabled: false,
          path: '/path/to/ext2',
        },
      ];
      response.setListExtensions();
      const {content, structuredContent} = await response.handle(
        'test',
        context,
      );

      t.assert.snapshot?.(getTextContent(content[0]));
      t.assert.snapshot?.(JSON.stringify(structuredContent, null, 2));
    });
  });
});
