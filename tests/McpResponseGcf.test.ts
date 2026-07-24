/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {decodeGeneric} from '@blackwell-systems/gcf';

import {getMockRequest, getTextContent, html, withMcpContext} from './utils.js';

/**
 * The GCF-encoded block is pushed last in the relevant response branch, so it
 * runs from the `GCF profile=` header to the end of the joined text. Slice it
 * out so it can be decoded back to the structured value it was produced from.
 */
function extractGcfBlock(text: string): string {
  const start = text.indexOf('GCF profile=');
  assert.notStrictEqual(
    start,
    -1,
    `expected a GCF header in response text, got:\n${text}`,
  );
  return text.slice(start).trim();
}

/** Normalize through JSON the same way structuredContent is serialized. */
function asJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('McpResponse GCF format', () => {
  it('encodes the page snapshot as GCF when dataFormat is "gcf"', async () => {
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

      const {content, structuredContent} = await response.handle(
        'test',
        context,
        'gcf',
      );

      const text = getTextContent(content[0]);
      assert.ok(
        text.includes('GCF profile=generic'),
        'snapshot response should carry a GCF generic-profile header',
      );

      const decoded = decodeGeneric(extractGcfBlock(text));
      assert.deepStrictEqual(
        decoded,
        asJson((structuredContent as {snapshot: unknown}).snapshot),
      );
    });
  });

  it('encodes network requests as GCF when dataFormat is "gcf"', async () => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [getMockRequest({stableId: 1}), getMockRequest({stableId: 2})];
      };

      const {content, structuredContent} = await response.handle(
        'test',
        context,
        'gcf',
      );

      const text = getTextContent(content[0]);
      assert.ok(
        text.includes('GCF profile=generic'),
        'network response should carry a GCF generic-profile header',
      );

      // The encoder is fed structuredContent.networkRequests directly, so the
      // decoded block must round-trip back to it losslessly.
      const decoded = decodeGeneric(extractGcfBlock(text));
      assert.deepStrictEqual(
        decoded,
        asJson(
          (structuredContent as {networkRequests: unknown}).networkRequests,
        ),
      );
    });
  });

  it('leaves network requests unencoded when dataFormat is "default"', async () => {
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getSelectedMcpPage().getNetworkRequests = () => {
        return [getMockRequest({stableId: 1})];
      };

      const {content} = await response.handle('test', context);

      const text = getTextContent(content[0]);
      assert.ok(
        !text.includes('GCF profile='),
        'default format must not emit a GCF header',
      );
      // Guard against a vacuous pass: the default path must still render the
      // human-readable network output (the built-in formatter, not GCF).
      assert.ok(
        text.includes('http://example.com'),
        'default format should still render the built-in network output',
      );
    });
  });

  it('round-trips console messages with bracket-colon patterns', async () => {
    // These are the standard browser log shapes that crash TOON's decoder
    // (bracket-colon patterns). GCF must encode them without corruption.
    const messages = [
      '[Error]: net::ERR_CONNECTION_REFUSED',
      '[React DevTools]: Component rendered 3 times',
      '[Violation]: Forced reflow while executing JavaScript took 42ms',
      '[Performance]: Long task detected (duration: 234ms)',
    ];

    await withMcpContext(async (response, context) => {
      response.setIncludeConsoleData(true);
      const page = context.getSelectedMcpPage().pptrPage;

      const seen = new Promise<void>(resolve => {
        let count = 0;
        page.on('console', () => {
          if (++count >= messages.length) {
            resolve();
          }
        });
      });
      await page.evaluate(msgs => {
        for (const msg of msgs) {
          console.log(msg);
        }
      }, messages);
      await seen;

      const {content, structuredContent} = await response.handle(
        'test',
        context,
        'gcf',
      );

      const text = getTextContent(content[0]);
      assert.ok(text.includes('GCF profile=generic'));

      // Every bracket-colon message survives encoding verbatim.
      for (const msg of messages) {
        assert.ok(
          text.includes(msg),
          `expected console message to survive GCF encoding: ${msg}`,
        );
      }

      const decoded = decodeGeneric(extractGcfBlock(text));
      assert.deepStrictEqual(
        decoded,
        asJson(
          (structuredContent as {consoleMessages: unknown}).consoleMessages,
        ),
      );
    });
  });

  it('encodes heap snapshot class diffs as GCF and round-trips', async () => {
    const classDiffs = [
      {
        className: 'Balanced',
        addedCount: 1,
        removedCount: 1,
        countDelta: 0,
        addedSize: 100,
        removedSize: 100,
        sizeDelta: 0,
      },
      {
        className: 'Grew',
        addedCount: 5,
        removedCount: 0,
        countDelta: 5,
        addedSize: 4096,
        removedSize: 0,
        sizeDelta: 4096,
      },
    ];

    await withMcpContext(async (response, context) => {
      response.setHeapSnapshotClassDiffs(classDiffs);

      const {content, structuredContent} = await response.handle(
        'test',
        context,
        'gcf',
      );

      const text = getTextContent(content[0]);

      // Golden wire output: pins the exact bytes McpResponse emits, so a
      // regression in the encode path is caught independently of the decoder
      // (a symmetric encode+decode bug can't round-trip its way past this).
      const block = extractGcfBlock(text);
      assert.strictEqual(
        block,
        [
          'GCF profile=generic',
          '## [2]{className,addedCount,removedCount,countDelta,addedSize,removedSize,sizeDelta}',
          'Balanced|1|1|0|100|100|0',
          'Grew|5|0|5|4096|0|4096',
        ].join('\n'),
      );

      const decoded = decodeGeneric(block);
      assert.deepStrictEqual(
        decoded,
        asJson(
          (structuredContent as {heapSnapshotClassDiffs: unknown})
            .heapSnapshotClassDiffs,
        ),
      );
    });
  });

  it('encodes a detailed heap class diff (nested arrays) as GCF and round-trips', async () => {
    const detailedClassDiff = {
      className: 'MyClass',
      addedCount: 2,
      removedCount: 1,
      countDelta: 1,
      addedSize: 120,
      removedSize: 60,
      sizeDelta: 60,
      addedIds: [101, 102],
      addedSelfSizes: [60, 60],
      deletedIds: [201],
      deletedSelfSizes: [60],
    };

    await withMcpContext(async (response, context) => {
      response.setHeapSnapshotDetailedClassDiff(detailedClassDiff);

      const {content, structuredContent} = await response.handle(
        'test',
        context,
        'gcf',
      );

      const text = getTextContent(content[0]);
      assert.ok(text.includes('GCF profile=generic'));
      const decoded = decodeGeneric(extractGcfBlock(text));
      assert.deepStrictEqual(
        decoded,
        asJson(
          (structuredContent as {heapSnapshotDetailedClassDiff: unknown})
            .heapSnapshotDetailedClassDiff,
        ),
      );
    });
  });

  it('does not change structuredContent when GCF is enabled', async () => {
    // Promotion safety: GCF only alters the text representation. MCP clients
    // consume structuredContent, which must be byte-identical either way.
    const makeRequests = () => [
      getMockRequest({stableId: 1}),
      getMockRequest({stableId: 2}),
    ];

    let defaultStructured: string | undefined;
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getSelectedMcpPage().getNetworkRequests = makeRequests;
      const {structuredContent} = await response.handle('test', context);
      defaultStructured = JSON.stringify(structuredContent);
    });

    let gcfStructured: string | undefined;
    await withMcpContext(async (response, context) => {
      response.setIncludeNetworkRequests(true);
      context.getSelectedMcpPage().getNetworkRequests = makeRequests;
      const {structuredContent} = await response.handle('test', context, 'gcf');
      gcfStructured = JSON.stringify(structuredContent);
    });

    assert.strictEqual(gcfStructured, defaultStructured);
  });

  it('round-trips values containing delimiters and GCF sentinels', async () => {
    // The encoder must quote/escape hostile values so they never collide with
    // GCF's own grammar (pipe, comma, quotes, ~ - @ ## sentinels, newlines,
    // unicode, empty, typed-literal lookalikes). This is the core robustness
    // guarantee for turning GCF on by default.
    const hostile = [
      {className: 'A|B,C"D', addedCount: 1},
      {className: '~', addedCount: 2},
      {className: '-', addedCount: 3},
      {className: '@0 ## fake-header', addedCount: 4},
      {className: 'line1\nline2\ttab', addedCount: 5},
      {className: 'unicode: café 日本語 🚀', addedCount: 6},
      {className: '', addedCount: 7},
      {className: 'true', addedCount: 8},
    ].map(d => ({
      className: d.className,
      addedCount: d.addedCount,
      removedCount: 0,
      countDelta: d.addedCount,
      addedSize: 0,
      removedSize: 0,
      sizeDelta: 0,
    }));

    await withMcpContext(async (response, context) => {
      response.setHeapSnapshotClassDiffs(hostile);

      const {content, structuredContent} = await response.handle(
        'test',
        context,
        'gcf',
      );

      const decoded = decodeGeneric(
        extractGcfBlock(getTextContent(content[0])),
      );
      assert.deepStrictEqual(
        decoded,
        asJson(
          (structuredContent as {heapSnapshotClassDiffs: unknown})
            .heapSnapshotClassDiffs,
        ),
      );
    });
  });
});
