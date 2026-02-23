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

import {takeMemorySnapshot} from '../../src/tools/memory.js';
import {withMcpContext} from '../utils.js';

describe('memory', () => {
  describe('take_memory_snapshot', () => {
    it('with default options', async () => {
      await withMcpContext(async (response, context) => {
        const filePath = join(tmpdir(), 'test-screenshot.heapsnapshot');
        try {
          await takeMemorySnapshot.handler(
            {params: {filePath}},
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
});
