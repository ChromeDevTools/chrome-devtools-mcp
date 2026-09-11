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
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

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
  getHeapSnapshotObjectDetails,
  queryHeapSnapshotObjects,
} from '../../src/tools/memory.js';
import {parseByteSizeRange} from '../../src/utils/bytes.js';
import {resolveCanonicalPath} from '../../src/utils/files.js';
import {
  createHandlerMocks,
  createMockClassDiffs,
  createMockDetailedClassDiff,
  createMockDominatorChain,
  createMockDuplicateStrings,
  createMockHeapSnapshotAggregateData,
  createMockHeapSnapshotStats,
  createMockHeapSnapshotStaticData,
  createMockItemsRange,
  createMockNativeContextSizes,
  createMockObjectInfo,
  createMockRetainedByContextSummary,
  createMockRetainingPaths,
} from '../mocks.js';
import {withMcpContext} from '../utils.js';

describe('memory', () => {
  afterEach(() => {
    sinon.restore();
  });

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
          const canonicalFilePath = await resolveCanonicalPath(filePath);
          assert.equal(
            response.responseLines.at(0),
            `Heap snapshot saved to ${canonicalFilePath}`,
          );
          assert.ok(existsSync(filePath));
        } finally {
          await rm(filePath, {force: true});
        }
      });
    });
  });

  describe('get_heapsnapshot_summary', () => {
    it('fetches stats, static data, native context sizes, and retained summary', async () => {
      const {context, response} = createHandlerMocks();
      const stats = createMockHeapSnapshotStats();
      const staticData = createMockHeapSnapshotStaticData();
      const nativeContextSizes = createMockNativeContextSizes();
      const retainedByContextSummary = createMockRetainedByContextSummary();

      context.getHeapSnapshotStats.resolves(stats);
      context.getHeapSnapshotStaticData.resolves(staticData);
      context.getHeapSnapshotNativeContextSizes.resolves(nativeContextSizes);
      context.getHeapSnapshotRetainedByContextSummary.resolves(
        retainedByContextSummary,
      );

      await getHeapSnapshotSummary.handler(
        {params: {filePath: 'test.heapsnapshot'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotStats,
        'test.heapsnapshot',
      );
      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotStaticData,
        'test.heapsnapshot',
      );
      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotNativeContextSizes,
        'test.heapsnapshot',
      );
      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotRetainedByContextSummary,
        'test.heapsnapshot',
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotStats,
        stats,
        staticData,
        nativeContextSizes,
        retainedByContextSummary,
      );
    });
  });

  describe('get_heapsnapshot_details', () => {
    it('with default options', async () => {
      const {context, response} = createHandlerMocks();
      const aggregates = createMockHeapSnapshotAggregateData();
      context.getHeapSnapshotAggregates.resolves(aggregates);

      await getHeapSnapshotDetails.handler(
        {params: {filePath: 'test.heapsnapshot'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotAggregates,
        'test.heapsnapshot',
        undefined,
        undefined,
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotAggregates,
        aggregates,
        {pageIdx: undefined, pageSize: undefined},
      );
    });

    it('with filters and pagination', async () => {
      const {context, response} = createHandlerMocks();
      const aggregates = createMockHeapSnapshotAggregateData();
      context.getHeapSnapshotAggregates.resolves(aggregates);

      await getHeapSnapshotDetails.handler(
        {
          params: {
            filePath: 'test.heapsnapshot',
            filterName: 'attributedToSpecificNativeContext',
            objectId: 123,
            pageIdx: 1,
            pageSize: 10,
          },
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotAggregates,
        'test.heapsnapshot',
        'attributedToSpecificNativeContext',
        123,
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotAggregates,
        aggregates,
        {pageIdx: 1, pageSize: 10},
      );
    });
  });

  describe('get_heapsnapshot_class_nodes', () => {
    it('with default options', async () => {
      const {context, response} = createHandlerMocks();
      const nodes = createMockItemsRange();
      context.getHeapSnapshotNodesById.resolves(nodes);

      await getHeapSnapshotClassNodes.handler(
        {params: {filePath: 'test.heapsnapshot', id: 19}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotNodesById,
        'test.heapsnapshot',
        19,
        undefined,
        undefined,
      );
      sinon.assert.calledOnceWithExactly(response.setHeapSnapshotNodes, nodes, {
        pageIdx: undefined,
        pageSize: undefined,
      });
    });

    it('with filters and pagination', async () => {
      const {context, response} = createHandlerMocks();
      const nodes = createMockItemsRange();
      context.getHeapSnapshotNodesById.resolves(nodes);

      await getHeapSnapshotClassNodes.handler(
        {
          params: {
            filePath: 'test.heapsnapshot',
            id: 19,
            filterName: 'objectsRetainedByContexts',
            objectId: 456,
            pageIdx: 2,
            pageSize: 20,
          },
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotNodesById,
        'test.heapsnapshot',
        19,
        'objectsRetainedByContexts',
        456,
      );
      sinon.assert.calledOnceWithExactly(response.setHeapSnapshotNodes, nodes, {
        pageIdx: 2,
        pageSize: 20,
      });
    });
  });

  describe('get_heapsnapshot_retainers', () => {
    it('with valid nodeId and pagination', async () => {
      const {context, response} = createHandlerMocks();
      const retainers = createMockItemsRange();
      context.getHeapSnapshotRetainers.resolves(retainers);

      await getHeapSnapshotRetainers.handler(
        {
          params: {
            filePath: 'test.heapsnapshot',
            nodeId: 25341,
            pageIdx: 1,
            pageSize: 5,
          },
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotRetainers,
        'test.heapsnapshot',
        25341,
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotNodes,
        retainers,
        {pageIdx: 1, pageSize: 5},
      );
    });
  });

  describe('get_heapsnapshot_object_details', () => {
    it('with valid nodeId', async () => {
      const {context, response} = createHandlerMocks();
      const objectInfo = createMockObjectInfo();
      context.getHeapSnapshotObjectDetails.resolves(objectInfo);

      await getHeapSnapshotObjectDetails.handler(
        {params: {filePath: 'test.heapsnapshot', nodeId: 25341}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotObjectDetails,
        'test.heapsnapshot',
        25341,
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotObjectDetails,
        objectInfo,
      );
    });
  });

  describe('close_heapsnapshot', () => {
    it('closes loaded snapshot', async () => {
      const {context, response} = createHandlerMocks();
      context.closeHeapSnapshot.resolves(true);

      await closeHeapSnapshot.handler(
        {params: {filePath: 'test.heapsnapshot'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.closeHeapSnapshot,
        'test.heapsnapshot',
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Closed heap snapshot: test.heapsnapshot',
      );
    });

    it('throws error when snapshot was not loaded', async () => {
      const {context, response} = createHandlerMocks();
      context.closeHeapSnapshot.resolves(false);

      await assert.rejects(
        closeHeapSnapshot.handler(
          {params: {filePath: 'test.heapsnapshot'}},
          response,
          context,
        ),
        {
          message:
            'Failed to close heap snapshot: test.heapsnapshot was not loaded.',
        },
      );
    });
  });

  describe('get_heapsnapshot_retaining_paths', () => {
    it('with valid nodeId and search limits', async () => {
      const {context, response} = createHandlerMocks();
      const retainingPaths = createMockRetainingPaths();
      context.getHeapSnapshotRetainingPaths.resolves(retainingPaths);

      await getHeapSnapshotRetainingPaths.handler(
        {
          params: {
            filePath: 'test.heapsnapshot',
            nodeId: 45901,
            maxDepth: 5,
            maxNodes: 10,
            maxSiblings: 2,
          },
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotRetainingPaths,
        'test.heapsnapshot',
        45901,
        5,
        10,
        2,
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotRetainingPaths,
        retainingPaths,
      );
    });
  });

  describe('get_heapsnapshot_edges', () => {
    it('with default options', async () => {
      const {context, response} = createHandlerMocks();
      const edges = createMockItemsRange();
      context.getHeapSnapshotEdges.resolves(edges);

      await getHeapSnapshotEdges.handler(
        {params: {filePath: 'test.heapsnapshot', nodeId: 25341}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotEdges,
        'test.heapsnapshot',
        25341,
        {
          sortBy: 'retainedSize',
          minRetainedSize: undefined,
          excludePrimitives: true,
        },
      );
      sinon.assert.calledOnceWithExactly(response.setHeapSnapshotNodes, edges, {
        pageIdx: undefined,
        pageSize: undefined,
      });
    });

    it('with retainedSize range, sortBy, and excludePrimitives', async () => {
      const {context, response} = createHandlerMocks();
      const edges = createMockItemsRange();
      context.getHeapSnapshotEdges.resolves(edges);

      await getHeapSnapshotEdges.handler(
        {
          params: {
            filePath: 'test.heapsnapshot',
            nodeId: 25341,
            sortBy: 'selfSize',
            retainedSize: parseByteSizeRange('100B-200B'),
            excludePrimitives: false,
            pageIdx: 0,
            pageSize: 2,
          },
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotEdges,
        'test.heapsnapshot',
        25341,
        {
          sortBy: 'selfSize',
          minRetainedSize: 100,
          excludePrimitives: false,
        },
      );
      sinon.assert.calledOnceWithExactly(response.setHeapSnapshotNodes, edges, {
        pageIdx: 0,
        pageSize: 2,
      });
    });
  });

  describe('get_heapsnapshot_dominators', () => {
    it('with valid nodeId', async () => {
      const {context, response} = createHandlerMocks();
      const dominators = createMockDominatorChain();
      context.getHeapSnapshotDominators.resolves(dominators);

      await getHeapSnapshotDominators.handler(
        {params: {filePath: 'test.heapsnapshot', nodeId: 25341}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotDominators,
        'test.heapsnapshot',
        25341,
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotDominators,
        dominators,
      );
    });
  });

  describe('compare_heapsnapshots', () => {
    it('returns summary diff when classIndex is omitted', async () => {
      const {context, response} = createHandlerMocks();
      const diffs = createMockClassDiffs();
      context.getHeapSnapshotClassDiffs.resolves(diffs);

      await compareHeapSnapshots.handler(
        {
          params: {
            baseFilePath: 'heap1.heapsnapshot',
            currentFilePath: 'heap2.heapsnapshot',
          },
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotClassDiffs,
        'heap1.heapsnapshot',
        'heap2.heapsnapshot',
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotClassDiffs,
        diffs,
      );
    });

    it('returns detailed diff when classIndex is provided', async () => {
      const {context, response} = createHandlerMocks();
      const detailedDiff = createMockDetailedClassDiff();
      context.getHeapSnapshotDetailedClassDiff.resolves(detailedDiff);

      await compareHeapSnapshots.handler(
        {
          params: {
            baseFilePath: 'heap1.heapsnapshot',
            currentFilePath: 'heap2.heapsnapshot',
            classIndex: 2,
          },
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotDetailedClassDiff,
        'heap1.heapsnapshot',
        'heap2.heapsnapshot',
        2,
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotDetailedClassDiff,
        detailedDiff,
      );
    });
  });

  describe('get_heapsnapshot_duplicate_strings', () => {
    it('with default options', async () => {
      const {context, response} = createHandlerMocks();
      const duplicateStrings = createMockDuplicateStrings();
      context.getHeapSnapshotDuplicateStrings.resolves(duplicateStrings);

      await getHeapSnapshotDuplicateStrings.handler(
        {params: {filePath: 'test.heapsnapshot'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.getHeapSnapshotDuplicateStrings,
        'test.heapsnapshot',
      );
      sinon.assert.calledOnceWithExactly(
        response.setHeapSnapshotDuplicateStrings,
        duplicateStrings,
        {pageIdx: undefined, pageSize: undefined},
      );
    });
  });

  describe('query_heapsnapshot_objects', () => {
    it('with default options', async () => {
      const {context, response} = createHandlerMocks();
      const range = createMockItemsRange();
      context.queryHeapSnapshotObjects.resolves(range);

      await queryHeapSnapshotObjects.handler(
        {params: {filePath: 'test.heapsnapshot'}},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.queryHeapSnapshotObjects,
        'test.heapsnapshot',
        {
          className: undefined,
          propertyName: undefined,
          nodeType: undefined,
          minRetainedSize: undefined,
          maxRetainedSize: undefined,
          minSelfSize: undefined,
          maxSelfSize: undefined,
          isDetached: undefined,
          sortBy: undefined,
        },
      );
      sinon.assert.calledOnceWithExactly(response.setHeapSnapshotNodes, range, {
        pageIdx: undefined,
        pageSize: undefined,
      });
    });

    it('with all query filters and pagination', async () => {
      const {context, response} = createHandlerMocks();
      const range = createMockItemsRange();
      context.queryHeapSnapshotObjects.resolves(range);

      await queryHeapSnapshotObjects.handler(
        {
          params: {
            filePath: 'test.heapsnapshot',
            className: 'Window',
            propertyName: 'prop',
            nodeType: 'object',
            retainedSize: parseByteSizeRange('1KB-2KB'),
            selfSize: parseByteSizeRange('100B-200B'),
            isDetached: true,
            sortBy: 'selfSize',
            pageIdx: 1,
            pageSize: 10,
          },
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.queryHeapSnapshotObjects,
        'test.heapsnapshot',
        {
          className: 'Window',
          propertyName: 'prop',
          nodeType: 'object',
          minRetainedSize: 1000,
          maxRetainedSize: 2000,
          minSelfSize: 100,
          maxSelfSize: 200,
          isDetached: true,
          sortBy: 'selfSize',
        },
      );
      sinon.assert.calledOnceWithExactly(response.setHeapSnapshotNodes, range, {
        pageIdx: 1,
        pageSize: 10,
      });
    });
  });
});
