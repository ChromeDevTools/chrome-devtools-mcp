/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describe, it} from 'node:test';

import {listNetworkRequests} from '../src/tools/network.js';
import {createHandlerMocks} from './mocks.js';

describe('skills', () => {
  it('uses valid resource types in the LCP debugging workflow', async () => {
    const skill = await readFile('skills/debug-optimize-lcp/SKILL.md', 'utf8');
    const match = skill.match(/resourceTypes: (\[[^\]]+\])/);
    assert.ok(match, 'expected an example resourceTypes filter');

    const schema = listNetworkRequests(createHandlerMocks().args).schema
      .resourceTypes;
    assert.equal(schema.safeParse(JSON.parse(match[1])).success, true);
  });
});
