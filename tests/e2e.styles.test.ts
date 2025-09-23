/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {describe, it} from 'node:test';
import assert from 'node:assert';
import {executablePath} from 'puppeteer';

function extractJson(text: string): unknown {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) {
    throw new Error('No JSON block found in tool response');
  }
  return JSON.parse(match[1]);
}

async function withClient(cb: (client: Client) => Promise<void>) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'build/src/index.js',
      '--headless',
      '--isolated',
      '--executable-path',
      executablePath(),
    ],
  });
  const client = new Client(
    {
      name: 'e2e-styles',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );
  try {
    await client.connect(transport);
    await cb(client);
  } finally {
    await client.close();
  }
}

function findUidFromSnapshot(snapshotText: string, includes: string): string {
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (!line.includes('uid=')) continue;
    if (line.includes(includes)) {
      const m = line.match(/uid=(\d+_\d+)/);
      if (m) return m[1];
    }
  }
  throw new Error('UID not found in snapshot for: ' + includes);
}

describe('e2e styles', () => {
  it('computed/box/visibility/batch/diff/snapshot flow', async () => {
    await withClient(async client => {
      const html = encodeURIComponent(`<!DOCTYPE html>
<div role="button" aria-label="box" style="display:block;width:10px;height:10px">box</div>
<span role="img" aria-label="icon">icon</span>`);

      // Navigate via MCP
      await client.callTool({
        name: 'navigate_page',
        arguments: {url: `data:text/html,${html}`},
      });

      // Snapshot and resolve UIDs
      const snapRes = await client.callTool({
        name: 'take_snapshot',
        arguments: {},
      });
      const snapText = (snapRes as {content?: Array<{text?: string}>})
        .content?.[0]?.text as string;
      const uidBox = findUidFromSnapshot(snapText, 'button "box"');
      const uidIcon = findUidFromSnapshot(snapText, 'img "icon"');

      // get_computed_styles
      const cs = await client.callTool({
        name: 'get_computed_styles',
        arguments: {uid: uidBox, properties: ['display'], includeSources: true},
      });
      const csParsed = extractJson(
        (cs as {content?: Array<{text?: string}>}).content?.[0]?.text || '',
      ) as {
        computed: Record<string, string>;
        sourceMap?: Record<string, unknown>;
      };
      assert.strictEqual(csParsed.computed.display, 'block');

      // get_box_model
      const bm = await client.callTool({
        name: 'get_box_model',
        arguments: {uid: uidBox},
      });
      const bmParsed = extractJson(
        (bm as {content?: Array<{text?: string}>}).content?.[0]?.text || '',
      ) as {
        borderRect: {width: number};
        contentRect: {width: number};
      };
      assert.ok(bmParsed.borderRect.width >= bmParsed.contentRect.width);

      // get_visibility (first visible)
      const vis1 = await client.callTool({
        name: 'get_visibility',
        arguments: {uid: uidBox},
      });
      const v1 = extractJson(
        (vis1 as {content?: Array<{text?: string}>}).content?.[0]?.text || '',
      ) as {
        isVisible: boolean;
      };
      assert.strictEqual(v1.isVisible, true);

      // Batch
      const batch = await client.callTool({
        name: 'get_computed_styles_batch',
        arguments: {uids: [uidBox, uidIcon], properties: ['display']},
      });
      const batchParsed = extractJson(
        (batch as {content?: Array<{text?: string}>}).content?.[0]?.text || '',
      ) as Record<string, {display: string}>;
      assert.strictEqual(batchParsed[uidBox].display, 'block');
      assert.strictEqual(batchParsed[uidIcon].display, 'inline');

      // Diff between two nodes
      const diff = await client.callTool({
        name: 'diff_computed_styles',
        arguments: {uidA: uidBox, uidB: uidIcon, properties: ['display']},
      });
      const diffParsed = extractJson(
        (diff as {content?: Array<{text?: string}>}).content?.[0]?.text || '',
      ) as Array<{
        property: string;
        before: string;
        after: string;
      }>;
      const displayChange = diffParsed.find(d => d.property === 'display');
      assert.ok(displayChange);
      assert.strictEqual(displayChange?.before, 'block');
      assert.strictEqual(displayChange?.after, 'inline');

      // Save snapshot
      await client.callTool({
        name: 'save_computed_styles_snapshot',
        arguments: {name: 'snap1', uids: [uidBox], properties: ['display']},
      });

      // Change display via evaluate_script
      await client.callTool({
        name: 'evaluate_script',
        arguments: {
          function: String((el: Element) => {
            (el as HTMLElement).style.display = 'inline';
            return true;
          }),
          args: [{uid: uidBox}],
        },
      });

      // Diff snapshot
      const sdiff = await client.callTool({
        name: 'diff_computed_styles_snapshot',
        arguments: {name: 'snap1', uid: uidBox, properties: ['display']},
      });
      const sdiffParsed = extractJson(
        (sdiff as {content?: Array<{text?: string}>}).content?.[0]?.text || '',
      ) as Array<{
        property: string;
        before: string;
        after: string;
      }>;
      const change = sdiffParsed.find(d => d.property === 'display');
      assert.ok(change);
      assert.strictEqual(change?.before, 'block');
      assert.strictEqual(change?.after, 'inline');

      // Hide and check visibility false
      await client.callTool({
        name: 'evaluate_script',
        arguments: {
          function: String((el: Element) => {
            (el as HTMLElement).style.display = 'none';
            return true;
          }),
          args: [{uid: uidBox}],
        },
      });
      const vis2 = await client.callTool({
        name: 'get_visibility',
        arguments: {uid: uidBox},
      });
      const v2 = extractJson(
        (vis2 as {content?: Array<{text?: string}>}).content?.[0]?.text || '',
      ) as {
        isVisible: boolean;
        reasons: string[];
      };
      assert.strictEqual(v2.isVisible, false);
      assert.ok(v2.reasons.includes('display:none'));
    });
  });
});
