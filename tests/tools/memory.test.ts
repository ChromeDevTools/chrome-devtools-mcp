/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {existsSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import {
  takeHeapSnapshot,
  getHeapSnapshotSummary,
  getHeapSnapshotDetails,
  getHeapSnapshotClassNodes,
  getHeapSnapshotRetainers,
  closeHeapSnapshot,
  getHeapSnapshotRetainingPaths,
  getHeapSnapshotEdges,
  getHeapSnapshotDominators,
  compareHeapSnapshots,
  getHeapSnapshotDuplicateStrings,
} from '../../src/tools/memory.js';
import {stableIdSymbol} from '../../src/utils/id.js';
import {withMcpContext} from '../utils.js';

describe('memory', () => {
  describe('take_heapsnapshot', () => {
    it('with default options', async () => {
      await withMcpContext(async (response, context) => {
        const filePath = join(tmpdir(), 'test-screenshot.heapsnapshot');
        try {
          await takeHeapSnapshot.handler(
            {params: {filePath}, page: context.getSelectedMcpPage()},
            response,
            context,
          );
          assert.equal(
            response.responseLines.at(0),
            `Heap snapshot saved to ${filePath}`,
          );
          assert.ok(existsSync(filePath));
        } finally {
          await rm(filePath, {force: true});
        }
      });
    });
  });

  describe('get_heapsnapshot_summary', () => {
    it('with default options', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        assert.ok(existsSync(filePath), `Fixture not found at ${filePath}`);

        await getHeapSnapshotSummary.handler(
          {params: {filePath}},
          response,
          context,
        );

        // Call handle to trigger formatting (similar to network tests)
        const responseData = await response.handle(
          getHeapSnapshotSummary.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });
  });

  describe('get_heapsnapshot_details', () => {
    it('with default options', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotDetails.handler(
          {params: {filePath}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotDetails.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });

    it('with objectsRetainedByContexts filterName', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotDetails.handler(
          {params: {filePath, filterName: 'objectsRetainedByContexts'}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotDetails.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });
  });

  describe('get_heapsnapshot_class_nodes', () => {
    it('with default options', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await context.getHeapSnapshotAggregates(filePath);

        await getHeapSnapshotClassNodes.handler(
          {params: {filePath, id: 19}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotClassNodes.name,
          context,
        );

        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });

    it('with objectsRetainedByContexts filterName', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        const aggregates = await context.getHeapSnapshotAggregates(
          filePath,
          'objectsRetainedByContexts',
        );
        const aggregate = Object.values(aggregates).find(
          a => a.name === 'Function',
        );
        assert.ok(aggregate);
        const id = aggregate[stableIdSymbol];
        assert.ok(id);

        await getHeapSnapshotClassNodes.handler(
          {params: {filePath, id, filterName: 'objectsRetainedByContexts'}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotClassNodes.name,
          context,
        );

        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });

    it('with non-existent class name', async () => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await context.getHeapSnapshotAggregates(filePath);

        await assert.rejects(
          getHeapSnapshotClassNodes.handler(
            {params: {filePath, id: 999999}},
            response,
            context,
          ),
          {message: 'Class with ID 999999 not found in heap snapshot'},
        );
      });
    });
  });

  describe('get_heapsnapshot_retainers', () => {
    it('with valid nodeId', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotRetainers.handler(
          {params: {filePath, nodeId: 25341}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotRetainers.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });
  });

  describe('close_heapsnapshot', () => {
    it('with default options', async () => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotSummary.handler(
          {params: {filePath}},
          response,
          context,
        );

        assert.ok(context.hasHeapSnapshots());

        await closeHeapSnapshot.handler(
          {params: {filePath}},
          response,
          context,
        );

        assert.ok(
          response.responseLines.includes(`Closed heap snapshot: ${filePath}`),
        );
        assert.ok(!context.hasHeapSnapshots());
      });
    });

    it('with non-existent snapshot', async () => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await assert.rejects(
          closeHeapSnapshot.handler({params: {filePath}}, response, context),
          {
            message: `Failed to close heap snapshot: ${filePath} was not loaded.`,
          },
        );
      });
    });
  });

  describe('get_heapsnapshot_retaining_paths', () => {
    it('with valid nodeId', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotRetainingPaths.handler(
          {params: {filePath, nodeId: 45901}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotRetainingPaths.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });

    it('reports when limits are reached', async () => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotRetainingPaths.handler(
          {params: {filePath, nodeId: 45901, maxDepth: 1}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotRetainingPaths.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        assert.match(output, /No retaining paths found\./);
        assert.match(
          output,
          /Note: results are truncated, the following limits were reached: depth\./,
        );
      });
    });
  });

  describe('get_heapsnapshot_edges', () => {
    it('with valid nodeId', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotEdges.handler(
          {params: {filePath, nodeId: 25341}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotEdges.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });

    it('with pagination', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotEdges.handler(
          {params: {filePath, nodeId: 25341, pageSize: 2}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotEdges.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });
  });

  describe('get_heapsnapshot_dominators', () => {
    it('with valid nodeId', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotDominators.handler(
          {params: {filePath, nodeId: 25341}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotDominators.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });
  });

  describe('compare_heapsnapshots', () => {
    it('compare heap-1 to heap-2', async t => {
      await withMcpContext(async (response, context) => {
        const filePathA = join(
          process.cwd(),
          'tests/fixtures/heap-1.heapsnapshot',
        );
        const filePathB = join(
          process.cwd(),
          'tests/fixtures/heap-2.heapsnapshot',
        );

        await compareHeapSnapshots.handler(
          {params: {baseFilePath: filePathA, currentFilePath: filePathB}},
          response,
          context,
        );

        const responseData = await response.handle(
          compareHeapSnapshots.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });

    it('compare heap-2 to heap-3', async t => {
      await withMcpContext(async (response, context) => {
        const filePathA = join(
          process.cwd(),
          'tests/fixtures/heap-2.heapsnapshot',
        );
        const filePathB = join(
          process.cwd(),
          'tests/fixtures/heap-3.heapsnapshot',
        );

        await compareHeapSnapshots.handler(
          {params: {baseFilePath: filePathA, currentFilePath: filePathB}},
          response,
          context,
        );

        const responseData = await response.handle(
          compareHeapSnapshots.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });

    it('compare heap-1 to heap-2 with classIndex filter', async t => {
      await withMcpContext(async (response, context) => {
        const filePathA = join(
          process.cwd(),
          'tests/fixtures/heap-1.heapsnapshot',
        );
        const filePathB = join(
          process.cwd(),
          'tests/fixtures/heap-2.heapsnapshot',
        );

        await compareHeapSnapshots.handler(
          {
            params: {
              baseFilePath: filePathA,
              currentFilePath: filePathB,
              classIndex: 2, // NewObject
            },
          },
          response,
          context,
        );

        const responseData = await response.handle(
          compareHeapSnapshots.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });

    it('compare heap-1 to heap-2 with invalid classIndex throws error', async () => {
      await withMcpContext(async (response, context) => {
        const filePathA = join(
          process.cwd(),
          'tests/fixtures/heap-1.heapsnapshot',
        );
        const filePathB = join(
          process.cwd(),
          'tests/fixtures/heap-2.heapsnapshot',
        );

        await assert.rejects(
          compareHeapSnapshots.handler(
            {
              params: {
                baseFilePath: filePathA,
                currentFilePath: filePathB,
                classIndex: 99,
              },
            },
            response,
            context,
          ),
          /Invalid classIndex: 99. Total classes with changes: 10/,
        );
      });
    });
  });

  // Verifies that the caching mechanism in HeapSnapshotManager correctly
  // distinguishes comparisons when the same "current" snapshot is compared
  // against different "base" snapshots. If the cache key (diffCacheKey) is
  // not unique per base snapshot, the second comparison might incorrectly
  // return cached results from the first comparison.
  it('compares the same current snapshot against different bases', async () => {
    await withMcpContext(async (_response, context) => {
      const filePathA = join(
        process.cwd(),
        'tests/fixtures/heap-1.heapsnapshot',
      );
      const filePathB = join(
        process.cwd(),
        'tests/fixtures/heap-2.heapsnapshot',
      );
      const filePathC = join(
        process.cwd(),
        'tests/fixtures/heap-3.heapsnapshot',
      );

      const firstDiff = await context.getHeapSnapshotClassDiffs(
        filePathA,
        filePathC,
      );
      const secondDiff = await context.getHeapSnapshotClassDiffs(
        filePathB,
        filePathC,
      );
      const firstNewObjectDiff = firstDiff.find(
        entry => entry.className === 'NewObject',
      );
      const secondNewObjectDiff = secondDiff.find(
        entry => entry.className === 'NewObject',
      );
      assert.ok(firstNewObjectDiff);
      assert.ok(secondNewObjectDiff);
      assert.equal(firstNewObjectDiff.addedCount, 7);
      assert.equal(secondNewObjectDiff.addedCount, 5);
    });
  });

  describe('get_heapsnapshot_duplicate_strings', () => {
    it('with default options', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getHeapSnapshotDuplicateStrings.handler(
          {params: {filePath}},
          response,
          context,
        );

        const responseData = await response.handle(
          getHeapSnapshotDuplicateStrings.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot(output);
      });
    });
  });
});
