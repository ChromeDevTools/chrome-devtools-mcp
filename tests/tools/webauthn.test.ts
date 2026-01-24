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
    it('enables WebAuthn so virtual authenticators can be added', async () => {
      await withMcpContext(async (response, context) => {
        await enableWebAuthn.handler({params: {}}, response, context);

        // Verify WebAuthn is enabled by successfully adding a virtual authenticator
        // This will fail if WebAuthn.enable wasn't called
        const page = context.getSelectedPage();
        // @ts-expect-error _client is internal Puppeteer API
        const session = page._client();
        const result = await session.send('WebAuthn.addVirtualAuthenticator', {
          options: {
            protocol: 'ctap2',
            transport: 'internal',
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
          },
        });
        assert.ok(result.authenticatorId, 'Should return authenticator ID');
      });
    });
  });
});
