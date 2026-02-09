/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {takeSnapshot} from '../../src/tools/snapshot.js';
import {withMcpContext} from '../utils.js';

describe('snapshot', () => {
  describe('browser_snapshot', () => {
    it('includes a snapshot', async () => {
      await withMcpContext(async (response, context) => {
        await takeSnapshot.handler({params: {}}, response, context);
        assert.ok(response.includeSnapshot);
      });
    });
  });
});
