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
  takeMemorySnapshot,
  exploreMemorySnapshot,
  getMemorySnapshotDetails,
  getNodesByClass,
} from '../../src/tools/memory.js';
import {withMcpContext} from '../utils.js';

describe('memory', () => {
  describe('take_memory_snapshot', () => {
    it('with default options', async () => {
      await withMcpContext(async (response, context) => {
        const filePath = join(tmpdir(), 'test-screenshot.heapsnapshot');
        try {
          await takeMemorySnapshot.handler(
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

  describe('load_memory_snapshot', () => {
    it('with default options', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        assert.ok(existsSync(filePath), `Fixture not found at ${filePath}`);

        await exploreMemorySnapshot.handler(
          {params: {filePath}},
          response,
          context,
        );

        // Call handle to trigger formatting (similar to network tests)
        const responseData = await response.handle(
          exploreMemorySnapshot.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot?.(output);
      });
    });
  });

  describe('get_memory_snapshot_details', () => {
    it('with default options', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await getMemorySnapshotDetails.handler(
          {params: {filePath}},
          response,
          context,
        );

        const responseData = await response.handle(
          getMemorySnapshotDetails.name,
          context,
        );
        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot?.(output);
      });
    });
  });

  describe('get_nodes_by_class', () => {
    it('with default options', async t => {
      await withMcpContext(async (response, context) => {
        const filePath = join(
          process.cwd(),
          'tests/fixtures/example.heapsnapshot',
        );

        await context.getHeapSnapshotAggregates(filePath);

        await getNodesByClass.handler(
          {params: {filePath, uid: 19}},
          response,
          context,
        );

        const responseData = await response.handle(
          getNodesByClass.name,
          context,
        );

        const output = responseData.content
          .map(c => (c.type === 'text' ? c.text : ''))
          .join('\n');

        t.assert.snapshot?.(output);
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
          getNodesByClass.handler(
            {params: {filePath, uid: 999999}},
            response,
            context,
          ),
          {message: 'Class with UID 999999 not found in heap snapshot'},
        );
      });
    });
  });
});
