/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {enableWebAuthn} from '../../src/tools/webauthn.js';
import {withMcpContext} from '../utils.js';

describe('webauthn', () => {
  describe('webauthn_enable', () => {
    it('can be called without error', async () => {
      await withMcpContext(async (response, context) => {
        await enableWebAuthn.handler({params: {}}, response, context);
        // If we get here without error, the tool exists and can be called
        assert.ok(true);
      });
    });
  });
});
