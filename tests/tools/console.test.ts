/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {consoleTool} from '../../src/tools/console.js';
import {withBrowser} from '../utils.js';

describe('console', () => {
  describe('list_console_messages', () => {
    it('list messages', async () => {
      await withBrowser(async (response, context) => {
        await consoleTool.handler({params: {}}, response, context);
        assert.ok(response.includeConsoleData);
      });
    });
  });
});
