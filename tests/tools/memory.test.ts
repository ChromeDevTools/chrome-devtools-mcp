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
    it('with default options', async () => {
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

        // Check if response contains Statistics or Static Data
        assert.ok(output.includes('Statistics:'));
        assert.ok(output.includes('Static Data:'));
      });
    });
  });
});
